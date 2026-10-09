import { z } from "zod";
import { prisma } from "@/lib/db";
import { Gender, EnrollmentStatus, SessionStatus, Prisma } from "@prisma/client";

export const studentInputSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  firstName: z.string().trim().min(2, "First name must be at least 2 characters").max(60),
  middleName: z.string().trim().max(60).nullable().optional(),
  lastName: z.string().trim().min(2, "Last name must be at least 2 characters").max(60),
  gender: z.nativeEnum(Gender),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD"),
  admissionNo: z.string().trim().max(40).optional(),
  allowDuplicate: z.boolean().optional().default(false),
  guardianName: z.string().trim().max(100).nullable().optional(),
  guardianPhone: z.string().trim().max(40).nullable().optional(),
  guardianEmail: z.string().trim().email("Invalid guardian email").nullable().optional().or(z.literal("")),
  className: z.string().trim().max(50).optional(),
  arm: z.string().trim().max(30).optional(),
});

export const studentUpdateSchema = z.object({
  firstName: z.string().trim().min(2).max(60).optional(),
  middleName: z.string().trim().max(60).nullable().optional(),
  lastName: z.string().trim().min(2).max(60).optional(),
  gender: z.nativeEnum(Gender).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  admissionNo: z.string().trim().max(40).optional(),
  allowDuplicate: z.boolean().optional().default(false),
  guardianName: z.string().trim().max(100).nullable().optional(),
  guardianPhone: z.string().trim().max(40).nullable().optional(),
  guardianEmail: z.string().trim().email().nullable().optional().or(z.literal("")),
});

export type StudentInput = z.infer<typeof studentInputSchema>;
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Transaction advisory lock to serialise student creation and counter updates.
 */
export async function lockStudents(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('students:admissions'::text))`;
}

/**
 * Searches for a preexisting active student sharing the same branch, names, and date of birth.
 */
export async function findDuplicate(tx: Tx, branchId: string, firstName: string, lastName: string, dateOfBirth: string, exceptId?: string) {
  const dob = new Date(dateOfBirth);
  return tx.studentRecord.findFirst({
    where: {
      branchId,
      archivedAt: null,
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
      dateOfBirth: dob,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true, admissionNo: true },
  });
}

/**
 * Generates the next sequential admission number for a calendar year (e.g. "2026/0001").
 */
export async function generateAdmissionNo(tx: Tx, year: number): Promise<string> {
  const rows = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO "AdmissionCounter" ("year", "next")
    VALUES (${year}::int, 2)
    ON CONFLICT ("year")
    DO UPDATE SET "next" = "AdmissionCounter"."next" + 1
    RETURNING ("next" - 1)::int AS seq
  `;
  const seq = rows[0]?.seq ?? 1;
  return `${year}/${String(seq).padStart(4, "0")}`;
}

export type StudentResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string; details?: Record<string, unknown> };

/**
 * Creates a student record with namesake duplicate protection and audited override.
 */
