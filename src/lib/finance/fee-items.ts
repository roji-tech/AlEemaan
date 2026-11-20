import { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FinanceError } from "@/lib/finance/service";
import { resolveInvoiceStatus } from "@/lib/finance/rules";
import { admissionFor, verdictFor, type LineFacts, type LineVerdict } from "@/lib/finance/fee-audience";
import { coveredGross, statusAfterDiscounts } from "@/lib/scholarships/rules";
import { today as schoolToday } from "@/lib/scholarships/service";

// A pupil's fee lines (task 0122): which ones apply to them and why not, opting out of an optional one (the school uniform for one new pupil), and recording that a physical item was handed over.
// Financial: only an administrator of the pupil's branch (the routes check it); a teacher or the family portal never reaches these.

type LineItem = { feeStructureId?: string; name: string; amount: string; covered?: boolean };

const dec = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const asLines = (json: Prisma.JsonValue | null): LineItem[] => (Array.isArray(json) ? (json as unknown as LineItem[]) : []);

/// The branch's current term, else its latest (a line that recurs has no term of its own). Refused when the branch has no term yet.
async function currentPeriodId(branchId: string): Promise<string> {
  const p =
    (await prisma.academicPeriod.findFirst({ where: { branchId, isCurrent: true }, select: { id: true } })) ??
    (await prisma.academicPeriod.findFirst({ where: { branchId }, orderBy: { startDate: "desc" }, select: { id: true } }));
  if (!p) throw new FinanceError("This branch has no term yet.", "NOT_FOUND");
  return p.id;
}

/// What is known of a pupil for a period: their class group that session, new or returning, gender and residence. Null when the pupil is not enrolled in the period's session.
async function pupilFor(branchId: string, studentId: string, periodId: string) {
  const period = await prisma.academicPeriod.findFirst({
    where: { branchId, id: periodId },
    select: { id: true, label: true, sessionId: true, session: { select: { startDate: true } } },
  });
  if (!period) throw new FinanceError("Period not found", "NOT_FOUND");
  const student = await prisma.studentRecord.findFirst({
    where: { branchId, id: studentId },
    select: { id: true, gender: true, residence: true, feeAdmission: true },
  });
  if (!student) throw new FinanceError("Pupil not found", "NOT_FOUND");
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { branchId, studentId, sessionId: period.sessionId, status: "ACTIVE" },
    select: { classArm: { select: { classGroupId: true } } },
  });
  const earlier = await prisma.studentEnrollment.count({
    where: { branchId, studentId, session: { startDate: { lt: period.session.startDate } } },
  });
  return {
    period,
    student,
    classGroupId: enrollment?.classArm?.classGroupId ?? null,
    facts: { admission: student.feeAdmission ?? admissionFor(earlier > 0), gender: student.gender, residence: student.residence },
  };
}

export type PupilFeeItem = {
  feeStructureId: string;
  name: string;
  amount: string;
  verdict: LineVerdict;
  /// How often the line is charged (task 0124), and for a once-a-year line whether an earlier invoice of this session already carries it (so it is not charged again this term).
  recurrence: "THIS_TERM" | "EVERY_TERM" | "EVERY_SESSION";
  carried: boolean;
  optional: boolean;
  trackHandover: boolean;
  scholarshipCovers: boolean;
  /// Whether the line is on the pupil's invoice now.
  onInvoice: boolean;
  received: { on: string; byUserId: string; note: string | null } | null;
};

export type PupilFeeItems = {
  periodId: string;
  periodLabel: string;
  periods: { id: string; label: string }[];
  /// How the fee lines see the pupil now: what was set by hand (null = worked out), and what it comes to for this period.
  admissionSetting: "NEW" | "RETURNING" | null;
  admission: "NEW" | "RETURNING";
  invoice: { id: string; invoiceNo: string; status: InvoiceStatus; amountPaid: string } | null;
  items: PupilFeeItem[];
};

