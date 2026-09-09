import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import { extractClaimFields } from "../lib/extraction-rules.ts";
import { assessAutoVerification } from "../lib/auto-verification.ts";

const suppliedFile = process.argv[2];
const expectedAmount = process.argv[3] ?? "4580.00";
const files = suppliedFile ? [suppliedFile] : ["claim_form.pdf", "invoice.pdf", "receipt.pdf"];
const documents = [];
for (const file of files) {
  const path = suppliedFile ? file : `../../datasets/golden/CLM-GOLD-001/${file}`;
  const bytes = await readFile(path);
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { maxImageSize: 16_777_216 });
  const result = await extractText(pdf, { mergePages: true });
  documents.push({ documentId: file, text: result.text });
}

const result = extractClaimFields(documents);
assert.equal(result.claimedAmount, expectedAmount);
assert.equal(result.currency, "MUR");
assert.ok(result.fields.some((field) => field.fieldName === "patient_name"));
assert.ok(result.fields.some((field) => field.fieldName === "member_number"));
const automation = assessAutoVerification(result.fields, result.warningCount);
assert.equal(automation.eligible, false);
assert.ok(automation.confidence > 0.85);
assert.equal(assessAutoVerification(result.fields, 0).eligible, true);
assert.equal(assessAutoVerification(result.fields, 1).eligible, false);
assert.equal(assessAutoVerification(result.fields.filter((field) => field.fieldName !== "patient_name"), 0).eligible, false);

const shillingsReceipt = extractClaimFields([{
  documentId: "receipt.png",
  method: "ocr",
  sourceConfidence: 0.89,
  text: "HOLISTIC MEDICAL CENTRE\nLocated along Bbaale Road, Kayunga District, Uganda\nRECEIPT\nReceipt No.: 10137\nDate: 10/04/2026\nReceived with thanks from: Sample Patient\nThe sum of shillings: three hundred sixty five thousand only\nBalance: 300000\nShs. 365000\nWith thanks",
}]);
assert.equal(shillingsReceipt.claimedAmount, "365000.00");
assert.equal(shillingsReceipt.currency, "UGX");
assert.equal(shillingsReceipt.fields.find((field) => field.fieldName === "provider_name")?.normalizedValue, "HOLISTIC MEDICAL CENTRE");
assert.equal(shillingsReceipt.fields.find((field) => field.fieldName === "patient_name")?.normalizedValue, "Sample Patient");
console.log(`Extraction verified: ${result.fields.length} fields, ${result.currency} ${result.claimedAmount}, ${Math.round(automation.confidence * 100)}% automation confidence`);
