export type DecimalLike = number | string | { toString(): string };

export const InvoiceStatus = {
  DRAFT: "DRAFT",
  UNPAID: "UNPAID",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  CANCELLED: "CANCELLED",
  WAIVED: "WAIVED",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const DiscountWorkflowMode = {
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
  SCHOLARSHIP: "SCHOLARSHIP",
  SIBLING_DISCOUNT: "SIBLING_DISCOUNT",
  STAFF_CHILD: "STAFF_CHILD",
} as const;
export type DiscountWorkflowMode = (typeof DiscountWorkflowMode)[keyof typeof DiscountWorkflowMode];

export const PaymentProvider = {
  PAYSTACK: "PAYSTACK",
  MANUAL: "MANUAL",
} as const;
export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

/**
 * Pure client/server currency formatter for Nigerian Naira.
 * Formats numbers into currency string with narrow symbol, e.g. "₦125,000.00".
 * Free of Node.js built-ins and Prisma dependencies to preserve strict CSP.
 */
export function formatNaira(naira: DecimalLike | null | undefined): string {
  if (naira === null || naira === undefined) return "₦0.00";
  const num = typeof naira === "number" ? naira : Number(naira.toString());
  if (Number.isNaN(num)) return "₦0.00";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/// What settled an invoice nobody paid money on (task 0113 S1, widened on 2026-11-19): the words the lists, the detail and the family's Finance tab use. Client-safe; the rule that decides it is
/// `settledBy` in `lib/scholarships/rules.ts`.
export type SettledBy = "SCHOLARSHIP" | "WAIVED" | "DISCOUNT";
export const SETTLED_TEXT: Record<SettledBy, string> = {
  SCHOLARSHIP: "Paid by scholarship",
  WAIVED: "Waived",
  DISCOUNT: "Paid by discount",
};
