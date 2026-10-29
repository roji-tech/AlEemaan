import { z } from "zod";
import { AssignmentStatus, SubmissionStatus, QuestionType, QuizStatus } from "@prisma/client";

export const attachmentSchema = z.object({
  title: z.string().min(1, "Attachment title is required"),
  url: z.string().url("Valid URL is required"),
});

export const createAssignmentSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  subjectId: z.string().min(1, "Subject is required"),
  classGroupId: z.string().optional().nullable(),
  classArmId: z.string().optional().nullable(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  totalPoints: z.number().int().min(1).max(1000).default(100),
  allowLate: z.boolean().default(true),
  status: z.nativeEnum(AssignmentStatus).default(AssignmentStatus.DRAFT),
  attachments: z.array(attachmentSchema).default([]),
});

export const updateAssignmentSchema = createAssignmentSchema.partial().omit({ branchId: true });

export const submitAssignmentSchema = z
  .object({
    content: z.string().optional().nullable(),
    attachments: z.array(attachmentSchema).default([]),
  })
  .refine((data) => data.content?.trim() || data.attachments.length > 0, {
    message: "Either submission text content or at least one attachment must be provided",
  });

export const gradeSubmissionSchema = z.object({
  score: z.number().min(0, "Score cannot be negative"),
  feedback: z.string().optional().nullable(),
  status: z.nativeEnum(SubmissionStatus).default(SubmissionStatus.GRADED),
});

export const createMaterialSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  subjectId: z.string().min(1, "Subject is required"),
  classGroupId: z.string().optional().nullable(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  attachments: z.array(attachmentSchema).default([]),
});

export const updateMaterialSchema = createMaterialSchema.partial().omit({ branchId: true });

export const quizQuestionSchema = z.object({
  id: z.string().optional(),
  prompt: z.string().min(1, "Prompt is required"),
  questionType: z.nativeEnum(QuestionType).default(QuestionType.MULTIPLE_CHOICE),
  options: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  correctAnswer: z.string().min(1, "Correct answer is required"),
  points: z.number().int().min(1).default(1),
  sortOrder: z.number().int().default(0),
  sourceItemId: z.string().optional().nullable(),
  sourceVersion: z.number().int().optional().nullable(),
  exposedToPractice: z.boolean().optional().default(false),
});

export const createQuizSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  subjectId: z.string().min(1, "Subject is required"),
  classGroupId: z.string().optional().nullable(),
  title: z.string().min(1, "Title is required").max(200),
  instructions: z.string().optional().nullable(),
  timeLimitMinutes: z.number().int().min(1).max(360).optional().nullable(),
  passingScore: z.number().min(0).max(100).optional().nullable(),
  isExamTemplate: z.boolean().optional().default(false),
  examWindowStart: z.string().datetime().optional().nullable(),
  examWindowEnd: z.string().datetime().optional().nullable(),
  status: z.nativeEnum(QuizStatus).default(QuizStatus.DRAFT),
  questions: z.array(quizQuestionSchema).min(1, "At least one question is required"),
});

export const updateQuizSchema = createQuizSchema.partial().omit({ branchId: true });

export const offerBackSchema = z.object({
  quizId: z.string().min(1, "Quiz ID is required"),
  quizQuestionId: z.string().min(1, "Question ID is required"),
  subjectLabel: z.string().max(100).optional(),
  topic: z.string().max(100).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
});

export const quizAttemptAnswerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().min(1),
});

export const submitQuizAttemptSchema = z.object({
  answers: z.array(quizAttemptAnswerSchema),
});
