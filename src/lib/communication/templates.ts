import { NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Standard system notification template codes.
 */
export const SYSTEM_TEMPLATE_CODES = {
  ATTENDANCE_ABSENCE: "ATTENDANCE_ABSENCE",
  RESULTS_PUBLISHED: "RESULTS_PUBLISHED",
  FEE_INVOICE_ISSUED: "FEE_INVOICE_ISSUED",
  FEE_OVERDUE_REMINDER: "FEE_OVERDUE_REMINDER",
  BROADCAST_ANNOUNCEMENT: "BROADCAST_ANNOUNCEMENT",
} as const;

export type SystemTemplateCode = (typeof SYSTEM_TEMPLATE_CODES)[keyof typeof SYSTEM_TEMPLATE_CODES];

export interface SystemTemplateDefinition {
  code: SystemTemplateCode;
  name: string;
  channel: NotificationChannel;
  subjectTemplate?: string;
  bodyTemplate: string;
  variables: string[];
}

/**
 * Standard system templates across supported notification channels.
 */
export const DEFAULT_SYSTEM_TEMPLATES: SystemTemplateDefinition[] = [
  // --- Attendance Absence ---
  {
    code: SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE,
    name: "Attendance Absence Notice (SMS)",
    channel: NotificationChannel.SMS,
    bodyTemplate:
      "Dear Guardian, {{student_name}} was marked absent in {{class_arm}} today, {{date}}. Contact {{school_name}} if this was unexpected.",
    variables: ["student_name", "class_arm", "date", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE,
    name: "Attendance Absence Notice (WhatsApp)",
    channel: NotificationChannel.WHATSAPP,
    bodyTemplate:
      "Dear Guardian, *{{student_name}}* was marked absent in {{class_arm}} today, {{date}}.\n\nPlease contact {{school_name}} if you did not authorize this absence.",
    variables: ["student_name", "class_arm", "date", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE,
    name: "Attendance Absence Notice (Email)",
    channel: NotificationChannel.EMAIL,
    subjectTemplate: "Absence Notice: {{student_name}} - {{school_name}}",
    bodyTemplate:
      "<p>Dear Guardian,</p><p>This is to notify you that <strong>{{student_name}}</strong> was marked absent in <strong>{{class_arm}}</strong> on <strong>{{date}}</strong>.</p><p>If you have any questions or this was unexpected, please reach out to the school administration.</p><p>Regards,<br/>{{school_name}}</p>",
    variables: ["student_name", "class_arm", "date", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE,
    name: "Attendance Absence Notice (In-App)",
    channel: NotificationChannel.IN_APP,
    subjectTemplate: "Absence Recorded: {{student_name}}",
    bodyTemplate: "{{student_name}} was marked absent in {{class_arm}} on {{date}}.",
    variables: ["student_name", "class_arm", "date"],
  },

  // --- Results Published ---
  {
    code: SYSTEM_TEMPLATE_CODES.RESULTS_PUBLISHED,
    name: "Results Published (SMS)",
    channel: NotificationChannel.SMS,
    bodyTemplate: "Dear Guardian, {{term_name}} results for {{student_name}} are now published. View report card here: {{report_card_url}}",
    variables: ["student_name", "term_name", "report_card_url"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.RESULTS_PUBLISHED,
    name: "Results Published (WhatsApp)",
    channel: NotificationChannel.WHATSAPP,
    bodyTemplate:
      "Dear Guardian, {{term_name}} terminal report cards for *{{student_name}}* have been published.\n\nView and verify the report card: {{report_card_url}}\n\n- {{school_name}}",
    variables: ["student_name", "term_name", "report_card_url", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.RESULTS_PUBLISHED,
    name: "Results Published (Email)",
    channel: NotificationChannel.EMAIL,
    subjectTemplate: "Term Results Published: {{student_name}} - {{term_name}}",
    bodyTemplate:
      '<p>Dear Guardian,</p><p>The terminal assessment results for <strong>{{student_name}}</strong> ({{term_name}}) are now published and available for review.</p><p><a href="{{report_card_url}}">Click here to access and verify the official report card</a></p><p>Best regards,<br/>{{school_name}}</p>',
    variables: ["student_name", "term_name", "report_card_url", "school_name"],
  },

  // --- Fee Invoice Issued ---
  {
    code: SYSTEM_TEMPLATE_CODES.FEE_INVOICE_ISSUED,
    name: "Fee Invoice Issued (SMS)",
    channel: NotificationChannel.SMS,
    bodyTemplate:
      "Dear Guardian, invoice of {{invoice_amount}} for {{student_name}} ({{term_name}}) is issued. Due: {{due_date}}. Pay: {{payment_url}}",
    variables: ["student_name", "invoice_amount", "term_name", "due_date", "payment_url"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.FEE_INVOICE_ISSUED,
    name: "Fee Invoice Issued (Email)",
    channel: NotificationChannel.EMAIL,
    subjectTemplate: "School Fee Invoice: {{student_name}} - {{term_name}}",
    bodyTemplate:
      '<p>Dear Guardian,</p><p>A new school fee invoice of <strong>{{invoice_amount}}</strong> has been generated for <strong>{{student_name}}</strong> for the <strong>{{term_name}}</strong> academic term.</p><p>Due Date: <strong>{{due_date}}</strong></p><p><a href="{{payment_url}}">Click here to view invoice and make secure payment</a></p><p>Thank you,<br/>Bursary Department, {{school_name}}</p>',
    variables: ["student_name", "invoice_amount", "term_name", "due_date", "payment_url", "school_name"],
  },

  // --- Fee Overdue Reminder ---
  {
    code: SYSTEM_TEMPLATE_CODES.FEE_OVERDUE_REMINDER,
    name: "Fee Overdue Reminder (SMS)",
    channel: NotificationChannel.SMS,
    bodyTemplate:
      "Reminder: Outstanding balance of {{balance_due}} for {{student_name}} is overdue. Please settle promptly via {{payment_url}} - {{school_name}}",
    variables: ["student_name", "balance_due", "payment_url", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.FEE_OVERDUE_REMINDER,
    name: "Fee Overdue Reminder (Email)",
    channel: NotificationChannel.EMAIL,
    subjectTemplate: "Overdue Notice: Outstanding School Fees - {{student_name}}",
    bodyTemplate:
      '<p>Dear Guardian,</p><p>This is a formal reminder regarding the outstanding balance of <strong>{{balance_due}}</strong> for <strong>{{student_name}}</strong>.</p><p><a href="{{payment_url}}">Click here to clear the outstanding balance online</a></p><p>Thank you,<br/>Bursary Department, {{school_name}}</p>',
    variables: ["student_name", "balance_due", "payment_url", "school_name"],
  },

  // --- Broadcast Announcement ---
  {
    code: SYSTEM_TEMPLATE_CODES.BROADCAST_ANNOUNCEMENT,
    name: "School Broadcast (SMS)",
    channel: NotificationChannel.SMS,
    bodyTemplate: "{{title}}: {{message}} - {{school_name}}",
    variables: ["title", "message", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.BROADCAST_ANNOUNCEMENT,
    name: "School Broadcast (WhatsApp)",
    channel: NotificationChannel.WHATSAPP,
    bodyTemplate: "*{{title}}*\n\n{{message}}\n\n- {{school_name}}",
    variables: ["title", "message", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.BROADCAST_ANNOUNCEMENT,
    name: "School Broadcast (Email)",
    channel: NotificationChannel.EMAIL,
    subjectTemplate: "Announcement: {{title}}",
    bodyTemplate: "<h3>{{title}}</h3><p>{{message}}</p><p>Regards,<br/>{{school_name}}</p>",
    variables: ["title", "message", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.BROADCAST_ANNOUNCEMENT,
    name: "School Broadcast (In-App)",
    channel: NotificationChannel.IN_APP,
    subjectTemplate: "{{title}}",
    bodyTemplate: "{{message}}",
    variables: ["title", "message"],
  },
];

/**
 * Escapes HTML characters in variable values for Email body rendering to avoid XSS injection.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Extracts list of variable placeholder tokens present in a template string.
 * E.g., "Hello {{ student_name }}, your fee is {{amount}}!" -> ["student_name", "amount"]
 */
export function extractTemplateVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  const vars = new Set<string>();
  for (const match of matches) {
    if (match[1]) {
      vars.add(match[1]);
    }
  }
  return Array.from(vars);
}

/**
 * Validates that all required tokens in a template are supplied in the values dictionary.
 */
export function validateTemplateVariables(
  template: string,
  values: Record<string, unknown>,
): { valid: boolean; missing: string[]; present: string[] } {
  const required = extractTemplateVariables(template);
  const missing: string[] = [];
  const present: string[] = [];

  for (const token of required) {
    if (values[token] === undefined || values[token] === null || values[token] === "") {
      missing.push(token);
    } else {
      present.push(token);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    present,
  };
}

/**
 * Pure interpolation of tokens in template string.
 * Escapes values if channel is EMAIL to prevent script injection.
 */
export function interpolateTokens(
  template: string,
  variables: Record<string, unknown>,
  channel?: NotificationChannel,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, token) => {
    const val = variables[token];
    if (val === undefined || val === null) {
      return `{{${token}}}`;
    }

    const strVal = String(val);
    if (channel === NotificationChannel.EMAIL) {
      return escapeHtml(strVal);
    }
    return strVal;
  });
}

/**
 * Renders a full template (subject and body) given variables and target channel.
 */
export function renderTemplate(
  template: { subjectTemplate?: string | null; bodyTemplate: string; channel: NotificationChannel },
  variables: Record<string, unknown>,
): { subject?: string; body: string } {
  const subject = template.subjectTemplate
    ? interpolateTokens(template.subjectTemplate, variables, template.channel)
    : undefined;

  const body = interpolateTokens(template.bodyTemplate, variables, template.channel);

  return { subject, body };
}

/**
 * Ensures that default system templates are seeded for a given branch.
 * Safe and idempotent.
 */
export async function ensureSystemTemplates(branchId: string): Promise<void> {
  const existing = await prisma.notificationTemplate.findMany({
    where: { branchId, isSystem: true },
    select: { code: true, channel: true },
  });

  const existingSet = new Set(existing.map((e) => `${e.code}:${e.channel}`));

  const toCreate = DEFAULT_SYSTEM_TEMPLATES.filter((tpl) => !existingSet.has(`${tpl.code}:${tpl.channel}`));

  if (toCreate.length === 0) return;

  for (const tpl of toCreate) {
    await prisma.notificationTemplate.create({
      data: {
        branchId,
        code: tpl.code,
        name: tpl.name,
        channel: tpl.channel,
        subjectTemplate: tpl.subjectTemplate || null,
        bodyTemplate: tpl.bodyTemplate,
        variables: tpl.variables,
        isSystem: true,
      },
    });
  }
}
