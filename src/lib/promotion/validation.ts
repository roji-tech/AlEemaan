import { z } from "zod";
import { PromotionDecision, DecisionMode } from "@prisma/client";

export const promotionPreviewQuerySchema = z.object({
  branchId: z.string().min(1, "Branch ID is required"),
  sourceSessionId: z.string().min(1, "Source session ID is required"),
  targetSessionId: z.string().min(1, "Target session ID is required"),
  sourceClassGroupId: z.string().min(1, "Source class group ID is required"),
  passMark: z.coerce.number().min(0).max(100).default(50.0),
});

export const studentPromotionOverrideSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  decision: z.nativeEnum(PromotionDecision),
  decisionMode: z.nativeEnum(DecisionMode).default(DecisionMode.AUTOMATIC),
  targetClassArmId: z.string().nullable().optional(),
  overrideReason: z.string().max(255).nullable().optional(),
});

export const executePromotionSchema = z.object({
  branchId: z.string().min(1, "Branch ID is required"),
  sourceSessionId: z.string().min(1, "Source session ID is required"),
  targetSessionId: z.string().min(1, "Target session ID is required"),
  sourceClassGroupId: z.string().min(1, "Source class group ID is required"),
  targetClassGroupId: z.string().nullable().optional(),
  passMark: z.number().min(0).max(100).default(50.0),
  overrides: z.array(studentPromotionOverrideSchema).default([]),
  notes: z.string().max(500).nullable().optional(),
});

export type PromotionPreviewQuery = z.infer<typeof promotionPreviewQuerySchema>;
export type StudentPromotionOverride = z.infer<typeof studentPromotionOverrideSchema>;
export type ExecutePromotionInput = z.infer<typeof executePromotionSchema>;
