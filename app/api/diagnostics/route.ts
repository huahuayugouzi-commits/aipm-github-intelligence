import { testAIConnection, testGitHubConnection } from "@/lib/diagnostics";
import { settings } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const githubConfigured = Boolean(process.env.GITHUB_TOKEN);
  const aiConfigured = Boolean(process.env.AI_API_KEY);
  return Response.json({
    github: { configured: githubConfigured, active: settings.dataMode === "github" },
    ai: { configured: aiConfigured, active: settings.aiProvider !== "mock", model: process.env.AI_MODEL || "mock-aipm-analyst" },
    readyForRealRun: settings.dataMode === "github",
    authenticatedGitHub: githubConfigured,
    readyForRealAnalysis: settings.aiProvider !== "mock" && aiConfigured,
  });
}

export async function POST(request: Request) {
  if (!process.env.PIPELINE_SECRET || request.headers.get("x-pipeline-secret") !== process.env.PIPELINE_SECRET) {
    return Response.json({ ok: false, message: "仅管理员可以执行连接诊断。" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { target?: string };
  if (body.target === "github") return Response.json(await testGitHubConnection());
  if (body.target === "ai") return Response.json(await testAIConnection());
  return Response.json({ ok: false, message: "target 必须为 github 或 ai" }, { status: 400 });
}
