"use client";
/**
 * ClinicFlow AI - prototype (Next.js App Router, Tailwind, lucide-react).
 * Region-neutral: currency, avg. appointment value and 12h times are settings, not hardcoded.
 *
 * SUPABASE MAP (swap the useState seeds + setters for queries/mutations):
 *   appointments(id, patient, phone, treatment, date, time, status, doctor_id)
 *   doctors(id, name, role)          blocked_slots(doctor_id, time)
 *   reminder_rules(id, label, on)    clinic_settings(currency, avg_value, prevented_count)
 */
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, MessageCircle, CalendarClock, CheckCheck, BellRing,
  ShieldCheck, Send, Phone, Video, CalendarCheck, Clock, CheckCircle2, X, Stethoscope, Moon, Sun, Eye, EyeOff, Loader2, LogOut,
} from "lucide-react";
import "./dark.css";
import { useLive } from "../lib/useLive";
import { supabase } from "../lib/supabase-browser";

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, "0");
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const t12 = (t) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };
const SLOTS = Array.from({ length: 18 }, (_, i) => { const m = 540 + i * 30; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; });
const TODAY = () => dkey(new Date());
const dayLabel = (k) => {
  const d = new Date(k + "T12:00:00");
  if (k === TODAY()) return "Today";
  if (k === dkey(addDays(1))) return "Tomorrow";
  return d.toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" });
};
const longDay = (k) => k === TODAY() ? "today" : k === dkey(addDays(1)) ? "tomorrow" : new Date(k + "T12:00:00").toLocaleDateString("en", { weekday: "long", day: "numeric", month: "short" });
const byDT = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);

const CLINIC = "Dr. Sarah Ahmed's Aesthetic & Dental Clinic";
const PATIENT = { name: "Ayesha Khan", phone: "+92 300 1234567" };
const CURRENCIES = ["PKR", "USD", "GBP", "EUR", "AED", "SAR", "CAD", "AUD", "INR"];
const TREATMENTS = [
  { name: "Teeth Whitening", kw: ["whiten"] }, { name: "Dental Cleaning", kw: ["clean", "scal"] },
  { name: "Botox", kw: ["botox"] }, { name: "Dermal Filler", kw: ["filler"] },
  { name: "Root Canal", kw: ["root"] }, { name: "Consultation", kw: ["consult"] },
  { name: "HydraFacial", kw: ["facial"] }, { name: "Braces Check-up", kw: ["brace"] },
];
const DOCTORS = [
  { id: "d1", name: "Dr. Sarah Ahmed", role: "Aesthetic & Dental Surgeon" },
  { id: "d2", name: "Dr. Omar Malik", role: "Orthodontist" },
];
const TONE = {
  Confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Reminder Sent": "bg-sky-50 text-sky-700 ring-sky-200",
  Rescheduled: "bg-violet-50 text-violet-700 ring-violet-200",
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
};

