import crypto from "node:crypto";
import { SEARCH_STRATEGY, settings } from "./config";
import { mockProjects } from "./mock-data";
import type { Category, GitHubProject } from "./types";

export class GitHubError extends Error { constructor(message: string, public status?: number) { super(message); } }
export class GitHubRateLimitError extends GitHubError {}

const headers = () => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "aipm-github-intelligence",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

const wait = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));

export function classifyCategory(fallback: Category, source: string): Category {
  const text=source.toLowerCase();
  if(/\b(eval|evaluation|observability|monitoring|benchmark)\b/.test(text))return "AI Evaluation";
  if(/\b(rag|retrieval|knowledge base|knowledge graph|semantic search)\b/.test(text))return "RAG";
  if(/\b(multimodal|vision language|image generation|video generation|speech|audio)\b/.test(text))return "Multimodal AI";
  if(/\b(saas|billing|subscription|multi-tenant|workspace)\b/.test(text))return "AI SaaS";
  if(/\b(workflow|automation|orchestration|pipeline)\b/.test(text))return "AI Workflow";
  if(/\b(claude code|coding agent|code agent|developer tool|software development|vibe coding)\b/.test(text))return "AI Coding";
  if(fallback==="AI Coding"&&/\b(code|developer|dev)\b/.test(text))return "AI Coding";
  if(/\b(agent|agentic|multi-agent|skills?)\b/.test(text))return "AI Agent";
  return fallback;
}

export async function requestJson(url: string, fetcher: typeof fetch = fetch) {
  let lastError: unknown;
  for (let attempt=0; attempt<3; attempt++) {
    try {
      const response = await fetcher(url, { headers: headers(), signal: AbortSignal.timeout(15000) });
      const remaining=response.headers.get("x-ratelimit-remaining");
      if ((response.status === 403 && remaining === "0") || response.status === 429) {
        const reset=response.headers.get("x-ratelimit-reset");
        const resetText=reset?`，重置时间 ${new Date(Number(reset)*1000).toISOString()}`:"";
        throw new GitHubRateLimitError(`GitHub API rate limit reached${resetText}`, response.status);
      }
      if (!response.ok) {
        const error=new GitHubError(`GitHub API ${response.status}: ${url}`, response.status);
        if (response.status>=500 || response.status===408) throw error;
        throw Object.assign(error,{retryable:false});
      }
      return response.json();
    } catch (error) {
      if (error instanceof GitHubRateLimitError || (error as {retryable?:boolean})?.retryable===false) throw error;
      lastError=error;
      if(attempt<2) await wait(250*2**attempt);
    }
  }
  throw lastError;
}

async function fetchReadme(fullName: string): Promise<{content:string;hash:string}> {
  try {
    const data = await requestJson(`https://api.github.com/repos/${fullName}/readme`);
    const complete=Buffer.from(data.content || "", "base64").toString("utf8");
    return {content:complete.slice(0,settings.maxInputChars),hash:crypto.createHash("sha256").update(complete).digest("hex")};
  } catch { return {content:"",hash:""}; }
}

export async function collectGitHubProjects(opts?: { perCategory?: number; strategy?: typeof SEARCH_STRATEGY }): Promise<{ projects: GitHubProject[]; failures: string[] }> {
  if (settings.dataMode === "mock") return { projects: mockProjects(), failures: [] };
  const strategy = opts?.strategy || SEARCH_STRATEGY;
  const perCategory = Math.min(opts?.perCategory || settings.githubProjectsPerCategory, 30);
  const seen = new Map<number, GitHubProject>();
  const failures: string[] = [];

  for (const item of strategy) {
    try {
      const data = await requestJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(item.query)}&sort=stars&order=desc&per_page=${perCategory}`);
      for (const repo of data.items || []) {
        if (repo.archived || repo.fork || seen.has(repo.id)) continue;
        try {
          const readme = await fetchReadme(repo.full_name);
          const project: GitHubProject = {
            githubId: repo.id, fullName: repo.full_name, name: repo.name, owner: repo.owner.login,
            url: repo.html_url, description: repo.description || "", stars: repo.stargazers_count,
            forks: repo.forks_count, language: repo.language, updatedAt: repo.updated_at,
            pushedAt: repo.pushed_at, openIssues: repo.open_issues_count, readme:readme.content,
            readmeHash: readme.hash,
            license: repo.license?.spdx_id || null, category: classifyCategory(item.category as Category, `${repo.name} ${repo.description||""}`),
            homepage: repo.homepage || null,
          };
          seen.set(repo.id, project);
        } catch (error) { failures.push(`${repo.full_name}: ${String(error)}`); }
      }
    } catch (error) {
      if (error instanceof GitHubRateLimitError) throw error;
      failures.push(`${item.category}: ${String(error)}`);
    }
  }
  return { projects: [...seen.values()], failures };
}
