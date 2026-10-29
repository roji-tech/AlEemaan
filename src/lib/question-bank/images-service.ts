import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { writeBankAudit } from "@/lib/question-bank/audit";
import { getEffectiveBankSettings } from "@/lib/question-bank/settings-service";
import { loadViewer } from "@/lib/question-bank/viewer";
import { mayDecide, mayEditAsSubmitter, staffMaySee, type BankViewer } from "@/lib/question-bank/rules";
import { ImageRejectedError, processQuestionImage } from "@/lib/question-bank/images";
import { ITEM_SELECT, NOT_FOUND, factsOf, fail, lockItem, snapshotOf, viewOf, type Fail, type ItemRow, type ItemView, type Tx } from "@/lib/question-bank/items-common";
import { getImageStore, StorageError, StorageNotConfiguredError, STORE_NAMES, type ImageStore, type StoreName } from "@/lib/storage";

// Pictures on question bank items (task 0032 slice 2.2). A picture is part of the question, so adding or removing one is an EDIT: the same people may do it, the version goes up
// with a snapshot, a reviewer's change leaves an EDITED review row, and the audit row names the picture. Nothing the person sent is stored: `processQuestionImage` draws it again.
// The browser is never given a backend address; `readImage` runs the question's own access check and the route streams the bytes.

const ACCESS_OFF = "The question bank is switched off for your role in this branch.";
const NO_STORE = fail(503, "STORAGE_NOT_CONFIGURED", "Image storage is not configured.");
/// Where every picture lives in a store: one folder for this project, then the picture's id.
const keyFor = (imageId: string) => `aleemaan/question-bank/${imageId}`;

type Judged = { ok: true; asReviewer: boolean } | Fail;

/// Who may change a question's pictures: whoever may edit its content now. The caller has already established that the person may SEE the question.
function judge(viewer: BankViewer, row: ItemRow): Judged {
  const facts = factsOf(row);
  const asWriter = mayEditAsSubmitter(viewer, facts);
  const asReviewer = !asWriter && mayDecide(viewer, facts, "edit").ok;
  if (!asWriter && !asReviewer) return fail(403, "FORBIDDEN", "You cannot change the pictures of this question.");
  return { ok: true, asReviewer };
}

async function bankOpen(viewer: BankViewer, branchId: string | null): Promise<boolean> {
  if (viewer.isSuperAdmin) return true;
  const settings = await getEffectiveBankSettings(branchId);
  const administers = viewer.memberships.some((m) => m.role === "ADMIN" && (branchId === null || m.branchId === branchId));
  return administers ? settings["bank.access.admins"] : settings["bank.access.staff"];
}

function storeOrNull(which?: StoreName): ImageStore | null {
  try {
    return getImageStore(which);
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) return null;
    throw error;
  }
}

/// Records the change to the question itself: a new version with a snapshot, an EDITED review row for a reviewer, the item's time stamp. Returns the question as it now is.
async function recordEdit(tx: Tx, userId: string, before: ItemRow, asReviewer: boolean): Promise<ItemRow> {
  const version = before.version + 1;
  await tx.questionBankItem.update({ where: { id: before.id }, data: { version } });
  const after = await tx.questionBankItem.findUniqueOrThrow({ where: { id: before.id }, select: ITEM_SELECT });
  await tx.questionBankItemVersion.create({ data: { itemId: after.id, version, snapshot: snapshotOf(after), actorUserId: userId } });
  if (asReviewer) await tx.questionBankReview.create({ data: { itemId: after.id, version, reviewerId: userId, outcome: "EDITED" } });
  return after;
}

export type ImageResult = { ok: true; item: ItemView; imageId: string } | Fail;

