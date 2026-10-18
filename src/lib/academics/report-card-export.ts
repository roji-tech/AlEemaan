import type { Card } from "@/components/results/ReportCard";

/**
 * Generates and triggers download of a self-contained, offline-compatible HTML report card.
 * The exported file includes standalone styling, official school headers, grading scales,
 * signatures, and verification URLs, and formats cleanly onto standard A4 portrait pages.
 */
export function generateReportCardHtml(card: Card, origin: string): string {
  const s = card.summary;
  const subjectsRows = card.subjects
    .map(
      (sub) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${escapeHtml(sub.name)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${sub.caTotal}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${sub.exam}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700;">${sub.total} <span style="font-size: 11px; font-weight: 400; color: #64748b;">/${sub.max}</span></td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 700;">${escapeHtml(sub.gradeLetter)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #475569;">${escapeHtml(sub.gradeRemark)}</td>
      </tr>`,
    )
    .join("");

  const legendText = card.legend.map((l) => `${escapeHtml(l.letter)} (${l.min}–${l.max}) ${escapeHtml(l.remark)}`).join(" · ");

  const verificationItems = card.subjects
    .filter((sub) => sub.verificationToken)
    .map(
      (sub) =>
        `<li style="margin-bottom: 4px;"><strong>${escapeHtml(sub.name)}:</strong> <a href="${origin}/verify/${sub.verificationToken}" target="_blank" style="color: #0284c7; text-decoration: underline;">${origin}/verify/${sub.verificationToken}</a></li>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Report Card - ${escapeHtml(card.student.name)} (${escapeHtml(card.period.label)})</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #f8fafc;
      margin: 0;
      padding: 24px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .header .motto {
      margin: 4px 0;
      font-size: 13px;
      color: #64748b;
      font-style: italic;
    }
    .header .contact {
      margin: 4px 0;
      font-size: 12px;
      color: #334155;
    }
    .header .term {
      margin-top: 8px;
      font-size: 15px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .student-info {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      background: #f1f5f9;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 24px;
    }
    .student-info dt { color: #64748b; font-size: 11px; text-transform: uppercase; }
    .student-info dd { margin: 2px 0 0; font-weight: 700; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-bottom: 24px;
    }
    th {
      background: #f8fafc;
      border-bottom: 2px solid #cbd5e1;
      padding: 10px 12px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #334155;
    }
    .summary-tiles {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .tile {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
    }
    .tile-label { font-size: 11px; text-transform: uppercase; color: #64748b; margin: 0; }
    .tile-value { font-size: 18px; font-weight: 800; margin: 4px 0 0; }
    .remarks {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .remarks h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: #64748b; }
    .remarks p { margin: 0 0 12px; font-style: italic; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 32px;
      margin-bottom: 24px;
    }
    .sig-box {
      border-top: 1px dashed #64748b;
      padding-top: 8px;
      text-align: center;
      font-size: 12px;
      color: #334155;
    }
    .legend {
      font-size: 11px;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      margin-top: 16px;
    }
    .btn-bar {
      margin-bottom: 16px;
      display: flex;
      justify-content: flex-end;
    }
    .print-btn {
      background: #0f172a;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    @media print {
      body { background: white; padding: 0; }
      .container { border: none; box-shadow: none; padding: 0; width: 100%; max-width: none; }
      .btn-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="btn-bar">
      <button class="print-btn" onclick="window.print()">Print or Save as PDF</button>
    </div>

    <div class="header">
      <h1>${escapeHtml(card.school.name)}</h1>
      ${card.school.motto ? `<div class="motto">${escapeHtml(card.school.motto)}</div>` : ""}
      <div class="contact">${escapeHtml([card.branch.name, card.school.address, card.school.phone].filter(Boolean).join(" · "))}</div>
      <div class="term">Official Student Report Card — ${escapeHtml(card.period.label)} (${escapeHtml(card.period.session)})</div>
    </div>

    <div class="student-info">
      <div>
        <dt>Pupil Name</dt>
        <dd>${escapeHtml(card.student.name)}</dd>
      </div>
      <div>
        <dt>Admission No.</dt>
        <dd>${escapeHtml(card.student.admissionNo)}</dd>
      </div>
      <div>
        <dt>Class &amp; Arm</dt>
        <dd>${card.class ? escapeHtml(`${card.class.group} ${card.class.arm}`) : "—"}</dd>
      </div>
      <div>
        <dt>Gender</dt>
        <dd>${card.student.gender === "FEMALE" ? "Female" : "Male"}</dd>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="text-align: left;">Subject</th>
          <th style="text-align: right;">CA Score</th>
          <th style="text-align: right;">Exam Score</th>
          <th style="text-align: right;">Total Mark</th>
          <th style="text-align: center;">Grade</th>
          <th style="text-align: left;">Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${subjectsRows || '<tr><td colspan="6" style="text-align: center; padding: 16px; color: #64748b;">No published results for this term.</td></tr>'}
      </tbody>
    </table>

    <div class="summary-tiles">
      <div class="tile">
        <p class="tile-label">Subjects Taken</p>
        <p class="tile-value">${s.subjectCount}</p>
      </div>
      <div class="tile">
        <p class="tile-label">Total Score</p>
        <p class="tile-value">${s.totalScore} / ${s.totalMax}</p>
      </div>
      <div class="tile">
        <p class="tile-label">Term Average</p>
        <p class="tile-value">${s.average !== null ? `${s.average}%` : "—"}</p>
      </div>
      <div class="tile">
        <p class="tile-label">Class Position</p>
        <p class="tile-value">${s.position !== null ? `${s.position}${getOrdinalSuffix(s.position)}` : "—"} <span style="font-size: 11px; font-weight: 400; color: #64748b;">${s.classSize ? `of ${s.classSize}` : ""}</span></p>
      </div>
    </div>

    <div class="remarks">
      <h3>Class Teacher's Remark</h3>
      <p>${escapeHtml(card.remarks.teacher || "Satisfactory academic performance.")}</p>
      <h3 style="margin-top: 12px;">Principal's Remark</h3>
      <p style="margin-bottom: 0;">${escapeHtml(card.remarks.principal || "Promoted/Advanced to next academic term.")}</p>
    </div>

    <div class="signatures">
      <div class="sig-box">Class Teacher's Signature &amp; Date</div>
      <div class="sig-box">Principal's Signature &amp; Stamp</div>
    </div>

    ${legendText ? `<div class="legend"><strong>Grading Scale:</strong> ${legendText}</div>` : ""}

    ${
      verificationItems
        ? `<div class="legend" style="margin-top: 8px;"><strong>Public Verification Records:</strong><ul style="margin: 4px 0 0 16px; padding: 0;">${verificationItems}</ul></div>`
        : ""
    }
  </div>
</body>
</html>`;
}

export function downloadReportCardHtml(card: Card, origin: string) {
  const html = generateReportCardHtml(card, origin);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const cleanName = card.student.name.replace(/[^a-zA-Z0-9]/g, "_");
  const cleanTerm = card.period.label.replace(/[^a-zA-Z0-9]/g, "_");
  a.href = url;
  a.download = `ReportCard_${cleanName}_${cleanTerm}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}
