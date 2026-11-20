import { sendJson, type Reply } from "@/components/auth/postJson";
import type { TemplatesData } from "@/components/results/template-types";

/// Places `classGroupIds` in the template as its whole set. A class that is in another template moves only with `confirmMoves`; without it the answer is 409 CONFIRM_MOVES and nothing changed.
export const placeClasses = (templateId: string, classGroupIds: readonly string[], confirmMoves: boolean): Promise<Reply> =>
  sendJson(`/api/v1/results/templates/${encodeURIComponent(templateId)}/classes`, "PUT", {
    classGroupIds,
    ...(confirmMoves ? { confirmMoves: true } : {}),
  });

/// Puts ONE class in a template (`target` an id), or back to "uses the default" (`target` null): the template's set with that class added or taken out.
export async function setClassTemplate(
  data: TemplatesData,
  classGroupId: string,
  target: string | null,
  confirmMoves: boolean,
): Promise<Reply> {
  if (target) {
    const template = data.templates.find((t) => t.id === target);
    const held = template?.classGroupIds ?? [];
    return placeClasses(target, held.includes(classGroupId) ? held : [...held, classGroupId], confirmMoves);
  }
  const current = data.templates.find((t) => t.classGroupIds.includes(classGroupId));
  if (!current) return { ok: true, status: 200 };
  return placeClasses(
    current.id,
    current.classGroupIds.filter((id) => id !== classGroupId),
    true,
  );
}
