import { z } from "zod";
import { resolveArmId } from "@/lib/academics/structure";
import { prisma } from "@/lib/db";
import { Gender, EnrollmentStatus, SessionStatus, StandingState, Prisma, GuardianRelationship, Residence } from "@prisma/client";
import { adminScope } from "@/lib/auth/branch-access";
import { applyMainGuardianFields, guardianInScope, linkGuardian } from "@/lib/guardians/service";
import { dayOf, studentStandingNow } from "@/lib/standing/rules";
import { birthDateRange, schoolDay, type PupilFilters } from "@/lib/students/list-filters";
import { resolveSchoolTimeZone } from "@/lib/question-bank/school-day";

export const studentInputSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  firstName: z.string().trim().min(2, "First name must be at least 2 characters").max(60),
  middleName: z.string().trim().max(60).nullable().optional(),
  lastName: z.string().trim().min(2, "Last name must be at least 2 characters").max(60),
  gender: z.nativeEnum(Gender),
  // The date of birth is not required (the maintainer, 2026-11-18: only the first name, the last name and the gender are): blank or missing is "not given".
  dateOfBirth: z.preprocess(
    (v) => (v === "" ? null : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD")
      .nullable()
      .optional(),
  ),
  admissionNo: z.string().trim().max(40).optional(),
  allowDuplicate: z.boolean().optional().default(false),
  // The main guardian (task 0113 D9): an existing guardian in the administrator's reach (`guardianId`, found by phone or e-mail), or the three fields, which find the guardian with that
  // whole phone and name in reach or make one. Either way the guardian is linked as the main contact; the pupil's own three columns are a mirror of the links.
  guardianId: z.string().trim().min(1).max(64).optional(),
  guardianRelationship: z.enum(GuardianRelationship).nullable().optional(),
  guardianName: z.string().trim().max(100).nullable().optional(),
  guardianPhone: z.string().trim().max(40).nullable().optional(),
  guardianEmail: z.string().trim().email("Invalid guardian email").nullable().optional().or(z.literal("")),
  /// Day pupil or boarder (task 0113 R1); null or missing = not set.
  residence: z.enum(Residence).nullable().optional(),
  className: z.string().trim().max(50).optional(),
  arm: z.string().trim().max(30).optional(),
});

