import { prisma } from "@/lib/db";
import {
  findSlotClashes,
  findBatchClashes,
  validateTimetableSlot,
  type TimetableSlotInput,
  type TimetableClash,
} from "./rules";
import type { CreateTimetableSlotInput, UpdateTimetableSlotInput } from "./validation";

export class TimetableClashError extends Error {
  public clashes: TimetableClash[];
  constructor(message: string, clashes: TimetableClash[]) {
    super(message);
    this.name = "TimetableClashError";
    this.clashes = clashes;
  }
}

export interface ListSlotsFilter {
  branchId: string;
  classArmId?: string;
  staffRecordId?: string;
  dayOfWeek?: number;
}

export async function listTimetableSlots(filter: ListSlotsFilter) {
  const where: Record<string, unknown> = {
    branchId: filter.branchId,
  };

  if (filter.classArmId) {
    where.classArmId = filter.classArmId;
  }
  if (filter.staffRecordId) {
    where.staffRecordId = filter.staffRecordId;
  }
  if (filter.dayOfWeek) {
    where.dayOfWeek = filter.dayOfWeek;
  }

  return prisma.timetableSlot.findMany({
    where,
    include: {
      classArm: {
        select: { id: true, name: true, classGroupId: true, classGroup: { select: { id: true, name: true } } },
      },
      subject: { select: { id: true, name: true, code: true } },
      staffRecord: { select: { id: true, firstName: true, lastName: true, category: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export async function getTimetableSlot(branchId: string, id: string) {
  return prisma.timetableSlot.findUnique({
    where: { branchId_id: { branchId, id } },
    include: {
      classArm: {
        select: { id: true, name: true, classGroupId: true, classGroup: { select: { id: true, name: true } } },
      },
      subject: { select: { id: true, name: true, code: true } },
      staffRecord: { select: { id: true, firstName: true, lastName: true, category: true } },
    },
  });
}

export async function createTimetableSlot(branchId: string, input: CreateTimetableSlotInput) {
  const validation = validateTimetableSlot(input);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
  }

  // Load existing slots on the same day in this branch for clash checking
  const existingSlots = await prisma.timetableSlot.findMany({
    where: {
      branchId,
      dayOfWeek: input.dayOfWeek,
    },
    select: {
      id: true,
      classArmId: true,
      subjectId: true,
      staffRecordId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      room: true,
    },
  });

  const clashes = findSlotClashes(input, existingSlots);
  if (clashes.length > 0) {
    throw new TimetableClashError(clashes[0].message, clashes);
  }

  return prisma.timetableSlot.create({
    data: {
      branchId,
      classArmId: input.classArmId,
      subjectId: input.subjectId,
      staffRecordId: input.staffRecordId,
      dayOfWeek: input.dayOfWeek,
      periodNumber: input.periodNumber ?? null,
      startTime: input.startTime,
      endTime: input.endTime,
      room: input.room?.trim() ?? null,
    },
    include: {
      classArm: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      staffRecord: { select: { id: true, firstName: true, lastName: true, category: true } },
    },
  });
}

export async function updateTimetableSlot(branchId: string, id: string, input: UpdateTimetableSlotInput) {
  const existing = await prisma.timetableSlot.findUnique({
    where: { branchId_id: { branchId, id } },
  });

  if (!existing) {
    return null;
  }

  const merged: TimetableSlotInput = {
    id: existing.id,
    classArmId: input.classArmId ?? existing.classArmId,
    subjectId: input.subjectId ?? existing.subjectId,
    staffRecordId: input.staffRecordId ?? existing.staffRecordId,
    dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
    periodNumber: input.periodNumber !== undefined ? input.periodNumber : existing.periodNumber,
    startTime: input.startTime ?? existing.startTime,
    endTime: input.endTime ?? existing.endTime,
    room: input.room !== undefined ? input.room : existing.room,
  };

  const validation = validateTimetableSlot(merged);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
  }

  // Load other slots on the candidate day
  const otherSlots = await prisma.timetableSlot.findMany({
    where: {
      branchId,
      dayOfWeek: merged.dayOfWeek,
      id: { not: id },
    },
    select: {
      id: true,
      classArmId: true,
      subjectId: true,
      staffRecordId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      room: true,
    },
  });

  const clashes = findSlotClashes(merged, otherSlots);
  if (clashes.length > 0) {
    throw new TimetableClashError(clashes[0].message, clashes);
  }

  return prisma.timetableSlot.update({
    where: { branchId_id: { branchId, id } },
    data: {
      classArmId: input.classArmId,
      subjectId: input.subjectId,
      staffRecordId: input.staffRecordId,
      dayOfWeek: input.dayOfWeek,
      periodNumber: input.periodNumber,
      startTime: input.startTime,
      endTime: input.endTime,
      room: input.room !== undefined ? input.room?.trim() ?? null : undefined,
    },
    include: {
      classArm: { select: { id: true, name: true } },
      subject: { select: { id: true, name: true, code: true } },
      staffRecord: { select: { id: true, firstName: true, lastName: true, category: true } },
    },
  });
}

export async function deleteTimetableSlot(branchId: string, id: string) {
  const existing = await prisma.timetableSlot.findUnique({
    where: { branchId_id: { branchId, id } },
  });

  if (!existing) {
    return null;
  }

  return prisma.timetableSlot.delete({
    where: { branchId_id: { branchId, id } },
  });
}

export async function batchCreateTimetableSlots(branchId: string, slots: CreateTimetableSlotInput[]) {
  // 1. Check internal batch clashes
  const internalClashes = findBatchClashes(slots);
  if (internalClashes.length > 0) {
    throw new TimetableClashError(`Batch conflict: ${internalClashes[0].message}`, internalClashes);
  }

  // 2. Check clashes against existing DB records
  const daysInBatch = Array.from(new Set(slots.map((s) => s.dayOfWeek)));
  const existingSlots = await prisma.timetableSlot.findMany({
    where: {
      branchId,
      dayOfWeek: { in: daysInBatch },
    },
    select: {
      id: true,
      classArmId: true,
      subjectId: true,
      staffRecordId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      room: true,
    },
  });

  for (const slot of slots) {
    const clashes = findSlotClashes(slot, existingSlots);
    if (clashes.length > 0) {
      throw new TimetableClashError(clashes[0].message, clashes);
    }
  }

  // 3. Insert in transaction
  return prisma.$transaction(
    slots.map((slot) =>
      prisma.timetableSlot.create({
        data: {
          branchId,
          classArmId: slot.classArmId,
          subjectId: slot.subjectId,
          staffRecordId: slot.staffRecordId,
          dayOfWeek: slot.dayOfWeek,
          periodNumber: slot.periodNumber ?? null,
          startTime: slot.startTime,
          endTime: slot.endTime,
          room: slot.room?.trim() ?? null,
        },
      }),
    ),
  );
}
