export type ClaimStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "REVIEW_REQUIRED"
  | "VERIFIED"
  | "PROCESSING_FAILED";

export type ClaimDTO = {
  id: string;
  reference: string;
  patientName: string;
  providerName: string;
  amount: string;
  status: ClaimStatus;
  warningCount: number;
  createdAt: string;
};

export type ViewerDTO = {
  id: string;
  email: string;
  displayName: string;
  role: "claims_officer" | "supervisor" | "administrator";
};
