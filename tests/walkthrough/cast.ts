// The fictional people of the walkthrough and the throwaway password they share. Nothing here is real: the names, the addresses (.test is reserved and never delivers) and the password are
// made up for the recording, and the run's database is thrown away.

export const PASSWORD = "Heron-Lantern-Quartz-2026";

export const cast = {
  superadmin: { name: "Amina Yusuf", email: "amina.yusuf@walkthrough.test" },
  // The people the superadministrator invites in C03. Each accepts through the link in the dev inbox and chooses the name typed there.
  branchAdmin: { name: "Bola Adeyemi", email: "bola.adeyemi@walkthrough.test" },
  teacher: { name: "Chidi Okafor", email: "chidi.okafor@walkthrough.test" },
  staff: { name: "Dayo Lawal", email: "dayo.lawal@walkthrough.test" },
  // An address typed wrongly on purpose: its invitation is revoked.
  mistyped: { email: "bola.adeyem@walkthrough.test" },
};

/// The setup token of this run: made by the runner (scripts/walkthrough-run/run.mjs), handed over in the environment, never printed. The journey types it, as a person would.
export const setupToken = (): string => process.env.WALKTHROUGH_SETUP_TOKEN ?? "";

/// The dev inbox's unlock token of this run: made by the runner, handed over in the environment, never printed. The journey types it into the inbox's own field, as a person would.
export const devToolsToken = (): string => process.env.WALKTHROUGH_DEV_TOOLS_TOKEN ?? "";

/// The fictional school of the walkthrough: its branches, profile and first session. Branch names follow the app's convention (a name with "Arabic" in it gets two terms a year, any other
/// three). The dates are typed the way a person types into a date field, month then day then year.
export const school = {
  // The first-run wizard seeds four branches; the walkthrough uses two of them and adds one of its own.
  branches: {
    englishPrimary: "Primary (English)",
    arabicPrimary: "Primary (Arabic)",
    added: "Nursery (English)",
    seededCount: 4,
  },
  profile: {
    name: "Al-Eemaan Demonstration School",
    principal: "Maryam Bello",
    phone: "0803 000 0001",
    motto: "Faith and knowledge",
    address: "12 Example Road, Ilorin",
    email: "office@walkthrough.test",
    website: "https://school.walkthrough.test",
  },
  session: {
    label: "2026/2027",
    startTyped: "09072026",
    endTyped: "07162027",
    shownDates: "2026-09-07 → 2027-07-16",
  },
};

/// What the branch administrator sets up in C04: classes with arms, subjects, and two staff records. Three names are typed with a slip on purpose ("Primry 2", "Mathematic") so that the
/// chapter shows editing a name as well as creating one, and one class and one subject exist only to be archived.
export const academics = {
  classes: { first: "Primary 1", slip: "Primry 2", second: "Primary 2", toArchive: "Primary 3" },
  arms: { a: "A", b: "B" },
  subjects: { slip: "Mathematic", maths: "Mathematics", english: "English Language", toArchive: "Drawing" },
  // The teacher's record matches the member who accepted the invitation in C03, so that the sign-in can be linked to it.
  teacher: {
    first: "Chidi",
    last: "Okafor",
    phone: "0803 000 0002",
    phoneCorrected: "0803 000 0092",
    email: "chidi.okafor@walkthrough.test",
  },
  office: { first: "Kemi", last: "Balogun", phone: "0803 000 0003", email: "kemi.balogun@walkthrough.test" },
};

/// What the branch administrator sets up in C05, and the superadministrator after them. One scheme is typed with a slip and corrected; the "Trial" ones exist only to be archived.
export const grading = {
  scheme: { slip: "Primry scheme", name: "Primary scheme", trial: "Trial scheme" },
  scale: { name: "Primary scale", trial: "Trial scale" },
  classScheme: "Primary 1 scheme",
  schoolWide: "School scheme",
};

