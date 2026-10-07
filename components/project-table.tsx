import Link from "next/link";

const categoryExplanations: Record<string, string> = {
  "AI Agent": "面向智能体规划、工具调用或自主任务执行，可用于研究 Agent 产品流程。",
  RAG: "面向知识检索与生成结合，适合研究企业知识库和问答产品。",
  "AI Workflow": "面向可视化 AI 工作流与业务自动化，适合研究流程编排和人机协作。",
  "AI Coding": "面向代码生成、理解或开发协作，适合研究 AI 编程产品体验。",
  "AI SaaS": "面向可直接使用的 AI 应用，适合研究用户场景、功能包装与商业化。",
  "Multimodal AI": "面向文本、图像、音频等多模态能力，适合研究新交互与内容生产。",
  "AI Evaluation": "面向模型、Prompt 或 Agent 评测，适合研究 AI 产品质量保障。",
};

export function chineseProjectExplanation(project: any) {
  if (typeof project.analysis_content === "string") {
    try {
      const analysis = JSON.parse(project.analysis_content);
      if (typeof analysis.positioning === "string" && analysis.positioning.trim()) {
        return { text: analysis.positioning.trim(), source: "已缓存 AI 分析" };
      }
    } catch {
      // Corrupted legacy analysis must not break a public ranking page.
    }
  }
  return {
    text: categoryExplanations[project.category] || "该项目尚无中文产品分析，可进入详情页查看仓库事实信息。",
    source: "分类说明",
  };
}

export function ProjectTable({projects,mode="popular"}:{projects:any[];mode?:string}){
  if(!projects.length)return <div className="card muted">暂无数据，请先运行一次情报任务。</div>;
  const showsGrowth=mode==="growth"||mode==="weekly";
  return <div className="table-wrap"><table className="ranking-table"><thead><tr><th>#</th><th>项目</th><th>中文产品解读</th><th>分类</th><th>当前 Star</th>{showsGrowth&&<th>{mode==="weekly"?"7 日新增":"30 日新增"}</th>}<th>最近推送</th><th>AIPM 分</th><th>License</th></tr></thead><tbody>{projects.map((p,i)=>{const explanation=chineseProjectExplanation(p);return <tr key={p.id}><td>{i+1}</td><td><Link className="repo" href={`/projects/${p.id}`}>{p.full_name}</Link><div className="muted original-description">GitHub 原文：{p.description||"仓库未提供描述"}</div></td><td className="product-explanation"><span>{explanation.text}</span><small>{explanation.source} · 仅作产品研究参考</small></td><td><span className="badge">{p.category}</span></td><td className="stars">★ {Number(p.stars).toLocaleString()}</td>{showsGrowth&&<td className="growth-value">+{Number(p.star_growth).toLocaleString()}</td>}<td>{String(p.pushed_at).slice(0,10)}</td><td>{p.product_score}</td><td>{p.license||"未验证"}</td></tr>})}</tbody></table></div>
}
