import type { UserRole } from "@/lib/types";

export const ROLE_LABELS: Record<UserRole, string> = {
  client: "Client",
  claims_officer: "Claims Officer",
  supervisor: "Supervisor",
  administrator: "Administrator",
};

export const STAFF_ROLES: UserRole[] = ["claims_officer", "supervisor", "administrator"];
export const REVIEW_ROLES: UserRole[] = ["claims_officer", "supervisor", "administrator"];
export const MANAGEMENT_ROLES: UserRole[] = ["supervisor", "administrator"];

export function hasRole(role: UserRole, allowed: readonly UserRole[]) {
  return allowed.includes(role);
}

export function canReview(role: UserRole) {
  return hasRole(role, REVIEW_ROLES);
}

export function canAssign(role: UserRole) {
  return hasRole(role, MANAGEMENT_ROLES);
}

export function canManageUsers(role: UserRole) {
  return role === "administrator";
}

export function canViewAnalytics(role: UserRole) {
  return hasRole(role, STAFF_ROLES);
}
