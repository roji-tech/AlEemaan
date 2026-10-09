import { prisma } from "@/lib/db";
import { Gender, EnrollmentStatus, SessionStatus } from "@prisma/client";
import { findDuplicate, generateAdmissionNo, lockStudents } from "./service";

export type ImportStudentRow = {
  branchId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: Gender;
  dateOfBirth: string; // YYYY-MM-DD
  admissionNo?: string | null;
  className?: string | null;
  arm?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
};

export type ImportResult = {
  total: number;
  imported: number;
  overridden: number;
  failed: number;
  conflicts: { row: number; name: string; existingAdmissionNo: string }[];
  errors: { row: number; error: string }[];
};

/**
 * Bulk imports students from parsed rows within a single transaction per branch.
 */
export async function importStudents(
  actorUserId: string,
  branchId: string,
  rows: ImportStudentRow[],
  allowDuplicates = false,
): Promise<ImportResult> {
  const result: ImportResult = {
    total: rows.length,
    imported: 0,
    overridden: 0,
    failed: 0,
    conflicts: [],
    errors: [],
  };

  const now = new Date();
  const year = now.getFullYear();

  await prisma.$transaction(async (tx) => {
    await lockStudents(tx);

    const activeSession = await tx.academicSession.findFirst({
      where: { branchId, status: SessionStatus.ACTIVE, archivedAt: null },
    });

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      const r = rows[i];

      // 1. Basic validation
      if (!r.firstName || !r.lastName || !r.dateOfBirth || !r.gender) {
        result.failed++;
        result.errors.push({ row: rowNum, error: "Missing required fields (First Name, Last Name, Gender, Date of Birth)" });
        continue;
      }

      // 2. Duplicate check
      const duplicate = await findDuplicate(tx, branchId, r.firstName, r.lastName, r.dateOfBirth);

      if (duplicate && !allowDuplicates) {
        result.failed++;
        result.conflicts.push({
          row: rowNum,
          name: `${r.firstName} ${r.lastName}`,
          existingAdmissionNo: duplicate.admissionNo,
        });
        continue;
      }

      // 3. Admission number
      let admissionNo = r.admissionNo;
      if (admissionNo) {
        const taken = await tx.studentRecord.findUnique({ where: { admissionNo } });
        if (taken) {
          result.failed++;
          result.errors.push({ row: rowNum, error: `Admission number "${admissionNo}" is already taken.` });
          continue;
        }
      } else {
        admissionNo = await generateAdmissionNo(tx, year);
      }

      // 4. Create student
      const student = await tx.studentRecord.create({
        data: {
          branchId,
          firstName: r.firstName,
          middleName: r.middleName || null,
          lastName: r.lastName,
          gender: r.gender,
          dateOfBirth: new Date(r.dateOfBirth),
          admissionNo,
          guardianName: r.guardianName || null,
          guardianPhone: r.guardianPhone || null,
          guardianEmail: r.guardianEmail || null,
        },
      });

      // 5. Enrol if class specified
      if (r.className && activeSession) {
        await tx.studentEnrollment.create({
          data: {
            studentId: student.id,
            branchId,
            sessionId: activeSession.id,
            className: r.className,
            arm: r.arm || null,
            status: EnrollmentStatus.ACTIVE,
          },
        });
      }

      // 6. Audit
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "STUDENT_IMPORTED",
          targetType: "StudentRecord",
          targetId: student.id,
          afterValue: {
            id: student.id,
            admissionNo,
            branchId,
            ...(duplicate && allowDuplicates ? { duplicateOverridden: true, existingAdmissionNo: duplicate.admissionNo } : {}),
          },
        },
      });

      result.imported++;
      if (duplicate && allowDuplicates) {
        result.overridden++;
      }
    }
  });

  return result;
}
