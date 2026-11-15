import { z } from "zod";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { audienceWords, findUnfillableTags } from "./tags";

export const NotificationChannelEnum = z.nativeEnum(NotificationChannel);
export const NotificationDispatchStatusEnum = z.nativeEnum(NotificationDispatchStatus);

export const TargetAudienceEnum = z.enum(["ALL_PARENTS", "CLASS_GROUP_PARENTS", "CLASS_ARM_PARENTS", "STAFF", "STUDENTS"]);

export type TargetAudience = z.infer<typeof TargetAudienceEnum>;

export const CreateTemplateSchema = z.object({
  name: z.string().min(2, "Template name must be at least 2 characters").max(100),
  code: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[A-Z0-9_]+$/, "Code must consist of uppercase letters, numbers, and underscores"),
  channel: NotificationChannelEnum,
  subjectTemplate: z.string().max(255).optional().nullable(),
  bodyTemplate: z.string().min(1, "Body template cannot be empty").max(5000),
  variables: z.array(z.string()).optional(),
});

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;

export const UpdateTemplateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  subjectTemplate: z.string().max(255).optional().nullable(),
  bodyTemplate: z.string().min(1).max(5000).optional(),
  variables: z.array(z.string()).optional(),
});

export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;

export const BroadcastMessageSchema = z
  .object({
    channel: NotificationChannelEnum,
    targetAudience: TargetAudienceEnum,
    classGroupId: z.string().optional().nullable(),
    classArmId: z.string().optional().nullable(),
    subject: z.string().max(255).optional().nullable(),
    body: z.string().min(1, "Broadcast body cannot be empty").max(5000),
    templateId: z.string().optional().nullable(),
    variables: z.record(z.string(), z.unknown()).optional(),
  })
  // Three things that cannot work are refused here, before anything is created (task 0055), so the route and the service agree and no dispatch row exists for them.
  .superRefine((value, ctx) => {
    if (value.channel === NotificationChannel.IN_APP) {
      // No screen reads an In-App dispatch back to a person; Announcements are the app's in-app feed.
      ctx.addIssue({
        code: "custom",
        path: ["channel"],
        message: "In-App messages are sent from Announcements: nothing here shows them to the person.",
      });
      return;
    }
    if (
      value.targetAudience === "STUDENTS" &&
      (value.channel === NotificationChannel.SMS || value.channel === NotificationChannel.WHATSAPP)
    ) {
      // A pupil's login has no phone number; only a guardian's record does.
      ctx.addIssue({ code: "custom", path: ["channel"], message: "Pupils have no phone number on file. Use Email, or send to guardians." });
      return;
    }
    const unfillable = findUnfillableTags([value.body, value.subject], value.targetAudience, Object.keys(value.variables ?? {}));
    if (unfillable.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: `These tags cannot be filled for ${audienceWords(value.targetAudience)}: ${unfillable.map((name) => `{{${name}}}`).join(", ")}. Remove them or choose another audience.`,
      });
    }
  });

export type BroadcastMessageInput = z.infer<typeof BroadcastMessageSchema>;

export const QueryDispatchesSchema = z.object({
  status: NotificationDispatchStatusEnum.optional(),
  channel: NotificationChannelEnum.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type QueryDispatchesInput = z.infer<typeof QueryDispatchesSchema>;

export const QueryTemplatesSchema = z.object({
  channel: NotificationChannelEnum.optional(),
  search: z.string().optional(),
});

export type QueryTemplatesInput = z.infer<typeof QueryTemplatesSchema>;
