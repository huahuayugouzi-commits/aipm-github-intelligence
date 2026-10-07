import { db } from "./db";
import { settings } from "./config";

export interface RankingFilters {
  category?: string;
  query?: string;
  language?: string;
  license?: string;
  minStars?: number;
  sort?: "stars" | "activity" | "score";
}

const nonProductPattern = /\b(awesome|curated list|book|tutorial|course|papers?|system prompts?|prompt collection|interview questions|roadmap|newsletter)\b/i;
const productPattern = /\b(agent|rag|retrieval|knowledge base|workflow|automation|coding|developer|evaluation|observability|multimodal|platform|app|tool|framework|studio|dashboard|api|cli|self-host|deploy|enterprise)\b/i;

/** Transparent product-fit gate shared by the weekly ranking and weekly report. */
export function isProductRelevant(project: { full_name?: unknown; description?: unknown; readme?: unknown; homepage?: unknown; license?: unknown }) {
  const summary = `${project.full_name || ""} ${project.description || ""}`;
  if (nonProductPattern.test(summary)) return false;
  const evidence = `${summary} ${String(project.readme || "").slice(0, 6000)}`;
  return productPattern.test(evidence) && (String(project.readme || "").length >= 500 || Boolean(project.homepage) || Boolean(project.license));
}

export function computeProductScore(project: { stars: number; forks: number; pushedAt: string; readme: string; homepage?: string | null; license?: string | null; description?: string }) {
  const popularity = Math.min(100, Math.log10(project.stars + 1) * 20);
  const days = Math.max(0, (Date.now() - new Date(project.pushedAt).getTime()) / 86400000);
  const activity = Math.max(0, 100 - days * 2.5);
  const completeness = Math.min(100, (project.readme.length > 1200 ? 45 : 20) + (project.homepage ? 25 : 0) + (project.license ? 20 : 0) + (project.description ? 10 : 0));
  const productTerms = /demo|dashboard|workflow|user|deploy|self-host|pricing|product|app/i.test(`${project.description} ${project.readme}`) ? 85 : 55;
  return Math.round((popularity * .25 + activity * .25 + completeness * .25 + productTerms * .25) * 10) / 10;
}

export function getRankings(input?: string | RankingFilters) {
  const filters: RankingFilters = typeof input === "string" ? { category: input } : input || {};
  const sourceFlag = settings.dataMode === "mock" ? 1 : 0;
  const base = `SELECT p.*,
    (SELECT COUNT(*) FROM project_snapshots s WHERE s.project_id=p.id) snapshot_count,
    (SELECT a.content_json FROM analyses a WHERE a.project_id=p.id ORDER BY a.id DESC LIMIT 1) analysis_content
    FROM projects p WHERE p.is_mock=?`;
  let rows = db.prepare(base).all(sourceFlag) as Array<Record<string, unknown>>;
  rows = rows.filter((row) => {
    if (filters.category && row.category !== filters.category) return false;
    if (filters.language && row.language !== filters.language) return false;
    if (filters.license && (row.license || "未验证") !== filters.license) return false;
    if (filters.minStars && Number(row.stars) < filters.minStars) return false;
    if (filters.query) {
      const haystack = `${row.full_name} ${row.description}`.toLowerCase();
      if (!haystack.includes(filters.query.toLowerCase())) return false;
    }
    return true;
  });
  const popular = [...rows].sort((a,b)=>Number(b.stars)-Number(a.stars)).slice(0,20);
  const active = [...rows].sort((a,b)=>new Date(String(b.pushed_at)).getTime()-new Date(String(a.pushed_at)).getTime()).slice(0,10);
  const recommended = [...rows].sort((a,b)=>Number(b.product_score)-Number(a.product_score)).slice(0,10);

  const weeklyGrowth = db.prepare(`
    SELECT p.*, latest.stars - old.stars AS star_growth,
      latest.captured_at AS latest_snapshot_at, old.captured_at AS baseline_snapshot_at
    FROM projects p
    JOIN project_snapshots latest ON latest.id=(SELECT id FROM project_snapshots WHERE project_id=p.id ORDER BY captured_at DESC LIMIT 1)
    JOIN project_snapshots old ON old.id=(SELECT id FROM project_snapshots WHERE project_id=p.id AND captured_at <= date('now','-7 days') ORDER BY captured_at DESC LIMIT 1)
    WHERE p.is_mock=? AND latest.captured_at > old.captured_at
    ORDER BY star_growth DESC, p.product_score DESC
  `).all(sourceFlag) as Array<Record<string, unknown>>;
  const allowed = new Set(rows.map((row) => Number(row.id)));
  const weeklyHot = weeklyGrowth.filter((row) => allowed.has(Number(row.id)) && isProductRelevant(row)).slice(0,10);

  const growth = db.prepare(`
    SELECT p.*, latest.stars - old.stars AS star_growth
    FROM projects p
    JOIN project_snapshots latest ON latest.id=(SELECT id FROM project_snapshots WHERE project_id=p.id ORDER BY captured_at DESC LIMIT 1)
    JOIN project_snapshots old ON old.id=(SELECT id FROM project_snapshots WHERE project_id=p.id AND captured_at <= datetime('now','-30 days') ORDER BY captured_at DESC LIMIT 1)
    WHERE p.is_mock=?
    ORDER BY star_growth DESC LIMIT 10
  `).all(sourceFlag) as Array<Record<string, unknown>>;
  const filteredGrowth = growth.filter((row) => allowed.has(Number(row.id))).slice(0,10);
  const selected = filters.sort === "activity" ? active : filters.sort === "score" ? recommended : popular;
  const languages = (db.prepare("SELECT DISTINCT language FROM projects WHERE language IS NOT NULL AND is_mock=? ORDER BY language").all(sourceFlag) as Array<{language:string}>).map(x=>x.language);
  const licenses = (db.prepare("SELECT DISTINCT COALESCE(license,'未验证') license FROM projects WHERE is_mock=? ORDER BY license").all(sourceFlag) as Array<{license:string}>).map(x=>x.license);
  return {
    weeklyHot,
    weeklyReady: weeklyHot.length > 0,
    weeklyEligibleCount: rows.filter(isProductRelevant).length,
    popular, active, recommended, growth: filteredGrowth, growthReady: filteredGrowth.length > 0,
    selected, total: rows.length, languages, licenses,
  };
}
