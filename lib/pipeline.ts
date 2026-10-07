import { db, acquireLock, nowIso, releaseLock } from "./db";
import crypto from "node:crypto";
import { collectGitHubProjects } from "./github";
import { analyzeProject, analysisCacheModel, estimateAnalysisUsage, AISchemaError, AIUnavailableError } from "./ai";
import { computeProductScore } from "./rankings";
import { buildWeeklyReport } from "./report";
import { settings } from "./config";
import type { GitHubProject, PipelineResult } from "./types";
import { logAIError, setAIStatus } from "./service-status";

function weekStartIso() {
  const d=new Date(); const day=(d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-day); d.setUTCHours(0,0,0,0); return d.toISOString();
}

function usageSince(since:string){
  return db.prepare(`SELECT COUNT(*) calls, COALESCE(SUM(input_tokens),0) input_tokens, COALESCE(SUM(output_tokens),0) output_tokens, COALESCE(SUM(estimated_cost),0) estimated_cost, COALESCE(AVG(success),0) success_rate FROM ai_usage WHERE created_at >= ? AND provider NOT IN ('mock','unknown') AND cache_hit=0`).get(since) as any;
}
export function currentWeekUsage(){return usageSince(weekStartIso());}
export function currentDayUsage(){const d=new Date();d.setUTCHours(0,0,0,0);return usageSince(d.toISOString());}

export function analysisFingerprint(project:GitHubProject){
  const starBand=Math.floor(Math.log(Math.max(1,project.stars))/Math.log(1.05));
  const forkBand=Math.floor(Math.log(Math.max(1,project.forks))/Math.log(1.1));
  return crypto.createHash("sha256").update(JSON.stringify({readme:project.readmeHash,description:project.description,license:project.license,homepage:project.homepage,category:project.category,starBand,forkBand})).digest("hex");
}

function upsertProject(project: GitHubProject) {
  const existing = db.prepare("SELECT id,readme_hash,readme,description,license,homepage,category,stars,forks,analysis_fingerprint FROM projects WHERE github_id=?").get(project.githubId) as {id:number;readme_hash:string;readme:string;description:string;license:string;homepage:string;category:string;stars:number;forks:number;analysis_fingerprint:string}|undefined;
  const savedProject=existing&&!project.readmeHash?{...project,readme:existing.readme,readmeHash:existing.readme_hash}:project;
  const fingerprint=analysisFingerprint(savedProject);const score=computeProductScore(savedProject); const now=nowIso();
  const legacyCacheCanMigrate=Boolean(existing&&!existing.analysis_fingerprint&&existing.readme_hash===savedProject.readmeHash&&existing.description===savedProject.description&&existing.license===savedProject.license&&existing.homepage===savedProject.homepage&&existing.category===savedProject.category&&existing.stars===savedProject.stars&&existing.forks===savedProject.forks);
  db.prepare(`INSERT INTO projects(github_id,full_name,name,owner,url,description,stars,forks,language,updated_at,pushed_at,open_issues,readme,readme_hash,license,category,homepage,product_score,is_mock,first_seen_at,last_seen_at,analysis_fingerprint)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(github_id) DO UPDATE SET full_name=excluded.full_name,name=excluded.name,owner=excluded.owner,url=excluded.url,description=excluded.description,stars=excluded.stars,forks=excluded.forks,language=excluded.language,updated_at=excluded.updated_at,pushed_at=excluded.pushed_at,open_issues=excluded.open_issues,readme=excluded.readme,readme_hash=excluded.readme_hash,license=excluded.license,category=excluded.category,homepage=excluded.homepage,product_score=excluded.product_score,is_mock=excluded.is_mock,last_seen_at=excluded.last_seen_at,analysis_fingerprint=excluded.analysis_fingerprint`)
    .run(savedProject.githubId,savedProject.fullName,savedProject.name,savedProject.owner,savedProject.url,savedProject.description,savedProject.stars,savedProject.forks,savedProject.language,savedProject.updatedAt,savedProject.pushedAt,savedProject.openIssues,savedProject.readme,savedProject.readmeHash,savedProject.license,savedProject.category,savedProject.homepage,score,savedProject.isMock?1:0,now,now,fingerprint);
  const row=db.prepare("SELECT id FROM projects WHERE github_id=?").get(savedProject.githubId) as {id:number};
  if(legacyCacheCanMigrate)db.prepare("UPDATE analyses SET readme_hash=? WHERE project_id=? AND readme_hash=?").run(fingerprint,row.id,existing!.readme_hash);
  db.prepare("INSERT OR IGNORE INTO project_snapshots(project_id,stars,forks,open_issues,captured_at) VALUES(?,?,?,?,?)").run(row.id,savedProject.stars,savedProject.forks,savedProject.openIssues,now.slice(0,10));
  const changed=!existing||existing.analysis_fingerprint!==fingerprint;
  return {id:row.id,changed,project:savedProject,fingerprint};
}

