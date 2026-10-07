import { db } from "@/lib/db";
import { currentWeekUsage } from "@/lib/pipeline";
import { getRankings } from "@/lib/rankings";
import { settings } from "@/lib/config";
import { RunButton } from "@/components/run-button";
import { ProjectTable } from "@/components/project-table";
import { getEffectiveAIStatus } from "@/lib/service-status";

export const dynamic="force-dynamic";
export default function Dashboard(){
  const sourceFlag=settings.dataMode==="mock"?1:0;
  const projectCount=(db.prepare("SELECT COUNT(*) n FROM projects WHERE is_mock=?").get(sourceFlag) as any).n;
  const analysisCount=(db.prepare("SELECT COUNT(*) n FROM analyses a JOIN projects p ON p.id=a.project_id WHERE p.is_mock=?").get(sourceFlag) as any).n;
  const reportCount=(db.prepare("SELECT COUNT(*) n FROM weekly_reports").get() as any).n;
  const latest=db.prepare("SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT 1").get() as any;
  const usage=currentWeekUsage(); const r=getRankings();
  const aiStatus=getEffectiveAIStatus();
  const usageHistory=db.prepare(`SELECT substr(created_at,1,10) day, COUNT(*) calls, SUM(input_tokens+output_tokens) tokens, SUM(estimated_cost) cost FROM ai_usage WHERE created_at >= datetime('now','-6 days') AND provider NOT IN ('mock','unknown') AND cache_hit=0 GROUP BY day ORDER BY day`).all() as any[];
  const cacheTotal=Number(latest?.cache_hits||0)+Number(latest?.analyzed_count||0); const cacheRate=cacheTotal?Math.round(Number(latest?.cache_hits||0)/cacheTotal*100):0;
  const usedTokens=Number(usage.input_tokens)+Number(usage.output_tokens);const budgetRate=Math.min(100,Math.round(usedTokens/settings.weeklyTokenBudget*100));const maxDaily=Math.max(1,...usageHistory.map(x=>Number(x.tokens)));
  return <><header className="header"><div><h1>AI 开源项目情报台</h1><div className="subtitle">让 GitHub 数据变成可执行的产品判断</div></div><span className={`badge ${settings.dataMode==="mock"?"mock":"good"}`}>{settings.dataMode==="mock"?"Mock 演示数据":"GitHub 实时数据"}</span></header>
  {settings.dataMode==="mock"?<div className="notice warn">当前为 Mock 模式：用于验证完整业务闭环，不代表真实 GitHub 数据。将 DATA_MODE 设为 github 后启用真实采集。</div>:!process.env.GITHUB_TOKEN?<div className="notice warn">当前使用 GitHub 匿名公共 API，数据真实但额度较低；正式定时运行建议配置 GITHUB_TOKEN。</div>:null}
  {aiStatus?.status==="degraded"&&<div className="notice warn">{aiStatus.message} 排行榜、GitHub 数据、历史周报和历史分析仍可正常浏览。</div>}
  <section className="grid metrics section"><div className="card metric"><small>已收录项目</small><strong>{projectCount}</strong></div><div className="card metric"><small>AI 深度分析</small><strong>{analysisCount}</strong></div><div className="card metric"><small>历史周报</small><strong>{reportCount}</strong></div><div className="card metric"><small>本次缓存命中率</small><strong>{cacheRate}%</strong></div></section>
  <section className="card section"><h2 className="section-title">运行本周任务</h2><RunButton enabled={Boolean(process.env.PIPELINE_SECRET)}/><p className="muted">普通页面访问不会调用 AI。仅定时任务或持有管理员触发密钥的操作可以启动采集与分析。</p></section>
  <section className="grid two-col section"><div className="card"><div className="chart-header"><h2 className="section-title">本周 AI 成本{settings.aiProvider==="mock"?"（模拟）":""}</h2><span className={`badge ${settings.aiProvider==="mock"?"mock":budgetRate>=80?"warn":"good"}`}>{settings.aiProvider==="mock"?"不占真实预算":`预算使用 ${budgetRate}%`}</span></div><div className="budget-number"><strong>{usedTokens.toLocaleString()}</strong><span>{settings.aiProvider==="mock"?" 估算 Token":` / ${settings.weeklyTokenBudget.toLocaleString()} Token`}</span></div><div className="bar"><span style={{width:`${settings.aiProvider==="mock"?0:budgetRate}%`}}/></div><div className="mini-bars">{usageHistory.length?usageHistory.map(x=><div key={x.day} title={`${x.day}: ${x.tokens} Token`}><span style={{height:`${Math.max(8,Number(x.tokens)/maxDaily*100)}%`}}/><small>{x.day.slice(5)}</small></div>):<p className="muted">本周尚无模型调用</p>}</div><div className="cost-footer"><span>调用 <strong>{usage.calls}</strong></span><span>估算费用 <strong>${Number(usage.estimated_cost).toFixed(4)}</strong></span></div></div><div className="card"><h2 className="section-title">最新状态</h2><div className="project-card"><span>任务状态</span><span className="badge">{latest?.status||"尚未运行"}</span></div><div className="project-card"><span>数据更新时间</span><strong>{latest?.finished_at?.slice(0,16).replace("T"," ")||"—"}</strong></div><div className="project-card"><span>分析成功率</span><strong>{Math.round(Number(usage.success_rate||0)*100)}%</strong></div><div className="project-card"><span>缓存命中</span><strong>{cacheRate}%</strong></div></div></section>
  <section className="section"><h2 className="section-title">AIPM 推荐研究</h2><ProjectTable projects={r.recommended.slice(0,5)}/></section></>
}
