import { Prisma, InvoiceStatus, PaymentProvider, PaymentStatus, DiscountWorkflowMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  toDecimal,
  toKobo,
  resolveInvoiceStatus,
  generateInvoiceNumber,
  generateReceiptNumber,
  generatePaymentReference,
  computeInvoiceBreakdown,
  type DecimalLike,
} from "./rules";
import { verifyPaystackSignature, computePayloadHash } from "./crypto";
import { getPaystackGateway } from "./paystack";
import { checkPart } from "./part-payment";
import { loadEffectivePolicy } from "./part-payment-service";
import { NOT_DRAFT } from "@/lib/drafts/live";
import { coveredGross, paidByScholarship, planDiscounts, planTopUp, settledBy, statusAfterDiscounts } from "@/lib/scholarships/rules";
import { admissionFor, billedFor } from "@/lib/finance/fee-audience";
import { liveForInvoices, today as schoolToday } from "@/lib/scholarships/service";

export class FinanceError extends Error {
  public code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "FinanceError";
    this.code = code;
  }
}

// --- Sequence Counter Allocations ---

async function allocateInvoiceNo(tx: Prisma.TransactionClient, branchId: string, branchCode: string, year: number): Promise<string> {
  const rows = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO "InvoiceCounter" ("branchId", "year", "next") VALUES (${branchId}, ${year}::int, 2)
    ON CONFLICT ("branchId", "year") DO UPDATE SET "next" = "InvoiceCounter"."next" + 1
    RETURNING ("next" - 1)::int AS seq`;
  return generateInvoiceNumber(branchCode, year, rows[0].seq);
}

export async function allocateReceiptNo(tx: Prisma.TransactionClient, branchId: string, branchCode: string, year: number): Promise<string> {
  const rows = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO "ReceiptCounter" ("branchId", "year", "next") VALUES (${branchId}, ${year}::int, 2)
    ON CONFLICT ("branchId", "year") DO UPDATE SET "next" = "ReceiptCounter"."next" + 1
    RETURNING ("next" - 1)::int AS seq`;
  return generateReceiptNumber(branchCode, year, rows[0].seq);
}

// --- Fee Structure Service ---

