import type { ClaimDTO, ViewerDTO } from "@/lib/types";

export const DEMO_VIEWER: ViewerDTO = {
  id: "demo-user",
  email: "officer@claimlens.mu",
  displayName: "Shuaib",
  role: "claims_officer",
};

export const DEMO_CLAIMS: ClaimDTO[] = [
  { id: "demo-142", reference: "CLM-2026-000142", patientName: "Aisha Raman", providerName: "Harbour Medical Centre", amount: "MUR 4,580.00", status: "REVIEW_REQUIRED", warningCount: 1, createdAt: "2026-08-12T05:42:00.000Z" },
  { id: "demo-141", reference: "CLM-2026-000141", patientName: "Noah Chen", providerName: "Northshore Clinic", amount: "MUR 2,150.00", status: "PROCESSING", warningCount: 0, createdAt: "2026-08-12T05:18:00.000Z" },
  { id: "demo-140", reference: "CLM-2026-000140", patientName: "Maya Beeharry", providerName: "Wellkin Hospital", amount: "MUR 7,240.00", status: "VERIFIED", warningCount: 0, createdAt: "2026-08-11T12:36:00.000Z" },
  { id: "demo-139", reference: "CLM-2026-000139", patientName: "Ethan Wong", providerName: "City Health Lab", amount: "MUR 1,890.00", status: "VERIFIED", warningCount: 0, createdAt: "2026-08-11T11:04:00.000Z" },
];
