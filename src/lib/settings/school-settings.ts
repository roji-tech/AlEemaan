import { z } from "zod";
import { prisma } from "@/lib/db";
import { isWebLink } from "@/lib/lms/attachments";

/// The six details a school (and, since task 0115, a branch) prints about itself, with their rules: ONE definition, so the school's form and a branch's cannot drift apart.
export const contactFields = {
  principal: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  motto: z.string().trim().max(200).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  email: z.string().trim().email("Invalid email address").nullable().optional().or(z.literal("")),
  // The website is a link on the public landing page (task 0070), so it must be a web address: z.string().url() also takes javascript:, data: and ftp:.
  website: z
    .string()
    .trim()
    .url("Invalid website URL")
    .refine(isWebLink, "The website must start with http:// or https://")
    .nullable()
    .optional()
    .or(z.literal("")),
};

export const DEFAULT_SCHOOL_NAME = "Al-Eemaan Schools";

export const schoolSettingsUpdateSchema = z.object({
  name: z.string().trim().min(2, "School name must be at least 2 characters").max(120),
  ...contactFields,
});

export type SchoolSettingsUpdateInput = z.infer<typeof schoolSettingsUpdateSchema>;

export async function getSchoolSettings() {
  const settings = await prisma.schoolSettings.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      name: DEFAULT_SCHOOL_NAME,
    },
  });
  return settings;
}

export async function updateSchoolSettings(input: SchoolSettingsUpdateInput) {
  const validated = schoolSettingsUpdateSchema.parse(input);

  // Normalize empty strings to null for optional contact fields
  const cleanData = {
    ...validated,
    email: validated.email === "" ? null : validated.email,
    website: validated.website === "" ? null : validated.website,
  };

  const updated = await prisma.schoolSettings.upsert({
    where: { id: "global" },
    update: cleanData,
    create: {
      id: "global",
      ...cleanData,
      name: cleanData.name || DEFAULT_SCHOOL_NAME,
    },
  });

  return updated;
}
