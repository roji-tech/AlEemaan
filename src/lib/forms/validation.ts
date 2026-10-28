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

export const createQuestionnaireSchema = z.object({
  branchId: idSchema,
  title: z.string().min(1).max(200),
  instructions: z.string().max(5000).optional().nullable(),
  isAnonymous: z.boolean().default(false),
  audienceKind: z.enum(["MEMBERS", "PUBLIC"]).default("MEMBERS"),
  roles: z.array(z.string().min(1).max(50)).optional().default([]),
  classGroupIds: z.array(idSchema).optional().default([]),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
  questions: z.array(
    z.object({
      prompt: z.string().min(1).max(20000),
      questionType: z.nativeEnum(BankQuestionType).optional(),
      options: z.any().optional(),
      sortOrder: z.number().int().min(0).default(0),
    }),
  ).min(1, "Questionnaire must contain at least one question."),
});

export const updateQuestionnaireSchema = z.object({
  branchId: idSchema.optional(),
  title: z.string().min(1).max(200).optional(),
  instructions: z.string().max(5000).optional().nullable(),
  status: z.nativeEnum(FormStatus).optional(),
  isAnonymous: z.boolean().optional(),
  audienceKind: z.enum(["MEMBERS", "PUBLIC"]).optional(),
  roles: z.array(z.string().min(1).max(50)).optional(),
  classGroupIds: z.array(idSchema).optional(),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
});

export const submitQuestionnaireSchema = z.object({
  answers: z.array(
    z.object({
      formQuestionId: idSchema,
      value: z.any(),
    }),
  ).min(1, "You must provide at least one answer."),
});

export const createPaperWorkSchema = z.object({
  branchId: idSchema,
  title: z.string().min(1).max(200),
  instructions: z.string().max(5000).optional().nullable(),
  classGroupIds: z.array(idSchema).min(1, "Paper work requires at least one target class group."),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
  maxDurationMinutes: z.number().int().min(1).max(1440).optional().nullable(),
});

export const updatePaperWorkSchema = z.object({
  branchId: idSchema.optional(),
  title: z.string().min(1).max(200).optional(),
  instructions: z.string().max(5000).optional().nullable(),
  status: z.nativeEnum(FormStatus).optional(),
  classGroupIds: z.array(idSchema).optional(),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
  maxDurationMinutes: z.number().int().min(1).max(1440).optional().nullable(),
});

export const updateTurnInSchema = z.object({
  status: z.enum(["PENDING", "HANDED_IN", "LATE"]),
  note: z.string().max(500).optional().nullable(),
});

export const batchUpdateTurnInsSchema = z.object({
  updates: z.array(
    z.object({
      studentId: idSchema,
      status: z.enum(["PENDING", "HANDED_IN", "LATE"]),
      note: z.string().max(500).optional().nullable(),
    }),
  ).min(1, "At least one turn-in update is required."),
});


