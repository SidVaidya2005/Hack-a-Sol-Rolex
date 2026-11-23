// Writes the three synthetic demo PDFs. Output is deterministic, so a rerun leaves git clean.
// Usage: node scripts/generate-demo-documents.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = join(
  resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  "app",
  "public",
  "demo-documents",
);

const BANNER = "SYNTHETIC DEMO DOCUMENT - NOT A REAL MEDICAL RECORD";
const DOCUMENTS = {
  "demo-prescription.pdf": [
    "Sample General Hospital",
    "Prescription",
    "Patient: Test Patient Alpha",
    "Date: 2026-11-22",
    "",
    "Sample medication - one tablet daily for 7 days",
    "Allergy noted: Sample drug allergy",
    "",
    "Prescriber: Sample General Doctor",
  ],
  "demo-lab-report.pdf": [
    "Sample City Lab",
    "Lab Report",
    "Patient: Test Patient Alpha",
    "Date: 2026-11-22",
    "",
    "Test: Sample blood panel",
    "Result: Within sample range",
    "",
    "Verified by: Sample Lab Technician",
  ],
  "demo-discharge-summary.pdf": [
    "Sample General Hospital",
    "Discharge Summary",
    "Patient: Test Patient Alpha",
    "Admitted: 2026-11-20    Discharged: 2026-11-22",
    "",
    "Diagnosis: Sample chronic condition",
    "Procedure: Sample imaging scan",
    "Follow-up: Sample outpatient consult in 14 days",
    "",
    "Attending: Sample General Doctor",
  ],
};

const escapeText = (text) => text.replace(/[\\()]/g, (match) => `\\${match}`);

function buildPdf(lines) {
  const commands = [`BT /F1 11 Tf 72 760 Td (${escapeText(BANNER)}) Tj ET`];
  lines.forEach((line, index) => {
    const size = index === 0 ? 20 : index === 1 ? 14 : 12;
    const y = 715 - index * 24;
    if (line) commands.push(`BT /F1 ${size} Tf 72 ${y} Td (${escapeText(line)}) Tj ET`);
  });
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(body);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

mkdirSync(outputDir, { recursive: true });
for (const [name, lines] of Object.entries(DOCUMENTS)) {
  writeFileSync(join(outputDir, name), buildPdf(lines));
}
console.log(`Wrote ${Object.keys(DOCUMENTS).length} synthetic PDFs.`);
