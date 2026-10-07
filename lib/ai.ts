import { analysisSchema } from "./analysis-schema";
import { ANALYSIS_PROMPT_VERSION, ANALYSIS_SCHEMA_VERSION, settings } from "./config";
import type { Analysis, GitHubProject } from "./types";

export class AIUnavailableError extends Error {
  constructor(public code:string,public publicMessage:string,public retryable=false){super(publicMessage);}
}
export class AISchemaError extends Error {
  constructor(message:string, public inputTokens=0, public outputTokens=0, public model="unknown"){super(message);}
}
export class BudgetExceededError extends Error {}

export interface AIResult { analysis: Analysis; inputTokens: number; outputTokens: number; model: string; }

export function analysisCacheModel(model:string){return `${model}|prompt:${ANALYSIS_PROMPT_VERSION}|schema:${ANALYSIS_SCHEMA_VERSION}`;}
export function estimateAnalysisTokens(project:GitHubProject){return Math.ceil(Math.min(project.readme.length,settings.maxInputChars)/4)+settings.maxOutputTokens+500;}
export function estimateAnalysisUsage(project:GitHubProject){const inputTokens=Math.ceil(Math.min(project.readme.length,settings.maxInputChars)/4)+500;const outputTokens=settings.maxOutputTokens;return {inputTokens,outputTokens,totalTokens:inputTokens+outputTokens,estimatedCost:inputTokens/1_000_000*settings.inputPrice+outputTokens/1_000_000*settings.outputPrice};}

function classifyAIError(status:number,body:string){
  const text=body.toLowerCase();
  if(status===401||status===403)return new AIUnavailableError("authentication","AI 分析服务认证失败，已暂停新的分析。",false);
  if(status===402||/insufficient|balance|spend.?limit|billing|quota.?exceed|credits?/.test(text))return new AIUnavailableError("quota_exhausted","AI 分析额度不足或已达到 Spend Limit，已暂停新的分析。",false);
  if(status===429)return new AIUnavailableError("rate_limit","AI 分析请求过于频繁，当前展示最近一次分析结果。",true);
  if(status===408)return new AIUnavailableError("timeout","AI 分析请求超时，当前展示最近一次分析结果。",true);
  if(status>=500)return new AIUnavailableError("provider_unavailable","AI 分析服务暂时不可用，当前展示最近一次分析结果。",true);
  return new AIUnavailableError("invalid_request","AI 分析配置或请求不兼容，已暂停新的分析。",false);
}

const systemPrompt = `你是 AI 产品分析师。只根据给定 GitHub 证据输出单个合法 JSON 对象，不要 Markdown、代码围栏或额外文本。严格遵守以下字段和类型模板：
{"positioning":"字符串","targetUsers":["字符串"],"painPoints":["字符串"],"coreFeatures":["字符串"],"aiTouchpoints":["字符串"],"differentiation":"字符串，不得使用数组","commercialPotential":{"assessment":"字符串","evidenceLevel":"inference"},"aipmLearningValue":"字符串","redevelopmentFeasibility":"字符串","verifiedFacts":["字符串"],"assumptions":["字符串"],"sourceUrl":"输入中的完整 GitHub URL","analysisDate":"YYYY-MM-DD"}
commercialPotential.evidenceLevel 只能是字符串 verified 或 inference，商业潜力缺乏直接证据时必须使用 inference。事实放 verifiedFacts；商业与用户判断放 assumptions，禁止虚构用户量、收入、合作或增长。每个数组最多3项，每项不超过40个中文字符；每个字符串不超过120个中文字符；总输出控制在1200个中文字符内。`;

