import type { ClaimDTO, ViewerDTO } from "@/lib/types";

export const DEMO_VIEWER: ViewerDTO = {
  id: "demo-user",
  email: "officer@claimlens.mu",
  displayName: "Shuaib",
  role: "claims_officer",
  status: "active",
};

export const DEMO_CLAIMS: ClaimDTO[] = [
  { id: "demo-142", reference: "CLM-2026-000142", patientName: "Aisha Raman", providerName: "Harbour Medical Centre", amount: "MUR 4,580.00", currency: "MUR", status: "REVIEW_REQUIRED", warningCount: 1, createdAt: "2026-08-12T05:42:00.000Z", clientId: "demo-client", clientName: "Aisha Raman", assignedTo: "demo-user", assignedOfficerName: "Shuaib" },
  { id: "demo-141", reference: "CLM-2026-000141", patientName: "Noah Chen", providerName: "Northshore Clinic", amount: "MUR 2,150.00", currency: "MUR", status: "PROCESSING", warningCount: 0, createdAt: "2026-08-12T05:18:00.000Z", clientId: "demo-client-2", clientName: "Noah Chen", assignedTo: null, assignedOfficerName: null },
  { id: "demo-140", reference: "CLM-2026-000140", patientName: "Maya Beeharry", providerName: "Wellkin Hospital", amount: "MUR 7,240.00", currency: "MUR", status: "VERIFIED", warningCount: 0, createdAt: "2026-08-11T12:36:00.000Z", clientId: "demo-client-3", clientName: "Maya Beeharry", assignedTo: "demo-user", assignedOfficerName: "Shuaib" },
  { id: "demo-139", reference: "CLM-2026-000139", patientName: "Ethan Wong", providerName: "City Health Lab", amount: "MUR 1,890.00", currency: "MUR", status: "VERIFIED", warningCount: 0, createdAt: "2026-08-11T11:04:00.000Z", clientId: "demo-client-4", clientName: "Ethan Wong", assignedTo: "demo-user", assignedOfficerName: "Shuaib" },
];
