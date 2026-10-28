import { z } from "zod";
import { BankQuestionType, FormStatus } from "@prisma/client";

export const idSchema = z.string().min(1).max(64);

export const formQuestionInputSchema = z.object({
  sourceItemId: idSchema.optional().nullable(),
  prompt: z.string().min(1).max(20000).optional(),
  questionType: z.nativeEnum(BankQuestionType).optional(),
  options: z.any().optional(),
  correctAnswer: z.string().max(2000).optional().nullable(),
  explanation: z.string().max(2000).optional().nullable(),
  points: z.number().int().min(0).max(100).default(1),
  sortOrder: z.number().int().min(0).default(0),
});

export const createPracticeSetSchema = z.object({
  branchId: idSchema,
  title: z.string().min(1).max(200),
  instructions: z.string().max(2000).optional().nullable(),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
  maxDurationMinutes: z.number().int().min(1).max(1440).optional().nullable(),
  classGroupIds: z.array(idSchema).optional().default([]),
  questions: z.array(formQuestionInputSchema).min(1, "Practice set must contain at least one question."),
});

export const updatePracticeSetSchema = z.object({
  branchId: idSchema.optional(),
  title: z.string().min(1).max(200).optional(),
  instructions: z.string().max(2000).optional().nullable(),
  status: z.nativeEnum(FormStatus).optional(),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
  maxDurationMinutes: z.number().int().min(1).max(1440).optional().nullable(),
  classGroupIds: z.array(idSchema).optional(),
});

export const submitFormAnswersSchema = z.object({
  answers: z.array(
    z.object({
      formQuestionId: idSchema,
      value: z.any(),
    }),
  ),
});
