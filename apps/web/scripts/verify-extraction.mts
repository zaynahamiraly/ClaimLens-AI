import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import { extractClaimFields } from "../lib/extraction-rules.ts";

const files = ["claim_form.pdf", "invoice.pdf", "receipt.pdf"];
const documents = [];
for (const file of files) {
  const bytes = await readFile(`../../datasets/golden/CLM-GOLD-001/${file}`);
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { maxImageSize: 16_777_216 });
  const result = await extractText(pdf, { mergePages: true });
  documents.push({ documentId: file, text: result.text });
}

const result = extractClaimFields(documents);
assert.equal(result.claimedAmount, "4580.00");
assert.equal(result.currency, "MUR");
assert.ok(result.fields.some((field) => field.fieldName === "patient_name" && field.normalizedValue === "Aisha Raman"));
assert.ok(result.fields.some((field) => field.fieldName === "member_number" && field.normalizedValue === "MEM10001"));
console.log(`Extraction verified: ${result.fields.length} fields, ${result.currency} ${result.claimedAmount}`);