/// The pupils of C06, all in Primary 1. Dates of birth are typed as a person types into a date field (month, day, year) and shown the way the list shows them. The guardians' phone numbers are
/// what the portal later signs them in with, so each is different. Aisha's admission number is left for the app to make; Yusuf's is typed, so the search by number has one to find.
export const pupils = {
  aisha: {
    first: "Aisha",
    last: "Bello",
    gender: "Female",
    dobTyped: "03152018",
    dobShown: "2018-03-15",
    arm: "A",
    guardian: "Hauwa Bello",
    phone: "0803 000 0101",
    phoneCorrected: "0803 000 0191",
    email: "hauwa.bello@walkthrough.test",
    admissionNo: "",
  },
  yusuf: {
    first: "Yusuf",
    last: "Danjuma",
    gender: "Male",
    dobTyped: "07202017",
    dobShown: "2017-07-20",
    arm: "A",
    guardian: "Sani Danjuma",
    phone: "0803 000 0102",
    phoneCorrected: "",
    email: "sani.danjuma@walkthrough.test",
    admissionNo: "AEM-0002",
  },
  zainab: {
    first: "Zainab",
    last: "Musa",
    gender: "Female",
    dobTyped: "11052018",
    dobShown: "2018-11-05",
    arm: "B",
    guardian: "Rabi Musa",
    phone: "0803 000 0103",
    phoneCorrected: "",
    email: "rabi.musa@walkthrough.test",
    admissionNo: "",
  },
  ibrahim: {
    first: "Ibrahim",
    last: "Sani",
    gender: "Male",
    dobTyped: "01092017",
    dobShown: "2017-01-09",
    arm: "B",
    guardian: "Lami Sani",
    phone: "0803 000 0104",
    phoneCorrected: "",
    email: "lami.sani@walkthrough.test",
    admissionNo: "",
  },
  // Registered in C12, after the portal chapter's first step: Aisha's sister, with the same guardian and the phone number as C06 corrected it, so that one guardian's sign-in opens two children.
  hafsa: {
    first: "Hafsa",
    last: "Bello",
    gender: "Female",
    dobTyped: "09222019",
    dobShown: "2019-09-22",
    arm: "B",
    guardian: "Hauwa Bello",
    phone: "0803 000 0191",
    phoneCorrected: "",
    email: "hauwa.bello@walkthrough.test",
    admissionNo: "",
  },
};

/// The announcements of C08. The first goes to one arm of the branch and stays published; "Sports day" is saved as a draft, then published and pinned; the third is a draft that is deleted.
export const notices = {
  resumption: { title: "Resumption notice", body: "School resumes on Monday at 8 am." },
  sports: { title: "Sports day", body: "Sports day is on Friday. Wear the house colours." },
  scrap: { title: "Exam timetable draft", body: "To be confirmed." },
};

/// The communication of C10: one broadcast to the guardians, and one template made, previewed, edited and deleted.
export const messages = {
  broadcast: { subject: "Resumption", opening: "Dear Guardian, ", closing: "school resumes on Monday." },
  template: {
    name: "Fee reminder",
    nameEdited: "Fee reminder (term)",
    code: "FEE_REMINDER",
    subject: "Fees for {{student_name}}",
    body: "Dear Guardian, fees for {{student_name}} are due.",
    variables: "student_name",
  },
};

/// The fees of C11, all for the English primary branch's first term (the pupils of C06 are in Primary 1, so each is invoiced for the Primary 1 tuition plus the levy for every class). The
/// tuition is typed with a slip and a wrong amount, and corrected in the same chapter; a third fee is added only to be deleted. Amounts are typed as digits and read back as the app writes
/// them (₦, thousands separators, two decimals).
export const finance = {
  term: "1st Term (2026/2027)",
  tuition: { slip: "Tuiton", name: "Tuition", amountTyped: "50000", amountCorrected: "45000", shown: "₦45,000.00" },
  levy: { name: "Development Levy", amountTyped: "10000", shown: "₦10,000.00" },
  scrap: { name: "Trial levy", amountTyped: "5000" },
  // 45,000 + 10,000 for each of the four pupils
  invoiceTotal: "₦55,000.00",
  allInvoiced: "₦220,000.00",
  dueTyped: "12312026",
  payment: { part: "20000", partShown: "₦20,000.00", balanceAfterPart: "₦35,000.00", ref: "POS-83921", note: "Deposited by Hauwa Bello" },
  waiver: { amount: "5000", shown: "₦5,000.00", balanceAfter: "₦50,000.00", reason: "Approved by the Principal - hardship" },
};

