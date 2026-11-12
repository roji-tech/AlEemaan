// The words of every info icon (task 0054), in one place: a typed object from a key to a short explanation. A call site names a key and cannot invent text, so the wording can be read,
// corrected and translated here, and tests/unit/info-tips.spec.ts holds every sentence to the same rules (one or two short sentences of 20 to 200 characters, ending in a full stop; no
// two keys say the same thing; no key left unused).
//
// Writing one: say what the thing IS or DOES, in plain words, and add what the screen does NOT already print under it (a tip that repeats the line under a heading is clutter). No promise,
// no instruction the button already gives, nothing that is only sometimes true. Check it against what the screen really does (read its source) before it goes in.

export const INFO_TIPS = {
  // Academics
  "academics.classes":
    "A class is a year group, and its arms are the groups it is split into, such as A and B. Beside an arm, cap is the most pupils it takes and the last number is its enrolments.",
  "academics.subjects": "The subjects the branch teaches. Open Subjects on a class to choose which of them that class studies.",
  "academics.schemes":
    "A branch has one default scheme for every class, and a class can have a scheme of its own. The parts and the exam add up to 100.",
  "academics.scales":
    "A scale that results already use cannot be changed. Saving a change makes a new version, and the old one stays for those results.",
  "scheme.applies":
    "Branch default means every class that has no scheme of its own. Choose a class to give just that class its own scheme.",

  // Students
  "students.show":
    "Choose which pupils the list shows. An archived pupil is no longer current, but the record is kept and Restore brings them back.",

  // Attendance
  "attendance.window":
    "Staff can change a saved day for 7 days after it. After that only an administrator can, and a day that has not come yet cannot be recorded.",

  // Communication
  "communication.status":
    "Sent means the provider accepted the message, not that it was read. A failed one shows its reason under View and can be tried again with Retry.",
} as const;

export type InfoTipKey = keyof typeof INFO_TIPS;