export async function addImage(input: { userId: string; itemId: string; bytes: Uint8Array; alt: string; decorative: boolean }): Promise<ImageResult> {
  // 1. Who is asking, and may they. Nothing is decoded for a person who may not.
  const early = await prisma.$transaction(async (tx) => {
    const row = await tx.questionBankItem.findUnique({ where: { id: input.itemId }, select: ITEM_SELECT });
    const viewer = await loadViewer(input.userId, tx);
    if (!row || !staffMaySee(viewer, factsOf(row), new Date())) return NOT_FOUND;
    const verdict = judge(viewer, row);
    if (!verdict.ok) return verdict;
    if (!(await bankOpen(viewer, row.branchId))) return fail(403, "BANK_OFF", ACCESS_OFF);
    const settings = await getEffectiveBankSettings(row.branchId);
    if (row.images.length >= settings["bank.images.max"]) return fail(409, "IMAGE_LIMIT", `A question can have at most ${settings["bank.images.max"]} pictures.`);
    return { ok: true, limits: { maxBytes: settings["bank.images.maxBytes"], maxLongSide: settings["bank.images.maxLongSide"] } } as const;
  });
  if (!early.ok) return early;

  // 2. A store, then the picture drawn again with the branch's limits.
  const store = storeOrNull();
  if (!store) return NO_STORE;
  let processed;
  try {
    processed = await processQuestionImage(input.bytes, early.limits);
  } catch (error) {
    if (error instanceof ImageRejectedError) return fail(error.reason === "TOO_BIG_UPLOAD" ? 413 : 400, "IMAGE_REJECTED", error.message);
    throw error;
  }

  // 3. The file goes to the store first; the row follows in one transaction that checks the person and the limit again. If the row is refused, the file is removed.
  const imageId = `img_${randomBytes(16).toString("hex")}`;
  const key = keyFor(imageId);
  try {
    await store.put(key, processed.bytes, processed.contentType);
  } catch (error) {
    if (error instanceof StorageError || error instanceof StorageNotConfiguredError) return fail(502, "STORAGE_FAILED", "The picture could not be saved. Try again in a moment.");
    throw error;
  }

  let result: ImageResult;
  try {
    result = await prisma.$transaction(async (tx): Promise<ImageResult> => {
      const before = await lockItem(tx, input.itemId);
      const viewer = await loadViewer(input.userId, tx);
      if (!before || !staffMaySee(viewer, factsOf(before), new Date())) return NOT_FOUND;
      const verdict = judge(viewer, before);
      if (!verdict.ok) return verdict;
      if (!(await bankOpen(viewer, before.branchId))) return fail(403, "BANK_OFF", ACCESS_OFF);
      const settings = await getEffectiveBankSettings(before.branchId);
      if (before.images.length >= settings["bank.images.max"]) return fail(409, "IMAGE_LIMIT", `A question can have at most ${settings["bank.images.max"]} pictures.`);

      const sortOrder = before.images.reduce((highest, image) => Math.max(highest, image.sortOrder), -1) + 1;
      await tx.questionBankImage.create({
        data: {
          id: imageId,
          itemId: before.id,
          storageKey: key,
          store: store.name,
          contentType: processed.contentType,
          alt: input.decorative ? "" : input.alt,
          decorative: input.decorative,
          bytes: processed.bytes.byteLength,
          width: processed.width,
          height: processed.height,
          sortOrder,
        },
      });
      const after = await recordEdit(tx, input.userId, before, verdict.asReviewer);
      await writeBankAudit(tx, {
        branchId: after.branchId,
        itemId: after.id,
        actorUserId: input.userId,
        entity: "ITEM",
        action: "IMAGE_ADDED",
        oldValue: { version: before.version, images: before.images.length },
        newValue: { version: after.version, images: after.images.length, imageId, decorative: input.decorative, bytes: processed.bytes.byteLength, store: store.name },
      });
      return { ok: true, item: await viewOf(tx, viewer, after), imageId };
    });
  } catch (error) {
    await store.remove(key).catch(() => {});
    throw error;
  }
  if (!result.ok) await store.remove(key).catch(() => {});
  return result;
}

export async function removeImage(input: { userId: string; itemId: string; imageId: string }): Promise<{ ok: true; item: ItemView } | Fail> {
  const done = await prisma.$transaction(async (tx) => {
    const before = await lockItem(tx, input.itemId);
    const viewer = await loadViewer(input.userId, tx);
    if (!before || !staffMaySee(viewer, factsOf(before), new Date())) return NOT_FOUND;
    const verdict = judge(viewer, before);
    if (!verdict.ok) return verdict;
    if (!(await bankOpen(viewer, before.branchId))) return fail(403, "BANK_OFF", ACCESS_OFF);
    const image = await tx.questionBankImage.findFirst({ where: { id: input.imageId, itemId: before.id }, select: { id: true, storageKey: true, store: true, decorative: true } });
    if (!image) return NOT_FOUND;

    await tx.questionBankImage.delete({ where: { id: image.id } });
    const after = await recordEdit(tx, input.userId, before, verdict.asReviewer);
    await writeBankAudit(tx, {
      branchId: after.branchId,
      itemId: after.id,
      actorUserId: input.userId,
      entity: "ITEM",
      action: "IMAGE_REMOVED",
      oldValue: { version: before.version, images: before.images.length, imageId: image.id },
      newValue: { version: after.version, images: after.images.length },
    });
    return { ok: true, item: await viewOf(tx, viewer, after), file: { key: image.storageKey, store: image.store } } as const;
  });
  if (!done.ok) return done;
  // The row is gone. A store that fails now leaves an unreferenced file, not a row pointing at nothing; nobody can reach it.
  const which = (STORE_NAMES as readonly string[]).includes(done.file.store) ? (done.file.store as StoreName) : undefined;
  const store = which ? storeOrNull(which) : null;
  if (store) await store.remove(done.file.key).catch((error) => console.error("question bank: a removed picture's file was left in the store", { imageId: input.imageId, store: done.file.store, error: String(error?.name ?? error) }));
  else console.error("question bank: a removed picture's file was left in the store (store not configured)", { imageId: input.imageId, store: done.file.store });
  return { ok: true, item: done.item };
}

export type ServedImage = { ok: true; bytes: Uint8Array; contentType: string } | Fail;

/// The picture's bytes, if the person may see the question it belongs to. The same "Not found" for a picture that does not exist, one on a question they may not see, and one
/// whose file the store no longer has.
export async function readImage(input: { userId: string; itemId: string; imageId: string }): Promise<ServedImage> {
  const viewer = await loadViewer(input.userId);
  const image = await prisma.questionBankImage.findFirst({
    where: { id: input.imageId, itemId: input.itemId },
    select: { storageKey: true, store: true, contentType: true, bytes: true, item: { select: { branchId: true, subjectKey: true, status: true, visibility: true, visibleFrom: true, submittedById: true } } },
  });
  if (!image || !staffMaySee(viewer, image.item, new Date())) return NOT_FOUND;
  const which = (STORE_NAMES as readonly string[]).includes(image.store) ? (image.store as StoreName) : undefined;
  const store = which ? storeOrNull(which) : null;
  if (!store) return NO_STORE;
  try {
    // our own record says how big it is: a store that returns more is wrong
    const stored = await store.get(image.storageKey, image.bytes * 2 + 1024);
    if (!stored) return NOT_FOUND;
    return { ok: true, bytes: stored.bytes, contentType: image.contentType };
  } catch (error) {
    if (error instanceof StorageError || error instanceof StorageNotConfiguredError) return fail(502, "STORAGE_FAILED", "The picture could not be loaded. Try again in a moment.");
    throw error;
  }
}
