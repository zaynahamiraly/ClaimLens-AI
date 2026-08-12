"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, ChevronRight,
  CircleUserRound, Clock3, FileCheck2, FileText, LayoutDashboard,
  LogOut, Menu, Plus, Search, ShieldCheck, Sparkles, Upload, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Claim = {
  id: string; patient: string; provider: string; amount: string;
  status: "Review required" | "Processing" | "Verified";
  created: string; warnings: number; progress: number;
};

const initialClaims: Claim[] = [
  { id: "CLM-2026-000142", patient: "Aisha Raman", provider: "Harbour Medical Centre", amount: "MUR 4,580.00", status: "Review required", created: "12 Aug, 09:42", warnings: 1, progress: 100 },
  { id: "CLM-2026-000141", patient: "Noah Chen", provider: "Northshore Clinic", amount: "MUR 2,150.00", status: "Processing", created: "12 Aug, 09:18", warnings: 0, progress: 68 },
  { id: "CLM-2026-000140", patient: "Maya Beeharry", provider: "Wellkin Hospital", amount: "MUR 7,240.00", status: "Verified", created: "11 Aug, 16:36", warnings: 0, progress: 100 },
  { id: "CLM-2026-000139", patient: "Ethan Wong", provider: "City Health Lab", amount: "MUR 1,890.00", status: "Verified", created: "11 Aug, 15:04", warnings: 0, progress: 100 },
];

const fields = [
  ["Patient name", "Aisha Raman", "99%"], ["Member number", "MEM10001", "98%"],
  ["Provider", "Harbour Medical Centre", "99%"], ["Invoice number", "INV-8522", "96%"],
  ["Service date", "12 Jul 2026", "97%"], ["Invoice total", "MUR 4,580.00", "94%"],
];

function Status({ value }: { value: Claim["status"] }) {
  return <span className={`status ${value === "Verified" ? "green" : value === "Processing" ? "blue" : "amber"}`}><i />{value}</span>;
}