export async function createStudent(actorUserId: string, rawInput: StudentInput): Promise<StudentResult<{ student: unknown }>> {
  const input = studentInputSchema.parse(rawInput);
  const now = new Date();
  const year = now.getFullYear();

  return prisma.$transaction(async (tx) => {
    await lockStudents(tx);

    // 1. Duplicate detection
    const duplicate = await findDuplicate(tx, input.branchId, input.firstName, input.lastName, input.dateOfBirth);

    if (duplicate && !input.allowDuplicate) {
      return {
        ok: false,
        error: `A student with this name and date of birth already exists (Admission No: ${duplicate.admissionNo}). Confirm namesake override to register.`,
        code: "POSSIBLE_DUPLICATE",
        details: { existingAdmissionNo: duplicate.admissionNo },
      };
    }

    // 2. Admission Number resolution
    let admissionNo = input.admissionNo;
    if (admissionNo) {
      const existing = await tx.studentRecord.findUnique({
        where: { admissionNo },
      });
      if (existing) {
        return {
          ok: false,
          error: `Admission number "${admissionNo}" is already taken.`,
          code: "ADMISSION_NUMBER_TAKEN",
        };
      }
    } else {
      admissionNo = await generateAdmissionNo(tx, year);
    }

    // 3. Insert student record
    const student = await tx.studentRecord.create({
      data: {
        branchId: input.branchId,
        firstName: input.firstName,
        middleName: input.middleName || null,
        lastName: input.lastName,
        gender: input.gender,
        dateOfBirth: new Date(input.dateOfBirth),
        admissionNo,
        guardianName: input.guardianName || null,
        guardianPhone: input.guardianPhone || null,
        guardianEmail: input.guardianEmail || null,
      },
    });

    // 4. Optional active session enrolment
    if (input.className) {
      const activeSession = await tx.academicSession.findFirst({
        where: { branchId: input.branchId, status: SessionStatus.ACTIVE, archivedAt: null },
      });
      if (activeSession) {
        await tx.studentEnrollment.create({
          data: {
            studentId: student.id,
            branchId: input.branchId,
            sessionId: activeSession.id,
            className: input.className,
            arm: input.arm || null,
            status: EnrollmentStatus.ACTIVE,
          },
        });
      }
    }

    // 5. Audit Log (Zero PII: only IDs, admission numbers, and override flags)
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "STUDENT_CREATED",
        targetType: "StudentRecord",
        targetId: student.id,
        afterValue: {
          id: student.id,
          admissionNo,
          branchId: input.branchId,
          ...(duplicate && input.allowDuplicate ? { duplicateOverridden: true, existingAdmissionNo: duplicate.admissionNo } : {}),
        },
      },
    });

    return { ok: true, data: { student } };
  });
}

/**
 * Updates a student record, validating against duplicates if names or birth date change.
 */
export async function updateStudent(
  actorUserId: string,
  id: string,
  rawInput: StudentUpdateInput,
): Promise<StudentResult<{ student: unknown }>> {
  const input = studentUpdateSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const student = await tx.studentRecord.findUnique({
      where: { id },
    });
    if (!student) {
      return { ok: false, error: "Student not found", code: "NOT_FOUND" };
    }

    await lockStudents(tx);

    const checkFirstName = input.firstName ?? student.firstName;
    const checkLastName = input.lastName ?? student.lastName;
    const checkDob = input.dateOfBirth ? input.dateOfBirth : student.dateOfBirth.toISOString().split("T")[0];

    // Check duplicate if name or DOB changed
    const duplicate = await findDuplicate(tx, student.branchId, checkFirstName, checkLastName, checkDob, id);
    if (duplicate && !input.allowDuplicate) {
      return {
        ok: false,
        error: `Another student with this name and date of birth exists (Admission No: ${duplicate.admissionNo}). Confirm namesake override to update.`,
        code: "POSSIBLE_DUPLICATE",
        details: { existingAdmissionNo: duplicate.admissionNo },
      };
    }

    // Check admission number conflict if changed
    if (input.admissionNo && input.admissionNo !== student.admissionNo) {
      const taken = await tx.studentRecord.findFirst({
        where: { admissionNo: input.admissionNo, id: { not: id } },
      });
      if (taken) {
        return {
          ok: false,
          error: `Admission number "${input.admissionNo}" is already taken.`,
          code: "ADMISSION_NUMBER_TAKEN",
        };
      }
    }

    const updated = await tx.studentRecord.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.middleName !== undefined ? { middleName: input.middleName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.gender !== undefined ? { gender: input.gender } : {}),
        ...(input.dateOfBirth !== undefined ? { dateOfBirth: new Date(input.dateOfBirth) } : {}),
        ...(input.admissionNo !== undefined ? { admissionNo: input.admissionNo } : {}),
        ...(input.guardianName !== undefined ? { guardianName: input.guardianName } : {}),
        ...(input.guardianPhone !== undefined ? { guardianPhone: input.guardianPhone } : {}),
        ...(input.guardianEmail !== undefined ? { guardianEmail: input.guardianEmail || null } : {}),
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "STUDENT_UPDATED",
        targetType: "StudentRecord",
        targetId: id,
        afterValue: {
          id,
          admissionNo: updated.admissionNo,
          ...(duplicate && input.allowDuplicate ? { duplicateOverridden: true, existingAdmissionNo: duplicate.admissionNo } : {}),
        },
      },
    });

    return { ok: true, data: { student: updated } };
  });
}

/**
 * Archives a student.
 */
