export type Category = "AI Agent" | "RAG" | "AI Workflow" | "AI Coding" | "AI SaaS" | "Multimodal AI" | "AI Evaluation";

export interface GitHubProject {
  githubId: number;
  fullName: string;
  name: string;
  owner: string;
  url: string;
  description: string;
  stars: number;
  forks: number;
  language: string | null;
  updatedAt: string;
  pushedAt: string;
  openIssues: number;
  readme: string;
  readmeHash: string;
  license: string | null;
  category: Category;
  homepage: string | null;
  isMock?: boolean;
}

export interface Analysis {
  positioning: string;
  targetUsers: string[];
  painPoints: string[];
  coreFeatures: string[];
  aiTouchpoints: string[];
  differentiation: string;
  commercialPotential: { assessment: string; evidenceLevel: "verified" | "inference" };
  aipmLearningValue: string;
  redevelopmentFeasibility: string;
  verifiedFacts: string[];
  assumptions: string[];
  sourceUrl: string;
  analysisDate: string;
}

export interface PipelineResult {
  runId: number;
  status: "success" | "partial" | "failed" | "skipped";
  collected: number;
  analyzed: number;
  cacheHits: number;
  failedProjects: string[];
  reportId?: number;
  message: string;
}