/* ---------- mock data ---------- */
const TODAY_ROWS = [
  ["Daniel Brooks", "+1 415 555 0142", "Dental Cleaning", "Confirmed"],
  ["Fatima Noor", "+92 321 5550188", "Botox", "Confirmed"],
  ["Priya Sharma", "+44 7700 900451", "HydraFacial", "Confirmed"],
  ["Omar Farooq", "+971 50 555 0137", "Root Canal", "Rescheduled"],
  ["Emily Carter", "+61 412 555 019", "Teeth Whitening", "Confirmed"],
  ["Hassan Raza", "+92 333 5550126", "Consultation", "Confirmed"],
  ["Sofia Martinez", "+34 612 555 014", "Dermal Filler", "Confirmed"],
  ["Bilal Ahmed", "+92 345 5550173", "Braces Check-up", "Confirmed"],
  ["Chloe Nguyen", "+1 646 555 0190", "Dental Cleaning", "Confirmed"],
  ["Zainab Ali", "+966 55 555 0164", "Botox", "Confirmed"],
  [PATIENT.name, PATIENT.phone, "Teeth Whitening", "Pending"],
  ["Liam O'Connor", "+353 85 555 0128", "Consultation", "Confirmed"],
  ["Maryam Siddiqui", "+92 300 5550155", "HydraFacial", "Confirmed"],
  ["Hannah Weber", "+49 151 5550117", "Dental Cleaning", "Confirmed"],
  ["Usman Tariq", "+92 312 5550182", "Root Canal", "Pending"],
  ["Aisha Rahman", "+44 7700 900622", "Dermal Filler", "Confirmed"],
  ["Ahmed Khalil", "+971 55 555 0191", "Braces Check-up", "Confirmed"],
  ["Noor Fatima", "+92 301 5550139", "Teeth Whitening", "Confirmed"],
];
const TOMORROW_ROWS = [[0, "Sara Lindqvist", "+46 70 555 0120", "Consultation", "Reminder Sent"], [2, "Imran Qureshi", "+92 322 5550171", "Dental Cleaning", "Confirmed"],
  [5, "Grace Okafor", "+234 802 555 0166", "Botox", "Confirmed"], [8, "Yusuf Demir", "+90 532 555 0143", "Root Canal", "Reminder Sent"], [12, "Mia Johansson", "+1 212 555 0108", "HydraFacial", "Confirmed"]];
const seedAppts = () => [
  ...TODAY_ROWS.map(([patient, phone, treatment, status], i) => ({ id: `t${i}`, patient, phone, treatment, status, date: TODAY(), time: SLOTS[i] })),
  ...TOMORROW_ROWS.map(([s, patient, phone, treatment, status], i) => ({ id: `m${i}`, patient, phone, treatment, status, date: dkey(addDays(1)), time: SLOTS[s] })),
];
const SEED_RULES = [
  { id: "r24", label: "24 hours before", desc: "Ask the patient to confirm or reschedule on WhatsApp.", on: true },
  { id: "r2", label: "2 hours before", desc: "Final reminder with arrival and parking details.", on: true },
  { id: "rw", label: "Offer freed slots to waitlist", desc: "When someone cancels, message the next waiting patient.", on: false },
];

