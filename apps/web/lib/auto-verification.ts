export type ConfidenceField = {
  fieldName: string;
  confidence: number;
};

export type AutoVerificationAssessment = {
  eligible: boolean;
  confidence: number;
  threshold: number;
  evidenceComplete: boolean;
};

const DEFAULT_THRESHOLD = 0.85;
const REQUIRED_FIELDS = new Set(["patient_name", "provider_name", "claimed_amount"]);
const SUPPORTING_FIELDS = new Set(["invoice_number", "service_date"]);

export function autoVerificationThreshold() {
  const configured = Number(process.env.CLAIM_AUTO_VERIFY_THRESHOLD);
  return Number.isFinite(configured) && configured > 0 && configured < 1
    ? configured
    : DEFAULT_THRESHOLD;
}

export function assessAutoVerification(
  fields: ConfidenceField[],
  warningCount: number,
  threshold = DEFAULT_THRESHOLD,
): AutoVerificationAssessment {
  const names = new Set(fields.map((field) => field.fieldName));
  const evidenceComplete = [...REQUIRED_FIELDS].every((name) => names.has(name))
    && [...SUPPORTING_FIELDS].some((name) => names.has(name));
  const confidence = fields.length
    ? fields.reduce((total, field) => total + field.confidence, 0) / fields.length
    : 0;
  const everyPredictionPasses = fields.length > 0
    && fields.every((field) => Number.isFinite(field.confidence) && field.confidence > threshold);

  return {
    eligible: evidenceComplete && warningCount === 0 && confidence > threshold && everyPredictionPasses,
    confidence,
    threshold,
    evidenceComplete,
  };
}
