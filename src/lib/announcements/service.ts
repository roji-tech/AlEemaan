import { prisma } from "@/lib/db";
import {
  isAnnouncementVisible,
  sortAnnouncements,
  canAuthorAnnouncements,
  canManageAnnouncement,
  type ViewerProfile,
  AnnouncementStatus,
} from "./rules";
import type { CreateAnnouncementInput, UpdateAnnouncementInput } from "./validation";

export class AnnouncementPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnnouncementPermissionError";
  }
}

export async function listAnnouncements(viewer: ViewerProfile, filter?: { branchId?: string; status?: AnnouncementStatus }) {
  const where: Record<string, unknown> = {};

  if (filter?.status) {
    where.status = filter.status;
  }

  // Branch filter: if specified, get that branch + school-wide announcements
  if (filter?.branchId) {
    where.OR = [{ branchId: filter.branchId }, { branchId: null }];
  } else if (!viewer.isSuperAdmin && viewer.branchId) {
    where.OR = [{ branchId: viewer.branchId }, { branchId: null }];
  }

  const items = await prisma.announcement.findMany({
    where,
    include: {
      branch: { select: { id: true, name: true } },
      classArm: { select: { id: true, name: true } },
      author: { select: { id: true, name: true, email: true } },
    },
    orderBy: { publishedAt: "desc" },
  });

  const visible = items.filter((ann) => isAnnouncementVisible(ann, viewer));
  return sortAnnouncements(visible);
}

export async function getAnnouncement(id: string, viewer: ViewerProfile) {
  const item = await prisma.announcement.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, name: true } },
      classArm: { select: { id: true, name: true } },
      author: { select: { id: true, name: true, email: true } },
    },
  });

  if (!item) {
    return null;
  }

  if (!isAnnouncementVisible(item, viewer)) {
    return null;
  }

  return item;
}

export async function createAnnouncement(authorUserId: string, viewer: ViewerProfile, input: CreateAnnouncementInput) {
  if (!canAuthorAnnouncements(viewer.role, viewer.isSuperAdmin)) {
    throw new AnnouncementPermissionError("You do not have permission to publish announcements");
  }

  // Non-superadmins cannot author school-wide announcements
  if (!input.branchId && !viewer.isSuperAdmin) {
    throw new AnnouncementPermissionError("Only super administrators can broadcast school-wide announcements");
  }

  return prisma.announcement.create({
    data: {
      branchId: input.branchId ?? null,
      classArmId: input.classArmId ?? null,
      title: input.title.trim(),
      body: input.body.trim(),
      targetRoles: input.targetRoles,
      status: input.status,
      isPinned: input.isPinned,
      authorUserId,
      publishedAt: input.publishedAt,
      expiresAt: input.expiresAt,
    },
    include: {
      branch: { select: { id: true, name: true } },
      classArm: { select: { id: true, name: true } },
      author: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function updateAnnouncement(id: string, viewer: ViewerProfile, input: UpdateAnnouncementInput) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }

  if (!canManageAnnouncement(existing, viewer)) {
    throw new AnnouncementPermissionError("You do not have permission to update this announcement");
  }

  return prisma.announcement.update({
    where: { id },
    data: {
      branchId: input.branchId,
      classArmId: input.classArmId,
      title: input.title?.trim(),
      body: input.body?.trim(),
      targetRoles: input.targetRoles,
      status: input.status,
      isPinned: input.isPinned,
      publishedAt: input.publishedAt,
      expiresAt: input.expiresAt,
    },
    include: {
      branch: { select: { id: true, name: true } },
      classArm: { select: { id: true, name: true } },
      author: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function deleteAnnouncement(id: string, viewer: ViewerProfile) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }

  if (!canManageAnnouncement(existing, viewer)) {
    throw new AnnouncementPermissionError("You do not have permission to delete this announcement");
  }

  return prisma.announcement.delete({ where: { id } });
}
