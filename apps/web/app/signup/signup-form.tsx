"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { signup, type SignupState } from "./actions";

const initialState: SignupState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, initialState);

  return <div className="login-card">
    <div className="demo-pill"><span /> Secure client registration</div>
    <h2>Create your account</h2>
    <p>Register to submit and track your own claims.</p>
    {state.success ? <div className="auth-success" role="status"><ShieldCheck /> <span><b>Confirmation email sent</b>{state.success}</span></div> : <form action={action}>
      <label htmlFor="displayName">Full name<input id="displayName" name="displayName" autoComplete="name" minLength={2} maxLength={120} required /></label>
      <label htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" required /></label>
      <label htmlFor="password">Password<input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
      <p className="password-hint">Use at least 8 characters.</p>
      {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
      <button className="primary full" type="submit" disabled={pending}>{pending ? "Creating account…" : "Create client account"} <ArrowRight size={17} /></button>
    </form>}
    <p className="auth-switch">Already registered? <Link href="/login">Sign in</Link></p>
    <div className="demo-note"><ShieldCheck /><span><b>Client access only</b><br />Registration cannot grant staff or administrator permissions. Your claim data remains private to your account.</span></div>
  </div>;
}
