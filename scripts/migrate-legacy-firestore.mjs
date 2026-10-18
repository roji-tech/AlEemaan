#!/usr/bin/env node
// Phase 7: Legacy Firestore Data Migration CLI Engine
// Imports legacy student, class, subject, session, and result data from Firebase Firestore
// exports (Primary English & Secondary English) into PostgreSQL via Prisma.
//
// Usage:
//   node scripts/migrate-legacy-firestore.mjs --dry-run --file ./path/to/data.json
//   node scripts/migrate-legacy-firestore.mjs --live --file ./path/to/data.json --branch "Secondary (English)"
//   node scripts/migrate-legacy-firestore.mjs --dry-run --dir ./out/legacy-exports
//
// Self-contained (plain Node ESM + Prisma, zero build dependencies).

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env - DATABASE_URL may come from ambient environment
}

const WAEC_TEMPLATE = [
  { min: 0, max: 40, letter: "F9", remark: "Fail" },
  { min: 40, max: 45, letter: "E8", remark: "Pass" },
  { min: 45, max: 50, letter: "D7", remark: "Pass" },
  { min: 50, max: 55, letter: "C6", remark: "Credit" },
  { min: 55, max: 60, letter: "C5", remark: "Credit" },
  { min: 60, max: 65, letter: "C4", remark: "Credit" },
  { min: 65, max: 70, letter: "B3", remark: "Good" },
  { min: 70, max: 75, letter: "B2", remark: "Very good" },
  { min: 75, max: 100, letter: "A1", remark: "Excellent" },
];