export const studentUpdateSchema = z.object({
  firstName: z.string().trim().min(2).max(60).optional(),
  middleName: z.string().trim().max(60).nullable().optional(),
  lastName: z.string().trim().min(2).max(60).optional(),
  gender: z.nativeEnum(Gender).optional(),
  // null clears the date of birth, undefined leaves it as it is.
  dateOfBirth: z.preprocess(
    (v) => (v === "" ? null : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD")
      .nullable()
      .optional(),
  ),
  admissionNo: z.string().trim().max(40).optional(),
  allowDuplicate: z.boolean().optional().default(false),
  guardianRelationship: z.enum(GuardianRelationship).nullable().optional(),
  guardianName: z.string().trim().max(100).nullable().optional(),
  guardianPhone: z.string().trim().max(40).nullable().optional(),
  guardianEmail: z.string().trim().email().nullable().optional().or(z.literal("")),
  residence: z.enum(Residence).nullable().optional(),
});

/// A pupil record as an answer carries it: never the access code's hash (task 0113 D7), whoever asks.
export function withoutSecrets<S extends { pupilCodeHash?: string | null }>(student: S): Omit<S, "pupilCodeHash"> {
  const { pupilCodeHash, ...rest } = student;
  void pupilCodeHash;
  return rest;
}

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
 * Searches for a preexisting active student sharing the same branch and names, and the same date of birth. A date of birth is not required, so a missing one cannot tell two pupils
 * apart: a namesake whose date of birth is missing (on either side) counts as the same pupil, and the person registering is asked to confirm (the same override as before). Without
 * this a file loaded twice would register every pupil twice. The middle name counts too when BOTH have one: "Abdulbasit Balqees Zakariyya" and "Abdulbasit Romlah Zakariyya" are
 * sisters, not a namesake.
 */
export async function findDuplicate(
  tx: Tx,
  branchId: string,
  firstName: string,
  lastName: string,
  dateOfBirth: string | null | undefined,
  exceptId?: string,
  middleName?: string | null,
) {
  const dob = dateOfBirth ? new Date(dateOfBirth) : null;
  const middle = middleName?.trim() || null;
  return tx.studentRecord.findFirst({
    where: {
      branchId,
      archivedAt: null,
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
      AND: [
        ...(dob ? [{ OR: [{ dateOfBirth: dob }, { dateOfBirth: null }] }] : []),
        ...(middle
          ? [{ OR: [{ middleName: null }, { middleName: "" }, { middleName: { equals: middle, mode: "insensitive" as const } }] }]
          : []),
      ],
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true, admissionNo: true, dateOfBirth: true },
  });
}

/// What to tell the person about a namesake: with a date of birth on both sides it is the same name and birthday; otherwise there is nothing to tell them apart by.
export const namesakeText = (hasDob: boolean, found: { dateOfBirth: Date | null }) =>
  hasDob && found.dateOfBirth ? "name and date of birth" : "name (a date of birth is missing, so they cannot be told apart)";

const dayText = (value: Date | null): string | null => (value ? value.toISOString().split("T")[0] : null);

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

  return prisma
    .$transaction(async (tx): Promise<StudentResult<{ student: unknown; enrolled: boolean }>> => {
      await lockStudents(tx);

      // 1. Duplicate detection
      const duplicate = await findDuplicate(
        tx,
        input.branchId,
        input.firstName,
        input.lastName,
        input.dateOfBirth,
        undefined,
        input.middleName,
      );

      if (duplicate && !input.allowDuplicate) {
        return {
          ok: false,
          error: `A student with this ${namesakeText(!!input.dateOfBirth, duplicate)} already exists (Admission No: ${duplicate.admissionNo}). Confirm namesake override to register.`,
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
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          admissionNo,
          residence: input.residence ?? null,
        },
      });

      // 3b. The main guardian (task 0113 D9): an existing one in reach, or the one the three fields name (found or made). The pupil's guardian columns follow (the mirror).
      if (input.guardianId) {
        const scope = await adminScope(actorUserId);
        const guardian = await tx.guardian.findFirst({
          where: { id: input.guardianId, archivedAt: null, ...guardianInScope(scope) },
          select: { id: true },
        });
        if (!guardian) throw new GuardianChoiceError();
        await linkGuardian(tx, {
          studentId: student.id,
          branchId: input.branchId,
          guardianId: guardian.id,
          relationship: input.guardianRelationship,
          isMain: true,
          actorUserId,
        });
      } else if (input.guardianName?.trim() || input.guardianPhone?.trim() || input.guardianEmail?.trim()) {
        await applyMainGuardianFields(tx, await adminScope(actorUserId), {
          student,
          name: input.guardianName ?? null,
          phone: input.guardianPhone ?? null,
          email: input.guardianEmail ?? null,
          relationship: input.guardianRelationship,
          actorUserId,
        });
      }

      // 4. Optional active session enrolment
      let enrolled = false;
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
              classArmId: await resolveArmId(tx, input.branchId, input.className, input.arm),
              status: EnrollmentStatus.ACTIVE,
            },
          });
          enrolled = true;
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

      // `enrolled` is false when a class was asked for but the branch has no ACTIVE session to place the pupil in (the record is still created); the screen says so.
      const saved = await tx.studentRecord.findUniqueOrThrow({ where: { id: student.id } });
      return { ok: true, data: { student: withoutSecrets(saved), enrolled } };
    })
    .catch((error: unknown) => {
      if (error instanceof GuardianChoiceError)
        return { ok: false, error: "That guardian is not one you can choose.", code: "GUARDIAN_NOT_FOUND" };
      throw error;
    });
}

