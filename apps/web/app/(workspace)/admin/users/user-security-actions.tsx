"use client";

import { useActionState, useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { createPasswordResetLink, deleteUserAccount, type UserSecurityState } from "./actions";

const initialState: UserSecurityState = {};

export function UserSecurityActions({ email, isCurrentUser, userId }: { email: string; isCurrentUser: boolean; userId: string }) {
  const resetAction = createPasswordResetLink.bind(null, userId);
  const deleteAction = deleteUserAccount.bind(null, userId);
  const [resetState, submitReset, resetPending] = useActionState(resetAction, initialState);
  const [deleteState, submitDelete, deletePending] = useActionState(deleteAction, initialState);
  const [copied, setCopied] = useState(false);

  async function copyRecoveryLink() {
    if (!resetState.resetLink) return;
    await navigator.clipboard.writeText(resetState.resetLink);
    setCopied(true);
  }

  return (
    <div className="user-security-actions">
      <form action={submitReset}>
        <button className="secondary" type="submit" disabled={resetPending}><KeyRound />{resetPending ? "Creating…" : "Reset password"}</button>
      </form>
      {resetState.error ? <small className="workflow-error" role="alert">{resetState.error}</small> : null}
      {resetState.resetLink ? <div className="recovery-link"><input aria-label={`Recovery link for ${email}`} value={resetState.resetLink} readOnly /><button className="secondary" type="button" onClick={copyRecoveryLink}><Copy />{copied ? "Copied" : "Copy"}</button><small>{resetState.success}</small></div> : null}
      {!isCurrentUser ? <details className="delete-user"><summary><Trash2 />Delete account</summary><form action={submitDelete}><p>This permanently removes login access. Claim and audit history will be preserved.</p><label>Type <b>{email}</b> to confirm<input name="confirmEmail" type="email" autoComplete="off" required /></label>{deleteState.error ? <small className="workflow-error" role="alert">{deleteState.error}</small> : null}{deleteState.success ? <small className="success-text" role="status">{deleteState.success}</small> : null}<button className="danger-button" type="submit" disabled={deletePending}><Trash2 />{deletePending ? "Deleting…" : "Delete account"}</button></form></details> : <small>Your own administrator account cannot be deleted.</small>}
    </div>
  );
}
