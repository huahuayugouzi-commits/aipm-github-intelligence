import crypto from "node:crypto";
import type { GitHubProject } from "./types";

const seed = [
  [101, "CopilotKit/OpenDots", "Persistent AI coworkers with computers, approvals and artifacts.", 3227, 425, "TypeScript", "AI Agent", "MIT"],
  [102, "QingYunA/answer-me-with-html", "An agent skill that turns complex answers into readable interactive pages.", 1099, 92, "TypeScript", "AI SaaS", "MIT"],
  [103, "infiniflow/ragflow", "Open-source RAG engine with agent capabilities.", 91682, 10890, "Go", "RAG", "Apache-2.0"],
  [104, "OpenHands/OpenHands", "AI-driven software development agents.", 90001, 11894, "TypeScript", "AI Coding", "MIT"],
  [105, "activepieces/activepieces", "Open-source AI workflow automation and MCP toolkit.", 24907, 4296, "TypeScript", "AI Workflow", "MIT"],
  [106, "comet-ml/opik", "LLM observability, evaluation and agent tracing platform.", 22378, 1841, "Python", "AI Evaluation", "Apache-2.0"],
  [107, "Remocn/remocn-studio", "Agent-native editable video production using Remotion.", 120, 11, "TypeScript", "Multimodal AI", "MIT"],
  [108, "srbhr/Resume-Matcher", "Local AI resume tailoring and job matching product.", 28584, 5064, "Python", "AI SaaS", "Apache-2.0"],
  [109, "langchain-ai/open-swe", "Asynchronous software engineering agent and PR workflow.", 10802, 1297, "Python", "AI Coding", "MIT"],
  [110, "ianarawjo/ChainForge", "Visual prompt and model evaluation environment.", 3034, 259, "TypeScript", "AI Evaluation", "MIT"],
] as const;

export function mockProjects(): GitHubProject[] {
  return seed.map(([githubId, fullName, description, stars, forks, language, category, license], index) => {
    const readme = `# ${fullName}\n\n${description}\n\n## Features\nDocumented setup, demo workflow, API integration and deployment guidance.`;
    const pushedAt = new Date(Date.now() - index * 86400000).toISOString();
    return {
      githubId, fullName, name: fullName.split("/")[1], owner: fullName.split("/")[0],
      url: `https://github.com/${fullName}`, description, stars, forks, language,
      updatedAt: pushedAt, pushedAt, openIssues: 10 + index, readme,
      readmeHash: crypto.createHash("sha256").update(readme).digest("hex"),
      license, category: category as GitHubProject["category"], homepage: null, isMock: true,
    };
  });
}