/// The coursework of C13: an assignment that is handed in and graded, one that exists only to be deleted, study materials (one to be deleted), and quizzes (one to be deleted). The due date is typed
/// as a person types into a date-and-time field: month, day, year (Tab: a year takes up to six digits, so the field does not move on by itself), then hour, minute and the letter of AM or PM.
export const coursework = {
  essay: {
    title: "Essay on honesty",
    description: "Five sentences on why honesty matters.",
    descriptionEdited: "Five sentences on why honesty matters, with one example.",
    instructions: "Write five sentences and give one example from school.",
    dueDateTyped: "12312026",
    dueTimeTyped: "0900A",
    points: "20",
    pointsShown: "20 pts",
  },
  scrap: { title: "Fractions worksheet", points: "10" },
  closed: { title: "Spelling test", points: "10" },
  handIn: {
    answer: "Honesty means telling the truth even when it is hard. I told my teacher when I broke a pencil.",
    linkTitle: "My drawing",
    linkUrl: "https://school.walkthrough.test/work/honesty",
  },
  grade: { score: "17", shown: "17/20", feedback: "Well done. Add one more example next time." },
  material: {
    title: "Reading notes: honesty",
    summary: "Short notes for the week.",
    content: "Honesty means telling the truth and keeping promises.",
    url: "https://school.walkthrough.test/notes/honesty.pdf",
    notAWebAddress: "javascript:alert(1)",
    notAWebAddressReason: "The link must start with http:// or https://",
    linkName: "Open Reading notes: honesty ↗",
    typeLabel: "Reading Notes",
  },
  draftMaterial: { title: "Term 2 plan", typeLabel: "Slide Deck / Presentation", summary: "Not ready for the pupils yet." },
  scrapMaterial: { title: "Old syllabus" },
  quiz: {
    title: "Honesty quiz",
    instructions: "Answer every question.",
    minutes: "10",
    pass: "60",
    choice: { prompt: "What is honesty?", right: "Telling the truth", wrong: "Telling a lie" },
    trueFalse: { prompt: "Honesty is a good habit." },
    short: { prompt: "Which word means telling the truth?", answer: "honesty" },
  },
  scrapQuiz: { title: "Trial quiz", prompt: "Is this a trial?", right: "Yes", wrong: "No" },
};

/// The results of C14: the marks of the first term's Mathematics in Primary 1 A (Primary 1 scheme: CA 40 and the exam 60, made in C05), the teacher's own scheme for English Language, and the
/// remarks on one pupil's card. Totals are what the sheet shows while the teacher types (the server makes the record when the marks are saved).
export const results = {
  pair: { maths: "Primary 1 A · Mathematics", english: "Primary 1 A · English Language" },
  group: "Primary 1 A · Mathematics",
  className: "Primary 1 A",
  scheme: "Primary 1 scheme",
  // Aisha's CA is first typed over its maximum of 40, which the sheet marks as needing attention; the second value is the one saved.
  aisha: { ca: "36", caTooHigh: "45", exam: "52", total: "88" },
  yusuf: { ca: "28", exam: "41", total: "69" },
  teacherScheme: {
    name: "English scheme",
    caMarks: "30",
    examMarks: "70",
    reason: "English has a longer exam: reading, writing and a spoken part.",
    reasonEdited: "English has a longer exam: reading, writing and speaking.",
    shown: "CA 30 + Exam 70 = 100",
  },
  remarks: { teacher: "Yusuf works hard and asks good questions.", principal: "A pleasing term. Keep it up." },
  unlockTooShort: "No",
  unlockReason: "A mark was typed wrongly; checking it again",
  // a code that was never issued, typed as a person would type an address into a new tab
  madeUpCode: "not-a-real-code-0000",
};

/// What is typed and read in C15 Approvals (section 6.14): the reasons that go with each decision, and the labels of the verification page's name format.
export const approvals = {
  // the branch administrator's reason for approving the teacher's own scheme for English Language (the request C14 left waiting)
  approveReason: "English has a longer exam, so the 30 and 70 split is fair.",
  // the branch administrator's reason for asking that the public verification page show initials only
  proposalReason: "Parents asked that a child's name is not written out on a page anyone can open.",
  // the reason the branch administrator types when they try to approve that request themselves (the server refuses)
  selfDecideReason: "I would like this to start now.",
  // the superadmin's reason for refusing that request
  rejectReason: "The page already shows only the first name and the first letter of the last name.",
  // the superadmin's own change to the verification page, and the name as the public page then writes it
  nameFormat: {
    initials: "Initials only (A. Y.)",
    full: "Full name",
    standard: "First name and the first letter of the last name (Amina Y.)",
  },
};

/// What is typed in C16 Users (section 6.15): a password that is not anyone's, the reasons that go with each change of standing, the last day of a suspension as it is typed into a date field
/// (month, day, year) and as the list then shows it.
export const users = {
  wrongPassword: "Not-the-password-9",
  // a search that finds no one
  nobody: "nobody by that name",
  tooShortReason: "No",
  suspendReason: "Away without leave for two weeks; the school is looking into it.",
  lastDayTyped: "12312030",
  lastDayShown: "31 Dec 2030",
  terminateReason: "The contract ended after the review.",
  reinstateReason: "The review found in their favour; they are back.",
  branchAdminSuspendReason: "Missed the morning registration twice.",
  branchAdminLiftReason: "Explained, and agreed a new routine.",
};

