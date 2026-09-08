"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { createUser, type UserActionState } from "./actions";

const initialState: UserActionState = {};

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, initialState);
  return <form action={action} className="admin-form">
    <div><h2>Create account</h2><p>Create a confirmed Supabase user and assign the correct workspace role.</p></div>
    <div className="form-grid">
      <label>Display name<input name="displayName" minLength={2} maxLength={120} required /></label>
      <label>Email<input name="email" type="email" autoComplete="off" required /></label>
      <label>Role<select name="role" defaultValue="client"><option value="client">Client</option><option value="claims_officer">Claims Officer</option><option value="supervisor">Supervisor</option><option value="administrator">Administrator</option></select></label>
      <label>Temporary password<input name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required /></label>
    </div>
    {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
    {state.success ? <p className="success-banner" role="status">{state.success}</p> : null}
    <button className="primary" type="submit" disabled={pending}><UserPlus />{pending ? "Creating…" : "Create user"}</button>
  </form>;
}
