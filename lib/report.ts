import { db, nowIso } from "./db";
import { getRankings } from "./rankings";
import { settings } from "./config";

function dateInTimezone(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: settings.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function buildWeeklyReport() {
  const rankings = getRankings();
  const sourceFlag=settings.dataMode==="mock"?1:0;
  const projects = db.prepare(`SELECT * FROM projects WHERE is_mock=? ORDER BY product_score DESC, stars DESC`).all(sourceFlag) as any[];
  const analyses = db.prepare(`SELECT p.id,p.full_name,p.url,p.stars,p.category,p.license,p.product_score,a.content_json FROM analyses a JOIN projects p ON p.id=a.project_id WHERE p.is_mock=? AND a.id IN (SELECT MAX(id) FROM analyses GROUP BY project_id) ORDER BY p.product_score DESC LIMIT 3`).all(sourceFlag) as any[];
  const end = new Date(); const start = new Date(end.getTime()-6*86400000);
  const periodStart = dateInTimezone(start), periodEnd=dateInTimezone(end);
  const categoryCounts=Object.entries(projects.reduce((map:Record<string,number>,p:any)=>{map[p.category]=(map[p.category]||0)+1;return map},{})).sort((a,b)=>b[1]-a[1]);
  const topCategory=categoryCounts[0]||["暂无",0];
  const activeThisWeek=projects.filter(p=>new Date(p.pushed_at).getTime()>=start.getTime()).length;
  const licensed=projects.filter(p=>p.license).length;
  const agentProjects=projects.filter(p=>p.category==="AI Agent"||p.category==="AI Workflow").sort((a,b)=>b.product_score-a.product_score).slice(0,10);
  const productLike=(p:any)=>!/\b(awesome|book|tutorial|course|system prompts?|papers?|roadmap)\b/i.test(`${p.full_name} ${p.description}`)&&/\b(app|platform|tool|framework|workflow|dashboard|studio|deploy|self-host|api|cli|service)\b/i.test(`${p.description} ${p.readme.slice(0,6000)}`);
  const replicable=projects.filter(p=>p.license&&p.readme.length>500&&productLike(p)).sort((a,b)=>b.product_score-a.product_score).slice(0,10);
  const learning=projects.filter(p=>["RAG","AI Evaluation","AI Agent","AI Workflow"].includes(p.category)).sort((a,b)=>b.product_score-a.product_score).slice(0,10);
  const commercial=projects.filter(p=>productLike(p)&&(p.homepage||/app|platform|workflow|enterprise|studio|dashboard/i.test(`${p.description} ${p.readme}`))).sort((a,b)=>b.product_score-a.product_score).slice(0,10);
  const newProjects=projects.filter(p=>new Date(p.first_seen_at).getTime()>=start.getTime()).sort((a,b)=>b.product_score-a.product_score).slice(0,10);
  const projectLine=(p:any,i:number,extra="")=>`${i+1}. [${p.full_name}](${p.url}) — ⭐ ${Number(p.stars).toLocaleString()} · ${p.category} · AIPM ${Number(p.product_score).toFixed(1)}${extra}`;
  const analysisLabel=settings.aiProvider==="mock"?"Mock AI 推测，仅用于工作流验证":"AI 分析，仍需用户研究验证";
  const lines = [
    `# AIPM GitHub 项目情报周报`, "", `数据检索日：${periodEnd}（${settings.timezone}）`, `统计周期：${periodStart} — ${periodEnd}`, `生成时间：${nowIso()}`, `数据来源：${settings.dataMode==="github"?"GitHub REST API 真实数据、仓库 README、License 与项目主页":"Mock 演示数据"}`, `分析来源：${settings.aiProvider==="openai"?"OpenAI-compatible API":"Mock AI（分析结论仅用于功能验证）"}`, `本周热门口径：真实 7 日新增 Star 优先；仅纳入具备产品形态、文档或部署证据的项目；历史不足时不生成名次。`, "",
    "## 第一部分：本周三个趋势", "",
    `1. **${topCategory[0]} 是本期样本最多的方向**：${topCategory[1]} / ${projects.length} 个项目。该结论只代表当前关键词策略采集样本，不等于全市场份额。`,
    `2. **开源项目保持较高迭代活跃度**：${activeThisWeek} / ${projects.length} 个项目在统计周期内有推送。活跃不等于产品质量或商业成功。`,
    `3. **二次开发许可基础相对清晰**：${licensed} / ${projects.length} 个项目可识别 SPDX License；商业使用前仍需复核具体条款。`, "",
    "## 第二部分：五大排行榜", "",
    "### 1. GitHub AI 本周热门项目 TOP 10", "", ...(rankings.weeklyReady?rankings.weeklyHot.slice(0,10).map((p:any,i)=>projectLine(p,i,` · 近 7 日新增 ⭐ ${Number(p.star_growth).toLocaleString()} · 真实快照计算`)):["- 历史数据积累中：尚无七天前的真实 Star 快照，本期不使用累计 Star 或 AI 猜测替代。"]), "",
    "### 2. AI Agent 优秀项目 TOP 10", "", ...(agentProjects.length?agentProjects.map((p,i)=>projectLine(p,i," · 按透明产品分排序")):["- 本期样本不足"]), "",
    "### 3. 值得复刻的 AI 产品 TOP 10", "", ...(replicable.length?replicable.map((p,i)=>projectLine(p,i,` · License ${p.license} · MVP 难度为待验证判断`)):["- 本期没有同时满足许可证与文档条件的项目"]), "",
    "### 4. AIPM 技术学习项目 TOP 10", "", ...(learning.length?learning.map((p,i)=>projectLine(p,i," · 适合学习工作流、RAG 或评测")):["- 本期样本不足"]), "",
    "### 5. AI 商业应用潜力 TOP 10", "", ...(commercial.length?commercial.map((p,i)=>projectLine(p,i," · 商业潜力为程序筛选后的推测，未经市场验证")):["- 本期样本不足"]), "",
    "## 第三部分：三个值得深度研究的产品", "",
    ...(analyses.length?analyses.flatMap((row,i)=>{const a=JSON.parse(row.content_json);return [`### ${i+1}. [${row.full_name}](${row.url})`, "", `**判断性质：** ${analysisLabel}`, `**产品定位：** ${a.positioning}`, `**目标用户：** ${a.targetUsers?.join("；")||"信息不足"}`, `**核心痛点：** ${a.painPoints?.join("；")||"信息不足"}`, `**核心功能：** ${a.coreFeatures?.join("；")||"信息不足"}`, `**AI 介入点：** ${a.aiTouchpoints?.join("；")||"信息不足"}`, `**差异化：** ${a.differentiation}`, `**商业化潜力：** ${a.commercialPotential?.assessment}（证据等级：${a.commercialPotential?.evidenceLevel}）`, `**AIPM 学习价值：** ${a.aipmLearningValue}`, `**二次开发：** ${a.redevelopmentFeasibility}`, `**GitHub 已证实：** ${a.verifiedFacts?.join("；")||`当前 Star ${row.stars}；License ${row.license||"未验证"}`}`, `**仍需验证：** ${a.assumptions?.join("；")||"目标用户与商业需求"}`, ""]}):["- 本期没有可用分析；数据采集结果仍可用于排行榜。", ""]),
    "## 第四部分：推荐实际复刻的两个项目", "",
    ...replicable.slice(0,2).flatMap((p:any,i)=>[`${i+1}. [${p.full_name}](${p.url})`, `- 推荐理由：文档与许可证较完整，AIPM 推荐分 ${Number(p.product_score).toFixed(1)}。`, `- 建议 MVP：保留一个核心用户场景、一次完整 AI 工作流、结果校验与成本记录。`, `- 实施难度：待完成代码结构与依赖审计后确认；不得仅凭 Star 判断。`]), "",
    "## 第五部分：本周 AIPM 必学三个知识点", "",
    "1. **Agent Workflow**：掌握任务拆分、工具调用、人工审批、失败恢复和可观测性，不必先深入模型训练。",
    "2. **RAG 评测**：建立问题—证据—答案测试集，分别衡量召回质量、答案忠实度和响应成本。",
    "3. **AI 成本与缓存**：理解 README 哈希、Prompt/Schema 版本、Token 预算和缓存失效如何影响产品成本。", "",
    "## 第六部分：下周重点关注", "",
    ...(newProjects.length?newProjects.slice(0,5).map((p:any,i)=>projectLine(p,i," · 本周期首次进入本地情报库")):["- 暂无可验证的新入库项目"]), "",
    "- 下周应优先观察 Star 快照变化、README 重大更新和连续提交活跃度；在积累满 30 天前，不输出猜测性增长数据。",
  ];
  return { periodStart, periodEnd, title:`AIPM GitHub 周报 ${periodEnd}`, markdown:lines.join("\n"), projectIds: analyses.map(x=>x.id) };
}