function mockAnalysis(project: GitHubProject): Analysis {
  return {
    positioning: `${project.name} 是一个面向 AI 产品实践的 ${project.category} 开源项目。`,
    targetUsers: ["AI 产品经理", "AI 应用开发者", "需要评估开源方案的团队"],
    painPoints: ["方案选择成本高", "缺乏可复用的产品工作流"],
    coreFeatures: [project.description || "README 中描述的核心能力", "可追溯的开源实现"],
    aiTouchpoints: ["LLM 推理", "结构化工作流", "结果校验"],
    differentiation: "基于仓库公开信息形成的初步判断，需结合真实用户访谈验证。",
    commercialPotential: { assessment: "可能适合垂直场景订阅或企业服务；市场需求尚未验证。", evidenceLevel: "inference" },
    aipmLearningValue: "可学习需求拆解、AI 工作流、可解释性与评测设计。",
    redevelopmentFeasibility: project.license ? `许可证为 ${project.license}，可先做小范围 MVP；商业使用前需复核条款。` : "许可证信息不足，二次开发前需要确认。",
    verifiedFacts: [`GitHub 当前 Star：${project.stars}`, `主要语言：${project.language || "未知"}`, `最近推送：${project.pushedAt}`],
    assumptions: ["商业潜力与目标用户为 AI 分析推测，不代表市场已验证"],
    sourceUrl: project.url, analysisDate: new Date().toISOString().slice(0,10),
  };
}

export async function analyzeProject(project: GitHubProject): Promise<AIResult> {
  const model = process.env.AI_MODEL || "mock-aipm-analyst";
  const source = JSON.stringify({
    repository: project.fullName, url: project.url, description: project.description,
    stars: project.stars, forks: project.forks, language: project.language,
    updatedAt: project.updatedAt, pushedAt: project.pushedAt, issues: project.openIssues,
    license: project.license, readme: project.readme.slice(0, settings.maxInputChars),
  });
  if (settings.aiProvider === "mock") {
    const analysis = analysisSchema.parse(mockAnalysis(project));
    return { analysis, inputTokens: Math.ceil(source.length / 4), outputTokens: 360, model };
  }
  if (!process.env.AI_API_KEY) throw new AIUnavailableError("missing_key","AI 分析服务未配置，当前展示最近一次分析结果。",false);
  const url=`${(process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/,"")}/chat/completions`;
  const request={method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.AI_API_KEY}`},body:JSON.stringify({model,temperature:0.2,max_tokens:settings.maxOutputTokens,response_format:{type:"json_object"},messages:[{role:"system",content:systemPrompt},{role:"user",content:source}]})};
  let response:Response|undefined;let lastFailure:AIUnavailableError|undefined;
  for(let attempt=0;attempt<2;attempt++){
    try{
      response=await fetch(url,{...request,signal:AbortSignal.timeout(settings.aiTimeoutMs)});
      if(response.ok)break;
      lastFailure=classifyAIError(response.status,await response.text());
      console.error(`[ai] request failed code=${lastFailure.code} status=${response.status} retryable=${lastFailure.retryable}`);
      if(!lastFailure.retryable||attempt===1)throw lastFailure;
      await new Promise(resolve=>setTimeout(resolve,500));
    }catch(error){
      if(error instanceof AIUnavailableError)throw error;
      lastFailure=new AIUnavailableError(error instanceof DOMException&&error.name==="TimeoutError"?"timeout":"network","AI 分析服务暂时不可用，当前展示最近一次分析结果。",true);
      console.error(`[ai] transport failed code=${lastFailure.code} retryable=true`);
      if(attempt===1)throw lastFailure;
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  }
  if (!response?.ok) throw lastFailure||new AIUnavailableError("provider_unavailable","AI 分析服务暂时不可用，当前展示最近一次分析结果。",false);
  const body = await response.json();
  try {
    const analysis = analysisSchema.parse(JSON.parse(body.choices?.[0]?.message?.content || "{}"));
    return { analysis, inputTokens: body.usage?.prompt_tokens || Math.ceil(source.length/4), outputTokens: body.usage?.completion_tokens || 0, model };
  } catch (error) { throw new AISchemaError(`AI 返回未通过 Schema 校验: ${String(error)}`,body.usage?.prompt_tokens||Math.ceil(source.length/4),body.usage?.completion_tokens||0,model); }
}
