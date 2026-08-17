"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ demoMode, configured, next }: { demoMode: boolean; configured: boolean; next?: string }) {
  const [state, action, pending] = useActionState(login, initialState);
  const enabled = demoMode || configured;

  return (
    <div className="login-card">
      <div className="mobile-logo brand"><span><Sparkles size={19} /></span>ClaimLens <b>AI</b></div>
      <div className="demo-pill"><span /> {demoMode ? "Synthetic demo" : configured ? "Secure workspace" : "Setup required"}</div>
      <h2>Welcome back</h2>
      <p>Sign in to your claims workspace.</p>
      <form action={action}>
        <input type="hidden" name="next" value={next ?? "/dashboard"} />
        <label htmlFor="email">Work email<input id="email" name="email" defaultValue={demoMode ? "officer@claimlens.mu" : ""} type="email" autoComplete="email" required disabled={!enabled} /></label>
        <label htmlFor="password">Password<input id="password" name="password" defaultValue={demoMode ? "claimlens-demo" : ""} type="password" autoComplete="current-password" minLength={8} required disabled={!enabled} /></label>
        {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
        <button className="primary full" type="submit" disabled={!enabled || pending}>{pending ? "Signing in…" : "Sign in"} <ArrowRight size={17} /></button>
      </form>
      {!demoMode && configured ? <p className="auth-switch">New to ClaimLens? <Link href="/signup">Create a client account</Link></p> : null}
      <div className="demo-note"><Sparkles size={16} /><span><b>{demoMode ? "Demo access" : configured ? "Supabase authentication" : "Configuration missing"}</b><br />{demoMode ? "Use the pre-filled synthetic credentials." : configured ? "Your session is protected with server-managed cookies." : "Add the Supabase URL and publishable key in Vercel."}</span></div>
    </div>
  );
}
