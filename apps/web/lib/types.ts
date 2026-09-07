export type ClaimStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "REVIEW_REQUIRED"
  | "VERIFIED"
  | "PROCESSING_FAILED";

export type VerificationState = {
  success?: boolean;
  error?: string;
};

export type ClaimDTO = {
  id: string;
  reference: string;
  patientName: string;
  providerName: string;
  amount: string;
  status: ClaimStatus;
  warningCount: number;
  createdAt: string;
  clientId: string | null;
  clientName: string | null;
  assignedTo: string | null;
  assignedOfficerName: string | null;
};

export type UserRole = "client" | "claims_officer" | "supervisor" | "administrator";
export type ProfileStatus = "active" | "inactive";

export type ViewerDTO = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: ProfileStatus;
};

export type ProfileDTO = ViewerDTO & { createdAt: string };

export type AuditEventDTO = {
  id: string;
  eventType: string;
  createdAt: string;
  actorName: string;
  claimReference: string | null;
  subjectName: string | null;
  detail: string | null;
};