/// The guardian chosen on the form is unknown, archived or out of the administrator's reach: the whole registration is undone (thrown out of the transaction) and the form says so.
class GuardianChoiceError extends Error {}

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
    const checkDob = input.dateOfBirth === undefined ? dayText(student.dateOfBirth) : input.dateOfBirth;
    const checkMiddle = input.middleName === undefined ? student.middleName : input.middleName;

    // Check for a namesake only when the name or the date of birth is being changed: with a date of birth not required, two pupils with the same name and none must still be editable
    // (a guardian's phone, a class) without being asked to confirm a namesake every time.
    const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const identityChanged =
      !sameName(checkFirstName, student.firstName) ||
      !sameName(checkLastName, student.lastName) ||
      !sameName(checkMiddle ?? "", student.middleName ?? "") ||
      checkDob !== dayText(student.dateOfBirth);
    const duplicate = identityChanged
      ? await findDuplicate(tx, student.branchId, checkFirstName, checkLastName, checkDob, id, checkMiddle)
      : null;
    if (duplicate && !input.allowDuplicate) {
      return {
        ok: false,
        error: `Another student with this ${namesakeText(!!checkDob, duplicate)} exists (Admission No: ${duplicate.admissionNo}). Confirm namesake override to update.`,
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
        ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null } : {}),
        ...(input.admissionNo !== undefined ? { admissionNo: input.admissionNo } : {}),
        ...(input.residence !== undefined ? { residence: input.residence } : {}),
      },
    });

    // The main guardian (task 0113 D9): the old three fields keep working, now through the guardian links (`applyMainGuardianFields`); the pupil's columns follow (the mirror).
    const guardianChanged =
      input.guardianName !== undefined ||
      input.guardianPhone !== undefined ||
      input.guardianEmail !== undefined ||
      input.guardianRelationship !== undefined;
    if (guardianChanged)
      await applyMainGuardianFields(tx, await adminScope(actorUserId), {
        student: updated,
        name: input.guardianName,
        phone: input.guardianPhone,
        email: input.guardianEmail,
        relationship: input.guardianRelationship,
        actorUserId,
      });
    const saved = guardianChanged ? await tx.studentRecord.findUniqueOrThrow({ where: { id } }) : updated;

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
          ...(input.residence !== undefined && input.residence !== student.residence ? { residence: input.residence } : {}),
          ...(duplicate && input.allowDuplicate ? { duplicateOverridden: true, existingAdmissionNo: duplicate.admissionNo } : {}),
        },
      },
    });

    return { ok: true, data: { student: withoutSecrets(saved) } };
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
      return { ok: true, data: { student: withoutSecrets(student) } };
    }

    await lockStudents(tx);

    const duplicate = await findDuplicate(
      tx,
      student.branchId,
      student.firstName,
      student.lastName,
      dayText(student.dateOfBirth),
      id,
      student.middleName,
    );

    if (duplicate && !allowDuplicate) {
      return {
        ok: false,
        error: `An active student with this ${namesakeText(!!student.dateOfBirth, duplicate)} exists (Admission No: ${duplicate.admissionNo}). Confirm namesake override to restore.`,
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

    return { ok: true, data: { student: withoutSecrets(restored) } };
  });
}

/**
 * Lists students with pagination, search, and filtering.
 */
export type StudentListFilters = {
  /// Branches the caller may see: `"all"` (an ADMIN) or a list. A requested `branchId` outside it yields an empty page (the route answers 404 first).
  visible: "all" | string[];
  branchId?: string;
  status?: "live" | "archived" | "all";
  /// Only pupils whose standing applies today: "suspended" (a suspension that has not ended) or "expelled" (task 0045).
  standing?: "suspended" | "expelled";
  q?: string;
  /// Class, arm, gender and age (task 0103 D1).
  filters?: PupilFilters;
};

