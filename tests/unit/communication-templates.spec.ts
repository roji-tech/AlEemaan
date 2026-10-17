import "../support/env";
import { NotificationChannel } from "@prisma/client";
import { test, expect } from "@playwright/test";
import {
  escapeHtml,
  extractTemplateVariables,
  validateTemplateVariables,
  interpolateTokens,
  renderTemplate,
  DEFAULT_SYSTEM_TEMPLATES,
  ensureSystemTemplates,
} from "@/lib/communication/templates";
import { db, seedInstance } from "../support/db";

test.describe("Communication Template Engine (Unit)", () => {
  let branchId: string;

  test.beforeAll(async () => {
    const branch = await seedInstance();
    branchId = branch.id;
  });

  test("escapeHtml escapes HTML dangerous characters", () => {
    const raw = `<script>alert('xss') & "test"</script>`;
    const escaped = escapeHtml(raw);
    expect(escaped).toBe("&lt;script&gt;alert(&#039;xss&#039;) &amp; &quot;test&quot;&lt;/script&gt;");
  });

  test("extractTemplateVariables extracts unique tokens ignoring whitespace", () => {
    const template = "Hello {{ student_name }}, your class is {{class_arm}}. See you {{ date }} or {{student_name}}!";
    const tokens = extractTemplateVariables(template);
    expect(tokens).toEqual(["student_name", "class_arm", "date"]);
  });

  test("validateTemplateVariables flags missing variables accurately", () => {
    const template = "Student: {{student_name}}, Due: {{due_date}}, Amount: {{amount}}";
    const res = validateTemplateVariables(template, {
      student_name: "Fatima",
      amount: "50,000",
    });

    expect(res.valid).toBe(false);
    expect(res.missing).toEqual(["due_date"]);
    expect(res.present).toEqual(["student_name", "amount"]);

    const validRes = validateTemplateVariables(template, {
      student_name: "Fatima",
      due_date: "2026-11-01",
      amount: "50,000",
    });
    expect(validRes.valid).toBe(true);
    expect(validRes.missing).toEqual([]);
  });

  test("interpolateTokens escapes HTML in EMAIL channel to prevent XSS", () => {
    const template = "<p>Notice for {{student_name}} in {{school_name}}</p>";
    const rendered = interpolateTokens(
      template,
      {
        student_name: "<img src=x onerror=alert(1)>",
        school_name: "Al-Eemaan & Sons",
      },
      NotificationChannel.EMAIL,
    );

    expect(rendered).toBe("<p>Notice for &lt;img src=x onerror=alert(1)&gt; in Al-Eemaan &amp; Sons</p>");
  });

  test("interpolateTokens leaves raw characters in SMS channel", () => {
    const template = "Notice for {{student_name}} & parents at {{school_name}}";
    const rendered = interpolateTokens(
      template,
      {
        student_name: "Ali <Junior>",
        school_name: "Al-Eemaan",
      },
      NotificationChannel.SMS,
    );

    expect(rendered).toBe("Notice for Ali <Junior> & parents at Al-Eemaan");
  });

  test("renderTemplate renders both subject and body correctly", () => {
    const tpl = {
      subjectTemplate: "Absence Notice: {{student_name}}",
      bodyTemplate: "{{student_name}} was absent on {{date}}.",
      channel: NotificationChannel.SMS,
    };

    const rendered = renderTemplate(tpl, {
      student_name: "Bilal",
      date: "2026-10-17",
    });

    expect(rendered.subject).toBe("Absence Notice: Bilal");
    expect(rendered.body).toBe("Bilal was absent on 2026-10-17.");
  });

  test("ensureSystemTemplates seeds system templates idempotently for branch", async () => {
    await ensureSystemTemplates(branchId);

    const seeded = await db.notificationTemplate.findMany({
      where: { branchId, isSystem: true },
    });

    expect(seeded.length).toBeGreaterThanOrEqual(DEFAULT_SYSTEM_TEMPLATES.length);

    // Call again to verify idempotency (no duplicate key errors)
    await ensureSystemTemplates(branchId);

    const afterSecondCall = await db.notificationTemplate.findMany({
      where: { branchId, isSystem: true },
    });

    expect(afterSecondCall.length).toBe(seeded.length);
  });
});
