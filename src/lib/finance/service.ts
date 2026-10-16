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

async function allocateReceiptNo(tx: Prisma.TransactionClient, branchId: string, branchCode: string, year: number): Promise<string> {
  const rows = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO "ReceiptCounter" ("branchId", "year", "next") VALUES (${branchId}, ${year}::int, 2)
    ON CONFLICT ("branchId", "year") DO UPDATE SET "next" = "ReceiptCounter"."next" + 1
    RETURNING ("next" - 1)::int AS seq`;
  return generateReceiptNumber(branchCode, year, rows[0].seq);
}

// --- Fee Structure Service ---

export async function listFeeStructures(branchId: string, filter?: { periodId?: string; classGroupId?: string }) {
  const where: Prisma.FeeStructureWhereInput = { branchId };
  if (filter?.periodId) where.periodId = filter.periodId;
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
  data: { periodId: string; classGroupId?: string | null; name: string; amount: DecimalLike }
) {
  // Validate period belongs to this branch
  await prisma.academicPeriod.findFirstOrThrow({
    where: { branchId, id: data.periodId },
  });

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
      periodId: data.periodId,
      classGroupId: data.classGroupId ?? null,
      name: data.name.trim(),
      amount: amountDecimal,
    },
    include: {
      period: { select: { id: true, label: true, ordinal: true } },
      classGroup: { select: { id: true, name: true } },
    },
  });
}

export async function updateFeeStructure(
  branchId: string,
  id: string,
  data: { name?: string; amount?: DecimalLike; classGroupId?: string | null }
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

  return prisma.feeStructure.delete({
    where: { branchId_id: { branchId, id } },
  });
}

// --- Invoice Batch Generation ---

export async function generateInvoices(
  branchId: string,
  options: { periodId: string; classGroupId?: string | null; dueDate?: Date | null; actorUserId?: string }
) {
  return prisma.$transaction(async (tx) => {
    const period = await tx.academicPeriod.findFirstOrThrow({
      where: { branchId, id: options.periodId },
      include: {
        branch: { select: { id: true, name: true } },
        session: true,
      },
    });

    const feeStructures = await tx.feeStructure.findMany({
      where: { branchId, periodId: options.periodId },
    });

    if (feeStructures.length === 0) {
      throw new FinanceError("No fee structures found for this academic period. Configure fees first.");
    }

    // Find all active student enrollments for this session in the branch
    const enrollmentWhere: Prisma.StudentEnrollmentWhereInput = {
      branchId,
      sessionId: period.sessionId,
      status: "ACTIVE",
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
    const year = new Date().getFullYear();
    const branchCode = period.branch.name.slice(0, 4).toUpperCase();

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
      const applicableFees = feeStructures.filter(
        (f) => !f.classGroupId || f.classGroupId === studentClassGroupId
      );

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
        };
      });

      const invoiceNo = await allocateInvoiceNo(tx, branchId, branchCode, year);

      await tx.invoice.create({
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

      created++;
    }

    return { created, skipped };
  });
}

// --- Invoice Queries & Details ---

export async function listInvoices(
  branchId: string,
  filter?: { periodId?: string; studentId?: string; status?: InvoiceStatus; page?: number; limit?: number }
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
        discounts: { select: { id: true, amount: true, reason: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ]);

  return { invoices, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getInvoice(branchId: string, id: string) {
  return prisma.invoice.findFirstOrThrow({
    where: { branchId, id },
    include: {
      student: true,
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
}

// --- Payments & Concurrency Fulfilment ---

export async function initializeGatewayPayment(
  branchId: string,
  params: { invoiceId: string; email: string; amount?: number; callbackUrl?: string }
) {
  return prisma.$transaction(async (tx) => {
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
  }
) {
  return prisma.$transaction(async (tx) => {
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

    const year = new Date().getFullYear();
    const branchCode = invoice.branch.name.slice(0, 4).toUpperCase();
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
export async function fulfillPayment(
  reference: string,
  verifiedAmountInKobo: number,
  channel?: string
) {
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
      throw new FinanceError(
        `Amount mismatch: expected ${expectedKobo} kobo, received ${verifiedAmountInKobo} kobo`
      );
    }

    // 4. Allocate receipt number
    const year = new Date().getFullYear();
    const branchCode = payment.branch.name.slice(0, 4).toUpperCase();
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

export async function processPaystackWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined
) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY || "mock_secret";
  const isValid = verifyPaystackSignature(rawBody, signatureHeader, secretKey);
  const rawPayloadHash = computePayloadHash(rawBody);

  let payload: { event?: string; data?: { id?: number; reference?: string; amount?: number; channel?: string } } = {};
  try {
    payload = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
  } catch {
    // Ignore parse error, logged below
  }

  const eventId = String(payload.data?.id || `evt_${Date.now()}`);

  // Record webhook audit log
  await prisma.paymentWebhookEvent.upsert({
    where: {
      provider_eventId: {
        provider: PaymentProvider.PAYSTACK,
        eventId,
      },
    },
    update: {
      signatureValid: isValid,
      processedAt: new Date(),
    },
    create: {
      provider: PaymentProvider.PAYSTACK,
      eventId,
      eventType: payload.event,
      signatureValid: isValid,
      rawPayloadHash,
      processedAt: new Date(),
    },
  });

  if (!isValid) {
    throw new FinanceError("Invalid webhook signature", "INVALID_SIGNATURE");
  }

  if (payload.event === "charge.success" && payload.data?.reference && payload.data.amount) {
    await fulfillPayment(payload.data.reference, payload.data.amount, payload.data.channel);
  }

  return { received: true, valid: isValid };
}

// --- Discounts & Waivers ---

export async function applyDiscount(
  branchId: string,
  invoiceId: string,
  data: {
    amount: DecimalLike;
    reason: string;
    mode: DiscountWorkflowMode;
    appliedByUserId: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { branchId, id: invoiceId },
      include: { discounts: true },
    });

    const discountAmount = toDecimal(data.amount);
    if (discountAmount.lte(0)) {
      throw new FinanceError("Discount amount must be greater than zero");
    }

    const currentDiscounts = invoice.discounts.map((d) => ({ amount: d.amount }));
    const allDiscounts = [...currentDiscounts, { amount: discountAmount }];

    // Parse line items
    const rawItems = (invoice.lineItems as { amount: string }[] | null) || [];
    const breakdown = computeInvoiceBreakdown(rawItems, allDiscounts);

    const discount = await tx.invoiceDiscount.create({
      data: {
        branchId,
        invoiceId: invoice.id,
        amount: discountAmount,
        reason: data.reason.trim(),
        mode: data.mode,
        appliedByUserId: data.appliedByUserId,
      },
    });

    // Update invoice totalAmount to reflect net amount
    const newStatus = resolveInvoiceStatus(breakdown.netAmount, invoice.amountPaid);

    await tx.invoice.update({
      where: { branchId_id: { branchId, id: invoice.id } },
      data: {
        totalAmount: breakdown.netAmount,
        status: newStatus,
      },
    });

    return discount;
  });
}
