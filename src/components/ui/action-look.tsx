import type { ReactNode } from "react";
import {
  AlertTriangleIcon,
  ArchiveIcon,
  BookOpenIcon,
  BuildingIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  FileTextIcon,
  LogOutIcon,
  MailIcon,
  PencilIcon,
  PlusIcon,
  SlidersIcon,
  TrashIcon,
  UndoIcon,
} from "./icons";
import type { Tone } from "./tone";

// What an action looks like in a menu (task 0105): a tone and an icon, chosen from what it does, so Add, Edit, Archive and Remove are told apart by colour and shape as well as by their words.
// Chosen from the action's `id` (the ids the call sites already use) and its `danger` flag; an action nothing here recognises gets no icon and the neutral tone, exactly as before, and a call
// site that wants something else passes its own `tone` and `icon` to the menu.

type Look = { tone: Tone; icon: ReactNode | null };

const ICON = "h-4 w-4";

/// Words in an id, in order of precedence: the first rule that matches wins, so "undo-archive" is a restore and not an archive.
const RULES: readonly { test: RegExp; look: () => Look }[] = [
  {
    test: /restore|reinstate|reactivate|unarchive|undo/,
    look: () => ({ tone: "ok", icon: <UndoIcon className={ICON} /> }),
  },
  { test: /history/, look: () => ({ tone: "neutral", icon: <ClockIcon className={ICON} /> }) },
  { test: /archive|close/, look: () => ({ tone: "warn", icon: <ArchiveIcon className={ICON} /> }) },
  { test: /suspend|deactivate|deny/, look: () => ({ tone: "warn", icon: <AlertTriangleIcon className={ICON} /> }) },
  // Ending a person's place (expel a pupil, terminate a member of staff, withdraw from a program) is not deleting anything: a "leaves" icon, still red (task 0111: Terminate had none).
  { test: /expel|terminate|withdraw/, look: () => ({ tone: "danger", icon: <LogOutIcon className={ICON} /> }) },
  { test: /remove|delete|revoke/, look: () => ({ tone: "danger", icon: <TrashIcon className={ICON} /> }) },
  { test: /subject/, look: () => ({ tone: "brand", icon: <BookOpenIcon className={ICON} /> }) },
  // Task 0101 D1: finishing a draft is a tick; putting a record back to unfinished is a page.
  { test: /complete/, look: () => ({ tone: "ok", icon: <CheckIcon className={ICON} /> }) },
  { test: /draft/, look: () => ({ tone: "neutral", icon: <FileTextIcon className={ICON} /> }) },
  { test: /current|approve|accept|grant|lift|activate/, look: () => ({ tone: "ok", icon: <CheckIcon className={ICON} /> }) },
  // Task 0114: inviting someone to sign in is an e-mail; moving a person to another branch is a building.
  { test: /invite/, look: () => ({ tone: "ok", icon: <MailIcon className={ICON} /> }) },
  { test: /transfer/, look: () => ({ tone: "brand", icon: <BuildingIcon className={ICON} /> }) },
  { test: /^(add|new|create|invite|arm|break)|add$|-add|-new/, look: () => ({ tone: "ok", icon: <PlusIcon className={ICON} /> }) },
  // Manage (open everything about it) is told apart from Edit (change its details) by shape (task 0111: both were a pencil); View only reads.
  { test: /manage|settings/, look: () => ({ tone: "brand", icon: <SlidersIcon className={ICON} /> }) },
  { test: /^view|details/, look: () => ({ tone: "neutral", icon: <EyeIcon className={ICON} /> }) },
  { test: /edit|rename|change|dates|update|profile/, look: () => ({ tone: "info", icon: <PencilIcon className={ICON} /> }) },
];

export function actionLook(action: { id: string; danger?: boolean; tone?: Tone; icon?: ReactNode }): Look {
  if (action.tone || action.icon) return { tone: action.tone ?? "neutral", icon: action.icon ?? null };
  const id = action.id.toLowerCase();
  const hit = RULES.find((rule) => rule.test.test(id));
  if (action.danger)
    return { tone: "danger", icon: hit && hit.look().tone === "danger" ? hit.look().icon : <TrashIcon className={ICON} /> };
  return hit ? hit.look() : { tone: "neutral", icon: null };
}
