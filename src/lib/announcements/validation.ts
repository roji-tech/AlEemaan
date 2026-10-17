import { z } from "zod";
import { Role, AnnouncementStatus } from "@prisma/client";

export const createAnnouncementSchema = z.object({
  branchId: z.string().nullable().optional(), // null = school-wide
  classArmId: z.string().nullable().optional(),
  title: z.string().min(1, "Title is required").max(200, "Title cannot exceed 200 characters"),
  body: z.string().min(1, "Announcement body is required"),
  targetRoles: z.array(z.nativeEnum(Role)).default([]),
  status: z.nativeEnum(AnnouncementStatus).default(AnnouncementStatus.PUBLISHED),
  isPinned: z.boolean().default(false),
  publishedAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((val) => (val ? new Date(val) : new Date())),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional()
    .transform((val) => (val ? new Date(val) : null)),
});

export const updateAnnouncementSchema = z.object({
  branchId: z.string().nullable().optional(),
  classArmId: z.string().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
  targetRoles: z.array(z.nativeEnum(Role)).optional(),
  status: z.nativeEnum(AnnouncementStatus).optional(),
  isPinned: z.boolean().optional(),
  publishedAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional()
    .transform((val) => (val === null ? null : val ? new Date(val) : undefined)),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