export async function listFeeStructures(branchId: string, filter?: { periodId?: string; classGroupId?: string }) {
  const where: Prisma.FeeStructureWhereInput = { branchId };
  // A term's list also holds the lines that recur (task 0124): they are charged in every term.
  if (filter?.periodId) where.OR = [{ periodId: filter.periodId }, { recurrence: { not: "THIS_TERM" } }];
  if (filter?.classGroupId !== undefined) {
    where.classGroupId = filter.classGroupId || null;
  }

  return prisma.feeStructure.findMany({
    where,
    include: {
      period: { select: { id: true, label: true, ordinal: true } },
      classGroup: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function createFeeStructure(
  branchId: string,
  data: {
    periodId?: string | null;
    recurrence?: "THIS_TERM" | "EVERY_TERM" | "EVERY_SESSION";
    classGroupId?: string | null;
    name: string;
    amount: DecimalLike;
  } & FeeBehaviour,
) {
  // How often (task 0124): a line for one term has that term; one that recurs (every term, once a year) has none.
  const recurrence = data.recurrence ?? "THIS_TERM";
  if (recurrence === "THIS_TERM" && !data.periodId)
    throw new FinanceError("Choose the term this fee is for, or say it is charged every term or once a year.");
  const periodId = recurrence === "THIS_TERM" ? data.periodId! : null;
  // Validate period belongs to this branch
  if (periodId) await prisma.academicPeriod.findFirstOrThrow({ where: { branchId, id: periodId } });

  if (data.classGroupId) {
    await prisma.classGroup.findFirstOrThrow({
      where: { branchId, id: data.classGroupId },
    });
  }

  const amountDecimal = toDecimal(data.amount);
  if (amountDecimal.isNegative()) {
    throw new FinanceError("Fee structure amount cannot be negative");
  }

  return prisma.feeStructure.create({
    data: {
      branchId,
      periodId,
      recurrence,
      classGroupId: data.classGroupId ?? null,
      name: data.name.trim(),
      amount: amountDecimal,
      ...behaviourData(data),
    },
    include: {
      period: { select: { id: true, label: true, ordinal: true } },
      classGroup: { select: { id: true, name: true } },
    },
  });
}

/// The settings of a fee line beyond name and amount (task 0122): who it is for (null = everyone), whether it is optional, whether a scholarship covers it, whether its handover is recorded.
export type FeeBehaviour = {
  audienceAdmission?: "NEW" | "RETURNING" | null;
  audienceGender?: "MALE" | "FEMALE" | null;
  audienceResidence?: "DAY" | "BOARDING" | null;
  optional?: boolean;
  scholarshipCovers?: boolean;
  trackHandover?: boolean;
};
const behaviourData = (d: FeeBehaviour): FeeBehaviour => ({
  ...(d.audienceAdmission !== undefined ? { audienceAdmission: d.audienceAdmission } : {}),
  ...(d.audienceGender !== undefined ? { audienceGender: d.audienceGender } : {}),
  ...(d.audienceResidence !== undefined ? { audienceResidence: d.audienceResidence } : {}),
  ...(d.optional !== undefined ? { optional: d.optional } : {}),
  ...(d.scholarshipCovers !== undefined ? { scholarshipCovers: d.scholarshipCovers } : {}),
  ...(d.trackHandover !== undefined ? { trackHandover: d.trackHandover } : {}),
});

export async function updateFeeStructure(
  branchId: string,
  id: string,
  data: { name?: string; amount?: DecimalLike; classGroupId?: string | null } & FeeBehaviour,
) {
  const existing = await prisma.feeStructure.findFirstOrThrow({
    where: { branchId, id },
  });

  if (data.classGroupId) {
    await prisma.classGroup.findFirstOrThrow({
      where: { branchId, id: data.classGroupId },
    });
  }

  const amountDecimal = data.amount !== undefined ? toDecimal(data.amount) : existing.amount;
  if (amountDecimal.isNegative()) {
    throw new FinanceError("Fee structure amount cannot be negative");
  }

  return prisma.feeStructure.update({
    where: { branchId_id: { branchId, id } },
    data: {
      name: data.name !== undefined ? data.name.trim() : existing.name,
      amount: amountDecimal,
      classGroupId: data.classGroupId !== undefined ? data.classGroupId : existing.classGroupId,
      ...behaviourData(data),
    },
    include: {
      period: { select: { id: true, label: true, ordinal: true } },
      classGroup: { select: { id: true, name: true } },
    },
  });
}

export async function deleteFeeStructure(branchId: string, id: string) {
  await prisma.feeStructure.findFirstOrThrow({
    where: { branchId, id },
  });
  // A line whose handovers were recorded keeps them: they are the school's record of what was given out (task 0122).
  const handed = await prisma.feeItemHandover.count({ where: { branchId, feeStructureId: id } });
  if (handed > 0)
    throw new FinanceError(
      `${handed} ${handed === 1 ? "pupil has" : "pupils have"} received this item, so the line cannot be deleted. Stop tracking it instead.`,
      "HAS_HANDOVERS",
    );

  return prisma.feeStructure.delete({
    where: { branchId_id: { branchId, id } },
  });
}

// --- Invoice Batch Generation ---

export async function generateInvoices(
  branchId: string,
  options: { periodId: string; classGroupId?: string | null; dueDate?: Date | null; actorUserId?: string },
) {
  return prisma.$transaction(async (tx) => {
    const period = await tx.academicPeriod.findFirstOrThrow({
      where: { branchId, id: options.periodId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        session: true,
      },
    });

    // This term's lines and the lines that recur (task 0124).
    const feeStructures = await tx.feeStructure.findMany({
      where: { branchId, OR: [{ periodId: options.periodId }, { recurrence: { not: "THIS_TERM" } }] },
    });

    if (feeStructures.length === 0) {
      throw new FinanceError("No fee structures found for this academic period. Configure fees first.");
    }

    // Find all active student enrollments for this session in the branch
    const enrollmentWhere: Prisma.StudentEnrollmentWhereInput = {
      branchId,
      sessionId: period.sessionId,
      status: "ACTIVE",
      // A draft is not invoiced (task 0101 D1): complete the record first.
      student: NOT_DRAFT,
    };

    if (options.classGroupId) {
      enrollmentWhere.classArm = { classGroupId: options.classGroupId };
    }

    const enrollments = await tx.studentEnrollment.findMany({
      where: enrollmentWhere,
      include: {
        student: true,
        classArm: true,
      },
    });

    let created = 0;
    let skipped = 0;
    let scholarshipDiscounts = 0;
    const year = new Date().getFullYear();
    const branchCode = period.branch.code;
    // Task 0113 S1: the scholarships live on the invoices' issue day (today, the school's day), for every pupil of the run, read once.
    const liveScholarships = await liveForInvoices(
      tx,
      enrollments.map((e) => e.studentId),
      schoolToday(),
    );

    // Task 0122: who is new this period (no enrolment in a session that began earlier), and each pupil's opt-outs, read once for the whole run.
    const pupilIds = enrollments.map((e) => e.studentId);
    const returning = new Set(
      (
        await tx.studentEnrollment.findMany({
          where: { branchId, studentId: { in: pupilIds }, session: { startDate: { lt: period.session.startDate } } },
          select: { studentId: true },
          distinct: ["studentId"],
        })
      ).map((r) => r.studentId),
    );
    const optedOut = new Map<string, Set<string>>();
    for (const o of await tx.studentFeeOptOut.findMany({
      where: { branchId, studentId: { in: pupilIds }, feeStructureId: { in: feeStructures.map((f) => f.id) } },
      select: { studentId: true, feeStructureId: true },
    }))
      optedOut.set(o.studentId, (optedOut.get(o.studentId) ?? new Set()).add(o.feeStructureId));
    // Once-a-year lines (task 0124): a pupil who already has the line on another invoice of this session is not charged it again; one who joined in a later term has it on their first.
    const carried = new Map<string, Set<string>>();
    if (feeStructures.some((f) => f.recurrence === "EVERY_SESSION"))
      for (const inv of await tx.invoice.findMany({
        where: { branchId, studentId: { in: pupilIds }, periodId: { not: options.periodId }, period: { sessionId: period.sessionId } },
        select: { studentId: true, lineItems: true },
      })) {
        const ids = carried.get(inv.studentId) ?? new Set<string>();
        for (const l of Array.isArray(inv.lineItems) ? (inv.lineItems as { feeStructureId?: string }[]) : [])
          if (l.feeStructureId) ids.add(l.feeStructureId);
        carried.set(inv.studentId, ids);
      }
    let missingResidence = 0;

    for (const enrollment of enrollments) {
      // Check if invoice already exists (idempotent)
      const existing = await tx.invoice.findUnique({
        where: {
          branchId_studentId_periodId: {
            branchId,
            studentId: enrollment.studentId,
            periodId: options.periodId,
          },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Filter applicable fee structures: general (null classGroupId) or matching student's class group
      const studentClassGroupId = enrollment.classArm?.classGroupId ?? null;
      const ofClass = feeStructures.filter(
        (f) =>
          (!f.classGroupId || f.classGroupId === studentClassGroupId) &&
          !(f.recurrence === "EVERY_SESSION" && carried.get(enrollment.studentId)?.has(f.id)),
      );
      // Task 0122: of the class's lines, the ones this pupil is billed (their gender, new or returning, day or boarding, and the optional lines they did not opt out of).
      const { billed: applicableFees, missingResidence: lacking } = billedFor(
        ofClass.map((f) => ({
          ...f,
          admission: f.audienceAdmission,
          gender: f.audienceGender,
          residence: f.audienceResidence,
        })),
        {
          admission: enrollment.student.feeAdmission ?? admissionFor(returning.has(enrollment.studentId)),
          gender: enrollment.student.gender,
          residence: enrollment.student.residence,
        },
        optedOut.get(enrollment.studentId) ?? new Set(),
      );
      if (lacking > 0) missingResidence++;

      if (applicableFees.length === 0) {
        skipped++;
        continue;
      }

      let totalAmount = new Prisma.Decimal(0);
      const lineItems = applicableFees.map((f) => {
        totalAmount = totalAmount.add(f.amount);
        return {
          feeStructureId: f.id,
          name: f.name,
          amount: f.amount.toString(),
          // false only when the fee says a scholarship does not cover this line (task 0122); the snapshot carries it so every later scholarship calculation agrees.
          ...(f.scholarshipCovers ? {} : { covered: false }),
        };
      });

      const invoiceNo = await allocateInvoiceNo(tx, branchId, branchCode, year);

      const invoice = await tx.invoice.create({
        data: {
          branchId,
          studentId: enrollment.studentId,
          periodId: options.periodId,
          invoiceNo,
          totalAmount,
          amountPaid: new Prisma.Decimal(0),
          status: InvoiceStatus.UNPAID,
          dueDate: options.dueDate ?? null,
          lineItems,
        },
      });

      // A scholarship live today takes its share off the new invoice, through the one discount function (net total and status as for a manual discount); one discount per scholarship.
      // The share is taken of the part the scholarship covers (task 0122: all of it unless a line says otherwise), never more than what the invoice owes.
      for (const { scholarship, amount } of planDiscounts(
        coveredGross(lineItems),
        liveScholarships.get(enrollment.studentId) ?? [],
        totalAmount,
      )) {
        await addDiscountTx(tx, branchId, invoice.id, {
          amount,
          reason: `${scholarship.typeName} (${scholarship.percent}%)`,
          mode: DiscountWorkflowMode.SCHOLARSHIP,
          appliedByUserId: options.actorUserId ?? "system",
          studentScholarshipId: scholarship.id,
        });
        scholarshipDiscounts++;
      }

      created++;
    }

    // `missingResidence`: pupils who were left without a line for boarders or day pupils because their record does not say which (task 0122); fix the record and generate again.
    return { created, skipped, scholarshipDiscounts, missingResidence };
  });
}

// --- Invoice Queries & Details ---

export async function listInvoices(
  branchId: string,
  filter?: { periodId?: string; studentId?: string; status?: InvoiceStatus; page?: number; limit?: number },
) {
  const where: Prisma.InvoiceWhereInput = { branchId };
  if (filter?.periodId) where.periodId = filter.periodId;
  if (filter?.studentId) where.studentId = filter.studentId;
  if (filter?.status) where.status = filter.status;

  const page = Math.max(1, filter?.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter?.limit ?? 50));
  const skip = (page - 1) * limit;

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        period: { select: { id: true, label: true } },
        payments: { select: { id: true, amount: true, status: true, paidAt: true, channel: true } },
        discounts: { select: { id: true, amount: true, reason: true, mode: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ]);

  // "Paid by scholarship", "Waived" or "Paid by discount" (task 0113 S1; 2026-11-19) is worked out here, once, for the list and the detail: `settledBy` names what settled an invoice nobody paid money on.
  return {
    invoices: invoices.map((invoice) => ({ ...invoice, paidByScholarship: paidByScholarship(invoice), settledBy: settledBy(invoice) })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getInvoice(branchId: string, id: string) {
  const invoice = await prisma.invoice.findFirstOrThrow({
    where: { branchId, id },
    include: {
      student: { omit: { pupilCodeHash: true } },
      period: {
        include: {
          session: true,
          branch: true,
        },
      },
      payments: {
        orderBy: [{ createdAt: "desc" }],
      },
      discounts: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });
  return { ...invoice, paidByScholarship: paidByScholarship(invoice), settledBy: settledBy(invoice) };
}

// --- Payments & Concurrency Fulfilment ---

/// The part-payment rule (task 0046) for a payment being STARTED or RECORDED, read inside the caller's transaction. It is not applied to a payment that has already been taken
/// (`fulfillPayment`, the webhook): money that was accepted when it was started is never refused afterwards, even if the rule changed in between.
async function enforcePartPayment(
  tx: Prisma.TransactionClient,
  branchId: string,
  invoice: { totalAmount: Prisma.Decimal; amountPaid: Prisma.Decimal; payInFull: boolean },
  amount: Prisma.Decimal,
) {
  const policy = await loadEffectivePolicy(tx, branchId);
  const check = checkPart({ total: invoice.totalAmount, paid: invoice.amountPaid, amount, policy, payInFull: invoice.payInFull });
  if (!check.ok) throw new FinanceError(check.message, check.code);
}

export async function initializeGatewayPayment(
  branchId: string,
  params: { invoiceId: string; email: string; amount?: number; callbackUrl?: string },
) {
  return prisma.$transaction(async (tx) => {
    // One payment at a time on an invoice: the balance and the part-payment rule are read under this lock, so two payments racing cannot both slip under the rule (task 0046).
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${params.invoiceId} AND "branchId" = ${branchId} FOR UPDATE`;
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { branchId, id: params.invoiceId },
    });

    if (invoice.status === InvoiceStatus.PAID) {
      throw new FinanceError("Invoice is already fully paid");
    }
    if (invoice.status === InvoiceStatus.WAIVED || invoice.status === InvoiceStatus.CANCELLED) {
      throw new FinanceError(`Invoice is marked as ${invoice.status}`);
    }

    const balanceDue = invoice.totalAmount.sub(invoice.amountPaid);
    const amountToPay = params.amount !== undefined ? toDecimal(params.amount) : balanceDue;

    if (amountToPay.lte(0)) {
      throw new FinanceError("Payment amount must be greater than zero");
    }
    if (amountToPay.gt(balanceDue)) {
      throw new FinanceError("Payment amount cannot exceed the balance due");
    }
    await enforcePartPayment(tx, branchId, invoice, amountToPay);

    const amountInKobo = toKobo(amountToPay);
    const reference = generatePaymentReference(PaymentProvider.PAYSTACK);

    const payment = await tx.payment.create({
      data: {
        branchId,
        invoiceId: invoice.id,
        amount: amountToPay,
        provider: PaymentProvider.PAYSTACK,
        providerRef: reference,
        status: PaymentStatus.PENDING,
        verifiedServerSide: false,
        metadata: {
          branchId,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
        },
      },
    });

    const gateway = getPaystackGateway();
    const gatewayInit = await gateway.initializePayment({
      email: params.email,
      amountInKobo,
      reference,
      callbackUrl: params.callbackUrl,
      metadata: {
        branchId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        studentId: invoice.studentId,
      },
    });

    return {
      paymentId: payment.id,
      reference,
      authorizationUrl: gatewayInit.authorizationUrl,
      accessCode: gatewayInit.accessCode,
      amount: amountToPay.toString(),
    };
  });
}

export async function recordManualPayment(
  branchId: string,
  invoiceId: string,
  data: {
    amount: DecimalLike;
    channel: string;
    reference?: string;
    paidAt?: Date;
    notes?: string;
    recordedByUserId?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${invoiceId} AND "branchId" = ${branchId} FOR UPDATE`;
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { branchId, id: invoiceId },
      include: { branch: true },
    });

    if (invoice.status === InvoiceStatus.PAID) {
      throw new FinanceError("Invoice is already fully paid");
    }
    if (invoice.status === InvoiceStatus.WAIVED || invoice.status === InvoiceStatus.CANCELLED) {
      throw new FinanceError(`Invoice is marked as ${invoice.status}`);
    }

    const amountDecimal = toDecimal(data.amount);
    if (amountDecimal.lte(0)) {
      throw new FinanceError("Payment amount must be greater than zero");
    }

    const balanceDue = invoice.totalAmount.sub(invoice.amountPaid);
    if (amountDecimal.gt(balanceDue)) {
      throw new FinanceError("Payment amount cannot exceed the balance due");
    }
    await enforcePartPayment(tx, branchId, invoice, amountDecimal);

    const year = new Date().getFullYear();
    const branchCode = invoice.branch.code;
    const receiptNo = await allocateReceiptNo(tx, branchId, branchCode, year);
    const reference = data.reference || generatePaymentReference(PaymentProvider.MANUAL);

    const payment = await tx.payment.create({
      data: {
        branchId,
        invoiceId: invoice.id,
        amount: amountDecimal,
        provider: PaymentProvider.MANUAL,
        providerRef: reference,
        status: PaymentStatus.SUCCESS,
        verifiedServerSide: true,
        channel: data.channel || "cash",
        paidAt: data.paidAt || new Date(),
        receiptNo,
        recordedByUserId: data.recordedByUserId,
        metadata: data.notes ? { notes: data.notes } : undefined,
      },
    });

    const newAmountPaid = invoice.amountPaid.add(amountDecimal);
    const newStatus = resolveInvoiceStatus(invoice.totalAmount, newAmountPaid);

    await tx.invoice.update({
      where: { branchId_id: { branchId, id: invoice.id } },
      data: {
        amountPaid: newAmountPaid,
        status: newStatus,
      },
    });

    return payment;
  });
}

/**
 * Atomically fulfills an online payment reference with concurrency locking.
 */
export async function fulfillPayment(reference: string, verifiedAmountInKobo: number, channel?: string) {
  // A payment of a program invoice (slice P4) carries a reference of its own kind; it is fulfilled in the program's tables. Loaded when needed: the program code imports this file.
  if (reference.startsWith("prg_pay_")) {
    const { fulfillProgramPayment } = await import("@/lib/programs/fees-payments");
    return fulfillProgramPayment(reference, verifiedAmountInKobo, channel);
  }
  return prisma.$transaction(async (tx) => {
    // 1. Concurrency lock: update status to SUCCESS only if currently PENDING
    const updated = await tx.payment.updateMany({
      where: {
        providerRef: reference,
        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.SUCCESS,
        verifiedServerSide: true,
        paidAt: new Date(),
        channel: channel || "paystack",
      },
    });

    if (updated.count === 0) {
      // Payment was already fulfilled or does not exist
      return null;
    }

    // 2. Fetch the fulfilled payment and parent invoice
    const payment = await tx.payment.findUniqueOrThrow({
      where: {
        provider_providerRef: {
          provider: PaymentProvider.PAYSTACK,
          providerRef: reference,
        },
      },
      include: {
        branch: true,
        invoice: true,
      },
    });

    // 3. Verify amount in kobo matches payment expectation
    const expectedKobo = toKobo(payment.amount);
    if (verifiedAmountInKobo !== expectedKobo) {
      throw new FinanceError(`Amount mismatch: expected ${expectedKobo} kobo, received ${verifiedAmountInKobo} kobo`);
    }

    // 4. Allocate receipt number
    const year = new Date().getFullYear();
    const branchCode = payment.branch.code;
    const receiptNo = await allocateReceiptNo(tx, payment.branchId, branchCode, year);

    await tx.payment.update({
      where: { id: payment.id },
      data: { receiptNo },
    });

    // 5. Update invoice balance and status
    const newAmountPaid = payment.invoice.amountPaid.add(payment.amount);
    const newStatus = resolveInvoiceStatus(payment.invoice.totalAmount, newAmountPaid);

    await tx.invoice.update({
      where: { branchId_id: { branchId: payment.branchId, id: payment.invoiceId } },
      data: {
        amountPaid: newAmountPaid,
        status: newStatus,
      },
    });

    return { ...payment, receiptNo };
  });
}

// --- Paystack Webhook Handler ---
//
// Ported from Octalve Edu (its F2/F3 hardening; Octalve's design is canonical for shared parts). Until 2026-10-19 this wrote its audit ledger BEFORE checking the
// signature, keyed by an event id the SENDER chose (an unsigned request could fill the table, or overwrite a genuine event's row to `signatureValid = false`), took
// the signing secret from `PAYSTACK_SECRET_KEY || "mock_secret"` (anyone could sign a charge.success), and gave an event that carried no id one made from the clock,
// so the same body was a new event every time.

/// What a delivery turned into.
export type WebhookOutcome =
  /// Unsigned or wrongly signed: NOTHING was written. Answered 401.
  | { status: "invalid_signature"; eventId: string }
  /// Fulfilled (or already was). `duplicate` when this event had been processed before.
  | { status: "processed"; eventId: string; duplicate?: true }
  /// Signed, but not an event this system acts on.
  | { status: "ignored"; eventId: string }
  /// A deliberate refusal (an amount that does not match...): recorded on the event row, answered 200, because retrying cannot change it.
  | { status: "refused"; eventId: string; error: string }
  /// A transient failure (database, network): answered 503 so the provider retries; the event stays unprocessed.
  | { status: "retry"; eventId: string };

type ParsedWebhook = { event?: unknown; data?: { id?: unknown; reference?: unknown; amount?: unknown; channel?: unknown } };
const MAX_EVENT_ID_LENGTH = 128;

/// The event's identity, derived from the payload itself and never from the clock, so the same body is the same event.
export function webhookEventId(parsed: ParsedWebhook, rawPayloadHash: string): string {
  const candidate = parsed.data?.id ?? parsed.data?.reference;
  const usable = (typeof candidate === "number" && Number.isFinite(candidate)) || (typeof candidate === "string" && candidate.length > 0);
  return (usable ? String(candidate) : `sha256:${rawPayloadHash.slice(0, 32)}`).slice(0, MAX_EVENT_ID_LENGTH);
}

export async function processPaystackWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secretKey: string,
): Promise<WebhookOutcome> {
  const rawPayloadHash = computePayloadHash(rawBody);

  let parsed: ParsedWebhook = {};
  try {
    const value: unknown = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as ParsedWebhook;
  } catch {
    // Not JSON: there is no event to process; it can only be ignored (or refused as unsigned below).
  }
  const eventId = webhookEventId(parsed, rawPayloadHash);

  // An unsigned or wrongly signed delivery is not evidence of anything: it writes NOTHING (no ledger row an outsider could fill or overwrite).
  if (!verifyPaystackSignature(rawBody, signatureHeader, secretKey)) {
    return { status: "invalid_signature", eventId };
  }

  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { provider_eventId: { provider: PaymentProvider.PAYSTACK, eventId } },
  });
  if (existing?.processedAt) return { status: "processed", eventId, duplicate: true };

  // The (signed) delivery goes in the ledger; `processedAt` is set only once it has been acted on.
  await prisma.paymentWebhookEvent.upsert({
    where: { provider_eventId: { provider: PaymentProvider.PAYSTACK, eventId } },
    create: {
      provider: PaymentProvider.PAYSTACK,
      eventId,
      eventType: typeof parsed.event === "string" ? parsed.event.slice(0, 64) : null,
      signatureValid: true,
      rawPayloadHash,
      processedAt: null,
    },
    update: { signatureValid: true },
  });

  const data = parsed.data;
  if (parsed.event === "charge.success" && typeof data?.reference === "string" && data.reference && typeof data.amount === "number") {
    try {
      await fulfillPayment(data.reference, data.amount, typeof data.channel === "string" ? data.channel : undefined);
    } catch (err) {
      if (err instanceof FinanceError) {
        await prisma.paymentWebhookEvent.update({
          where: { provider_eventId: { provider: PaymentProvider.PAYSTACK, eventId } },
          data: { error: err.message.slice(0, 500) },
        });
        return { status: "refused", eventId, error: err.message };
      }
      console.error("[PAYSTACK_WEBHOOK_TRANSIENT]", err);
      return { status: "retry", eventId };
    }

    await prisma.paymentWebhookEvent.update({
      where: { provider_eventId: { provider: PaymentProvider.PAYSTACK, eventId } },
      data: { processedAt: new Date(), error: null },
    });
    return { status: "processed", eventId };
  }

  return { status: "ignored", eventId };
}

// --- Discounts & Waivers ---

type DiscountData = {
  amount: DecimalLike;
  reason: string;
  mode: DiscountWorkflowMode;
  appliedByUserId: string;
  /// Task 0113 S1: the scholarship this discount is one share of (at most one per scholarship per invoice, by a unique index).
  studentScholarshipId?: string | null;
};

/// Takes a discount off an invoice, in the caller's transaction: the ONE place a discount is written, for the manual form, for invoice generation and for "Apply to open invoices", so the net
/// total and the status are worked out the same way for all three. The net is the fees less every discount; the status is what money gives for it, except that an invoice with nothing left
/// to pay because discounts of any kind took the whole fee off is PAID (task 0113 S1; widened from scholarships alone on 2026-11-19 so a fully waived invoice leaves the arrears lists).
export async function addDiscountTx(tx: Prisma.TransactionClient, branchId: string, invoiceId: string, data: DiscountData) {
  const invoice = await tx.invoice.findFirstOrThrow({
    where: { branchId, id: invoiceId },
    include: { discounts: true },
  });

  const discountAmount = toDecimal(data.amount);
  if (discountAmount.lte(0)) {
    throw new FinanceError("Discount amount must be greater than zero");
  }

  const mode = data.mode;
  const allDiscounts = [...invoice.discounts.map((d) => ({ amount: d.amount, mode: d.mode })), { amount: discountAmount, mode }];

  // Parse line items
  const rawItems = (invoice.lineItems as { amount: string }[] | null) || [];
  const breakdown = computeInvoiceBreakdown(rawItems, allDiscounts);

  const discount = await tx.invoiceDiscount.create({
    data: {
      branchId,
      invoiceId: invoice.id,
      amount: discountAmount,
      reason: data.reason.trim(),
      mode,
      appliedByUserId: data.appliedByUserId,
      ...(data.studentScholarshipId ? { studentScholarshipId: data.studentScholarshipId } : {}),
    },
  });

  // Update invoice totalAmount to reflect net amount
  const newStatus = statusAfterDiscounts(
    resolveInvoiceStatus(breakdown.netAmount, invoice.amountPaid),
    breakdown.netAmount,
    allDiscounts,
  ) as InvoiceStatus;

  await tx.invoice.update({
    where: { branchId_id: { branchId, id: invoice.id } },
    data: {
      totalAmount: breakdown.netAmount,
      status: newStatus,
    },
  });

  return discount;
}

export async function applyDiscount(branchId: string, invoiceId: string, data: DiscountData) {
  return prisma.$transaction((tx) => addDiscountTx(tx, branchId, invoiceId, data));
}

/// How many of a pupil's open invoices a scholarship has not been applied to yet (the number on "Apply to this pupil's open invoices"): invoices that are Unpaid or Part paid, with something
/// still owed, and no discount from this scholarship.
export async function openInvoicesFor(
  db: Prisma.TransactionClient | typeof prisma,
  branchId: string,
  studentId: string,
  scholarshipId: string,
) {
  const rows = await db.invoice.findMany({
    where: {
      branchId,
      studentId,
      status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID] },
      discounts: { none: { studentScholarshipId: scholarshipId } },
    },
    select: { id: true, totalAmount: true, amountPaid: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.filter((r) => r.totalAmount.gt(r.amountPaid));
}

/// "Apply to this pupil's open invoices" (task 0113 S1): adds the scholarship's share to each open invoice of the pupil that does not have it yet, never more than the invoice still owes, once per
/// scholarship per invoice (the unique link makes a second press do nothing). The invoice is locked as for a payment, so a payment racing it cannot make the balance wrong. Invoices already
/// paid, waived or cancelled are not touched; neither are invoices that already have a discount from this scholarship: a raised share reaches those through `topUpScholarshipOnOpenInvoices`, below.
export async function applyScholarshipToOpenInvoices(
  branchId: string,
  studentId: string,
  scholarshipId: string,
  actorUserId: string,
): Promise<{ applied: number; settled: number; kobo: number }> {
  return prisma.$transaction(async (tx) => {
    const scholarship = await tx.studentScholarship.findFirst({
      where: { id: scholarshipId, studentId, branchId },
      select: { id: true, percent: true, startsOn: true, endsOn: true, endedAt: true, type: { select: { name: true } } },
    });
    if (!scholarship) throw new FinanceError("Scholarship not found");
    const day = schoolToday();
    const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    if (scholarship.endedAt || (iso(scholarship.startsOn) ?? day) > day || (iso(scholarship.endsOn) ?? day) < day)
      throw new FinanceError("This scholarship is not live today, so it cannot be applied.");
    let applied = 0;
    let settled = 0;
    let total = new Prisma.Decimal(0);
    for (const candidate of await openInvoicesFor(tx, branchId, studentId, scholarshipId)) {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${candidate.id} AND "branchId" = ${branchId} FOR UPDATE`;
      const invoice = await tx.invoice.findFirstOrThrow({ where: { id: candidate.id, branchId }, include: { discounts: true } });
      // Re-read under the lock: it may have been paid, or already carry this scholarship.
      if (invoice.status !== InvoiceStatus.UNPAID && invoice.status !== InvoiceStatus.PARTIALLY_PAID) continue;
      if (invoice.discounts.some((d) => d.studentScholarshipId === scholarshipId)) continue;
      const balance = invoice.totalAmount.sub(invoice.amountPaid);
      const gross = coveredGross((invoice.lineItems as { amount: string; covered?: boolean }[] | null) ?? []);
      const [plan] = planDiscounts(gross, [{ id: scholarshipId, percent: scholarship.percent }], balance);
      if (!plan) continue;
      await addDiscountTx(tx, branchId, invoice.id, {
        amount: plan.amount,
        reason: `${scholarship.type.name} (${scholarship.percent}%)`,
        mode: DiscountWorkflowMode.SCHOLARSHIP,
        appliedByUserId: actorUserId,
        studentScholarshipId: scholarshipId,
      });
      applied++;
      total = total.add(plan.amount);
      const after = await tx.invoice.findFirstOrThrow({ where: { id: invoice.id }, include: { discounts: true } });
      if (paidByScholarship(after)) settled++;
    }
    if (applied > 0)
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "STUDENT_SCHOLARSHIP_APPLIED",
          targetType: "StudentRecord",
          targetId: studentId,
          afterValue: { scholarshipId, invoices: applied, settled, kobo: toKobo(total) },
        },
      });
    return { applied, settled, kobo: toKobo(total) };
  });
}

// --- "Apply the change to open invoices" (the maintainer approved this on 2026-11-19) ---
//
// A scholarship already on an invoice is ONE discount line (a unique link per scholarship per invoice). When the share is raised, new invoices take the new share, and the invoices already issued keep
// the old line until an administrator chooses to top them up: the line is RAISED to what the new share asks (never a second line, so pressing it again finds nothing more to add), only on Unpaid or
// Part paid invoices, never beyond what the invoice still owes. A lowered share, or an ended scholarship, changes nothing already issued.

type TopUpDb = Prisma.TransactionClient | typeof prisma;

async function liveScholarshipForTopUp(db: TopUpDb, branchId: string, studentId: string, scholarshipId: string) {
  const scholarship = await db.studentScholarship.findFirst({
    where: { id: scholarshipId, studentId, branchId },
    select: { id: true, percent: true, startsOn: true, endsOn: true, endedAt: true, type: { select: { name: true } } },
  });
  if (!scholarship) throw new FinanceError("Scholarship not found");
  const day = schoolToday();
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  if (scholarship.endedAt || (iso(scholarship.startsOn) ?? day) > day || (iso(scholarship.endsOn) ?? day) < day)
    throw new FinanceError("This scholarship is not live today, so its invoices cannot be changed.");
  return scholarship;
}

const OPEN: InvoiceStatus[] = [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID];

/// What the raise would do, without doing it: how many open invoices of the pupil already carry this scholarship and would be topped up, and the extra amount in kobo.
export async function previewScholarshipTopUp(
  branchId: string,
  studentId: string,
  scholarshipId: string,
): Promise<{ invoices: number; kobo: number }> {
  const scholarship = await liveScholarshipForTopUp(prisma, branchId, studentId, scholarshipId);
  const rows = await prisma.invoice.findMany({
    where: { branchId, studentId, status: { in: OPEN }, discounts: { some: { studentScholarshipId: scholarshipId } } },
    include: { discounts: true },
  });
  let invoices = 0;
  let total = new Prisma.Decimal(0);
  for (const invoice of rows) {
    const given = invoice.discounts
      .filter((d) => d.studentScholarshipId === scholarshipId)
      .reduce((n, d) => n.add(d.amount), new Prisma.Decimal(0));
    const gross = coveredGross((invoice.lineItems as { amount: string; covered?: boolean }[] | null) ?? []);
    const delta = planTopUp(gross, scholarship.percent, given, invoice.totalAmount.sub(invoice.amountPaid));
    if (delta.gt(0)) {
      invoices++;
      total = total.add(delta);
    }
  }
  return { invoices, kobo: toKobo(total) };
}

/// Tops up the open invoices that already carry this scholarship to its present share, in one transaction, each invoice locked as for a payment. Returns how many invoices changed, how many of
/// those are now settled (nothing left to pay), and the extra amount in kobo. Audited without any note text.
export async function topUpScholarshipOnOpenInvoices(
  branchId: string,
  studentId: string,
  scholarshipId: string,
  actorUserId: string,
): Promise<{ toppedUp: number; settled: number; kobo: number }> {
  return prisma.$transaction(async (tx) => {
    const scholarship = await liveScholarshipForTopUp(tx, branchId, studentId, scholarshipId);
    const candidates = await tx.invoice.findMany({
      where: { branchId, studentId, status: { in: OPEN }, discounts: { some: { studentScholarshipId: scholarshipId } } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    let toppedUp = 0;
    let settled = 0;
    let total = new Prisma.Decimal(0);
    for (const { id } of candidates) {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${id} AND "branchId" = ${branchId} FOR UPDATE`;
      const invoice = await tx.invoice.findFirstOrThrow({ where: { id, branchId }, include: { discounts: true } });
      // Re-read under the lock: it may have been paid since.
      if (!OPEN.includes(invoice.status)) continue;
      const mine = invoice.discounts.filter((d) => d.studentScholarshipId === scholarshipId);
      if (mine.length === 0) continue;
      const given = mine.reduce((n, d) => n.add(d.amount), new Prisma.Decimal(0));
      const items = (invoice.lineItems as { amount: string; covered?: boolean }[] | null) ?? [];
      const gross = coveredGross(items);
      const delta = planTopUp(gross, scholarship.percent, given, invoice.totalAmount.sub(invoice.amountPaid));
      if (delta.lte(0)) continue;
      const line = mine[0];
      const raised = line.amount.add(delta);
      await tx.invoiceDiscount.update({
        where: { id: line.id },
        data: { amount: raised, reason: `${scholarship.type.name} (${scholarship.percent}%)` },
      });
      const all = invoice.discounts.map((d) => ({ amount: d.id === line.id ? raised : d.amount, mode: d.mode }));
      const breakdown = computeInvoiceBreakdown(items, all);
      const status = statusAfterDiscounts(
        resolveInvoiceStatus(breakdown.netAmount, invoice.amountPaid),
        breakdown.netAmount,
        all,
      ) as InvoiceStatus;
      await tx.invoice.update({ where: { branchId_id: { branchId, id } }, data: { totalAmount: breakdown.netAmount, status } });
      toppedUp++;
      total = total.add(delta);
      if (status === InvoiceStatus.PAID) settled++;
    }
    if (toppedUp > 0)
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "STUDENT_SCHOLARSHIP_TOPPED_UP",
          targetType: "StudentRecord",
          targetId: studentId,
          afterValue: { scholarshipId, percent: scholarship.percent, invoices: toppedUp, settled, kobo: toKobo(total) },
        },
      });
    return { toppedUp, settled, kobo: toKobo(total) };
  });
}
