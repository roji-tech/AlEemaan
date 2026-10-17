import { NotificationChannel, NotificationDispatchStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureSystemTemplates, interpolateTokens } from "./templates";
import { defaultNotificationDispatcher } from "./gateways/dispatcher";
import type {
  BroadcastMessageInput,
  CreateTemplateInput,
  QueryDispatchesInput,
  QueryTemplatesInput,
  UpdateTemplateInput,
} from "./validation";

export interface TemplateListItem {
  id: string;
  code: string;
  name: string;
  channel: NotificationChannel;
  subjectTemplate: string | null;
  bodyTemplate: string;
  variables: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DispatchListItem {
  id: string;
  templateId: string | null;
  channel: NotificationChannel;
  recipientAddress: string;
  recipientUserId: string | null;
  status: NotificationDispatchStatus;
  subject: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface PaginatedDispatches {
  items: DispatchListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * List templates for a branch, automatically seeding default system templates if missing.
 */
export async function listTemplates(branchId: string, query?: QueryTemplatesInput): Promise<TemplateListItem[]> {
  await ensureSystemTemplates(branchId);

  const where: Prisma.NotificationTemplateWhereInput = {
    branchId,
    ...(query?.channel ? { channel: query.channel } : {}),
    ...(query?.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { code: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const records = await prisma.notificationTemplate.findMany({
    where,
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return records.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    channel: t.channel,
    subjectTemplate: t.subjectTemplate,
    bodyTemplate: t.bodyTemplate,
    variables: Array.isArray(t.variables) ? (t.variables as string[]) : [],
    isSystem: t.isSystem,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
}

/**
 * Get a single template by ID.
 */
export async function getTemplate(branchId: string, id: string): Promise<TemplateListItem | null> {
  const t = await prisma.notificationTemplate.findUnique({
    where: {
      branchId_id: { branchId, id },
    },
  });

  if (!t) return null;

  return {
    id: t.id,
    code: t.code,
    name: t.name,
    channel: t.channel,
    subjectTemplate: t.subjectTemplate,
    bodyTemplate: t.bodyTemplate,
    variables: Array.isArray(t.variables) ? (t.variables as string[]) : [],
    isSystem: t.isSystem,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/**
 * Create a new custom template for a branch.
 */
export async function createTemplate(branchId: string, input: CreateTemplateInput): Promise<TemplateListItem> {
  const t = await prisma.notificationTemplate.create({
    data: {
      branchId,
      code: input.code,
      name: input.name,
      channel: input.channel,
      subjectTemplate: input.subjectTemplate || null,
      bodyTemplate: input.bodyTemplate,
      variables: input.variables || [],
      isSystem: false,
    },
  });

  return {
    id: t.id,
    code: t.code,
    name: t.name,
    channel: t.channel,
    subjectTemplate: t.subjectTemplate,
    bodyTemplate: t.bodyTemplate,
    variables: Array.isArray(t.variables) ? (t.variables as string[]) : [],
    isSystem: t.isSystem,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/**
 * Update an existing template.
 */
export async function updateTemplate(
  branchId: string,
  id: string,
  input: UpdateTemplateInput,
): Promise<TemplateListItem> {
  const t = await prisma.notificationTemplate.update({
    where: {
      branchId_id: { branchId, id },
    },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.subjectTemplate !== undefined ? { subjectTemplate: input.subjectTemplate } : {}),
      ...(input.bodyTemplate ? { bodyTemplate: input.bodyTemplate } : {}),
      ...(input.variables ? { variables: input.variables } : {}),
    },
  });

  return {
    id: t.id,
    code: t.code,
    name: t.name,
    channel: t.channel,
    subjectTemplate: t.subjectTemplate,
    bodyTemplate: t.bodyTemplate,
    variables: Array.isArray(t.variables) ? (t.variables as string[]) : [],
    isSystem: t.isSystem,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/**
 * Delete a custom template. System templates cannot be deleted.
 */
export async function deleteTemplate(branchId: string, id: string): Promise<boolean> {
  const existing = await prisma.notificationTemplate.findUnique({
    where: { branchId_id: { branchId, id } },
    select: { isSystem: true },
  });

  if (!existing) return false;
  if (existing.isSystem) {
    throw new Error("System templates cannot be deleted");
  }

  await prisma.notificationTemplate.delete({
    where: { branchId_id: { branchId, id } },
  });

  return true;
}

/**
 * Query dispatches with pagination and filters.
 */
export async function listDispatches(branchId: string, query?: QueryDispatchesInput): Promise<PaginatedDispatches> {
  const page = query?.page ?? 1;
  const limit = query?.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Prisma.NotificationDispatchWhereInput = {
    branchId,
    ...(query?.status ? { status: query.status } : {}),
    ...(query?.channel ? { channel: query.channel } : {}),
    ...(query?.search
      ? {
          OR: [
            { recipientAddress: { contains: query.search, mode: "insensitive" } },
            { subject: { contains: query.search, mode: "insensitive" } },
            { body: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, records] = await Promise.all([
    prisma.notificationDispatch.count({ where }),
    prisma.notificationDispatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  const items: DispatchListItem[] = records.map((d) => ({
    id: d.id,
    templateId: d.templateId,
    channel: d.channel,
    recipientAddress: d.recipientAddress,
    recipientUserId: d.recipientUserId,
    status: d.status,
    subject: d.subject,
    body: d.body,
    metadata: d.metadata as Record<string, unknown> | null,
    attempts: d.attempts,
    lastError: d.lastError,
    sentAt: d.sentAt,
    createdAt: d.createdAt,
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Retry an individual failed dispatch.
 */
export async function retryDispatch(
  branchId: string,
  dispatchId: string,
  actorUserId?: string,
): Promise<{ success: boolean; status: NotificationDispatchStatus; error?: string }> {
  const dispatch = await prisma.notificationDispatch.findUnique({
    where: { branchId_id: { branchId, id: dispatchId } },
  });

  if (!dispatch) {
    throw new Error("Dispatch record not found");
  }

  // Set to RETRYING and increment attempts
  await prisma.notificationDispatch.update({
    where: { id: dispatch.id },
    data: {
      status: NotificationDispatchStatus.RETRYING,
      attempts: { increment: 1 },
    },
  });

  const res = await defaultNotificationDispatcher({
    dispatchId: dispatch.id,
    branchId: dispatch.branchId,
    channel: dispatch.channel,
    recipientAddress: dispatch.recipientAddress,
    recipientUserId: dispatch.recipientUserId,
    subject: dispatch.subject,
    body: dispatch.body,
  });

  if (res.success) {
    await prisma.notificationDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: NotificationDispatchStatus.SENT,
        sentAt: new Date(),
        lastError: null,
      },
    });

    await prisma.notificationAuditLog.create({
      data: {
        branchId,
        dispatchId: dispatch.id,
        actorUserId: actorUserId || null,
        event: "DISPATCH_RETRY_SUCCESS",
        channel: dispatch.channel,
        recipient: dispatch.recipientAddress,
        details: { externalId: res.externalId },
      },
    });

    return { success: true, status: NotificationDispatchStatus.SENT };
  } else {
    await prisma.notificationDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: NotificationDispatchStatus.FAILED,
        lastError: res.error || "Unknown dispatch failure",
      },
    });

    await prisma.notificationAuditLog.create({
      data: {
        branchId,
        dispatchId: dispatch.id,
        actorUserId: actorUserId || null,
        event: "DISPATCH_RETRY_FAILED",
        channel: dispatch.channel,
        recipient: dispatch.recipientAddress,
        details: { error: res.error },
      },
    });

    return { success: false, status: NotificationDispatchStatus.FAILED, error: res.error };
  }
}

/**
 * Broadcast message campaign resolving target audience and queuing/dispatching messages.
 */
export async function broadcastMessage(
  branchId: string,
  input: BroadcastMessageInput,
  actorUserId?: string,
): Promise<{ count: number; dispatches: DispatchListItem[] }> {
  const { channel, targetAudience, classGroupId, classArmId, subject, body, templateId, variables } = input;

  // 1. Resolve recipients
  type Recipient = { address: string; userId?: string | null; studentId?: string; studentName?: string };
  const recipients: Recipient[] = [];

  if (targetAudience === "ALL_PARENTS" || targetAudience === "CLASS_GROUP_PARENTS" || targetAudience === "CLASS_ARM_PARENTS") {
    const studentWhere: Prisma.StudentRecordWhereInput = {
      branchId,
      archivedAt: null,
      ...(classArmId
        ? { enrollments: { some: { classArmId } } }
        : classGroupId
          ? { enrollments: { some: { classArm: { classGroupId } } } }
          : {}),
    };

    const students = await prisma.studentRecord.findMany({
      where: studentWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianEmail: true,
        guardianPhone: true,
      },
    });

    for (const s of students) {
      const address = channel === NotificationChannel.EMAIL ? s.guardianEmail : s.guardianPhone;
      if (address) {
        recipients.push({
          address: address.trim(),
          studentId: s.id,
          studentName: `${s.firstName} ${s.lastName}`,
        });
      }
    }
  } else if (targetAudience === "STAFF") {
    const staffMembers = await prisma.membership.findMany({
      where: {
        branchId,
        deactivatedAt: null,
        role: { in: ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"] },
      },
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    for (const m of staffMembers) {
      if (m.user.email) {
        recipients.push({
          address: m.user.email.trim(),
          userId: m.user.id,
        });
      }
    }
  } else if (targetAudience === "STUDENTS") {
    const studentUsers = await prisma.membership.findMany({
      where: {
        branchId,
        deactivatedAt: null,
        role: "STUDENT",
      },
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    for (const m of studentUsers) {
      if (m.user.email) {
        recipients.push({
          address: m.user.email.trim(),
          userId: m.user.id,
        });
      }
    }
  }

  // Deduplicate by recipient address
  const uniqueRecipients = Array.from(
    new Map(recipients.map((r) => [r.address.toLowerCase(), r])).values(),
  );

  if (uniqueRecipients.length === 0) {
    return { count: 0, dispatches: [] };
  }

  // 2. Create dispatch rows and execute
  const createdDispatches: DispatchListItem[] = [];

  for (const r of uniqueRecipients) {
    const mergedVariables = {
      ...variables,
      ...(r.studentName ? { student_name: r.studentName } : {}),
    };

    const renderedBody = interpolateTokens(body, mergedVariables, channel);
    const renderedSubject = subject ? interpolateTokens(subject, mergedVariables, channel) : null;

    const row = await prisma.notificationDispatch.create({
      data: {
        branchId,
        templateId: templateId || null,
        channel,
        recipientAddress: r.address,
        recipientUserId: r.userId || null,
        status: NotificationDispatchStatus.QUEUED,
        subject: renderedSubject,
        body: renderedBody,
        metadata: mergedVariables,
        attempts: 1,
      },
    });

    // Execute dispatch
    const dispatchRes = await defaultNotificationDispatcher({
      dispatchId: row.id,
      branchId,
      channel,
      recipientAddress: r.address,
      recipientUserId: r.userId || null,
      subject: renderedSubject,
      body: renderedBody,
    });

    const updated = await prisma.notificationDispatch.update({
      where: { id: row.id },
      data: {
        status: dispatchRes.success ? NotificationDispatchStatus.SENT : NotificationDispatchStatus.FAILED,
        sentAt: dispatchRes.success ? new Date() : null,
        lastError: dispatchRes.success ? null : dispatchRes.error,
      },
    });

    createdDispatches.push({
      id: updated.id,
      templateId: updated.templateId,
      channel: updated.channel,
      recipientAddress: updated.recipientAddress,
      recipientUserId: updated.recipientUserId,
      status: updated.status,
      subject: updated.subject,
      body: updated.body,
      metadata: updated.metadata as Record<string, unknown> | null,
      attempts: updated.attempts,
      lastError: updated.lastError,
      sentAt: updated.sentAt,
      createdAt: updated.createdAt,
    });
  }

  // 3. Log audit entry
  await prisma.notificationAuditLog.create({
    data: {
      branchId,
      actorUserId: actorUserId || null,
      event: "BROADCAST_CAMPAIGN_DISPATCHED",
      channel,
      recipient: `${uniqueRecipients.length} recipients`,
      details: {
        targetAudience,
        channel,
        count: uniqueRecipients.length,
      },
    },
  });

  return {
    count: createdDispatches.length,
    dispatches: createdDispatches,
  };
}
