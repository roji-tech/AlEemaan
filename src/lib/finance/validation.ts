import { z } from "zod";
import { DiscountWorkflowMode } from "@prisma/client";

/// Who a fee line is for and how it behaves (task 0122); all optional, and null means no condition.
const feeAudienceFields = {
  audienceAdmission: z.enum(["NEW", "RETURNING"]).nullable().optional(),
  audienceGender: z.enum(["MALE", "FEMALE"]).nullable().optional(),
  audienceResidence: z.enum(["DAY", "BOARDING"]).nullable().optional(),
  optional: z.boolean().optional(),
  scholarshipCovers: z.boolean().optional(),
  trackHandover: z.boolean().optional(),
};

export const createFeeStructureSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  /// The term; empty when the line is charged every term or once a year (`recurrence`, task 0124).
  periodId: z.string().min(1).nullable().optional(),
  recurrence: z.enum(["THIS_TERM", "EVERY_TERM", "EVERY_SESSION"]).optional(),
  classGroupId: z.string().optional().nullable(),
  name: z.string().trim().min(2, "Fee item name must be at least 2 characters").max(100),
  amount: z.number().positive("Amount must be greater than 0"),
  ...feeAudienceFields,
});

export const updateFeeStructureSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  amount: z.number().positive("Amount must be greater than 0").optional(),
  classGroupId: z.string().optional().nullable(),
  ...feeAudienceFields,
});

export const generateInvoicesSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  periodId: z.string().min(1, "Academic period is required"),
  classGroupId: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
});

export const recordPaymentSchema = z.object({
  amount: z.number().positive("Payment amount must be greater than 0"),
  channel: z.enum(["cash", "pos", "bank_transfer", "card", "mock"]).default("cash"),
  reference: z.string().trim().min(3).optional(),
  paidAt: z.string().datetime().optional(),
  notes: z.string().trim().max(255).optional(),
});

export const applyDiscountSchema = z.object({
  amount: z.number().positive("Discount amount must be greater than 0"),
  reason: z.string().trim().min(3, "Reason must be at least 3 characters").max(255),
  mode: z.nativeEnum(DiscountWorkflowMode).default(DiscountWorkflowMode.MANUAL_OVERRIDE),
});

export const initializePaymentSchema = z.object({
  invoiceId: z.string().min(1, "Invoice ID is required"),
  email: z.string().email("Valid email required for payment gateway"),
  amount: z.number().positive().optional(), // If partial payment allowed, else full balance
  callbackUrl: z.string().url().optional(),
});
