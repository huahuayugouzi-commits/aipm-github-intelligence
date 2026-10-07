import { acquireLock, db, nowIso, releaseLock } from "./db";
import { requestJson } from "./github";

export type SnapshotResult = { status: "success" | "partial" | "skipped"; updated: number; failures: string[]; message: string };

/**
 * Daily low-cost telemetry: refresh only mutable repository counters for projects
 * already in the real-data catalog. It never reads README or calls the AI service.
 */
export async function captureDailySnapshots(fetchRepo: (fullName: string) => Promise<any> = async fullName => requestJson(`https://api.github.com/repos/${fullName}`)): Promise<SnapshotResult> {
  if (!acquireLock("daily-github-snapshots", 30)) return { status: "skipped", updated: 0, failures: [], message: "每日快照任务已在运行，已跳过重复触发。" };
  const failures: string[] = [];
  let updated = 0;
  try {
    const projects = db.prepare("SELECT id,full_name FROM projects WHERE is_mock=0 ORDER BY id").all() as Array<{id:number;full_name:string}>;
    const capturedAt = nowIso().slice(0,10);
    for (const project of projects) {
      try {
        const repo = await fetchRepo(project.full_name);
        const stars = Number(repo.stargazers_count);
        const forks = Number(repo.forks_count);
        const issues = Number(repo.open_issues_count);
        if (![stars, forks, issues].every(Number.isFinite)) throw new Error("GitHub 返回的计数字段无效");
        db.prepare("UPDATE projects SET stars=?,forks=?,open_issues=?,updated_at=?,pushed_at=?,last_seen_at=? WHERE id=?")
          .run(stars, forks, issues, repo.updated_at || nowIso(), repo.pushed_at || repo.updated_at || nowIso(), nowIso(), project.id);
        db.prepare("INSERT INTO project_snapshots(project_id,stars,forks,open_issues,captured_at) VALUES(?,?,?,?,?) ON CONFLICT(project_id,captured_at) DO UPDATE SET stars=excluded.stars,forks=excluded.forks,open_issues=excluded.open_issues")
          .run(project.id, stars, forks, issues, capturedAt);
        updated++;
      } catch (error) {
        failures.push(`${project.full_name}: ${error instanceof Error ? error.message : "快照失败"}`);
      }
    }
    const status = failures.length ? "partial" : "success";
    return { status, updated, failures, message: status === "success" ? `已更新 ${updated} 个项目的每日 GitHub 快照。` : `已更新 ${updated} 个项目，${failures.length} 个项目失败。` };
  } finally {
    releaseLock("daily-github-snapshots");
  }
}