export default function Home() {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("officer@claimlens.mu");
  const [view, setView] = useState<"dashboard" | "claims" | "review">("dashboard");
  const [claims, setClaims] = useState(initialClaims);
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [selectedField, setSelectedField] = useState(5);
  const [verified, setVerified] = useState(false);
  const [authError, setAuthError] = useState("");
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!supabase || !signedIn) return;
    supabase.from("claims").select("reference,patient_name,provider_name,claimed_amount,currency,status,warning_count,created_at").order("created_at", { ascending: false }).then(({ data }) => {
      if (!data?.length) return;
      setClaims(data.map(row => ({
        id: row.reference, patient: row.patient_name, provider: row.provider_name,
        amount: row.claimed_amount == null ? "Pending extraction" : `${row.currency} ${Number(row.claimed_amount).toLocaleString("en-MU", { minimumFractionDigits: 2 })}`,
        status: row.status === "VERIFIED" ? "Verified" : row.status === "PROCESSING" || row.status === "UPLOADED" ? "Processing" : "Review required",
        created: new Date(row.created_at).toLocaleString("en-MU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
        warnings: row.warning_count, progress: row.status === "PROCESSING" ? 68 : 100,
      })));
    });
  }, [signedIn, supabase]);

  const filtered = useMemo(() => claims.filter(c => `${c.id} ${c.patient} ${c.provider}`.toLowerCase().includes(query.toLowerCase())), [claims, query]);

  if (!signedIn) return <main className="login-shell">
    <section className="login-brand">
      <div className="brand light"><span><Sparkles size={21}/></span>ClaimLens <b>AI</b></div>
      <div className="hero-copy"><div className="eyebrow"><ShieldCheck size={15}/> Evidence-grounded claims review</div><h1>Every claim.<br/><em>Clearly understood.</em></h1><p>Turn complex health claim documents into structured, traceable decisions—with AI that always shows its work.</p><div className="proof"><div><b>12</b><span>fields extracted</span></div><div><b>40ms</b><span>pilot processing</span></div><div><b>100%</b><span>golden case</span></div></div></div>
      <p className="synthetic">Built for accountable, human-led decisions.</p>
    </section>
    <section className="login-panel"><div className="login-card"><div className="mobile-logo brand"><span><Sparkles size={19}/></span>ClaimLens <b>AI</b></div><div className="demo-pill"><span/> {supabase ? "Supabase connected" : "Demo workspace"}</div><h2>Welcome back</h2><p>Sign in to your claims workspace.</p><form onSubmit={async e => { e.preventDefault(); setAuthError(""); if (!supabase) { setSignedIn(true); return; } const form = new FormData(e.currentTarget); const { error } = await supabase.auth.signInWithPassword({ email, password: String(form.get("password")) }); if (error) setAuthError(error.message); else setSignedIn(true); }}><label>Work email<input value={email} onChange={e => setEmail(e.target.value)} type="email" required/></label><label>Password<input name="password" defaultValue="claimlens-demo" type="password" required/></label>{authError && <p className="auth-error">{authError}</p>}<div className="form-note"><label className="remember"><input type="checkbox" defaultChecked/>Remember me</label><a>Forgot password?</a></div><button className="primary full">Sign in <ArrowRight size={17}/></button></form><div className="demo-note"><Sparkles size={16}/><span><b>{supabase ? "Live workspace" : "Demo access"}</b><br/>{supabase ? "Authentication and claims are backed by Supabase." : "Use the pre-filled credentials to explore."}</span></div></div></section>
  </main>;

  const openReview = () => { setView("review"); setMobile(false); };
  return <div className="app-shell">
    <aside className={mobile ? "sidebar open" : "sidebar"}><div className="brand"><span><Sparkles size={19}/></span>ClaimLens <b>AI</b><button className="side-close" onClick={() => setMobile(false)}><X/></button></div><nav><p>Workspace</p><button className={view === "dashboard" ? "active" : ""} onClick={() => {setView("dashboard");setMobile(false)}}><LayoutDashboard/>Overview</button><button className={view === "claims" ? "active" : ""} onClick={() => {setView("claims");setMobile(false)}}><FileText/>Claims <small>4</small></button><button onClick={openReview} className={view === "review" ? "active" : ""}><FileCheck2/>Review queue <small className="warn">1</small></button><p>Intelligence</p><button><Activity/>Analytics</button><button><ShieldCheck/>Audit trail</button></nav><div className="side-bottom"><div className="system"><span/><div><b>All systems operational</b><small>Pipeline A · v1.0</small></div></div><button className="profile"><CircleUserRound/><div><b>Shuaib</b><small>Claims officer</small></div><ChevronRight/></button></div></aside>
    <main className="workspace"><header><button className="menu" onClick={() => setMobile(true)}><Menu/></button><div><span className="crumb">Workspace /</span> {view === "dashboard" ? "Overview" : view === "claims" ? "Claims" : "AI Review"}</div><div className="header-actions"><button className="icon-btn"><Search/></button><button className="avatar">SH</button><button className="icon-btn" onClick={() => setSignedIn(false)} title="Sign out"><LogOut/></button></div></header>
      {view === "review" ? <Review verified={verified} setVerified={setVerified} selected={selectedField} setSelected={setSelectedField}/> : <div className="content">
        <div className="title-row"><div><p className="kicker">{view === "dashboard" ? "Operations overview" : "Claim management"}</p><h1>{view === "dashboard" ? "Good morning, Shuaib." : "Claims"}</h1><p>{view === "dashboard" ? "Here’s what needs your attention today." : "Track, process and review every claim package."}</p></div><button className="primary" onClick={() => setNewOpen(true)}><Plus/>New claim</button></div>
        {view === "dashboard" && <><section className="metrics"><article><div className="metric-icon amber"><AlertTriangle/></div><span>Review required</span><strong>1</strong><small><b>Action needed</b> before verification</small></article><article><div className="metric-icon blue"><Clock3/></div><span>In processing</span><strong>1</strong><small>Average pipeline time <b>2.4s</b></small></article><article><div className="metric-icon green"><CheckCircle2/></div><span>Verified today</span><strong>2</strong><small><b>12 fields</b> checked per claim</small></article><article><div className="metric-icon violet"><Activity/></div><span>Pilot accuracy</span><strong>100%</strong><small>Golden dataset · <b>12/12</b></small></article></section><section className="attention" onClick={openReview}><div className="attention-icon"><Sparkles/></div><div><span>Ready for human review</span><h3>CLM-2026-000142 · Aisha Raman</h3><p>One amount mismatch needs your attention. Source evidence is ready.</p></div><button>Review claim <ArrowRight/></button></section></>}
        <section className="table-card"><div className="table-head"><div><h2>{view === "dashboard" ? "Recent claims" : "All claims"}</h2><p>{view === "dashboard" ? "Latest activity across your workspace" : `${filtered.length} claims in this workspace`}</p></div><div className="search"><Search/><input placeholder="Search claims..." value={query} onChange={e => setQuery(e.target.value)}/></div></div><div className="table-scroll"><table><thead><tr><th>Claim</th><th>Patient & provider</th><th>Amount</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>{filtered.map(c => <tr key={c.id} onClick={() => c.id.endsWith("142") && openReview()}><td><b>{c.id}</b>{c.warnings > 0 && <small className="warning-text"><AlertTriangle/> {c.warnings} warning</small>}</td><td><b>{c.patient}</b><small>{c.provider}</small></td><td><b>{c.amount}</b></td><td><Status value={c.status}/>{c.status === "Processing" && <div className="progress"><i style={{width:`${c.progress}%`}}/></div>}</td><td>{c.created}</td><td><ChevronRight/></td></tr>)}</tbody></table></div><button className="view-all" onClick={() => setView("claims")}>View all claims <ArrowRight/></button></section>
      </div>}
    </main>
    {newOpen && <NewClaim onClose={() => setNewOpen(false)} onCreate={async (claim, files) => {
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Your session has expired. Please sign in again.");
        const { data: inserted, error } = await supabase.from("claims").insert({ reference: claim.id, created_by: user.id, patient_name: claim.patient, provider_name: claim.provider, status: "PROCESSING" }).select("id").single();
        if (error) throw error;
        for (const file of files) {
          const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${user.id}/${inserted.id}/${crypto.randomUUID()}-${safe}`;
          const { error: uploadError } = await supabase.storage.from("claim-documents").upload(path, file, { contentType: file.type, upsert: false });
          if (uploadError) throw uploadError;
          const { error: documentError } = await supabase.from("claim_documents").insert({ claim_id: inserted.id, uploaded_by: user.id, document_type: "UNKNOWN", original_name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size });
          if (documentError) throw documentError;
        }
      }
      setClaims([claim,...claims]);setNewOpen(false);setView("claims");
    }}/>} {null}
  </div>;
}

function NewClaim({onClose,onCreate}:{onClose:()=>void;onCreate:(c:Claim,files:File[])=>Promise<void>}) {
  const [patient,setPatient]=useState(""); const [provider,setProvider]=useState(""); const [files,setFiles]=useState<File[]>([]); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  return <div className="modal-backdrop"><section className="modal"><div className="modal-head"><div><span className="kicker">New package</span><h2>Create a claim</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><div className="form-grid"><label>Patient name<input value={patient} onChange={e=>setPatient(e.target.value)} placeholder="Full synthetic name"/></label><label>Provider<input value={provider} onChange={e=>setProvider(e.target.value)} placeholder="Medical provider"/></label></div><label className="drop"><Upload/><b>Drop claim documents here</b><span>PDF, PNG or JPEG · maximum 10 MB each</span><input multiple type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e=>setFiles(Array.from(e.target.files||[]).filter(file=>file.size<=10485760))}/></label>{files.length>0&&<div className="file-list">{files.map(f=><span key={f.name}><FileText/>{f.name}<b>{(f.size/1024).toFixed(0)} KB</b></span>)}</div>}{error&&<p className="auth-error">{error}</p>}<div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy||!patient||!provider||files.length===0} onClick={async()=>{setBusy(true);setError("");try{await onCreate({id:`CLM-2026-${String(Date.now()).slice(-6)}`,patient,provider,amount:"Pending extraction",status:"Processing",created:"Just now",warnings:0,progress:12},files)}catch(reason){setError(reason instanceof Error?reason.message:"Could not create claim");setBusy(false)}}}>{busy?"Uploading…":"Create & process"} <ArrowRight/></button></div></section></div>;
}

function Review({verified,setVerified,selected,setSelected}:{verified:boolean;setVerified:(v:boolean)=>void;selected:number;setSelected:(v:number)=>void}) {
  return <div className="review"><div className="review-top"><div><button className="back">← Review queue</button><h1>CLM-2026-000142</h1><p>Aisha Raman · Harbour Medical Centre</p></div><div><span className="status amber"><i/>Review required</span><button className="primary" onClick={()=>setVerified(true)} disabled={verified}>{verified?<><CheckCircle2/>Verified</>:<>Verify claim <ArrowRight/></>}</button></div></div><div className="review-grid"><section className="document"><div className="doc-toolbar"><div><FileText/> invoice.pdf</div><span>Page 1 of 1 · 100%</span></div><div className="paper"><div className="paper-brand">Harbour Medical Centre<small>Synthetic Tax Invoice</small></div><div className="paper-row"><b>Invoice number</b><span>INV-8522</span></div><div className="paper-row"><b>Invoice date</b><span>14/07/2026</span></div><div className="paper-row"><b>Patient</b><span>Aisha Raman</span></div><div className="invoice-lines"><b>Description <span>Amount (MUR)</span></b><p>Medical consultation <span>1,500.00</span></p><p>Laboratory tests <span>3,080.00</span></p></div><div className={selected===5?"highlight":"total"}><b>Invoice total</b><strong>MUR 4,580.00</strong></div><small className="service">Service date: 12 July 2026</small></div></section><section className="extraction"><div className="extract-head"><div><span className="kicker">Pipeline A · completed in 40ms</span><h2>Extracted fields</h2></div><span className="score"><Sparkles/>12/12</span></div><div className="alert"><AlertTriangle/><div><b>Cross-document check</b><p>Receipt amount needs human confirmation.</p></div></div><div className="field-list">{fields.map((f,i)=><button key={f[0]} className={selected===i?"selected":""} onClick={()=>setSelected(i)}><div><span>{f[0]}</span><b>{f[1]}</b></div><small>{f[2]}<ChevronRight/></small></button>)}</div><div className="evidence"><ShieldCheck/><div><b>Evidence linked</b><p>Selected value located on invoice.pdf, page 1. Original AI prediction is preserved in the audit trail.</p></div></div></section></div></div>;
}