/// What is typed in C17 Discipline (section 6.17): the reasons that go with each change of a pupil's or a staff record's standing.
export const discipline = {
  suspendReason: "Fighting in the corridor.",
  expelReason: "Serious misconduct, after two warnings.",
  liftReason: "The parents met the head teacher.",
  reinstateReason: "The appeal was upheld.",
  staffSuspendReason: "Pending an inquiry into the school's cash box.",
  staffTerminateReason: "The contract ended after the inquiry.",
  staffReinstateReason: "The inquiry cleared them.",
};

/// What is typed in C18 Account (section 6.18). A new administrator is invited for the account steps, so that nothing of the school's real people has to be put back.
export const account = {
  newcomer: { name: "Ese Ibe", email: "ese.ibe@walkthrough.test" },
  editedName: "Ese Ibe-Mark",
  newPassword: "Granite-Cobalt-Plum-2027",
  newEmail: "ese.mark@walkthrough.test",
  // C19: the address that has no account, and the password chosen from the reset link
  nobody: "nobody.at.all@walkthrough.test",
  resetPassword: "Quartz-Maple-Heron-2028",
};

/// What is written in C20 Forms (section 6.21): a practice set of two questions, a questionnaire for staff, a public anonymous one, and paper work.
export const forms = {
  practice: {
    title: "Fractions drill",
    editedTitle: "Fractions drill, week 3",
    instructions: "Answer every question.",
    minutes: "15",
    editedMinutes: "20",
    q1: { prompt: "What is 1/2 + 1/4?", a: "1/4", b: "3/4", points: "2" },
    q2: { prompt: "2/4 is the same as 1/2." },
    printReason: "A copy for the form teacher's file.",
  },
  staffPulse: {
    title: "Staff pulse",
    prompt: "What would help you most?",
    answer: "More planning time, please.",
    answerStaff: "A quieter staff room.",
  },
  lunch: { title: "Lunch survey", prompt: "How was lunch?" },
  paper: { title: "Holiday project" },
};

/// What is written in C22 Question bank (section 6.22): a reviewer, a question of the teacher's, and the sentences of the review.
export const bank = {
  subject: "Mathematics",
  question: { prompt: "Which of these fractions is the same as one half?", a: "2/4", b: "1/3", classTag: "Primary 1" },
};

/// What is written in C23 Question bank, review and reports (section 6.23): a reviewer's own question, why it is sent back, a problem a teacher reports and the answer to it.
export const review = {
  subject: "Mathematics",
  question: { prompt: "Which of these numbers is a prime number?", a: "7", b: "9", fixedB: "15", classTag: "Primary 6" },
  sentBack: "Nine is too easy to rule out: use fifteen.",
  report: "Please check the key: a pupil can argue that fifteen is prime.",
  answer: "Fifteen is three times five, so it is not prime; the key is right.",
  retire: "Replaced by a clearer question in the next term's paper.",
};

/// What is written in C24 Question bank, overlap, printing and settings (section 6.24): a near copy of the reviewer's question, why a handout is printed, and the settings that are changed and put back.
export const tools = {
  copySuffix: " Choose one.",
  printReason: "Handout for the Monday revision class",
  settings: {
    notANumber: "lots",
    largest: "60",
    presets: "10, 20, 50",
    reason: "Smaller sets for term one",
    branchLargest: "40",
    schoolLargest: "100",
    schoolPresets: "10, 20, 30, 50, 100",
  },
};

/// What is written in C25 Programs (section 6.25): a program that never ends, with its levels and groups, and a program for a set period with a branch of its own.
export const programs = {
  hifz: {
    name: "Quran memorisation",
    levels: ["Juz", "Group"],
    top: "Juz A",
    second: "Juz B",
    child: "Group 1",
    renamed: "Group One",
  },
  course: {
    name: "Revision course",
    startsTyped: "12142026",
    startsText: "14 Dec 2026",
    ownBranchTaken: school.branches.added,
    ownBranch: "Revision Centre",
    badEndTyped: "11302026",
    endTyped: "06302027",
    renamed: "Revision course (evening)",
  },
};

