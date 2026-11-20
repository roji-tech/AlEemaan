import { SEED_SCALES, SEED_SCHEME, SEED_TEMPLATES } from "@/lib/results/seed-templates";
import { buildSchoolSeeds } from "@/lib/results/school-template-seed";
import type { Definition } from "@/lib/results/school-templates-rules";

/// The four masters of the school's printed cards (task 0120), typed. See school-template-seed.ts.
export const SCHOOL_SEEDS = buildSchoolSeeds(SEED_TEMPLATES, SEED_SCHEME, SEED_SCALES) as readonly {
  id: string;
  key: string;
  name: string;
  description: string;
  layoutCode: string;
  definition: Definition;
}[];
