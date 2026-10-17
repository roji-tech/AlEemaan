import { prisma } from "@/lib/db";
import { AssignmentStatus, SubmissionStatus, QuizStatus, Prisma } from "@prisma/client";
import { resolveSubmissionStatus, evaluateQuizAttempt, type QuizAnswerItem } from "./rules";

export class LmsError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = "LmsError";
  }
}

// --- Assignments ---

export interface CreateAssignmentParams {
  branchId: string;
  subjectId: string;
  classGroupId?: string | null;
  classArmId?: string | null;
  title: string;
  description?: string | null;
  instructions?: string | null;
  dueDate?: string | null;
  totalPoints?: number;
  allowLate?: boolean;
  status?: AssignmentStatus;
  attachments?: { title: string; url: string }[];
  createdById?: string | null;
}

export async function createAssignment(params: CreateAssignmentParams) {
  let staffId: string | null = null;
  if (params.createdById) {
    const staff = await prisma.staffRecord.findFirst({
      where: {
        branchId: params.branchId,
        OR: [{ id: params.createdById }, { userId: params.createdById }],
      },
      select: { id: true },
    });
    staffId = staff?.id ?? null;
  }

  return prisma.assignment.create({
    data: {
      branchId: params.branchId,
      subjectId: params.subjectId,
      classGroupId: params.classGroupId,
      classArmId: params.classArmId,
      title: params.title,
      description: params.description,
      instructions: params.instructions,
      dueDate: params.dueDate ? new Date(params.dueDate) : null,
      totalPoints: params.totalPoints ?? 100,
      allowLate: params.allowLate ?? true,
      status: params.status ?? AssignmentStatus.DRAFT,
      attachments: params.attachments ? (params.attachments as unknown as Prisma.InputJsonValue) : [],
      createdById: staffId,
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      classGroup: { select: { id: true, name: true } },
      classArm: { select: { id: true, name: true } },
    },
  });
}

