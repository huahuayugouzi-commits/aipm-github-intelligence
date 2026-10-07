export type ConnectionResult = {
  ok: boolean;
  message: string;
  details?: Record<string, string | number | boolean | null>;
};

export async function testGitHubConnection(fetcher: typeof fetch = fetch): Promise<ConnectionResult> {
  if (!process.env.GITHUB_TOKEN) return { ok: false, message: "GITHUB_TOKEN 未配置" };
  try {
    const response = await fetcher("https://api.github.com/rate_limit", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "aipm-github-intelligence",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { ok: false, message: `GitHub API 返回 HTTP ${response.status}，请检查 Token` };
    const body = await response.json();
    const core = body.resources?.core;
    const search = body.resources?.search;
    return {
      ok: true,
      message: "GitHub API 连接正常",
      details: {
        coreRemaining: core?.remaining ?? null,
        coreLimit: core?.limit ?? null,
        searchRemaining: search?.remaining ?? null,
        searchLimit: search?.limit ?? null,
        resetAt: core?.reset ? new Date(core.reset * 1000).toISOString() : null,
      },
    };
  } catch (error) {
    return { ok: false, message: `GitHub API 连接失败：${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function testAIConnection(fetcher: typeof fetch = fetch): Promise<ConnectionResult> {
  if (!process.env.AI_API_KEY) return { ok: false, message: "AI_API_KEY 未配置" };
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  try {
    const response = await fetcher(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { ok: false, message: `AI 服务返回 HTTP ${response.status}，请检查 Base URL 与 API Key` };
    const body = await response.json();
    const configuredModel = process.env.AI_MODEL || "";
    const models = Array.isArray(body.data) ? body.data : [];
    const modelFound = configuredModel ? models.some((item: { id?: string }) => item.id === configuredModel) : false;
    return {
      ok: true,
      message: configuredModel && !modelFound && models.length ? "AI 服务连接正常，但模型列表中未找到当前模型" : "AI 服务连接正常",
      details: { baseUrl, configuredModel: configuredModel || "未配置", modelFound, listedModels: models.length, availableModels: models.slice(0,20).map((item:{id?:string})=>item.id).filter(Boolean).join(", ") },
    };
  } catch (error) {
    return { ok: false, message: `AI 服务连接失败：${error instanceof Error ? error.message : String(error)}` };
  }
}