export async function runPipeline(triggerType="manual", deps: { collector?: typeof collectGitHubProjects; analyzer?: typeof analyzeProject } = {}): Promise<PipelineResult> {
  if (!acquireLock("weekly-pipeline")) return {runId:0,status:"skipped",collected:0,analyzed:0,cacheHits:0,failedProjects:[],message:"已有任务正在运行，已避免重复执行。"};
  const start=nowIso(); const run=db.prepare("INSERT INTO pipeline_runs(trigger_type,status,started_at) VALUES(?,?,?)").run(triggerType,"running",start); const runId=Number(run.lastInsertRowid);
  let collected=0, analyzed=0, cacheHits=0, runTokens=0; const failedProjects:string[]=[];
  try {
    const result=await (deps.collector||collectGitHubProjects)(); failedProjects.push(...result.failures);
    if(result.projects.length===0&&result.failures.length>0)throw new Error(`所有数据源采集失败：${result.failures.join("；")}`);
    const candidates:Array<{project:GitHubProject;id:number;changed:boolean;score:number}>=[];
    for(const project of result.projects){const saved=upsertProject(project); collected++; candidates.push({id:saved.id,changed:saved.changed,project:saved.project,score:computeProductScore(saved.project)});}
    candidates.sort((a,b)=>Number(b.changed)-Number(a.changed)||b.score-a.score);
    for(const item of candidates.slice(0,settings.maxProjectsPerRun)){
      const model=process.env.AI_MODEL||"mock-aipm-analyst";
      const cacheModel=analysisCacheModel(model);
      const fingerprint=analysisFingerprint(item.project);
      const cached=db.prepare("SELECT id FROM analyses WHERE project_id=? AND readme_hash=? AND model=?").get(item.id,fingerprint,cacheModel);
      if(cached){cacheHits++;db.prepare("INSERT INTO ai_usage(run_id,project_id,model,input_tokens,output_tokens,estimated_cost,success,provider,cache_hit,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(runId,item.id,model,0,0,0,1,settings.aiProvider,1,nowIso());continue;}
      const estimate=estimateAnalysisUsage(item.project);const estimatedTokens=estimate.totalTokens;
      if(settings.aiProvider!=="mock"){
        const usage=currentWeekUsage();const daily=currentDayUsage();
        if(Number(daily.input_tokens)+Number(daily.output_tokens)+estimatedTokens>settings.dailyTokenBudget){failedProjects.push("AI 每日 Token 预算不足：已暂停新的分析");setAIStatus("degraded","daily_token_budget","AI 每日 Token 预算已用尽，当前展示最近一次分析结果。");break;}
        if(Number(usage.input_tokens)+Number(usage.output_tokens)+estimatedTokens>settings.weeklyTokenBudget){failedProjects.push("AI 每周 Token 预算不足：已暂停新的分析");setAIStatus("degraded","weekly_token_budget","AI 每周 Token 预算已用尽，当前展示最近一次分析结果。");break;}
        if(runTokens+estimatedTokens>settings.runTokenBudget){failedProjects.push("AI 单次任务 Token 预算不足：已停止新的分析");break;}
        if(settings.dailyCostBudget>0&&Number(daily.estimated_cost)+estimate.estimatedCost>settings.dailyCostBudget){failedProjects.push("AI 每日费用预算不足：已暂停新的分析");setAIStatus("degraded","daily_cost_budget","AI 每日费用预算已用尽，当前展示最近一次分析结果。");break;}
        if(settings.weeklyCostBudget>0&&Number(usage.estimated_cost)+estimate.estimatedCost>settings.weeklyCostBudget){failedProjects.push("AI 每周费用预算不足：已暂停新的分析");setAIStatus("degraded","weekly_cost_budget","AI 每周费用预算已用尽，当前展示最近一次分析结果。");break;}
      }
      try{
        const ai=await (deps.analyzer||analyzeProject)(item.project);
        const cost=ai.inputTokens/1_000_000*settings.inputPrice+ai.outputTokens/1_000_000*settings.outputPrice;
        db.prepare("INSERT INTO analyses(project_id,readme_hash,model,content_json,input_tokens,output_tokens,estimated_cost,created_at) VALUES(?,?,?,?,?,?,?,?)").run(item.id,fingerprint,analysisCacheModel(ai.model),JSON.stringify(ai.analysis),ai.inputTokens,ai.outputTokens,cost,nowIso());
        db.prepare("INSERT INTO ai_usage(run_id,project_id,model,input_tokens,output_tokens,estimated_cost,success,provider,cache_hit,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(runId,item.id,ai.model,ai.inputTokens,ai.outputTokens,cost,1,settings.aiProvider,0,nowIso()); runTokens+=ai.inputTokens+ai.outputTokens; analyzed++;setAIStatus("healthy",null,"AI 分析服务正常");
      }catch(error){
        const failedInput=error instanceof AISchemaError?error.inputTokens:0;const failedOutput=error instanceof AISchemaError?error.outputTokens:0;const failedModel=error instanceof AISchemaError?error.model:model;
        const failedCost=failedInput/1_000_000*settings.inputPrice+failedOutput/1_000_000*settings.outputPrice;
        db.prepare("INSERT INTO ai_usage(run_id,project_id,model,input_tokens,output_tokens,estimated_cost,success,provider,cache_hit,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(runId,item.id,failedModel,failedInput,failedOutput,failedCost,0,settings.aiProvider,0,nowIso());runTokens+=failedInput+failedOutput;
        const code=error instanceof AIUnavailableError?error.code:error instanceof AISchemaError?"schema_invalid":"analysis_failed";
        const safeMessage=error instanceof AIUnavailableError?error.publicMessage:error instanceof AISchemaError?"AI 返回格式不符合要求，已保留最近一次分析结果。":"AI 分析暂时失败，已保留最近一次分析结果。";
        logAIError(runId,item.id,code,safeMessage,error instanceof AIUnavailableError&&error.retryable);setAIStatus("degraded",code,safeMessage);failedProjects.push(`${item.project.fullName}: ${safeMessage}`);
        if(error instanceof AIUnavailableError)break;
      }
    }
    const report=buildWeeklyReport();
    const reportRow=db.prepare("INSERT INTO weekly_reports(period_start,period_end,title,content_markdown,project_ids_json,is_mock,analysis_provider,created_at) VALUES(?,?,?,?,?,?,?,?)").run(report.periodStart,report.periodEnd,report.title,report.markdown,JSON.stringify(report.projectIds),settings.dataMode==="mock"?1:0,settings.aiProvider,nowIso());
    const status=failedProjects.length?"partial":"success";
    db.prepare("UPDATE pipeline_runs SET status=?,finished_at=?,collected_count=?,analyzed_count=?,cache_hits=?,error_json=?,report_id=? WHERE id=?").run(status,nowIso(),collected,analyzed,cacheHits,JSON.stringify(failedProjects),Number(reportRow.lastInsertRowid),runId);
    const sourceLabel=settings.dataMode==="mock"?"Mock 数据":`真实 GitHub 数据（${settings.aiProvider==="mock"?"Mock AI":"真实 AI"}）`;
    return {runId,status,collected,analyzed,cacheHits,failedProjects,reportId:Number(reportRow.lastInsertRowid),message:status==="partial"?`${sourceLabel}已生成周报，但存在 ${failedProjects.length} 项降级，请查看运行详情。`:`${sourceLabel}闭环完成。`};
  }catch(error){
    db.prepare("UPDATE pipeline_runs SET status='failed',finished_at=?,error_json=? WHERE id=?").run(nowIso(),JSON.stringify([String(error)]),runId);
    return {runId,status:"failed",collected,analyzed,cacheHits,failedProjects:[String(error)],message:"流水线失败，已有数据保持可用。"};
  }finally{releaseLock("weekly-pipeline");}
}
