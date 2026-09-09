"use client";

import { useActionState, useRef, useState } from "react";
import { ArrowRight, FileText, Upload, X } from "lucide-react";
import { createClaim, type ClaimFormState } from "../actions";

const initialState: ClaimFormState = {};

export function ClaimForm() {
  const [state, action, pending] = useActionState(createClaim, initialState);
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
      const duplicate = unique.some((current) => current.name === file.name && current.size === file.size && current.lastModified === file.lastModified);
      if (!duplicate) unique.push(file);
    }
    setFileNotice(unique.length > 3 ? "A claim can contain a maximum of 3 documents." : undefined);
    syncInput(unique.slice(0, 3));
  };
  const removeFile = (removedIndex: number) => syncInput(files.filter((_, index) => index !== removedIndex));
  return <form action={action} className="claim-form-card">
    <label className="drop"><Upload /><b>{files.length ? "Add more claim documents" : "Select claim documents"}</b><span>1–3 PDF, PNG, JPEG, or DOCX files · maximum 6 MB each</span><input ref={inputRef} name="documents" multiple type="file" accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" required onChange={(event) => addFiles(event.currentTarget.files)} /></label>
    {files.length ? <div className="selected-documents" aria-live="polite"><b>{files.length} document{files.length === 1 ? "" : "s"} ready to submit</b>{files.map((file, index) => <span key={`${file.name}-${file.lastModified}-${index}`}><FileText />{file.name}<small>{(file.size / 1024 / 1024).toFixed(2)} MB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(index)}><X /></button></span>)}</div> : null}
    {fileNotice ? <p className="workflow-error" role="alert">{fileNotice}</p> : null}
    {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
    <div className="upload-guidance"><FileText /><p><b>Patient, provider, amount, and dates are extracted automatically.</b><br />Use synthetic data only. Files are stored in a private, owner-scoped Supabase bucket.</p></div>
    <div className="modal-actions"><button className="primary" type="submit" disabled={pending}>{pending ? "Creating claim…" : "Create & process"}<ArrowRight /></button></div>
  </form>;
}
