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

  // Academic sessions (task 0093)
  "academics.sessions":
    "A branch has one active session at a time, and pupils are placed in classes for the active one. Closing a session deletes nothing, and a closed session can be made active again.",
  "sessions.label": "The school year, such as 2026/2027. A branch can have a session of a given name only once.",
  "sessions.dates":
    "The first and last day of the school year. Each term or semester starts as an equal share of these days, and you can change them.",
  "sessions.kind":
    "Whether the year is cut into terms or semesters. A session of semesters has two, and the choice cannot be changed later.",
  "sessions.terms": "How many terms the year has, 2 or 3. A branch with Arabic in its name starts at 2 and the others at 3.",
  "sessions.periodDates":
    "The first and last day of each term or semester. They stay inside the session and do not overlap; a gap between two is a holiday.",
  "sessions.break":
    "A stretch of days inside a term or semester when there is no school, such as the mid-term break. The term's own dates stay as they are.",
  "sessions.branches":
    "Choose every branch that should start this year. A branch that already has a session with this name is left out, and each branch is created and recorded on its own.",

  // Overview (task 0093)
  "overview.todo":
    "What is missing in the branches you administer, with the page that fixes it. A branch with no active session comes first, because pupils cannot be placed in a class without one.",
  "overview.quickActions":
    "Shortcuts for setting a school up. The new-session and new-class ones open their form straight away; the others open the page.",

  // School profile
  "settings.principal": "The name printed beside the principal's remark on a report card.",
  "settings.motto": "The line printed under the school's name at the top of a report card.",

  // Students
  "students.show":
    "Choose which pupils the list shows. An archived pupil is no longer current, but the record is kept and Restore brings them back.",

  // Attendance
  "attendance.window":
    "Staff can change a saved day for 7 days after it. After that only an administrator can, and a day that has not come yet cannot be recorded.",

  // Programs
  "programs.lockRelease":
    "While someone is editing an entry, others can read it but not change it. Closing the entry starts this countdown, and 0 hands it back at once.",
  "programs.verify":
    "Entries stay drafts until the writer hands them in and a verifier approves them. Families see only verified entries, and a returned entry goes back to its writer with a comment.",
  "programs.weekGrid":
    "One row for each day the booklet covers, for each kind of entry. A day before the person's place began, and a day still to come, cannot be filled in.",

  // Forms
  "forms.marking":
    "Short answers marked by hand wait here. An attempt can be marked in more than one sitting, only what changed is saved, and each mark is kept in the marking history.",

  // Question bank
  "bank.reviewers":
    "A reviewer reads and approves the questions of their subject. They can write questions of their own too, but never approve one of their own.",

  // Communication
  "communication.channel":
    "Email goes to the email address on file and SMS or WhatsApp to the phone number on file. A person with none for that channel is left out, and pupils can be sent Email only.",
  "communication.tags":
    "A tag is replaced with the real value in each message: the school's name and today's date for everyone, and for guardians the pupil's name and class.",
  "communication.status":
    "Sent means the provider accepted the message, not that it was read. A failed one shows its reason under View and can be tried again with Retry.",
} as const;

export type InfoTipKey = keyof typeof INFO_TIPS;
