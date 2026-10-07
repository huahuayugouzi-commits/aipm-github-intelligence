"use client";

import { useState } from "react";

type Result = { ok: boolean; message: string; details?: Record<string, unknown> };

export function ConnectionTests({ githubConfigured, aiConfigured, adminEnabled }: { githubConfigured: boolean; aiConfigured: boolean; adminEnabled: boolean }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [secret, setSecret] = useState("");

  async function run(target: "github" | "ai") {
    setLoading(target);
    try {
      const response = await fetch("/api/diagnostics", { method: "POST", headers: { "Content-Type": "application/json", "x-pipeline-secret": secret }, body: JSON.stringify({ target }) });
      const result = await response.json() as Result;
      setResults(current => ({ ...current, [target]: result }));
    } catch (error) {
      setResults(current => ({ ...current, [target]: { ok: false, message: String(error) } }));
    } finally { setLoading(null); }
  }

  return <section className="card section">
    <h2 className="section-title">连接诊断</h2>
    <p className="muted">仅管理员可执行。测试由服务端发起，浏览器不会获取 API Key；AI 测试只读取模型列表，不发送生成请求。</p>
    {adminEnabled?<input className="admin-secret" type="password" autoComplete="off" value={secret} onChange={event=>setSecret(event.target.value)} placeholder="管理员触发密钥" aria-label="连接诊断管理员密钥"/>:<div className="notice warn">尚未配置管理员触发密钥，连接诊断已禁用。</div>}
    <div className="diagnostic-grid">
      <div className="diagnostic-item">
        <div><strong>GitHub REST API</strong><span className={`badge ${githubConfigured ? "good" : "warn"}`}>{githubConfigured ? "已配置" : "待配置"}</span></div>
        <button className="btn secondary" disabled={!githubConfigured || !adminEnabled || !secret || loading !== null} onClick={() => run("github")}>{loading === "github" ? "测试中…" : "测试连接"}</button>
        {results.github && <ResultView result={results.github} />}
      </div>
      <div className="diagnostic-item">
        <div><strong>OpenAI-compatible API</strong><span className={`badge ${aiConfigured ? "good" : "warn"}`}>{aiConfigured ? "已配置" : "待配置"}</span></div>
        <button className="btn secondary" disabled={!aiConfigured || !adminEnabled || !secret || loading !== null} onClick={() => run("ai")}>{loading === "ai" ? "测试中…" : "测试连接"}</button>
        {results.ai && <ResultView result={results.ai} />}
      </div>
    </div>
  </section>;
}

function ResultView({ result }: { result: Result }) {
  return <div className={`diagnostic-result ${result.ok ? "success" : "failure"}`}><strong>{result.ok ? "通过" : "未通过"}</strong> · {result.message}{result.details && <pre>{JSON.stringify(result.details, null, 2)}</pre>}</div>;
}
