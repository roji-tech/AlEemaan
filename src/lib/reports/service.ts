import { ReportCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/roles";
import { sendEmailQuietly } from "@/lib/email/transport";
import { developerEmail, reportEmail, stripControls, type ReportBody, type StoredReport } from "./report";

/// Records one report, with who sent it as the SERVER knows them (never as the browser says). Returns the stored row.
export async function recordReport(userId: string, body: ReportBody, userAgent: string | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      isSuperAdmin: true,
      memberships: { where: { deactivatedAt: null }, select: { role: true, branch: { select: { name: true } } } },
    },
  });
  const roles = [...new Set(user?.memberships.map((m) => ROLE_LABELS[m.role]) ?? [])];
  if (user?.isSuperAdmin) roles.unshift("Superadmin");
  const branches = [...new Set(user?.memberships.map((m) => m.branch.name) ?? [])];
  return prisma.problemReport.create({
    data: {
      userId,
      reporterName: user?.name ? stripControls(user.name).slice(0, 120) : null,
      reporterEmail: user?.email ? stripControls(user.email).slice(0, 200) : null,
      reporterRoles: roles.join(", ") || null,
      branches: branches.join(", ").slice(0, 500) || null,
      category: ReportCategory[body.category],
      message: body.message,
      pagePath: body.pagePath,
      userAgent: userAgent ? stripControls(userAgent).slice(0, 300) : null,
      viewport: body.viewport ?? null,
    },
  });
}

/// Mails a recorded report to DEVELOPER_EMAIL and notes in the record whether it was handed to the mail service. Called AFTER the response, so it can never fail the person's request;
/// with no address set it does nothing (the report is already safe in the table).
export async function mailReport(report: StoredReport): Promise<boolean> {
  const to = developerEmail();
  if (!to) return false;
  const sent = await sendEmailQuietly(reportEmail(to, report));
  if (sent) await prisma.problemReport.update({ where: { id: report.id }, data: { emailed: true } }).catch(() => undefined);
  return sent;
}