/* ---------- small UI ---------- */
const Badge = ({ s }) => <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TONE[s]}`}>{s}</span>;
const Toggle = ({ on, onChange, label }) => (
  <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-sky-600" : "bg-slate-300"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600`}>
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
  </button>
);
const DateChips = ({ value, onChange }) => (
  <div className="flex gap-2 overflow-x-auto pb-1">
    {Array.from({ length: 7 }, (_, i) => dkey(addDays(i))).map((k) => (
      <button key={k} onClick={() => onChange(k)}
        className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition ${value === k ? "bg-sky-600 text-white ring-sky-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-sky-50"}`}>{dayLabel(k)}</button>
    ))}
  </div>
);

/* ---------- schedule ---------- */
function Schedule({ appts, date, setDate, onRemind }) {
  const rows = appts.filter((a) => a.date === date).sort(byDT);
  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="space-y-3 border-b border-slate-100 p-4">
        <h2 className="text-lg font-semibold text-slate-900">{date === TODAY() ? "Today's schedule" : `Schedule for ${dayLabel(date)}`}</h2>
        <DateChips value={date} onChange={setDate} />
      </div>
      <div className="hidden grid-cols-[1.4fr_1.2fr_1.2fr_.8fr_1.5fr] gap-3 px-4 py-2 text-xs font-medium text-slate-500 md:grid">
        <span>Patient</span><span>Phone</span><span>Treatment</span><span>Time</span><span>WhatsApp status</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.length === 0 && <li className="p-8 text-center text-sm text-slate-500">No appointments yet. Book one from the WhatsApp simulator.</li>}
        {rows.map((a) => (
          <li key={a.id} className={`grid gap-1 px-4 py-3 md:grid-cols-[1.4fr_1.2fr_1.2fr_.8fr_1.5fr] md:items-center md:gap-3 ${a.isNew ? "bg-sky-50/70" : ""}`}>
            <span className="font-medium text-slate-900">{a.patient}</span>
            <span className="text-sm text-slate-500">{a.phone}</span>
            <span className="text-sm text-slate-700">{a.treatment}</span>
            <span className="text-sm font-medium text-slate-700">{t12(a.time)}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 md:mt-0">
              <Badge s={a.status} />
              {a.status === "Pending" && (
                <button onClick={() => onRemind(a.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                  <BellRing size={13} /> Send 24h WhatsApp Reminder
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- whatsapp simulator ---------- */
const QUICK = ["Book Teeth Whitening tomorrow at 4 PM", "Confirm my 2 PM appointment", "Reschedule to Friday"];
function Chat({ onMessage }) {
  const [msgs, setMsgs] = useState([{ id: 0, from: "bot", text: `Hi ${PATIENT.name.split(" ")[0]}! I'm the virtual receptionist at ${CLINIC}. I can book, confirm or reschedule your visit. How can I help?`, at: "9:00 AM" }]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const box = useRef(null);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [msgs, typing]);
  const now = () => t12(`${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`);
  const send = (t) => {
    const v = t.trim(); if (!v || typing) return;
    setMsgs((m) => [...m, { id: Date.now(), from: "me", text: v, at: now() }]); setText(""); setTyping(true);
    setTimeout(async () => { let r; try { r = await onMessage(v); } catch { r = "Could not reach the server. Please try again."; } setTyping(false); setMsgs((m) => [...m, { id: Date.now() + 1, from: "bot", text: r, at: now() }]); }, 1000);
  };
  return (
    <section className="flex h-[calc(100dvh-13rem)] max-h-[640px] min-h-[440px] flex-col overflow-hidden rounded-2xl ring-1 ring-slate-200">
      <header className="flex items-center gap-3 bg-[#008069] px-4 py-3 text-white">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-white/20"><Stethoscope size={20} /></div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{CLINIC}</p><p className="text-xs text-emerald-100">{typing ? "typing..." : "AI receptionist - online"}</p></div>
        <Video size={18} /><Phone size={18} />
      </header>
      <div ref={box} className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2] p-3">
        <p className="mx-auto w-fit rounded-lg bg-[#fff5c4] px-3 py-1 text-center text-xs text-slate-600">Testing as {PATIENT.name} ({PATIENT.phone})</p>
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : ""}`}>
            <div className={`max-w-[82%] rounded-xl px-3 py-2 text-sm shadow-sm ${m.from === "me" ? "bg-[#d9fdd3]" : "bg-white"} text-slate-800`}>
              <p className="whitespace-pre-line">{m.text}</p>
              <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-slate-500">{m.at}{m.from === "me" && <CheckCheck size={14} className="text-sky-500" />}</p>
            </div>
          </div>
        ))}
        {typing && <div className="w-fit rounded-xl bg-white px-4 py-3 shadow-sm"><span className="flex gap-1">{[0, 1, 2].map((i) => <i key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 150}ms` }} />)}</span></div>}
      </div>
      <div className="space-y-2 bg-slate-100 p-3">
        <div className="flex flex-wrap gap-2">{QUICK.map((q) => <button key={q} onClick={() => send(q)} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200 hover:bg-sky-50">{q}</button>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message, e.g. Book botox Friday 11 AM" className="min-w-0 flex-1 rounded-full bg-white px-4 py-2.5 text-base outline-none sm:text-sm ring-1 ring-slate-200 focus:ring-sky-400" />
          <button aria-label="Send" className="grid h-10 w-10 place-items-center rounded-full bg-[#008069] text-white"><Send size={17} /></button>
        </form>
      </div>
    </section>
  );
}

