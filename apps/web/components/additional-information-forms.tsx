"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileQuestion, FileText, MessageSquareMore, Send, Upload, X } from "lucide-react";
import type { InformationRequestState, InformationResponseState } from "@/app/(workspace)/claims/actions";

type RequestAction = (state: InformationRequestState, formData: FormData) => Promise<InformationRequestState>;
type ResponseAction = (state: InformationResponseState, formData: FormData) => Promise<InformationResponseState>;

const requestInitialState: InformationRequestState = {};
const responseInitialState: InformationResponseState = {};
const documentOptions = ["Clearer copy of an existing document", "Invoice or receipt", "Prescription or pharmacy document", "Medical certificate", "Claim form", "Other supporting document"];

export function AdditionalInformationRequestForm({ action }: { action: RequestAction }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, requestInitialState);
  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  if (state.success) return <div className="information-success" role="status"><Send /><span><b>Request sent to the client.</b><small>The claim is paused until the client responds.</small></span></div>;
  return <section className="information-form-card">
    <div className="decision-heading"><FileQuestion /><div><h2>Request additional information</h2><p>Ask a specific question or request supporting evidence instead of rejecting an incomplete claim.</p></div></div>
    <form action={formAction} className="information-form">
      <label>Reason shown to the client<input name="reason" minLength={5} maxLength={500} required placeholder="For example: The treatment date is unclear" /></label>
      <label>Questions or instructions<textarea name="questions" minLength={5} maxLength={2000} rows={4} required placeholder="Explain exactly what the client should confirm or upload…" /></label>
      <fieldset><legend>Suggested documents (optional)</legend><div className="information-document-options">{documentOptions.map((option) => <label key={option}><input type="checkbox" name="requiredDocuments" value={option} />{option}</label>)}</div></fieldset>
      <div className="information-form-row"><label>Response deadline (optional)<input name="deadline" type="date" /></label><label>Internal note—hidden from client<textarea name="internalNote" maxLength={2000} rows={2} placeholder="Private operational context…" /></label></div>
      {state.error ? <p className="workflow-error" role="alert">{state.error}</p> : null}
      <button className="primary" type="submit" disabled={pending}><Send />{pending ? "Sending request…" : "Send request"}</button>
    </form>
  </section>;
}

export function AdditionalInformationResponseForm({ action }: { action: ResponseAction }) {
  const [state, formAction, pending] = useActionState(action, responseInitialState);
  const [files, setFiles] = useState<File[]>([]);
  const [fileNotice, setFileNotice] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const syncInput = (nextFiles: File[]) => {
    const transfer = new DataTransfer();
    nextFiles.forEach((file) => transfer.items.add(file));
    if (inputRef.current) inputRef.current.files = transfer.files;
    setFiles(nextFiles);
  };
  const addFiles = (selected: FileList | null) => {
    const unique = [...files];
    for (const file of Array.from(selected ?? [])) {
      if (!unique.some((current) => current.name === file.name && current.size === file.size && current.lastModified === file.lastModified)) unique.push(file);
    }
    const packageSize = unique.reduce((total, file) => total + file.size, 0);
    setFileNotice(unique.length > 8 ? "Upload no more than 8 documents." : packageSize > 18 * 1024 * 1024 ? "The complete response must be under 18 MB." : undefined);
    syncInput(unique.slice(0, 8));
  };
  const removeFile = (removedIndex: number) => syncInput(files.filter((_, index) => index !== removedIndex));

  return <form action={formAction} className="information-response-form">
    <label><MessageSquareMore />Your answer<textarea name="responseText" maxLength={2000} rows={4} placeholder="Answer the Claims Officer’s questions…" /></label>
    <label className="drop information-drop"><Upload /><b>{files.length ? "Add more supporting documents" : "Upload supporting documents"}</b><span>PDF, PNG, JPEG, or DOCX · up to 8 files</span><input ref={inputRef} name="documents" multiple type="file" accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" onChange={(event) => addFiles(event.currentTarget.files)} /></label>
    {files.length ? <div className="selected-documents" aria-live="polite">{files.map((file, index) => <span key={`${file.name}-${file.lastModified}-${index}`}><FileText />{file.name}<small>{(file.size / 1024 / 1024).toFixed(2)} MB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(index)}><X /></button></span>)}</div> : null}
    {fileNotice ? <p className="workflow-error" role="alert">{fileNotice}</p> : null}
    {state.error ? <p className="workflow-error" role="alert">{state.error}</p> : null}
    <button className="primary" type="submit" disabled={pending || Boolean(fileNotice)}><Send />{pending ? "Submitting response…" : "Submit information"}</button>
  </form>;
}
