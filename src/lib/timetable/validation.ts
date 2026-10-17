import { z } from "zod";
import { isValidTimeString, parseTimeToMinutes } from "./rules";

const timeStringSchema = z.string().refine(isValidTimeString, { message: "Must be a valid 24-hour time string in 'HH:MM' format" });

export const createTimetableSlotSchema = z
  .object({
    branchId: z.string().min(1, "branchId is required"),
    classArmId: z.string().min(1, "classArmId is required"),
    subjectId: z.string().min(1, "subjectId is required"),
    staffRecordId: z.string().min(1, "staffRecordId is required"),
    dayOfWeek: z.number().int().min(1).max(7),
    periodNumber: z.number().int().positive().nullable().optional(),
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    room: z.string().max(50).nullable().optional(),
  })
  .refine((data) => parseTimeToMinutes(data.startTime) < parseTimeToMinutes(data.endTime), {
    message: "startTime must be strictly before endTime",
    path: ["endTime"],
  });

export const updateTimetableSlotSchema = z
  .object({
    classArmId: z.string().min(1).optional(),
    subjectId: z.string().min(1).optional(),
    staffRecordId: z.string().min(1).optional(),
    dayOfWeek: z.number().int().min(1).max(7).optional(),
    periodNumber: z.number().int().positive().nullable().optional(),
    startTime: timeStringSchema.optional(),
    endTime: timeStringSchema.optional(),
    room: z.string().max(50).nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return parseTimeToMinutes(data.startTime) < parseTimeToMinutes(data.endTime);
      }
      return true;
    },
    {
      message: "startTime must be strictly before endTime",
      path: ["endTime"],
    },
  );

export const batchTimetableSlotSchema = z.object({
  branchId: z.string().min(1, "branchId is required"),
  slots: z.array(createTimetableSlotSchema).min(1, "At least one slot is required in batch"),
});

export type CreateTimetableSlotInput = z.infer<typeof createTimetableSlotSchema>;
export type UpdateTimetableSlotInput = z.infer<typeof updateTimetableSlotSchema>;
export type BatchTimetableSlotInput = z.infer<typeof batchTimetableSlotSchema>;
