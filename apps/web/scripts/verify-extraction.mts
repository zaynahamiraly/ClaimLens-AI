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
assert.equal(automation.eligible, true);
assert.ok(automation.confidence > 0.85);
assert.equal(assessAutoVerification(result.fields, 1).eligible, false);
assert.equal(assessAutoVerification(result.fields.filter((field) => field.fieldName !== "patient_name"), 0).eligible, false);
console.log(`Extraction verified: ${result.fields.length} fields, ${result.currency} ${result.claimedAmount}, ${Math.round(automation.confidence * 100)}% automation confidence`);