export async function archiveStudent(actorUserId: string, id: string): Promise<StudentResult<{ id: string }>> {
  const student = await prisma.studentRecord.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: "STUDENT_ARCHIVED",
      targetType: "StudentRecord",
      targetId: id,
      afterValue: { id, admissionNo: student.admissionNo },
    },
  });

  return { ok: true, data: { id } };
}

/**
 * Restores an archived student with namesake conflict check.
 */
export async function restoreStudent(
  actorUserId: string,
  id: string,
  allowDuplicate = false,
): Promise<StudentResult<{ student: unknown }>> {
  return prisma.$transaction(async (tx) => {
    const student = await tx.studentRecord.findUnique({
      where: { id },
    });
    if (!student) {
      return { ok: false, error: "Student not found", code: "NOT_FOUND" };
    }
    if (!student.archivedAt) {
      return { ok: true, data: { student } };
    }

    await lockStudents(tx);

    const duplicate = await findDuplicate(
      tx,
      student.branchId,
      student.firstName,
      student.lastName,
      student.dateOfBirth.toISOString().split("T")[0],
      id,
    );

    if (duplicate && !allowDuplicate) {
      return {
        ok: false,
        error: `An active student with this name and date of birth exists (Admission No: ${duplicate.admissionNo}). Confirm namesake override to restore.`,
        code: "POSSIBLE_DUPLICATE",
        details: { existingAdmissionNo: duplicate.admissionNo },
      };
    }

    const restored = await tx.studentRecord.update({
      where: { id },
      data: { archivedAt: null },
    });

    await tx.auditLog.create({
      data: {
        actorUserId,
        action: "STUDENT_RESTORED",
        targetType: "StudentRecord",
        targetId: id,
        afterValue: {
          id,
          admissionNo: restored.admissionNo,
          ...(duplicate && allowDuplicate ? { duplicateOverridden: true, existingAdmissionNo: duplicate.admissionNo } : {}),
        },
      },
    });

    return { ok: true, data: { student: restored } };
  });
}

/**
 * Lists students with pagination, search, and filtering.
 */
export async function listStudents(filters: {
  branchId?: string;
  status?: "live" | "archived" | "all";
  q?: string;
  page?: number;
  limit?: number;
}) {
  const { branchId, status = "live", q, page = 1, limit = 25 } = filters;
  const skip = (page - 1) * limit;

  const where: Prisma.StudentRecordWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(status === "live" ? { archivedAt: null } : status === "archived" ? { archivedAt: { not: null } } : {}),
  };

  if (q && q.trim()) {
    const query = q.trim();
    where.OR = [
      { firstName: { contains: query, mode: "insensitive" } },
      { lastName: { contains: query, mode: "insensitive" } },
      { admissionNo: { contains: query, mode: "insensitive" } },
    ];
  }

  const [students, total] = await Promise.all([
    prisma.studentRecord.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        enrollments: {
          orderBy: { enrolledAt: "desc" },
          take: 1,
          include: { session: { select: { label: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.studentRecord.count({ where }),
  ]);

  return {
    students: students.map((s) => ({
      id: s.id,
      branchId: s.branchId,
      branchName: s.branch.name,
      firstName: s.firstName,
      middleName: s.middleName,
      lastName: s.lastName,
      gender: s.gender,
      dateOfBirth: s.dateOfBirth.toISOString().split("T")[0],
      admissionNo: s.admissionNo,
      archived: s.archivedAt !== null,
      guardianName: s.guardianName,
      guardianPhone: s.guardianPhone,
      guardianEmail: s.guardianEmail,
      currentClass: s.enrollments[0] ? `${s.enrollments[0].className}${s.enrollments[0].arm ? ` ${s.enrollments[0].arm}` : ""}` : null,
      sessionLabel: s.enrollments[0]?.session.label ?? null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Retrieves student detail by ID with complete enrolment history.
 */
export async function getStudent(id: string) {
  const student = await prisma.studentRecord.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, name: true } },
      enrollments: {
        orderBy: { enrolledAt: "desc" },
        include: { session: { select: { id: true, label: true } } },
      },
    },
  });

  if (!student) return null;

  return {
    ...student,
    dateOfBirth: student.dateOfBirth.toISOString().split("T")[0],
    archived: student.archivedAt !== null,
  };
}
