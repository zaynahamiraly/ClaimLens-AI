"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { updatePassword, type UpdatePasswordState } from "./actions";

const initialState: UpdatePasswordState = {};

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initialState);
  return <form action={action} className="login-card password-reset-card">
    <div className="demo-pill"><KeyRound /> Secure recovery</div>
    <h2>Choose a new password</h2>
    <p>The administrator cannot see your password. Enter a new one known only to you.</p>
    <label>New password<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></label>
    <label>Confirm new password<input name="confirmPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></label>
    <p className="password-hint">Use at least 12 characters, including uppercase, lowercase, and a number.</p>
    {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
    <button className="primary full" type="submit" disabled={pending}><KeyRound />{pending ? "Updating…" : "Update password"}</button>
  </form>;
}