/* ---------- app ---------- */
function DarkToggle() {
  const [dark, setDark] = useState(false);
  const apply = (on) => document.documentElement.classList.toggle("dark", on);
  useEffect(() => {
    let saved = null; try { saved = localStorage.getItem("cf-dark"); } catch {}
    const on = saved ? saved === "1" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(on); apply(on);
  }, []);
  const flip = () => { const on = !dark; setDark(on); apply(on); try { localStorage.setItem("cf-dark", on ? "1" : "0"); } catch {} };
  return (
    <button onClick={flip} aria-label="Toggle dark mode" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export default function Page() {
  const live = useLive(); // live mode only when Supabase env vars are set; otherwise demo data
  if (live.enabled && !live.ready) return null;
  if (live.enabled && !live.session) return <AuthScreen />;
  if (live.enabled && live.loading) return null;
  if (live.enabled && live.needsSetup) return <Onboard live={live} />;
  return <App live={live.enabled ? live : null} />;
}

const field = "w-full rounded-lg bg-white px-3.5 py-2.5 text-base sm:text-sm text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500";
const CURS = ["PKR", "USD", "GBP", "EUR", "AED", "SAR", "CAD", "AUD", "INR"];

function friendly(msg = "") {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Incorrect email or password.";
  if (m.includes("invalid api key") || m.includes("apikey")) return "The app cannot reach its database because the Supabase key in the deployment settings is wrong. Please contact support.";
  if (m.includes("not confirmed")) return "Please confirm your email first. Check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Try signing in instead.";
  if (m.includes("at least")) return msg;
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("fetch") || m.includes("network")) return "Cannot connect. Check your internet connection and try again.";
  return msg || "Something went wrong. Please try again.";
}

function AuthShell({ children }) {
  const points = ["Automatic 24h and 2h WhatsApp reminders", "Patients book and reschedule by chat, in their own language", "A live schedule your whole team can trust"];
  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.05fr_1fr]">
      <div className="fixed right-4 top-4 z-10"><DarkToggle /></div>
      <div className="hidden flex-col justify-between p-12 text-white lg:flex" style={{ background: "linear-gradient(145deg,#075985,#0c4a6e 60%,#082f49)" }}>
        <div className="flex items-center gap-2.5"><div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><MessageCircle size={19} /></div><span className="text-lg font-semibold">ClinicFlow AI</span></div>
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-semibold leading-tight">Fewer no-shows. A calmer front desk.</h2>
          <p className="text-sky-100">An AI receptionist on your clinic WhatsApp that books, confirms and reschedules patients around the clock.</p>
          <ul className="space-y-3 text-sm text-sky-50">{points.map((t) => <li key={t} className="flex items-center gap-2.5"><CheckCircle2 size={18} className="shrink-0 text-sky-300" />{t}</li>)}</ul>
        </div>
        <p className="text-xs text-sky-200">Powered by Innoletics</p>
      </div>
      <div className="flex items-start justify-center px-4 pt-24 sm:pt-[16vh]">{children}</div>
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("in");
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [show, setShow] = useState(false);
  const [err, setErr] = useState(""), [info, setInfo] = useState(""), [busy, setBusy] = useState(false);
  const switchMode = (m) => { setMode(m); setErr(""); setInfo(""); };
  const submit = async (e) => {
    e.preventDefault(); if (busy) return;
    setErr(""); setInfo(""); setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) setErr(friendly(error.message));
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw });
        if (error) setErr(friendly(error.message));
        else if (data.user?.identities?.length === 0) setErr(friendly("already registered"));
        else if (!data.session) { setInfo("Account created. Check your email to confirm it, then sign in."); setMode("in"); }
      }
    } catch (x) { setErr(friendly(String(x?.message || x))); }
    setBusy(false);
  };
  return (
    <AuthShell>
      <form onSubmit={submit} className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6 flex items-center gap-2.5 lg:hidden"><div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-600 text-white"><MessageCircle size={19} /></div><span className="text-lg font-semibold text-slate-900">ClinicFlow AI</span></div>
        <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
          {[["in", "Sign in"], ["up", "Create account"]].map(([m, l]) => (
            <button type="button" key={m} onClick={() => switchMode(m)} className={`rounded-md py-2 transition ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
          ))}
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{mode === "in" ? "Welcome back" : "Start with ClinicFlow"}</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">{mode === "in" ? "Sign in to your clinic dashboard." : "Create your account in under a minute."}</p>
        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input className={`${field} mb-4`} type="email" autoComplete="email" placeholder="you@clinic.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
        <div className="relative mb-6">
          <input className={`${field} pr-11`} type={show ? "text" : "password"} autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder={mode === "in" ? "Your password" : "At least 6 characters"} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-70">
          {busy && <Loader2 size={16} className="animate-spin" />}{mode === "in" ? "Sign in" : "Create account"}
        </button>
        {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{err}</p>}
        {info && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">{info}</p>}
        <p className="mt-6 text-center text-xs text-slate-400">Powered by <b className="font-semibold text-slate-600">Innoletics</b></p>
      </form>
    </AuthShell>
  );
}

function Onboard({ live }) {
  const tz0 = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  if (!zones.includes(tz0)) zones.unshift(tz0);
  const [f, setF] = useState({ name: "", doctor: "", timezone: tz0, currency: "USD", avg_value: 100 });
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (e) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErr("");
    const r = await live.onboard({ ...f, avg_value: Number(f.avg_value) });
    if (!r.ok) setErr(r.error || "Could not create your clinic."); setBusy(false);
  };
  const L = (t) => <label className="mb-1 block text-sm font-medium text-slate-700">{t}</label>;
  return (
    <AuthShell>
      <form onSubmit={go} className="w-full max-w-[400px] rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Set up your clinic</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">These details can be changed later.</p>
        {L("Clinic name")}<input className={`${field} mb-4`} placeholder="Smile & Glow Clinic" value={f.name} onChange={set("name")} required />
        {L("Lead doctor")}<input className={`${field} mb-4`} placeholder="Dr. Jane Smith" value={f.doctor} onChange={set("doctor")} required />
        {L("Timezone")}<select className={`${field} mb-4`} value={f.timezone} onChange={set("timezone")}>{zones.map((z) => <option key={z}>{z}</option>)}</select>
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div>{L("Currency")}<select className={field} value={f.currency} onChange={set("currency")}>{CURS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div>{L("Avg. visit value")}<input className={field} type="number" min="0" value={f.avg_value} onChange={set("avg_value")} /></div>
        </div>
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-70">{busy && <Loader2 size={16} className="animate-spin" />}Create clinic</button>
        {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{err}</p>}
        <button type="button" onClick={live.signOut} className="mt-5 block w-full text-center text-sm text-slate-500 hover:text-slate-700">Use a different account</button>
      </form>
    </AuthShell>
  );
}

function App({ live }) {
  const [tab, setTab] = useState("dash");
  const [localAppts, setAppts] = useState(seedAppts);
  const appts = live ? live.appts : localAppts;
  const [date, setDate] = useState(TODAY());
  const [localBlocked, setBlocked] = useState({ d1: ["13:00", "13:30"], d2: [] });
  const blocked = live ? live.blocked : localBlocked;
  const [docSel, setDoc] = useState("d1");
  const doctors = live ? live.doctors : DOCTORS;
  const doc = doctors.find((d) => d.id === docSel)?.id ?? doctors[0]?.id;
  const [manageDate, setManageDate] = useState(TODAY());
  const [localRules, setRules] = useState(SEED_RULES);
  const rules = live ? live.rules : localRules;
  const [cur, setCur] = useState("PKR");
  const [avg, setAvg] = useState(5000);
  useEffect(() => { if (live?.clinic) { setCur(live.clinic.currency); setAvg(Number(live.clinic.avg_value)); } }, [live?.clinic?.id]); // eslint-disable-line
  const [localSaved, setSaved] = useState(24);
  const saved = live ? live.saved : localSaved;
  const [toasts, setToasts] = useState([]);
  const ref = useRef(appts); ref.current = appts;

  const toast = (title, body) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, body }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };
  const patch = (id, p) => setAppts((a) => a.map((x) => (x.id === id ? { ...x, ...p, isNew: false } : x)));
  const money = (n) => new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0, currencyDisplay: "code" }).format(n);

  const remind = async (id) => {
    const a = appts.find((x) => x.id === id);
    if (live) { const r = await live.remind(id); return toast(r.ok ? "WhatsApp reminder sent" : "Reminder not sent", r.ok ? `${a.patient} (${a.phone}) was asked to confirm.` : r.error || "Check WhatsApp settings."); }
    patch(id, { status: "Reminder Sent" });
    toast("WhatsApp reminder delivered", `${a.patient} (${a.phone}) was asked to confirm their ${t12(a.time)} ${a.treatment}.`);
  };

  /* AI receptionist: intent + entity parsing, mutates schedule, returns reply text */
  const isFree = (d, t, ignore) => SLOTS.includes(t) && !blocked.d1.includes(t) && !ref.current.some((a) => a.id !== ignore && a.date === d && a.time === t && a.status !== "Cancelled");
  const alts = (d, t, ignore) => SLOTS.filter((s) => isFree(d, s, ignore)).sort((a, b) => Math.abs(toMin(a) - toMin(t)) - Math.abs(toMin(b) - toMin(t))).slice(0, 3).sort();
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const parseTime = (q) => { const m = q.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/); if (!m) return null; let h = (+m[1]) % 12 + (m[3] === "pm" ? 12 : 0); const r = Math.round((h * 60 + +(m[2] || 0)) / 30) * 30; return `${pad(Math.floor(r / 60))}:${pad(r % 60)}`; };
  const parseDate = (q) => {
    if (/\btoday\b/.test(q)) return TODAY(); if (/tomorrow/.test(q)) return dkey(addDays(1));
    const i = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].findIndex((d) => new RegExp(`\\b${d}`).test(q));
    return i < 0 ? null : dkey(addDays(((i - new Date().getDay() + 7) % 7) || 7));
  };
  const suggest = (d, t, ignore) => { const s = alts(d, t, ignore); return s.length ? `I have ${s.map(t12).join(", ")} free ${longDay(d)}. Which works for you?` : `Nothing is free ${longDay(d)}. Want to try another day?`; };

  const onMessage = (raw) => {
    const q = raw.toLowerCase(), time = parseTime(q), d = parseDate(q);
    const treat = TREATMENTS.find((t) => t.kw.some((k) => q.includes(k)));
    const mine = ref.current.filter((a) => a.phone === PATIENT.phone && a.status !== "Cancelled").sort(byDT);

    if (/cancel/.test(q)) {
      const a = (time && mine.find((x) => x.time === time)) || mine[0];
      if (!a) return "I couldn't find an upcoming appointment under your number.";
      patch(a.id, { status: "Cancelled" }); toast("Slot released", `${a.patient} cancelled ${t12(a.time)} ${dayLabel(a.date)}.`);
      return `Done - your ${t12(a.time)} appointment ${longDay(a.date)} is cancelled. Reply "book" any time to pick a new slot.`;
    }
    if (/resched|move|change/.test(q)) {
      const a = mine[0]; if (!a) return "I couldn't find an upcoming appointment to move. Would you like to book one?";
      const nd = d || a.date, nt = time || a.time;
      if (!isFree(nd, nt, a.id)) return `Sorry, ${t12(nt)} ${longDay(nd)} isn't available. ${suggest(nd, nt, a.id)}`;
      patch(a.id, { date: nd, time: nt, status: "Rescheduled" }); setDate(nd); setSaved((s) => s + 1);
      toast("Appointment rescheduled by AI", `${a.patient} moved to ${dayLabel(nd)}, ${t12(nt)}.`);
      return `No problem! I've moved your ${a.treatment} to ${longDay(nd)} at ${t12(nt)}. You'll get a reminder 24 hours before. See you then!`;
    }
    if (/confirm|\byes\b|i'll be there/.test(q)) {
      const a = time ? mine.find((x) => x.time === time) : mine.find((x) => ["Pending", "Reminder Sent"].includes(x.status)) || mine[0];
      if (!a) return `I couldn't find an appointment${time ? ` at ${t12(time)}` : ""} under your number. Want me to book one?`;
      if (["Pending", "Reminder Sent"].includes(a.status)) setSaved((s) => s + 1);
      patch(a.id, { status: "Confirmed" }); setDate(a.date);
      toast("Confirmed via WhatsApp", `${a.patient} confirmed ${t12(a.time)} ${a.treatment}.`);
      return `Thank you, ${a.patient.split(" ")[0]}! Your ${a.treatment} ${longDay(a.date)} at ${t12(a.time)} is confirmed. Please arrive 10 minutes early.`;
    }
    if (/book|appoint|schedule|slot|\bsee\b/.test(q) || treat) {
      if (!d) return "Happy to help! Which day would you like - today, tomorrow, or a weekday?";
      if (!time) return `Sure. What time ${longDay(d)}? ${suggest(d, "12:00")}`;
      if (!isFree(d, time)) return `Sorry, ${t12(time)} ${longDay(d)} isn't available. ${suggest(d, time)}`;
      const t = treat?.name || "Consultation";
      setAppts((a) => [...a, { id: `n${Date.now()}`, patient: PATIENT.name, phone: PATIENT.phone, treatment: t, date: d, time, status: "Confirmed", isNew: true }]); setDate(d);
      toast("New booking via WhatsApp", `${PATIENT.name} booked ${t} - ${dayLabel(d)}, ${t12(time)}.`);
      return `You're booked! ${t} ${longDay(d)} at ${t12(time)} with Dr. Sarah Ahmed at ${CLINIC}. I'll remind you 24 hours before. Reply "reschedule" if plans change.`;
    }
    return "I can help you book, confirm, reschedule or cancel an appointment. Try \"Book Botox Friday at 11 AM\".";
  };

  /* derived KPIs */
  const todays = appts.filter((a) => a.date === TODAY() && a.status !== "Cancelled");
  const cnt = (s) => todays.filter((a) => a.status === s).length;
  const kpis = [
    { label: "Today's appointments", v: todays.length, icon: CalendarCheck, c: "text-sky-600 bg-sky-50" },
    { label: "Confirmed via WhatsApp", v: cnt("Confirmed"), icon: CheckCircle2, c: "text-emerald-600 bg-emerald-50" },
    { label: "Pending reminder", v: cnt("Pending"), icon: Clock, c: "text-amber-600 bg-amber-50" },
    { label: "Prevented no-shows this month", v: saved, sub: `${money(saved * avg)} saved`, icon: ShieldCheck, c: "text-violet-600 bg-violet-50" },
  ];
  const NAV = [["dash", "Dashboard", LayoutDashboard], ["sim", "WhatsApp AI", MessageCircle], ["avail", "Availability", CalendarClock]];

  const doctor = doctors.find((d) => d.id === doc) || { name: "the doctor" };
  const toggleSlot = (t) => {
    const isOn = blocked[doc].includes(t);
    if (live) live.toggleSlot(doc, t, !isOn); else setBlocked((b) => ({ ...b, [doc]: isOn ? b[doc].filter((x) => x !== t) : [...b[doc], t] }));
    toast(isOn ? "Slot reopened" : "Slot blocked", `${t12(t)} ${isOn ? "can be booked again" : "is hidden from the AI receptionist"} for ${doctor.name}.`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
        <div className="mb-8 flex items-center gap-2.5"><div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-600 text-white"><MessageCircle size={19} /></div><span className="text-lg font-semibold text-slate-900">ClinicFlow AI</span></div>
        <nav className="space-y-1">{NAV.map(([id, l, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${tab === id ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={18} />{l}</button>)}</nav>
        <div className="mt-auto space-y-2">
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Connected to WhatsApp Business. Prototype data only.</p>
          <p className="px-1 text-xs text-slate-400">Powered by <b className="font-semibold text-slate-600">Innoletics</b></p>
        </div>
      </aside>

      <main className="px-4 pb-28 pt-5 lg:ml-64 lg:px-8 lg:pb-10">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <div><h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{live?.clinic?.name || CLINIC}</h1><p className="text-sm text-slate-500">{new Date().toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div>
          <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200"><i className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />AI receptionist live</span>
          <DarkToggle />
          {live && <button onClick={live.signOut} aria-label="Sign out" title="Sign out" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"><LogOut size={17} /></button>}
        </header>

        {tab === "dash" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.label} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className={`mb-3 grid h-9 w-9 place-items-center rounded-lg ${k.c}`}><k.icon size={18} /></div>
                  <p className="text-2xl font-semibold text-slate-900">{k.v}</p>
                  <p className="text-xs text-slate-500">{k.label}</p>
                  {k.sub && <p className="mt-1 text-sm font-medium text-violet-700">{k.sub}</p>}
                </div>
              ))}
            </div>
            <Schedule appts={appts} date={date} setDate={setDate} onRemind={remind} />
          </div>
        )}

        {tab === "sim" && (
          <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
            <Chat onMessage={live ? live.simulate : onMessage} />
            <Schedule appts={appts} date={date} setDate={setDate} onRemind={remind} />
          </div>
        )}

        {tab === "avail" && (
          <div className="grid gap-5 xl:grid-cols-2">
            <section className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Doctor availability</h2>
              <div className="flex gap-2">{doctors.map((d) => <button key={d.id} onClick={() => setDoc(d.id)} className={`rounded-xl px-3 py-2 text-left text-sm ring-1 ${doc === d.id ? "bg-sky-50 ring-sky-300" : "ring-slate-200"}`}><b className="block text-slate-900">{d.name}</b><span className="text-xs text-slate-500">{d.role}</span></button>)}</div>
              <DateChips value={manageDate} onChange={setManageDate} />
              <p className="text-xs text-slate-500">Blocked times apply to every day and are hidden from the AI receptionist.</p>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SLOTS.map((t) => {
                  const booked = appts.some((a) => a.date === manageDate && a.time === t && a.status !== "Cancelled");
                  const off = blocked[doc].includes(t);
                  return (
                    <li key={t} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                      <span className="text-sm font-medium">{t12(t)} <span className="ml-1 text-xs font-normal text-slate-500">{off ? "Blocked" : booked && doc === doctors[0]?.id ? "Booked" : "Open"}</span></span>
                      <Toggle on={!off} onChange={() => toggleSlot(t)} label={`${t12(t)} open for booking`} />
                    </li>
                  );
                })}
              </ul>
            </section>
            <div className="space-y-5">
              <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <h2 className="mb-3 text-lg font-semibold text-slate-900">Automated reminder rules</h2>
                <ul className="divide-y divide-slate-100">
                  {rules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                      <div><p className="font-medium text-slate-900">{r.label}</p><p className="text-sm text-slate-500">{r.desc}</p></div>
                      <Toggle on={r.on} label={r.label} onChange={(v) => { if (live) live.setRule(r.id, v); else setRules((x) => x.map((y) => (y.id === r.id ? { ...y, on: v } : y))); toast(v ? "Rule enabled" : "Rule paused", r.label); }} />
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <h2 className="mb-3 text-lg font-semibold text-slate-900">Clinic settings</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-600">Currency
                    <select value={cur} onChange={(e) => setCur(e.target.value)} className="mt-1 w-full rounded-lg bg-white px-3 py-2 ring-1 ring-slate-300">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                  <label className="text-sm text-slate-600">Average value of one appointment
                    <input type="number" min="0" value={avg} onChange={(e) => setAvg(Math.max(0, +e.target.value))} className="mt-1 w-full rounded-lg px-3 py-2 ring-1 ring-slate-300" /></label>
                </div>
                <p className="mt-3 text-xs text-slate-500">Revenue saved = prevented no-shows x average appointment value.</p>
              </section>
            </div>
          </div>
        )}
        <footer className="mt-8 text-center text-xs text-slate-400">Powered by <b className="font-semibold text-slate-600">Innoletics</b> &bull; ClinicFlow AI</footer>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        {NAV.map(([id, l, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium ${tab === id ? "text-sky-700" : "text-slate-500"}`}><Icon size={20} />{l}</button>)}
      </nav>

      <div className="pointer-events-none fixed inset-x-3 top-3 z-50 flex flex-col items-end gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-slate-900 p-3.5 text-white shadow-lg">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />
            <div className="flex-1"><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-slate-300">{t.body}</p></div>
            <button aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={15} className="text-slate-400" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