/// Which pupils a list (and its export, task 0103 D3) holds: one `where` for both, so they can never disagree. A class is the class of the pupil's enrolment in the branch's ACTIVE session
/// (where registration puts them); with no active session, any enrolment. "No class yet" is no such enrolment. Age is on the school's day today; a pupil with no date of birth is left out
/// when an age is asked for, and `noDateOfBirth` says how many matched everything else.
export async function studentListWhere(
  args: StudentListFilters,
): Promise<{ where: Prisma.StudentRecordWhereInput; withoutAge: Prisma.StudentRecordWhereInput | null }> {
  const { visible, branchId, status = "live", standing, q, filters = {} } = args;
  const todayDay = dayOf(new Date());
  const and: Prisma.StudentRecordWhereInput[] = [];
  if (filters.classGroupId || filters.noClass) {
    const active = branchId
      ? await prisma.academicSession.findFirst({
          where: { branchId, status: SessionStatus.ACTIVE, archivedAt: null },
          select: { id: true },
        })
      : null;
    const session = active ? { sessionId: active.id } : {};
    if (filters.noClass) and.push({ enrollments: { none: session } });
    else
      and.push({
        enrollments: {
          some: {
            ...session,
            classArm: { classGroupId: filters.classGroupId, ...(filters.classArmId ? { id: filters.classArmId } : {}) },
          },
        },
      });
  }
  if (filters.gender) and.push({ gender: filters.gender });
  if (filters.residence) and.push({ residence: filters.residence === "NONE" ? null : filters.residence });
  if (filters.scholarship) {
    // "Live" is the school's day today: not ended, started (or no start), not past its last day (or no end). The same definition as the invoices use (lib/scholarships/rules.ts `liveOn`).
    const day = new Date(`${schoolDay(new Date(), resolveSchoolTimeZone())}T00:00:00Z`);
    const live: Prisma.StudentScholarshipWhereInput = {
      endedAt: null,
      OR: [{ startsOn: null }, { startsOn: { lte: day } }],
      AND: [{ OR: [{ endsOn: null }, { endsOn: { gte: day } }] }],
      ...(filters.scholarship !== "ANY" && filters.scholarship !== "NONE" ? { typeId: filters.scholarship } : {}),
    };
    and.push(filters.scholarship === "NONE" ? { scholarships: { none: live } } : { scholarships: { some: live } });
  }

  const where: Prisma.StudentRecordWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(visible === "all" ? {} : { branchId: branchId && visible.includes(branchId) ? branchId : { in: visible } }),
    ...(status === "live" ? { archivedAt: null } : status === "archived" ? { archivedAt: { not: null } } : {}),
    ...(standing === "expelled"
      ? { standing: StandingState.EXPELLED }
      : standing === "suspended"
        ? {
            standing: StandingState.SUSPENDED,
            OR: [{ standingUntil: null }, { standingUntil: { gte: new Date(`${todayDay}T00:00:00Z`) } }],
          }
        : {}),
  };
  if (q && q.trim()) {
    const query = q.trim();
    and.push({
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { admissionNo: { contains: query, mode: "insensitive" } },
      ],
    });
  }
  const base: Prisma.StudentRecordWhereInput = and.length > 0 ? { ...where, AND: and } : where;
  if (filters.ageMin === undefined && filters.ageMax === undefined) return { where: base, withoutAge: null };
  const range = birthDateRange(filters.ageMin, filters.ageMax, schoolDay(new Date(), resolveSchoolTimeZone()));
  const born: Prisma.DateTimeNullableFilter = {
    not: null,
    ...(range.earliest ? { gte: new Date(`${range.earliest}T00:00:00Z`) } : {}),
    ...(range.latest ? { lte: new Date(`${range.latest}T00:00:00Z`) } : {}),
  };
  return {
    where: { ...where, AND: [...and, { dateOfBirth: born }] },
    withoutAge: { ...where, AND: [...and, { dateOfBirth: null }] },
  };
}

/**
 * Lists students with pagination, search, and filtering.
 */
export async function listStudents(args: StudentListFilters & { page?: number; limit?: number }) {
  const { page = 1, limit = 25 } = args;
  const todayDay = dayOf(new Date());
  const skip = (page - 1) * limit;
  const { where, withoutAge } = await studentListWhere(args);

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
  const noDateOfBirth = withoutAge ? await prisma.studentRecord.count({ where: withoutAge }) : null;

  return {
    students: students.map((s) => ({
      id: s.id,
      branchId: s.branchId,
      branchName: s.branch.name,
      firstName: s.firstName,
      middleName: s.middleName,
      lastName: s.lastName,
      gender: s.gender,
      dateOfBirth: dayText(s.dateOfBirth),
      admissionNo: s.admissionNo,
      archived: s.archivedAt !== null,
      standing: studentStandingNow(s, todayDay),
      standingUntil: s.standingUntil && studentStandingNow(s, todayDay) === "SUSPENDED" ? dayOf(s.standingUntil) : null,
      guardianName: s.guardianName,
      guardianPhone: s.guardianPhone,
      guardianEmail: s.guardianEmail,
      residence: s.residence,
      currentClass: s.enrollments[0] ? `${s.enrollments[0].className}${s.enrollments[0].arm ? ` ${s.enrollments[0].arm}` : ""}` : null,
      sessionLabel: s.enrollments[0]?.session.label ?? null,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    /// When an age was asked for: how many pupils matched everything else but have no date of birth, so their age could not be checked (task 0103 D1).
    noDateOfBirth,
  };
}

/**
 * Retrieves student detail by ID with complete enrolment history.
 */
export async function getStudent(id: string, visible: "all" | string[] = []) {
  // A student of a branch the caller cannot see is "not found" (the same answer as an unknown id).
  const student = await prisma.studentRecord.findFirst({
    where: { id, ...(visible === "all" ? {} : { branchId: { in: visible } }) },
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
    ...withoutSecrets(student),
    dateOfBirth: dayText(student.dateOfBirth),
    archived: student.archivedAt !== null,
    // What applies today (an ended suspension reads as in good standing), not the stored value.
    standing: studentStandingNow(student, dayOf(new Date())),
    standingUntil: student.standingUntil ? dayOf(student.standingUntil) : null,
  };
}
