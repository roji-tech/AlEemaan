import { prisma } from "@/lib/db";
import { layoutForClass } from "@/lib/results/templates";
import type { TemplateSnapshot } from "@/lib/results/template-snapshot-rules";

/// What the template looks like now, for the record a first publish makes (task 0127): the class's look and the template's live trait groups with their live traits.
export async function snapshotTemplate(branchId: string, templateId: string, classGroupId: string): Promise<TemplateSnapshot> {
  const [layout, groups] = await Promise.all([
    layoutForClass(branchId, classGroupId),
    prisma.resultTemplateTraitGroup.findMany({
      where: { branchId, templateId },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        showSign: true,
        traits: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } },
      },
    }),
  ]);
  return {
    layout: {
      code: layout.code,
      name: layout.name,
      isLegacy: layout.isLegacy === true,
      options: (layout.options ?? {}) as Record<string, boolean>,
    },
    groups: groups.filter((g) => g.traits.length > 0),
  };
}
