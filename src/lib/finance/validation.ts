import { z } from "zod";
import { DiscountWorkflowMode } from "@prisma/client";

export const createFeeStructureSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  periodId: z.string().min(1, "Academic period is required"),
  classGroupId: z.string().optional().nullable(),
  name: z.string().trim().min(2, "Fee item name must be at least 2 characters").max(100),
  amount: z.number().positive("Amount must be greater than 0"),
});

export const updateFeeStructureSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  amount: z.number().positive("Amount must be greater than 0").optional(),
  classGroupId: z.string().optional().nullable(),
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
