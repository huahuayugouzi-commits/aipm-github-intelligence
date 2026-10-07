import { z } from "zod";

export const analysisSchema = z.object({
  positioning: z.string().min(1),
  targetUsers: z.array(z.string()),
  painPoints: z.array(z.string()),
  coreFeatures: z.array(z.string()),
  aiTouchpoints: z.array(z.string()),
  differentiation: z.string(),
  commercialPotential: z.object({ assessment: z.string(), evidenceLevel: z.enum(["verified", "inference"]) }),
  aipmLearningValue: z.string(),
  redevelopmentFeasibility: z.string(),
  verifiedFacts: z.array(z.string()),
  assumptions: z.array(z.string()),
  sourceUrl: z.string().url(),
  analysisDate: z.string(),
});
