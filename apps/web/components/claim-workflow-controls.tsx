"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Banknote, CircleDollarSign } from "lucide-react";
import type { ClaimDecisionOutcome, ClaimStatus, ClaimWorkflowState } from "@/lib/types";

const initialState: ClaimWorkflowState = {};

type WorkflowAction = (state: ClaimWorkflowState, formData: FormData) => Promise<ClaimWorkflowState>;

function useRefreshAfterSuccess(success?: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (success) router.refresh();
  }, [router, success]);
}

export function ClaimDecisionForm({ action }: { action: WorkflowAction }) {
  const [outcome, setOutcome] = useState<ClaimDecisionOutcome>("APPROVED");
  const [state, formAction, pending] = useActionState(action, initialState);
  useRefreshAfterSuccess(state.success);

  return (
    <section className="decision-card">
      <div className="decision-heading">
        <BadgeCheck />
        <div>
          <h2>Supervisor decision</h2>
          <p>Approve or reject this verified claim. The decision is recorded permanently.</p>
        </div>
      </div>
      <form action={formAction} className="decision-form">
        <label>
          Decision
          <select name="outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as ClaimDecisionOutcome)}>
            <option value="APPROVED">Approve claim</option>
            <option value="REJECTED">Reject claim</option>
          </select>
        </label>
        {outcome === "APPROVED" ? (
          <label>
            Approved amount (MUR)
            <input name="approvedAmount" type="number" min="0.01" step="0.01" required />
          </label>
        ) : <input name="approvedAmount" type="hidden" value="" />}
        <label className="decision-notes">
          Decision notes
          <textarea name="notes" minLength={5} maxLength={2000} rows={4} required placeholder="Explain the reason for this decision…" />
        </label>
        {state.error ? <p className="workflow-error" role="alert">{state.error}</p> : null}
        <button className="primary" type="submit" disabled={pending}>
          <BadgeCheck />{pending ? "Saving decision…" : "Confirm decision"}
        </button>
      </form>
    </section>
  );
}

export function SettlementControls({ action, status }: { action: WorkflowAction; status: ClaimStatus }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  useRefreshAfterSuccess(state.success);
  const target = status === "APPROVED" ? "PAYMENT_PENDING" : "PAID";

  return (
    <section className="assignment-card settlement-card">
      <div>
        {target === "PAYMENT_PENDING" ? <Banknote /> : <CircleDollarSign />}
        <span>
          <b>{target === "PAYMENT_PENDING" ? "Approved for settlement" : "Payment is pending"}</b>
          <small>{target === "PAYMENT_PENDING" ? "Move this approved claim into the payment queue." : "Confirm that settlement has been completed."}</small>
          {state.error ? <small className="workflow-error" role="alert">{state.error}</small> : null}
        </span>
      </div>
      <form action={formAction}>
        <button className="primary" type="submit" name="status" value={target} disabled={pending}>
          {pending ? "Updating…" : target === "PAYMENT_PENDING" ? "Mark payment pending" : "Mark as paid"}
        </button>
      </form>
    </section>
  );
}