/// The lines of the period for this pupil's class (and the whole school), each with whether the pupil is billed it, opted out of it, or it is for another kind of pupil; with the handover record.
export async function pupilFeeItems(branchId: string, studentId: string, wanted: string | null): Promise<PupilFeeItems> {
  // No period named: the branch's current one, else its latest (the screen opens on it and offers the others).
  const periods = await prisma.academicPeriod.findMany({
    where: { branchId },
    select: { id: true, label: true, isCurrent: true, startDate: true, session: { select: { label: true } } },
    orderBy: [{ startDate: "desc" }, { id: "asc" }],
  });
  const periodId = wanted ?? periods.find((p) => p.isCurrent)?.id ?? periods[0]?.id;
  if (!periodId) throw new FinanceError("This branch has no term yet.", "NOT_FOUND");
  const { period, student, classGroupId, facts } = await pupilFor(branchId, studentId, periodId);
  const lines = await prisma.feeStructure.findMany({
    where: {
      branchId,
      AND: [
        { OR: [{ periodId }, { recurrence: { not: "THIS_TERM" } }] },
        { OR: [{ classGroupId: null }, ...(classGroupId ? [{ classGroupId }] : [])] },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const [optOuts, handovers, invoice] = await Promise.all([
    prisma.studentFeeOptOut.findMany({
      where: { branchId, studentId, feeStructureId: { in: lines.map((l) => l.id) } },
      select: { feeStructureId: true },
    }),
    prisma.feeItemHandover.findMany({ where: { branchId, studentId, feeStructureId: { in: lines.map((l) => l.id) } } }),
    prisma.invoice.findUnique({ where: { branchId_studentId_periodId: { branchId, studentId, periodId } } }),
  ]);
  const out = new Set(optOuts.map((o) => o.feeStructureId));
  const onInvoice = new Set(asLines(invoice?.lineItems ?? null).map((l) => l.feeStructureId));
  // Once-a-year lines an earlier invoice of this session already carries (task 0124).
  const carried = new Set<string>();
  if (lines.some((l) => l.recurrence === "EVERY_SESSION"))
    for (const inv of await prisma.invoice.findMany({
      where: { branchId, studentId, periodId: { not: periodId }, period: { sessionId: period.sessionId } },
      select: { lineItems: true },
    }))
      for (const l of asLines(inv.lineItems)) if (l.feeStructureId) carried.add(l.feeStructureId);
  return {
    periodId,
    periodLabel: period.label,
    periods: periods.map((p) => ({ id: p.id, label: `${p.session.label} ${p.label}` })),
    admissionSetting: student.feeAdmission,
    admission: facts.admission,
    invoice: invoice
      ? { id: invoice.id, invoiceNo: invoice.invoiceNo, status: invoice.status, amountPaid: invoice.amountPaid.toString() }
      : null,
    items: lines.map((l) => {
      const h = handovers.find((x) => x.feeStructureId === l.id);
      return {
        feeStructureId: l.id,
        name: l.name,
        amount: l.amount.toString(),
        verdict: verdictFor(factsOf(l), facts, out),
        recurrence: l.recurrence,
        carried: l.recurrence === "EVERY_SESSION" && carried.has(l.id) && !onInvoice.has(l.id),
        optional: l.optional,
        trackHandover: l.trackHandover,
        scholarshipCovers: l.scholarshipCovers,
        onInvoice: onInvoice.has(l.id),
        received: h ? { on: h.receivedOn.toISOString().slice(0, 10), byUserId: h.receivedByUserId, note: h.note } : null,
      };
    }),
  };
}

const factsOf = (l: {
  id: string;
  optional: boolean;
  audienceAdmission: LineFacts["admission"];
  audienceGender: LineFacts["gender"];
  audienceResidence: LineFacts["residence"];
}): LineFacts => ({
  id: l.id,
  optional: l.optional,
  admission: l.audienceAdmission,
  gender: l.audienceGender,
  residence: l.audienceResidence,
});

/// Opt a pupil out of an optional line, or back in. The choice is kept for invoices still to be made. If the pupil's invoice for the line's period exists it is changed too, but only while nothing
/// has been paid on it and nothing was taken off by hand: the line goes off (or on) and the total, the scholarship share (scaled to what it now covers) and the status are worked out again, in
/// one transaction under the invoice's lock. Otherwise nothing is saved and the reason is given.
export async function setFeeOptOut(
  branchId: string,
  studentId: string,
  feeStructureId: string,
  optedOut: boolean,
  actorUserId: string,
  note?: string | null,
): Promise<{ optedOut: boolean; invoiceChanged: boolean }> {
  const line = await prisma.feeStructure.findFirst({ where: { branchId, id: feeStructureId } });
  if (!line) throw new FinanceError("Fee line not found", "NOT_FOUND");
  if (!line.optional) throw new FinanceError("Only an optional line can be opted out of. Make the line optional first.", "NOT_OPTIONAL");
  // A line that recurs has no term of its own: the change is made to the pupil's invoice of the current term (task 0124).
  const termId = line.periodId ?? (await currentPeriodId(branchId));
  const { facts } = await pupilFor(branchId, studentId, termId);

  class Refused extends Error {}
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.studentFeeOptOut.findUnique({ where: { studentId_feeStructureId: { studentId, feeStructureId } } });
      if (optedOut && !existing)
        await tx.studentFeeOptOut.create({
          data: { branchId, studentId, feeStructureId, byUserId: actorUserId, note: note?.trim() || null },
        });
      if (!optedOut && existing) await tx.studentFeeOptOut.delete({ where: { id: existing.id } });

      let invoiceChanged = false;
      const found = await tx.invoice.findUnique({
        where: { branchId_studentId_periodId: { branchId, studentId, periodId: termId } },
        select: { id: true },
      });
      if (found) {
        await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${found.id} AND "branchId" = ${branchId} FOR UPDATE`;
        const invoice = await tx.invoice.findFirstOrThrow({ where: { id: found.id, branchId }, include: { discounts: true } });
        const items = asLines(invoice.lineItems);
        const has = items.some((i) => i.feeStructureId === feeStructureId);
        // The line belongs on the invoice unless the pupil opted out; opting back in puts it there only when it is for this kind of pupil (it may be another gender's or class's).
        const wanted = !optedOut && verdictFor(factsOf(line), facts, new Set()) === "billed";
        if (wanted !== has) {
          if (invoice.status !== InvoiceStatus.UNPAID || invoice.amountPaid.gt(0))
            throw new Refused("This pupil's invoice has been paid on or settled, so a line cannot be taken off or put on it now.");
          if (invoice.discounts.some((d) => d.mode !== "SCHOLARSHIP"))
            throw new Refused("This invoice has a discount that was set by hand. Remove it first, then change the line.");
          const next = optedOut
            ? items.filter((i) => i.feeStructureId !== feeStructureId)
            : [
                ...items,
                { feeStructureId, name: line.name, amount: line.amount.toString(), ...(line.scholarshipCovers ? {} : { covered: false }) },
              ];
          if (next.length === 0) throw new Refused("That is the only line on the invoice. Cancel the invoice instead.");
          const gross = next.reduce((n, i) => n.add(dec(i.amount)), dec(0));
          const before = coveredGross(items);
          const after = coveredGross(next);
          // A scholarship keeps its share of what it covers: scaled to the covered part now, to the kobo.
          const scaled = invoice.discounts.map((d) => ({
            id: d.id,
            mode: d.mode,
            amount: before.gt(0) ? d.amount.mul(after).div(before).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : d.amount,
          }));
          const discount = scaled.reduce((n, d) => n.add(d.amount), dec(0));
          if (discount.gt(gross)) throw new Refused("The discounts on this invoice would be more than what is left to pay.");
          for (const d of scaled) await tx.invoiceDiscount.update({ where: { id: d.id }, data: { amount: d.amount } });
          const net = gross.sub(discount);
          const status = statusAfterDiscounts(resolveInvoiceStatus(net, invoice.amountPaid), net, scaled) as InvoiceStatus;
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { lineItems: next as unknown as Prisma.InputJsonValue, totalAmount: net, status },
          });
          invoiceChanged = true;
        }
      }
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: optedOut ? "STUDENT_FEE_OPTED_OUT" : "STUDENT_FEE_OPTED_IN",
          targetType: "StudentRecord",
          targetId: studentId,
          afterValue: { feeStructureId, name: line.name, invoiceChanged },
          reason: note?.trim() || null,
        },
      });
      return { optedOut, invoiceChanged };
    });
  } catch (e) {
    if (e instanceof Refused) throw new FinanceError(e.message, "INVOICE_LOCKED");
    throw e;
  }
}

/// Record that a pupil has received a tracked item, or undo it. The day is the school's today unless given. Never touches an invoice or a payment.
export async function setHandover(
  branchId: string,
  studentId: string,
  feeStructureId: string,
  received: boolean,
  actorUserId: string,
  options: { receivedOn?: string | null; note?: string | null } = {},
): Promise<{ received: boolean; receivedOn: string | null }> {
  const line = await prisma.feeStructure.findFirst({ where: { branchId, id: feeStructureId } });
  if (!line) throw new FinanceError("Fee line not found", "NOT_FOUND");
  if (!line.trackHandover)
    throw new FinanceError("This line is not tracked as an item that is handed over. Turn on tracking for it first.", "NOT_TRACKED");
  const student = await prisma.studentRecord.findFirst({ where: { branchId, id: studentId }, select: { id: true } });
  if (!student) throw new FinanceError("Pupil not found", "NOT_FOUND");
  const day = options.receivedOn ?? schoolToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)))
    throw new FinanceError("Give the day as YYYY-MM-DD.", "VALIDATION");
  if (day > schoolToday()) throw new FinanceError("An item cannot have been received on a day that has not come.", "VALIDATION");
  return prisma.$transaction(async (tx) => {
    if (received) {
      await tx.feeItemHandover.upsert({
        where: { studentId_feeStructureId: { studentId, feeStructureId } },
        create: {
          branchId,
          studentId,
          feeStructureId,
          receivedOn: new Date(`${day}T00:00:00.000Z`),
          receivedByUserId: actorUserId,
          note: options.note?.trim() || null,
        },
        update: { receivedOn: new Date(`${day}T00:00:00.000Z`), receivedByUserId: actorUserId, note: options.note?.trim() || null },
      });
    } else {
      await tx.feeItemHandover.deleteMany({ where: { studentId, feeStructureId, branchId } });
    }
    await tx.auditLog.create({
      data: {
        actorUserId,
        action: received ? "STUDENT_ITEM_RECEIVED" : "STUDENT_ITEM_RECEIPT_UNDONE",
        targetType: "StudentRecord",
        targetId: studentId,
        afterValue: { feeStructureId, name: line.name, ...(received ? { receivedOn: day } : {}) },
        reason: options.note?.trim() || null,
      },
    });
    return { received, receivedOn: received ? day : null };
  });
}

export type HandoverRow = {
  studentId: string;
  name: string;
  admissionNo: string | null;
  className: string | null;
  invoiceStatus: InvoiceStatus;
  /// Money paid on the pupil's invoice and the invoice's total: an invoice-level fact (payments are not per line), shown so "paid but not yet received" can be seen.
  amountPaid: string;
  totalAmount: string;
  received: { on: string; note: string | null } | null;
};

/// The pupils who have a tracked line on their invoice, with whether each received it: the list the school works down when the uniforms are given out. Newest names last by name.
export async function handoverList(
  branchId: string,
  periodId: string,
  feeStructureId: string,
): Promise<{ line: { id: string; name: string }; rows: HandoverRow[] }> {
  const line = await prisma.feeStructure.findFirst({ where: { branchId, id: feeStructureId, OR: [{ periodId }, { periodId: null }] } });
  if (!line) throw new FinanceError("Fee line not found", "NOT_FOUND");
  if (!line.trackHandover) throw new FinanceError("This line is not tracked as an item that is handed over.", "NOT_TRACKED");
  const invoices = await prisma.invoice.findMany({
    where: { branchId, periodId, lineItems: { array_contains: [{ feeStructureId }] } },
    include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } },
  });
  const handovers = await prisma.feeItemHandover.findMany({ where: { branchId, feeStructureId } });
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { branchId, studentId: { in: invoices.map((i) => i.studentId) }, session: { periods: { some: { id: periodId } } } },
    select: { studentId: true, className: true, arm: true },
  });
  const rows = invoices.map((i): HandoverRow => {
    const h = handovers.find((x) => x.studentId === i.studentId);
    const e = enrollments.find((x) => x.studentId === i.studentId);
    return {
      studentId: i.studentId,
      name: `${i.student.firstName} ${i.student.lastName}`.trim(),
      admissionNo: i.student.admissionNo ?? null,
      className: e ? `${e.className}${e.arm ? ` ${e.arm}` : ""}` : null,
      invoiceStatus: i.status,
      amountPaid: i.amountPaid.toString(),
      totalAmount: i.totalAmount.toString(),
      received: h ? { on: h.receivedOn.toISOString().slice(0, 10), note: h.note } : null,
    };
  });
  rows.sort((a, b) => (a.className ?? "").localeCompare(b.className ?? "", "en", { numeric: true }) || a.name.localeCompare(b.name, "en"));
  return { line: { id: line.id, name: line.name }, rows };
}

/// Set how the fee lines see a pupil: NEW or RETURNING, or null to work it out from the enrolments again. Affects invoices still to be made; one that exists is not changed (opt out of the
/// lines that should not be there). Audited.
export async function setFeeAdmission(
  branchId: string,
  studentId: string,
  admission: "NEW" | "RETURNING" | null,
  actorUserId: string,
): Promise<{ admission: "NEW" | "RETURNING" | null }> {
  const student = await prisma.studentRecord.findFirst({ where: { branchId, id: studentId }, select: { id: true, feeAdmission: true } });
  if (!student) throw new FinanceError("Pupil not found", "NOT_FOUND");
  if (student.feeAdmission === admission) return { admission };
  await prisma.$transaction([
    prisma.studentRecord.update({ where: { id: studentId }, data: { feeAdmission: admission } }),
    prisma.auditLog.create({
      data: {
        actorUserId,
        action: "STUDENT_FEE_ADMISSION_SET",
        targetType: "StudentRecord",
        targetId: studentId,
        beforeValue: { admission: student.feeAdmission },
        afterValue: { admission },
      },
    }),
  ]);
  return { admission };
}