export async function listAssignments(branchId: string, filter?: { subjectId?: string; classGroupId?: string; status?: AssignmentStatus }) {
  return prisma.assignment.findMany({
    where: {
      branchId,
      archivedAt: null,
      ...(filter?.subjectId ? { subjectId: filter.subjectId } : {}),
      ...(filter?.classGroupId ? { classGroupId: filter.classGroupId } : {}),
      ...(filter?.status ? { status: filter.status } : {}),
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      classGroup: { select: { id: true, name: true } },
      classArm: { select: { id: true, name: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAssignmentById(branchId: string, id: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { id, branchId, archivedAt: null },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      classGroup: { select: { id: true, name: true } },
      classArm: { select: { id: true, name: true } },
      submissions: {
        include: {
          student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  if (!assignment) {
    throw new LmsError("Assignment not found", 404);
  }
  return assignment;
}

export async function updateAssignment(branchId: string, id: string, data: Partial<CreateAssignmentParams>) {
  await getAssignmentById(branchId, id);

  return prisma.assignment.update({
    where: { branchId_id: { branchId, id } },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.instructions !== undefined ? { instructions: data.instructions } : {}),
      ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
      ...(data.totalPoints !== undefined ? { totalPoints: data.totalPoints } : {}),
      ...(data.allowLate !== undefined ? { allowLate: data.allowLate } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.attachments !== undefined ? { attachments: data.attachments as unknown as Prisma.InputJsonValue } : {}),
      ...(data.classGroupId !== undefined ? { classGroupId: data.classGroupId } : {}),
      ...(data.classArmId !== undefined ? { classArmId: data.classArmId } : {}),
      ...(data.subjectId !== undefined ? { subjectId: data.subjectId } : {}),
    },
  });
}

export async function archiveAssignment(branchId: string, id: string) {
  await getAssignmentById(branchId, id);

  return prisma.assignment.update({
    where: { branchId_id: { branchId, id } },
    data: { archivedAt: new Date() },
  });
}

// --- Submissions & Speed Grader ---

export interface SubmitAssignmentParams {
  content?: string | null;
  attachments?: { title: string; url: string }[];
}

export async function submitAssignment(branchId: string, assignmentId: string, studentId: string, params: SubmitAssignmentParams) {
  const assignment = await getAssignmentById(branchId, assignmentId);
  const now = new Date();

  const resolution = resolveSubmissionStatus(assignment.dueDate, assignment.allowLate, now);
  if (!resolution.isAllowed) {
    throw new LmsError("Assignment deadline has passed and late submissions are not allowed", 400);
  }

  return prisma.assignmentSubmission.upsert({
    where: {
      branchId_assignmentId_studentId: {
        branchId,
        assignmentId,
        studentId,
      },
    },
    create: {
      branchId,
      assignmentId,
      studentId,
      content: params.content,
      attachments: params.attachments ? (params.attachments as unknown as Prisma.InputJsonValue) : [],
      status: resolution.status,
      submittedAt: now,
    },
    update: {
      content: params.content,
      attachments: params.attachments ? (params.attachments as unknown as Prisma.InputJsonValue) : [],
      status: resolution.status,
      submittedAt: now,
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
    },
  });
}

export async function gradeSubmission(
  branchId: string,
  assignmentId: string,
  submissionId: string,
  data: { score: number; feedback?: string | null; status?: SubmissionStatus },
  staffId?: string | null,
) {
  const submission = await prisma.assignmentSubmission.findFirst({
    where: { id: submissionId, assignmentId, branchId },
  });

  if (!submission) {
    throw new LmsError("Submission not found", 404);
  }

  let graderStaffId: string | null = null;
  if (staffId) {
    const staff = await prisma.staffRecord.findFirst({
      where: {
        branchId,
        OR: [{ id: staffId }, { userId: staffId }],
      },
      select: { id: true },
    });
    graderStaffId = staff?.id ?? null;
  }

  return prisma.assignmentSubmission.update({
    where: { branchId_id: { branchId, id: submissionId } },
    data: {
      score: data.score,
      feedback: data.feedback,
      status: data.status ?? SubmissionStatus.GRADED,
      gradedById: graderStaffId,
      gradedAt: new Date(),
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
    },
  });
}

// --- Learning Materials ---

export interface CreateMaterialParams {
  branchId: string;
  subjectId: string;
  classGroupId?: string | null;
  title: string;
  description?: string | null;
  content?: string | null;
  attachments?: { title: string; url: string }[];
  createdById?: string | null;
}

export async function createMaterial(params: CreateMaterialParams) {
  let staffId: string | null = null;
  if (params.createdById) {
    const staff = await prisma.staffRecord.findFirst({
      where: {
        branchId: params.branchId,
        OR: [{ id: params.createdById }, { userId: params.createdById }],
      },
      select: { id: true },
    });
    staffId = staff?.id ?? null;
  }

  return prisma.learningMaterial.create({
    data: {
      branchId: params.branchId,
      subjectId: params.subjectId,
      classGroupId: params.classGroupId,
      title: params.title,
      description: params.description,
      content: params.content,
      attachments: params.attachments ? (params.attachments as unknown as Prisma.InputJsonValue) : [],
      createdById: staffId,
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      classGroup: { select: { id: true, name: true } },
    },
  });
}

export async function listMaterials(branchId: string, filter?: { subjectId?: string; classGroupId?: string }) {
  return prisma.learningMaterial.findMany({
    where: {
      branchId,
      archivedAt: null,
      ...(filter?.subjectId ? { subjectId: filter.subjectId } : {}),
      ...(filter?.classGroupId ? { classGroupId: filter.classGroupId } : {}),
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      classGroup: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMaterialById(branchId: string, id: string) {
  const material = await prisma.learningMaterial.findFirst({
    where: { id, branchId, archivedAt: null },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      classGroup: { select: { id: true, name: true } },
    },
  });

  if (!material) {
    throw new LmsError("Learning material not found", 404);
  }
  return material;
}

export async function updateMaterial(branchId: string, id: string, data: Partial<CreateMaterialParams>) {
  await getMaterialById(branchId, id);

  return prisma.learningMaterial.update({
    where: { branchId_id: { branchId, id } },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.attachments !== undefined ? { attachments: data.attachments as unknown as Prisma.InputJsonValue } : {}),
      ...(data.classGroupId !== undefined ? { classGroupId: data.classGroupId } : {}),
      ...(data.subjectId !== undefined ? { subjectId: data.subjectId } : {}),
    },
  });
}

export async function archiveMaterial(branchId: string, id: string) {
  await getMaterialById(branchId, id);

  return prisma.learningMaterial.update({
    where: { branchId_id: { branchId, id } },
    data: { archivedAt: new Date() },
  });
}

// --- Quizzes ---

export interface CreateQuizParams {
  branchId: string;
  subjectId: string;
  classGroupId?: string | null;
  title: string;
  instructions?: string | null;
  timeLimitMinutes?: number | null;
  passingScore?: number | null;
  status?: QuizStatus;
  createdById?: string | null;
  questions: {
    prompt: string;
    questionType?: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
    options?: { id: string; text: string }[];
    correctAnswer: string;
    points?: number;
    sortOrder?: number;
  }[];
}

export async function createQuiz(params: CreateQuizParams) {
  let staffId: string | null = null;
  if (params.createdById) {
    const staff = await prisma.staffRecord.findFirst({
      where: {
        branchId: params.branchId,
        OR: [{ id: params.createdById }, { userId: params.createdById }],
      },
      select: { id: true },
    });
    staffId = staff?.id ?? null;
  }

  return prisma.quiz.create({
    data: {
      branchId: params.branchId,
      subjectId: params.subjectId,
      classGroupId: params.classGroupId,
      title: params.title,
      instructions: params.instructions,
      timeLimitMinutes: params.timeLimitMinutes,
      passingScore: params.passingScore,
      status: params.status ?? QuizStatus.DRAFT,
      createdById: staffId,
      questions: {
        create: params.questions.map((q, idx) => ({
          prompt: q.prompt,
          questionType: q.questionType ?? "MULTIPLE_CHOICE",
          options: q.options ? (q.options as unknown as Prisma.InputJsonValue) : [],
          correctAnswer: q.correctAnswer,
          points: q.points ?? 1,
          sortOrder: q.sortOrder ?? idx,
        })),
      },
    },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      subject: { select: { id: true, name: true, code: true } },
      classGroup: { select: { id: true, name: true } },
    },
  });
}

export async function listQuizzes(branchId: string, filter?: { subjectId?: string; status?: QuizStatus }) {
  return prisma.quiz.findMany({
    where: {
      branchId,
      archivedAt: null,
      ...(filter?.subjectId ? { subjectId: filter.subjectId } : {}),
      ...(filter?.status ? { status: filter.status } : {}),
    },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      subject: { select: { id: true, name: true, code: true } },
      classGroup: { select: { id: true, name: true } },
      _count: { select: { questions: true, attempts: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getQuizById(branchId: string, id: string) {
  const quiz = await prisma.quiz.findFirst({
    where: { id, branchId, archivedAt: null },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      subject: { select: { id: true, name: true, code: true } },
      classGroup: { select: { id: true, name: true } },
      attempts: {
        include: {
          student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        },
        orderBy: { completedAt: "desc" },
      },
    },
  });

  if (!quiz) {
    throw new LmsError("Quiz not found", 404);
  }
  return quiz;
}

export async function archiveQuiz(branchId: string, id: string) {
  await getQuizById(branchId, id);

  return prisma.quiz.update({
    where: { branchId_id: { branchId, id } },
    data: { archivedAt: new Date() },
  });
}

export async function attemptQuiz(branchId: string, quizId: string, studentId: string, answers: QuizAnswerItem[]) {
  const quiz = await getQuizById(branchId, quizId);
  const questions = quiz.questions.map((q) => ({
    id: q.id,
    correctAnswer: q.correctAnswer,
    points: q.points,
  }));

  const evaluation = evaluateQuizAttempt(questions, answers, quiz.passingScore);

  return prisma.quizAttempt.create({
    data: {
      branchId,
      quizId,
      studentId,
      answers: answers as unknown as Prisma.InputJsonValue,
      score: evaluation.percentage,
      isPassed: evaluation.isPassed,
      completedAt: new Date(),
    },
    include: {
      quiz: { select: { id: true, title: true, passingScore: true } },
    },
  });
}