/// The people of C26 Program people (section 6.26): pupils added from the school's records, a whole class, a child typed in through the other branch, and the reasons that are kept.
export const programPeople = {
  group: "Juz A–Group One",
  otherGroup: "Juz B",
  className: "Primary 1 A",
  child: { first: "Maryam", last: "Ahmad", dobTyped: "03042020", guardian: "Hauwa Ahmad", phone: "0803 000 0301" },
  guardian: { first: "Hauwa", last: "Ahmad" },
  leaveReason: "Moved to another city",
  backReason: "Came back after the break",
  suspendReason: "Disturbing the class",
  liftReason: "Apologised to the group",
  expelReason: "Left without telling anyone",
  reinstateReason: "The family came to explain",
};

/// What is written in C27 Program attendance (section 6.27): a note, a session name, why a mark is corrected, and the percentage a program flags under.
export const attendance = {
  note: "Sick, his mother called",
  session: "Evening",
  reason: "Found in the register",
  flagTyped: "60",
  flagBad: "101",
  flagKept: "75",
};

/// What is written in C28 Program assessments (section 6.28): the grades, an assessment and its limits, the scores, and why a published score is changed.
export const programAssessments = {
  grades: [
    { name: "Fail", from: "0" },
    { name: "Pass", from: "50" },
  ],
  duplicateName: "Fail",
  title: "Recitation check",
  kind: "Recitation",
  outOf: "20",
  passMark: "10",
  tooBigTitle: "Too big",
  tooBig: "5000",
  over: "21",
  score: "15,5",
  scoreShown: "15.5",
  fixed: "17",
  comment: "Good recitation",
  changed: "18",
  reason: "Recounted the paper",
};

/// What is written in C29 Program fees (section 6.29): a monthly fee, the payments on its invoices, and a discount with its reason.
export const programFees = {
  name: "Monthly fee",
  amount: "5000",
  amountShown: "₦5,000.00",
  dueDay: "10",
  over: "6000",
  part: "2000",
  rest: "3000",
  discount: "1000",
  discountReason: "Sibling discount",
  branchPayment: "1000",
};

/// What is written in C30 Program completion (section 6.30): the certificate's title and wording (one placeholder mistyped on purpose), a signatory, the rule, and the reasons that are kept.
export const programCompletion = {
  title: "Certificate of Memorisation",
  badWording: "Well done {nme}.",
  wording: "{name} memorised a portion in {program} at {school}.",
  signatory: { name: "Sheikh Musa", title: "Head of program" },
  minAverage: "70",
  override: "Finished the practical work instead",
  withdraw: "Issued before the final result was checked",
  reopen: "Had not finished the last unit",
};

/// What is written in C31 Program progress records (section 6.31): ranges of the Quran booklet (surah and ayah), a note, a rating, and what a supervisor says when an entry is returned.
export const progress = {
  template: "QURAN_BOOKLET",
  lockRelease: "0",
  surah: "2",
  surahName: "Al-Baqarah",
  fromAyah: "1",
  tooFar: "500",
  toAyah: "5",
  note: "Smooth, no prompting",
  rating: "4",
  ratingShown: "Very good",
  nextFrom: "6",
  nextTo: "9",
  changedTo: "8",
  gridSurah: "1",
  gridFrom: "1",
  gridTo: "7",
  gridRating: "5",
  tooShort: "ok",
  comment: "Check the last ayah again",
};

/// What is written in C32 Program progress in the portal (section 6.32): the Hijri adjustment tried out of range and then in range.
export const progressPortal = { hijriBad: "3", hijriGood: "-1" };

/// What is written in C33 Portal practice (section 6.33): the school allows practice with a pool of one question, and what the pupil answers.
export const practice = {
  minPool: "1",
  tooShort: "no",
  report: "The explanation does not say why.",
  subject: "Mathematics",
  classTag: "Primary 1",
  questions: [
    { prompt: "Is three plus four equal to seven?", right: "Yes", wrong: "No", explanation: "Three and four make seven." },
    { prompt: "Is five plus six equal to eleven?", right: "Yes", wrong: "No", explanation: "Five and six make eleven." },
  ],
};

/// What is written in C34 Forms in the portal and marking (section 6.34): a second practice set with a question that is marked by hand, the pupil's answers, the teacher's marks, a questionnaire for the pupils and paper work.
export const formsPortal = {
  quiz: {
    title: "Reading quiz",
    instructions: "Read, then answer.",
    q1: { prompt: "Which word is a verb?", a: "Run", b: "Table", points: "1" },
    q2: { prompt: "Why do plants need light?", model: "to make food", points: "3" },
    pupilAnswer: "to make their food",
    tooMuch: "5",
    score: "3",
    feedback: "Well said.",
  },
  pulse: { title: "Class pulse", prompt: "How was the week?", comment: "Quiet and good." },
  record: { title: "Reading record", instructions: "Bring the log on Monday.", note: "Neat work." },
};
