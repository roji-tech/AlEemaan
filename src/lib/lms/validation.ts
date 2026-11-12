import { z } from "zod";
import { AssignmentStatus, MaterialStatus, MaterialType, SubmissionStatus, QuestionType, QuizStatus } from "@prisma/client";
import { isWebLink } from "./attachments";

export const attachmentSchema = z.object({
  title: z.string().min(1, "Attachment title is required"),
  url: z.string().url("Valid URL is required").refine(isWebLink, "The link must start with http:// or https://"),
});

// The fields of each kind of coursework WITHOUT defaults. The create schema adds the defaults; the update schema is these fields, all optional. An update schema
// made from the create schema with `.partial()` applied the defaults of every field the request did not send (Zod 4), so `PATCH { title }` unpublished an
// assignment, set its points back to 100 and emptied its attachments (task 0066).
const assignmentFields = z.object({
  branchId: z.string().min(1, "Branch is required"),
  subjectId: z.string().min(1, "Subject is required"),
  classGroupId: z.string().optional().nullable(),
  classArmId: z.string().optional().nullable(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  totalPoints: z.number().int().min(1).max(1000),
  allowLate: z.boolean(),
  status: z.nativeEnum(AssignmentStatus),
  attachments: z.array(attachmentSchema),
});

export const createAssignmentSchema = assignmentFields.extend({
  totalPoints: assignmentFields.shape.totalPoints.default(100),
  allowLate: assignmentFields.shape.allowLate.default(true),
  status: assignmentFields.shape.status.default(AssignmentStatus.DRAFT),
  attachments: assignmentFields.shape.attachments.default([]),
});

export const updateAssignmentSchema = assignmentFields.partial().omit({ branchId: true });

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

const materialFields = z.object({
  branchId: z.string().min(1, "Branch is required"),
  subjectId: z.string().min(1, "Subject is required"),
  classGroupId: z.string().optional().nullable(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  materialType: z.nativeEnum(MaterialType),
  status: z.nativeEnum(MaterialStatus),
  attachments: z.array(attachmentSchema),
});

export const createMaterialSchema = materialFields.extend({
  materialType: materialFields.shape.materialType.default(MaterialType.DOCUMENT),
  status: materialFields.shape.status.default(MaterialStatus.PUBLISHED),
  attachments: materialFields.shape.attachments.default([]),
});

export const updateMaterialSchema = materialFields.partial().omit({ branchId: true });

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

const quizFields = z.object({
  branchId: z.string().min(1, "Branch is required"),
  subjectId: z.string().min(1, "Subject is required"),
  classGroupId: z.string().optional().nullable(),
  title: z.string().min(1, "Title is required").max(200),
  instructions: z.string().optional().nullable(),
  timeLimitMinutes: z.number().int().min(1).max(360).optional().nullable(),
  passingScore: z.number().min(0).max(100).optional().nullable(),
  isExamTemplate: z.boolean(),
  examWindowStart: z.string().datetime().optional().nullable(),
  examWindowEnd: z.string().datetime().optional().nullable(),
  status: z.nativeEnum(QuizStatus),
  questions: z.array(quizQuestionSchema).min(1, "At least one question is required"),
});

export const createQuizSchema = quizFields.extend({
  isExamTemplate: quizFields.shape.isExamTemplate.optional().default(false),
  status: quizFields.shape.status.default(QuizStatus.DRAFT),
});

export const updateQuizSchema = quizFields.partial().omit({ branchId: true });

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