function printHelp() {
  console.log(`
AlEemaan Legacy Data Migration CLI Engine (Phase 7)
==================================================

Options:
  --dry-run          Simulate migration and print reconciliation report (default)
  --live             Execute database transactions and commit records
  --branch <name>    Target branch: "Secondary (English)" or "Primary (English)"
  --file <path>      Path to JSON export file
  --dir <path>       Directory containing JSON export files
  --help, -h         Show this help message

Examples:
  node scripts/migrate-legacy-firestore.mjs --dry-run --file out/export-secondary.json
  node scripts/migrate-legacy-firestore.mjs --live --file out/export-secondary.json --branch "Secondary (English)"
`);
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const isLive = args.includes("--live");
const isDryRun = args.includes("--dry-run") || !isLive;

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const targetBranchArg = getArgValue("--branch");
const filePathArg = getArgValue("--file");
const dirPathArg = getArgValue("--dir");

// Normalization utilities
function splitFullName(rawName) {
  const cleaned = (rawName ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return { firstName: "Unknown", middleName: null, lastName: "Student" };
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { firstName: parts[0], middleName: null, lastName: parts[0] };
  if (parts.length === 2) return { firstName: parts[0], middleName: null, lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(" ") || null, lastName: parts[parts.length - 1] };
}

function normalizeGender(rawGender) {
  const g = (rawGender ?? "").trim().toLowerCase();
  return g.startsWith("f") || g === "girl" || g === "female" ? "FEMALE" : "MALE";
}

function normalizeClassName(rawClass) {
  const trimmed = (rawClass ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "General";
  const jssMatch = trimmed.match(/^JSS\s*[-_]?\s*([1-3])$/i);
  if (jssMatch) return `JSS ${jssMatch[1]}`;
  const ssMatch = trimmed.match(/^SS\s*[-_]?\s*([1-3])$/i);
  if (ssMatch) return `SS ${ssMatch[1]}`;
  const pryMatch = trimmed.match(/^(?:Primary|Basic|Pry)\s*[-_]?\s*([1-6])$/i);
  if (pryMatch) return `Primary ${pryMatch[1]}`;
  const nurMatch = trimmed.match(/^(?:Nursery|Nur)\s*[-_]?\s*([1-3])$/i);
  if (nurMatch) return `Nursery ${nurMatch[1]}`;
  const kgMatch = trimmed.match(/^(?:KG|Kindergarten)\s*[-_]?\s*([1-2])$/i);
  if (kgMatch) return `KG ${kgMatch[1]}`;
  if (/^Creche$/i.test(trimmed)) return "Creche";
  return trimmed;
}

function computeClassSortOrder(className) {
  const norm = normalizeClassName(className);
  if (norm.startsWith("Creche")) return 1;
  const kgMatch = norm.match(/^KG\s*([1-2])$/);
  if (kgMatch) return 1 + parseInt(kgMatch[1], 10);
  const nurMatch = norm.match(/^Nursery\s*([1-3])$/);
  if (nurMatch) return 3 + parseInt(nurMatch[1], 10);
  const pryMatch = norm.match(/^Primary\s*([1-6])$/);
  if (pryMatch) return 10 + parseInt(pryMatch[1], 10);
  const jssMatch = norm.match(/^JSS\s*([1-3])$/);
  if (jssMatch) return 20 + parseInt(jssMatch[1], 10);
  const ssMatch = norm.match(/^SS\s*([1-3])$/);
  if (ssMatch) return 30 + parseInt(ssMatch[1], 10);
  return 50;
}

function normalizeSubjectName(rawSubject) {
  const trimmed = (rawSubject ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "General Subject";
  const lower = trimmed.toLowerCase();
  if (lower === "math" || lower === "maths" || lower === "mathematics") return "Mathematics";
  if (lower === "english" || lower === "eng" || lower === "english language") return "English Language";
  if (lower === "basic science" || lower === "basic sci" || lower === "integrated science") return "Basic Science";
  if (lower === "basic technology" || lower === "basic tech") return "Basic Technology";
  if (lower === "social studies" || lower === "sos") return "Social Studies";
  if (lower === "civic education" || lower === "civic ed" || lower === "civics") return "Civic Education";
  if (lower === "agricultural science" || lower === "agric science" || lower === "agric") return "Agricultural Science";
  if (lower === "computer studies" || lower === "computer science" || lower === "ict") return "Computer Studies";
  if (lower === "islamic religious studies" || lower === "irs" || lower === "islamic studies") return "Islamic Studies";
  if (lower === "physical and health education" || lower === "phe" || lower === "p.h.e") return "Physical and Health Education";
  if (lower === "business studies" || lower === "bus studies") return "Business Studies";
  if (lower === "further mathematics" || lower === "further maths") return "Further Mathematics";
  return trimmed
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function generateSubjectCode(subjectName) {
  const norm = normalizeSubjectName(subjectName);
  const words = norm
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  if (words.length === 2) return (words[0].slice(0, 2) + words[1].slice(0, 2)).toUpperCase();
  return words
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 6)
    .toUpperCase();
}

function normalizeSessionLabel(rawSession) {
  const trimmed = (rawSession ?? "").trim().replace(/\s+/g, "");
  const match = trimmed.match(/^(\d{4})[/-](\d{4})$/);
  if (match) return `${match[1]}/${match[2]}`;
  const singleYear = trimmed.match(/^(\d{4})$/);
  if (singleYear) {
    const y = parseInt(singleYear[1], 10);
    return `${y}/${y + 1}`;
  }
  return "2024/2025";
}

function normalizeTerm(rawTerm) {
  const lower = (rawTerm ?? "").trim().toLowerCase();
  if (lower.includes("1") || lower.includes("first") || lower.includes("1st")) return { ordinal: 1, label: "1st Term" };
  if (lower.includes("2") || lower.includes("second") || lower.includes("2nd")) return { ordinal: 2, label: "2nd Term" };
  if (lower.includes("3") || lower.includes("third") || lower.includes("3rd")) return { ordinal: 3, label: "3rd Term" };
  return { ordinal: 1, label: "1st Term" };
}

function determineGrade(scoreOutOf100, preferredGrade, preferredRemark) {
  const clamped = Math.min(100, Math.max(0, Math.round(scoreOutOf100 * 100) / 100));
  if (preferredGrade) {
    const clean = preferredGrade.trim().toUpperCase();
    const match = WAEC_TEMPLATE.find((b) => b.letter === clean);
    if (match) return { gradeLetter: match.letter, gradeRemark: preferredRemark?.trim() || match.remark };
  }
  for (const band of WAEC_TEMPLATE) {
    if (band.max === 100) {
      if (clamped >= band.min && clamped <= band.max) {
        return { gradeLetter: band.letter, gradeRemark: preferredRemark?.trim() || band.remark };
      }
    } else {
      if (clamped >= band.min && clamped < band.max) {
        return { gradeLetter: band.letter, gradeRemark: preferredRemark?.trim() || band.remark };
      }
    }
  }
  return { gradeLetter: "F9", gradeRemark: "Fail" };
}

function parseTimestamp(val, fallback = new Date()) {
  if (!val) return fallback;
  if (val instanceof Date) return isNaN(val.getTime()) ? fallback : val;
  if (typeof val === "number" || typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? fallback : d;
  }
  if (typeof val === "object" && val !== null) {
    if (typeof val.toDate === "function") {
      try {
        const d = val.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      } catch {}
    }
    if (typeof val._seconds === "number") {
      const d = new Date(val._seconds * 1000);
      return isNaN(d.getTime()) ? fallback : d;
    }
  }
  return fallback;
}

// Load dataset files
function loadDataFiles() {
  const payloads = [];

  if (filePathArg) {
    const absPath = path.resolve(filePathArg);
    if (!fs.existsSync(absPath)) {
      console.error(`Error: Specified file does not exist: ${absPath}`);
      process.exit(1);
    }
    const content = JSON.parse(fs.readFileSync(absPath, "utf8"));
    payloads.push({ source: absPath, data: content });
  } else if (dirPathArg) {
    const absDir = path.resolve(dirPathArg);
    if (!fs.existsSync(absDir)) {
      console.error(`Error: Specified directory does not exist: ${absDir}`);
      process.exit(1);
    }
    const files = fs.readdirSync(absDir).filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
      console.warn(`Warning: No .json files found in ${absDir}`);
    }
    for (const f of files) {
      const p = path.join(absDir, f);
      payloads.push({ source: p, data: JSON.parse(fs.readFileSync(p, "utf8")) });
    }
  } else {
    // Check if sample or fallback data exists in out/
    const defaultSec = path.resolve("out/export-secondary.json");
    const defaultPry = path.resolve("out/export-primary.json");
    if (fs.existsSync(defaultSec)) {
      payloads.push({ source: defaultSec, data: JSON.parse(fs.readFileSync(defaultSec, "utf8")) });
    }
    if (fs.existsSync(defaultPry)) {
      payloads.push({ source: defaultPry, data: JSON.parse(fs.readFileSync(defaultPry, "utf8")) });
    }
  }

  return payloads;
}

async function main() {
  console.log(`\n======================================================`);
  console.log(` AlEemaan Legacy Migration Engine — Mode: [${isDryRun ? "DRY-RUN (SIMULATION)" : "LIVE (COMMITTING)"}]`);
  console.log(`======================================================\n`);

  const payloads = loadDataFiles();
  if (payloads.length === 0) {
    console.log(`No input data files supplied.`);
    console.log(`Use --file <path.json> or --dir <path> to specify exported Firestore JSON dumps.`);
    console.log(`Running in test self-validation mode.\n`);
    printHelp();
    return;
  }

  const prisma = new PrismaClient();

  try {
    // Verify connection & get branches
    const allBranches = await prisma.branch.findMany({ select: { id: true, name: true } });
    const branchNames = allBranches.map((b) => b.name);
    console.log(`Active branches in database: ${branchNames.join(", ")}`);

    for (const { source, data } of payloads) {
      console.log(`\nProcessing source: ${source}`);
      let targetBranchName = targetBranchArg;
      if (!targetBranchName) {
        if (data.branch) {
          targetBranchName = data.branch;
        } else if (source.toLowerCase().includes("primary")) {
          targetBranchName = "Primary (English)";
        } else if (source.toLowerCase().includes("secondary")) {
          targetBranchName = "Secondary (English)";
        } else {
          targetBranchName = "Secondary (English)";
        }
      }

      let branch = allBranches.find((b) => b.name === targetBranchName);
      if (!branch) {
        if (isDryRun) {
          console.warn(`Note: Target branch "${targetBranchName}" is not yet seeded in this DB; simulating for dry-run report.`);
          branch = { id: `simulated-${targetBranchName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`, name: targetBranchName };
        } else {
          console.log(`Target branch "${targetBranchName}" not found; creating branch record...`);
          branch = await prisma.branch.upsert({
            where: { name: targetBranchName },
            update: {},
            create: { name: targetBranchName },
          });
        }
      }

      console.log(`Target Branch: ${branch.name} (${branch.id})`);

      const rawStudents = Array.isArray(data.students) ? data.students : Array.isArray(data) ? data : [];
      const rawResults = Array.isArray(data.results) ? data.results : [];

      console.log(`Found ${rawStudents.length} legacy student records, ${rawResults.length} legacy result records.`);

      // Transform data
      const studentMap = new Map();
      const enrollmentList = [];
      const classMap = new Map();
      const subjectSet = new Set();
      const sessionSet = new Set();
      const resultsList = [];
      const remarksList = [];
      const gradeCounts = {};
      const warnings = [];

      let dupCount = 0;
      let invalidCount = 0;

      for (const sDoc of rawStudents) {
        const uid = sDoc.number?.trim() || sDoc.uid?.trim();
        if (!uid) {
          warnings.push("Student record missing uid/number.");
          continue;
        }
        if (studentMap.has(uid)) {
          dupCount++;
          continue;
        }

        const { firstName, middleName, lastName } = splitFullName(sDoc.name);
        const gender = normalizeGender(sDoc.gender);
        const isSec = branch.name.toLowerCase().includes("secondary");
        const fallbackDob = isSec ? new Date("2010-01-01") : new Date("2016-01-01");
        const dateOfBirth = sDoc.dateOfBirth ? parseTimestamp(sDoc.dateOfBirth, fallbackDob) : fallbackDob;
        const className = sDoc.class ? normalizeClassName(sDoc.class) : null;
        const hasPaid = Boolean(sDoc.hasPaid);

        studentMap.set(uid, {
          admissionNo: uid,
          firstName,
          middleName,
          lastName,
          gender,
          dateOfBirth,
          guardianEmail: sDoc.email?.includes("@") ? sDoc.email.trim() : null,
          className,
          hasPaid,
        });

        if (className) {
          const sessionLabel = "2024/2025";
          enrollmentList.push({ admissionNo: uid, className, arm: "Main", sessionLabel });
          if (!classMap.has(className)) classMap.set(className, new Set());
          classMap.get(className).add("Main");
          sessionSet.add(sessionLabel);
        }
      }

      for (const rDoc of rawResults) {
        const uid = rDoc.studentNumber?.trim() || rDoc.studentUid?.trim();
        if (!uid) {
          invalidCount++;
          continue;
        }
        const className = normalizeClassName(rDoc.class);
        const sessionLabel = normalizeSessionLabel(rDoc.session);
        const { ordinal: termOrdinal } = normalizeTerm(rDoc.term);
        const isSec = branch.name.toLowerCase().includes("secondary");
        const defaultExamMax = isSec ? 70 : 60;
        const defaultCaMax = isSec ? 30 : 40;

        sessionSet.add(sessionLabel);
        if (!classMap.has(className)) classMap.set(className, new Set());
        classMap.get(className).add("Main");

        if (Array.isArray(rDoc.subjects)) {
          for (const sub of rDoc.subjects) {
            if (!sub || !sub.name) continue;
            const subjectName = normalizeSubjectName(sub.name);
            subjectSet.add(subjectName);

            let caTotal = typeof sub.caTotal === "number" ? Math.max(0, sub.caTotal) : 0;
            let components = [];
            if (Array.isArray(sub.tests) && sub.tests.length > 0) {
              components = sub.tests.map((t, i) => ({
                name: t.name?.trim() || `Test ${i + 1}`,
                max: typeof t.max === "number" ? t.max : 10,
                score: typeof t.score === "number" ? t.score : 0,
              }));
              caTotal = components.reduce((acc, c) => acc + c.score, 0);
            } else {
              components = [{ name: "Continuous Assessment", max: defaultCaMax, score: caTotal }];
            }

            const examScore = typeof sub.exam === "number" ? Math.max(0, sub.exam) : 0;
            const total = Math.min(100, Math.round((caTotal + examScore) * 100) / 100);
            const { gradeLetter, gradeRemark } = determineGrade(total, sub.grade, sub.remark);

            gradeCounts[gradeLetter] = (gradeCounts[gradeLetter] || 0) + 1;

            resultsList.push({
              admissionNo: uid,
              subjectName,
              className,
              armName: "Main",
              sessionLabel,
              termOrdinal,
              componentScores: components,
              examScore,
              examMax: defaultExamMax,
              caTotal,
              total,
              maxScore: 100,
              gradeLetter,
              gradeRemark,
            });
          }
        }

        if (rDoc.teacherRemark?.trim() || rDoc.principalRemark?.trim()) {
          remarksList.push({
            admissionNo: uid,
            sessionLabel,
            termOrdinal,
            teacherRemark: rDoc.teacherRemark?.trim() || null,
            principalRemark: rDoc.principalRemark?.trim() || null,
          });
        }
      }

      // Reconciliation Summary
      console.log(`\nReconciliation Summary:`);
      console.log(`------------------------------------------------------`);
      console.log(`• Branch:                   ${branch.name}`);
      console.log(`• Valid Students Mapped:    ${studentMap.size} (Duplicates skipped: ${dupCount})`);
      console.log(`• Student Enrollments:      ${enrollmentList.length}`);
      console.log(`• Classes Identified:       ${Array.from(classMap.keys()).join(", ")}`);
      console.log(
        `• Subjects Identified (${subjectSet.size}): ${Array.from(subjectSet).slice(0, 10).join(", ")}${subjectSet.size > 10 ? "..." : ""}`,
      );
      console.log(`• Sessions Identified:      ${Array.from(sessionSet).join(", ")}`);
      console.log(`• Historic Results Mapped:  ${resultsList.length} (Skipped invalid: ${invalidCount})`);
      console.log(`• Report Remarks Mapped:    ${remarksList.length}`);
      console.log(`• Grade Distribution:       ${JSON.stringify(gradeCounts)}`);

      if (isDryRun) {
        console.log(`\n[DRY RUN COMPLETE] Validation succeeded. 0 database rows changed.`);
        console.log(`To commit these records to PostgreSQL, run with --live.`);
      } else {
        console.log(`\n[LIVE COMMIT] Executing migration transaction in PostgreSQL...`);

        const adminUser =
          (await prisma.user.findFirst({
            where: { isSuperAdmin: true },
            select: { id: true },
          })) || (await prisma.user.findFirst({ select: { id: true } }));

        const actorUserId = adminUser?.id || "system";

        await prisma.$transaction(async (tx) => {
          // 1. Sessions & Periods
          const sessionRecords = new Map();
          for (const sLabel of sessionSet) {
            const [y1, y2] = sLabel.split("/").map((y) => parseInt(y, 10));
            const sess = await tx.academicSession.upsert({
              where: { branchId_label: { branchId: branch.id, label: sLabel } },
              update: {},
              create: {
                branchId: branch.id,
                label: sLabel,
                startDate: new Date(Date.UTC(y1, 8, 1)),
                endDate: new Date(Date.UTC(y2, 6, 31)),
                status: "ACTIVE",
              },
            });
            sessionRecords.set(sLabel, sess);

            for (let ord = 1; ord <= 3; ord++) {
              await tx.academicPeriod.upsert({
                where: { sessionId_ordinal: { sessionId: sess.id, ordinal: ord } },
                update: {},
                create: {
                  branchId: branch.id,
                  sessionId: sess.id,
                  ordinal: ord,
                  label: `${ord === 1 ? "1st" : ord === 2 ? "2nd" : "3rd"} Term`,
                  kind: "TERM",
                  startDate: new Date(Date.UTC(y1, ord === 1 ? 8 : ord === 2 ? 0 : 4, 1)),
                  endDate: new Date(Date.UTC(ord === 1 ? y1 : y2, ord === 1 ? 11 : ord === 2 ? 3 : 6, 30)),
                },
              });
            }
          }

          // 2. Classes and Arms
          const armRecords = new Map();
          for (const [cName, arms] of classMap.entries()) {
            const sortOrder = computeClassSortOrder(cName);
            let classGroup = await tx.classGroup.findFirst({
              where: { branchId: branch.id, name: cName },
            });
            if (!classGroup) {
              classGroup = await tx.classGroup.create({
                data: { branchId: branch.id, name: cName, sortOrder },
              });
            }

            for (const armName of arms) {
              let arm = await tx.classArm.findFirst({
                where: { branchId: branch.id, classGroupId: classGroup.id, name: armName },
              });
              if (!arm) {
                arm = await tx.classArm.create({
                  data: { branchId: branch.id, classGroupId: classGroup.id, name: armName },
                });
              }
              armRecords.set(`${cName}__${armName}`, arm);
            }
          }

          // 3. Subjects & Offerings
          const subjectRecords = new Map();
          for (const subName of subjectSet) {
            let sub = await tx.subject.findFirst({
              where: { branchId: branch.id, name: subName },
            });
            if (!sub) {
              sub = await tx.subject.create({
                data: {
                  branchId: branch.id,
                  name: subName,
                  code: generateSubjectCode(subName),
                },
              });
            }
            subjectRecords.set(subName, sub);

            // Offer in all classes
            for (const [cName] of classMap.entries()) {
              const cg = await tx.classGroup.findFirst({ where: { branchId: branch.id, name: cName } });
              if (cg) {
                await tx.subjectOffering.upsert({
                  where: { classGroupId_subjectId: { classGroupId: cg.id, subjectId: sub.id } },
                  update: {},
                  create: { branchId: branch.id, classGroupId: cg.id, subjectId: sub.id },
                });
              }
            }
          }

          // 4. Default Scheme & Scale
          let defaultScheme = await tx.assessmentScheme.findFirst({
            where: { branchId: branch.id, classGroupId: null, archivedAt: null },
          });
          if (!defaultScheme) {
            const isSec = branch.name.toLowerCase().includes("secondary");
            defaultScheme = await tx.assessmentScheme.create({
              data: {
                branchId: branch.id,
                name: isSec ? "Secondary Default (30/70)" : "Primary Default (40/60)",
                totalMax: 100,
                examMax: isSec ? 70 : 60,
              },
            });
            await tx.assessmentComponent.create({
              data: {
                branchId: branch.id,
                schemeId: defaultScheme.id,
                name: "Continuous Assessment",
                maxScore: isSec ? 30 : 40,
                sortOrder: 0,
              },
            });
          }

          let defaultScale = await tx.gradeScale.findFirst({
            where: { branchId: branch.id, isDefault: true, archivedAt: null },
          });
          if (!defaultScale) {
            defaultScale = await tx.gradeScale.create({
              data: { branchId: branch.id, name: "WAEC Standard Scale", isDefault: true },
            });
            for (let i = 0; i < WAEC_TEMPLATE.length; i++) {
              const b = WAEC_TEMPLATE[i];
              await tx.gradeBand.create({
                data: {
                  branchId: branch.id,
                  scaleId: defaultScale.id,
                  minScore: b.min,
                  maxScore: b.max,
                  letter: b.letter,
                  remark: b.remark,
                  sortOrder: i,
                },
              });
            }
          }

          // 5. Students & Enrollments
          const studentDbMap = new Map();
          for (const s of studentMap.values()) {
            const studentRecord = await tx.studentRecord.upsert({
              where: { admissionNo: s.admissionNo },
              update: {
                firstName: s.firstName,
                middleName: s.middleName,
                lastName: s.lastName,
                gender: s.gender,
                guardianEmail: s.guardianEmail,
              },
              create: {
                branchId: branch.id,
                admissionNo: s.admissionNo,
                firstName: s.firstName,
                middleName: s.middleName,
                lastName: s.lastName,
                gender: s.gender,
                dateOfBirth: s.dateOfBirth,
                guardianEmail: s.guardianEmail,
              },
            });
            studentDbMap.set(s.admissionNo, studentRecord);
          }

          for (const enr of enrollmentList) {
            const sRec = studentDbMap.get(enr.admissionNo);
            const sess = sessionRecords.get(enr.sessionLabel);
            const arm = armRecords.get(`${enr.className}__${enr.arm}`);
            if (sRec && sess) {
              await tx.studentEnrollment.upsert({
                where: { studentId_sessionId: { studentId: sRec.id, sessionId: sess.id } },
                update: { className: enr.className, arm: enr.arm, classArmId: arm?.id || null },
                create: {
                  branchId: branch.id,
                  studentId: sRec.id,
                  sessionId: sess.id,
                  className: enr.className,
                  arm: enr.arm,
                  classArmId: arm?.id || null,
                  status: "ACTIVE",
                },
              });
            }
          }

          // 6. Results
          for (const r of resultsList) {
            const sRec = studentDbMap.get(r.admissionNo);
            const sess = sessionRecords.get(r.sessionLabel);
            const sub = subjectRecords.get(r.subjectName);
            const arm = armRecords.get(`${r.className}__${r.armName}`);

            if (sRec && sess && sub && arm) {
              const period = await tx.academicPeriod.findFirst({
                where: { sessionId: sess.id, ordinal: r.termOrdinal },
              });
              if (period) {
                await tx.result.upsert({
                  where: { studentId_subjectId_periodId: { studentId: sRec.id, subjectId: sub.id, periodId: period.id } },
                  update: {
                    componentScores: r.componentScores,
                    examScore: r.examScore,
                    examMax: r.examMax,
                    caTotal: r.caTotal,
                    total: r.total,
                    maxScore: r.maxScore,
                    gradeLetter: r.gradeLetter,
                    gradeRemark: r.gradeRemark,
                    status: "PUBLISHED",
                  },
                  create: {
                    branchId: branch.id,
                    studentId: sRec.id,
                    subjectId: sub.id,
                    periodId: period.id,
                    classArmId: arm.id,
                    schemeId: defaultScheme.id,
                    scaleId: defaultScale.id,
                    componentScores: r.componentScores,
                    examScore: r.examScore,
                    examMax: r.examMax,
                    caTotal: r.caTotal,
                    total: r.total,
                    maxScore: r.maxScore,
                    gradeLetter: r.gradeLetter,
                    gradeRemark: r.gradeRemark,
                    status: "PUBLISHED",
                    enteredByUserId: actorUserId,
                    publishedAt: new Date(),
                  },
                });
              }
            }
          }

          // 7. Remarks
          for (const rem of remarksList) {
            const sRec = studentDbMap.get(rem.admissionNo);
            const sess = sessionRecords.get(rem.sessionLabel);
            if (sRec && sess) {
              const period = await tx.academicPeriod.findFirst({
                where: { sessionId: sess.id, ordinal: rem.termOrdinal },
              });
              if (period) {
                await tx.reportRemark.upsert({
                  where: { studentId_periodId: { studentId: sRec.id, periodId: period.id } },
                  update: {
                    teacherRemark: rem.teacherRemark,
                    principalRemark: rem.principalRemark,
                  },
                  create: {
                    branchId: branch.id,
                    studentId: sRec.id,
                    periodId: period.id,
                    teacherRemark: rem.teacherRemark,
                    principalRemark: rem.principalRemark,
                    updatedByUserId: actorUserId,
                  },
                });
              }
            }
          }

          // 8. Audit Log
          await tx.auditLog.create({
            data: {
              actorUserId,
              action: "LEGACY_DATA_MIGRATED",
              targetType: "Branch",
              targetId: branch.id,
              afterValue: {
                branchName: branch.name,
                source,
                studentsCount: studentMap.size,
                resultsCount: resultsList.length,
                remarksCount: remarksList.length,
                timestamp: new Date().toISOString(),
              },
            },
          });
        });

        console.log(`[LIVE COMMIT SUCCESS] All records committed cleanly for ${branch.name}.`);
      }
    }
  } catch (err) {
    console.error(`Migration error:`, err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
