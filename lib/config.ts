import type { Category } from "./types";

export const SEARCH_STRATEGY: Array<{ category: Category; query: string }> = [
  { category: "AI Agent", query: "topic:ai-agent stars:>100" },
  { category: "RAG", query: "RAG LLM stars:>100" },
  { category: "AI Workflow", query: "AI workflow automation stars:>100" },
  { category: "AI Coding", query: "AI coding agent stars:>100" },
  { category: "AI SaaS", query: "AI SaaS application stars:>50" },
  { category: "Multimodal AI", query: "multimodal AI stars:>100" },
  { category: "AI Evaluation", query: "LLM evaluation stars:>50" },
];

export const ANALYSIS_PROMPT_VERSION = "2026-10-06.5";
export const ANALYSIS_SCHEMA_VERSION = "1";

export const settings = {
  dataMode: process.env.DATA_MODE || (process.env.GITHUB_TOKEN ? "github" : "mock"),
  aiProvider: process.env.AI_PROVIDER || (process.env.AI_API_KEY ? "openai" : "mock"),
  timezone: process.env.APP_TIMEZONE || "Asia/Shanghai",
  maxProjectsPerRun: Number(process.env.AI_MAX_PROJECTS_PER_RUN || 5),
  githubProjectsPerCategory: Math.min(30, Math.max(1, Number(process.env.GITHUB_PROJECTS_PER_CATEGORY || 8))),
  weeklyTokenBudget: Number(process.env.AI_WEEKLY_TOKEN_BUDGET || 50000),
  dailyTokenBudget: Number(process.env.AI_DAILY_TOKEN_BUDGET || 15000),
  runTokenBudget: Number(process.env.AI_RUN_TOKEN_BUDGET || 30000),
  dailyCostBudget: Number(process.env.AI_DAILY_COST_BUDGET || 1),
  weeklyCostBudget: Number(process.env.AI_WEEKLY_COST_BUDGET || 5),
  maxInputChars: Number(process.env.AI_MAX_INPUT_CHARS || 18000),
  maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 1800),
  inputPrice: Number(process.env.AI_INPUT_PRICE || 0),
  outputPrice: Number(process.env.AI_OUTPUT_PRICE || 0),
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 60000),
};
