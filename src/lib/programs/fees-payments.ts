import { Prisma, PaymentProvider, PaymentStatus, type InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { allocateReceiptNo, FinanceError } from "@/lib/finance/service";
import { getPaystackGateway } from "@/lib/finance/paystack";
import { checkPart } from "@/lib/finance/part-payment";
import { loadEffectivePolicy } from "@/lib/finance/part-payment-service";
import { toKobo } from "@/lib/finance/rules";
import { change, done, refuse, writeAudit, type Result } from "./common";
import { fromCents, statusOf, toCents } from "./fees-rules";
import { mayTouchInvoice } from "./fees-service";

// Programs, slice P4: taking payments on a program's invoices (task 0043, section 11.4). The same locked path as the school's money (task 0046): the invoice row is locked, the part-payment
// rule of the invoice's branch applies, "pay in full only" can tighten it, and the webhook is NOT subject to it (money that was already sent is accepted). Receipts are numbered from the
// branch's own sequence, the one the school's receipts use.

const INVOICE_NOT_FOUND = "That invoice was not found.";

function reference(kind: "man" | "pay"): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return `prg_${kind}_${Date.now()}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const branchCodeOf = (name: string) => name.slice(0, 4).toUpperCase();

/// What a payment may be, checked on a locked invoice: the invoice is open, the amount is positive and not above the balance, and the part-payment rule allows it.
async function checkPayable(
  tx: Prisma.TransactionClient,
  invoice: { branchId: string; status: InvoiceStatus; totalAmount: Prisma.Decimal; amountPaid: Prisma.Decimal; payInFull: boolean },
  amount: number,
) {
  if (invoice.status === "PAID") return refuse(409, "ALREADY_PAID", "That invoice is already fully paid.");
  if (invoice.status !== "UNPAID" && invoice.status !== "PARTIALLY_PAID")
    return refuse(409, "NOT_OPEN", `That invoice is ${invoice.status.toLowerCase()}.`);
  const balance = toCents(Number(invoice.totalAmount)) - toCents(Number(invoice.amountPaid));
  if (toCents(amount) <= 0)
    return refuse(400, "VALIDATION", "The amount must be more than zero.", [
      { path: "body.amount", message: "The amount must be more than zero." },
    ]);
  if (toCents(amount) > balance)
    return refuse(409, "EXCEEDS_BALANCE", "The amount can't be more than what is owed.", [
      { path: "body.amount", message: "The amount can't be more than what is owed." },
    ]);
  const policy = await loadEffectivePolicy(tx, invoice.branchId);
  const check = checkPart({ total: invoice.totalAmount, paid: invoice.amountPaid, amount, policy, payInFull: invoice.payInFull });
  return check.ok ? null : refuse(409, check.code, check.message, [{ path: "body.amount", message: check.message }]);
}

export type PaymentInput = { amount: number; channel: string; reference?: string; notes?: string };

/// Records a payment that was taken outside (cash, a transfer, a card machine). A super admin, a program admin, or the administrator of the invoice's branch. Accepted even when fees have
/// been switched off for the program since: an invoice that exists can still be paid, and money offered is not turned away.
export async function recordProgramPayment(
  actorUserId: string,
  programId: string,
  invoiceId: string,
  input: PaymentInput,
): Promise<Result<{ paymentId: string; receiptNo: string; balance: number; status: InvoiceStatus }>> {
  return change(
    actorUserId,
    programId,
    "people",
    async ({ tx, viewer }) => {
      await tx.$queryRaw`SELECT "id" FROM "ProgramInvoice" WHERE "id" = ${invoiceId} AND "programId" = ${programId} FOR UPDATE`;
      const invoice = await tx.programInvoice.findFirst({
        where: { id: invoiceId, programId },
        include: { branch: { select: { branch: { select: { name: true } } } } },
      });
      if (!invoice || !mayTouchInvoice(viewer, invoice.branchId)) return refuse(404, "NOT_FOUND", INVOICE_NOT_FOUND);
      const refused = await checkPayable(tx, invoice, input.amount);
      if (refused) return refused;
      const ref = input.reference ?? reference("man");
      if (
        await tx.programPayment.findUnique({
          where: { provider_providerRef: { provider: PaymentProvider.MANUAL, providerRef: ref } },
          select: { id: true },
        })
      )
        return refuse(409, "DUPLICATE_REFERENCE", "A payment with that reference has already been recorded.", [
          { path: "body.reference", message: "A payment with that reference has already been recorded." },
        ]);
      const receiptNo = await allocateReceiptNo(tx, invoice.branchId, branchCodeOf(invoice.branch.branch.name), new Date().getFullYear());
      const payment = await tx.programPayment.create({
        data: {
          programId,
          branchId: invoice.branchId,
          invoiceId,
          amount: input.amount,
          provider: PaymentProvider.MANUAL,
          providerRef: ref,
          status: PaymentStatus.SUCCESS,
          verifiedServerSide: true,
          channel: input.channel,
          paidAt: new Date(),
          receiptNo,
          recordedByUserId: actorUserId,
          metadata: input.notes ? { notes: input.notes } : undefined,
        },
      });
      const paid = toCents(Number(invoice.amountPaid)) + toCents(input.amount);
      const total = toCents(Number(invoice.totalAmount));
      const status = statusOf(total, paid) as InvoiceStatus;
      await tx.programInvoice.update({ where: { id: invoiceId }, data: { amountPaid: fromCents(paid), status } });
      await writeAudit(tx, {
        programId,
        actorUserId,
        action: "PAYMENT_RECORDED",
        targetType: "Invoice",
        targetId: invoiceId,
        after: { amount: input.amount, channel: input.channel, receiptNo },
      });
      return done({ paymentId: payment.id, receiptNo, balance: fromCents(total - paid), status });
    },
    { allowArchived: true },
  );
}

/// Starts a payment through the gateway: a pending payment under the invoice's lock, then the gateway's address for the payer. The webhook completes it.
export async function startProgramGatewayPayment(
  actorUserId: string,
  programId: string,
  invoiceId: string,
  input: { email: string; amount?: number },
): Promise<Result<{ paymentId: string; reference: string; authorizationUrl: string; accessCode: string; amount: number }>> {
  return change(
    actorUserId,
    programId,
    "people",
    async ({ tx, viewer }) => {
      await tx.$queryRaw`SELECT "id" FROM "ProgramInvoice" WHERE "id" = ${invoiceId} AND "programId" = ${programId} FOR UPDATE`;
      const invoice = await tx.programInvoice.findFirst({ where: { id: invoiceId, programId } });
      if (!invoice || !mayTouchInvoice(viewer, invoice.branchId)) return refuse(404, "NOT_FOUND", INVOICE_NOT_FOUND);
      const balance = toCents(Number(invoice.totalAmount)) - toCents(Number(invoice.amountPaid));
      const amount = input.amount ?? fromCents(balance);
      const refused = await checkPayable(tx, invoice, amount);
      if (refused) return refused;
      const ref = reference("pay");
      const payment = await tx.programPayment.create({
        data: {
          programId,
          branchId: invoice.branchId,
          invoiceId,
          amount,
          provider: PaymentProvider.PAYSTACK,
          providerRef: ref,
          status: PaymentStatus.PENDING,
          recordedByUserId: actorUserId,
          metadata: { programId, invoiceId },
        },
      });
      const init = await getPaystackGateway().initializePayment({
        email: input.email,
        amountInKobo: toKobo(amount),
        reference: ref,
        metadata: { programId, invoiceId, paymentId: payment.id },
      });
      await writeAudit(tx, {
        programId,
        actorUserId,
        action: "PAYMENT_STARTED",
        targetType: "Invoice",
        targetId: invoiceId,
        after: { amount, reference: ref },
      });
      return done({ paymentId: payment.id, reference: ref, authorizationUrl: init.authorizationUrl, accessCode: init.accessCode, amount });
    },
    { allowArchived: true },
  );
}

/// The webhook found a signed `charge.success` for a program payment. Fulfils it under the invoice's lock; the amount must be exactly what was started; the part-payment rule is NOT
/// applied (the money is already taken). Returns null when it was already fulfilled or does not exist. If a discount since made the invoice smaller than what is now paid, the payment is
/// still accepted and the total is raised to what was paid (and audited) - money that arrived is never refused.
export async function fulfillProgramPayment(providerRef: string, verifiedAmountInKobo: number, channel?: string) {
  return prisma.$transaction(async (tx) => {
    const pending = await tx.programPayment.findUnique({
      where: { provider_providerRef: { provider: PaymentProvider.PAYSTACK, providerRef } },
    });
    if (!pending) return null;
    await tx.$queryRaw`SELECT "id" FROM "ProgramInvoice" WHERE "id" = ${pending.invoiceId} AND "programId" = ${pending.programId} FOR UPDATE`;
    const updated = await tx.programPayment.updateMany({
      where: { provider: PaymentProvider.PAYSTACK, providerRef, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.SUCCESS, verifiedServerSide: true, paidAt: new Date(), channel: channel || "paystack" },
    });
    if (updated.count === 0) return null;
    const payment = await tx.programPayment.findUniqueOrThrow({
      where: { provider_providerRef: { provider: PaymentProvider.PAYSTACK, providerRef } },
      include: { invoice: { include: { branch: { select: { branch: { select: { name: true } } } } } } },
    });
    const expected = toKobo(payment.amount);
    if (verifiedAmountInKobo !== expected)
      throw new FinanceError(`Amount mismatch: expected ${expected} kobo, received ${verifiedAmountInKobo} kobo`);
    const receiptNo = await allocateReceiptNo(
      tx,
      payment.branchId,
      branchCodeOf(payment.invoice.branch.branch.name),
      new Date().getFullYear(),
    );
    await tx.programPayment.update({ where: { id: payment.id }, data: { receiptNo } });
    const paid = toCents(Number(payment.invoice.amountPaid)) + toCents(Number(payment.amount));
    const total = Math.max(toCents(Number(payment.invoice.totalAmount)), paid);
    await tx.programInvoice.update({
      where: { id: payment.invoiceId },
      data: { amountPaid: fromCents(paid), totalAmount: fromCents(total), status: statusOf(total, paid) as InvoiceStatus },
    });
    if (total > toCents(Number(payment.invoice.totalAmount)))
      await writeAudit(tx, {
        programId: payment.programId,
        actorUserId: payment.recordedByUserId ?? "system",
        action: "OVERPAYMENT_ACCEPTED",
        targetType: "Invoice",
        targetId: payment.invoiceId,
        after: { total: fromCents(total) },
      });
    return { ...payment, receiptNo };
  });
}
