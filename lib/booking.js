import { admin } from "./db";
import { zonedToUtc, localParts } from "./clinic-time";

export const TREATMENTS = ["Teeth Whitening", "Dental Cleaning", "Botox", "Dermal Filler", "Root Canal", "Consultation", "HydraFacial", "Braces Check-up"];
export const SLOTS = Array.from({ length: 18 }, (_, i) => { const m = 540 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });
const nextDay = (d) => new Date(Date.parse(d + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);
const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");

const doctorOf = async (clinic) => (await admin.from("doctors").select("id,name").eq("clinic_id", clinic.id).order("name").limit(1)).data?.[0];

async function freeSlots(clinic, doc, date, ignoreId) {
  const tz = clinic.timezone;
  const [{ data: b }, { data: a }] = await Promise.all([
    admin.from("blocked_slots").select("slot_time").eq("doctor_id", doc.id),
    admin.from("appointments").select("id,starts_at").eq("doctor_id", doc.id).neq("status", "cancelled")
      .gte("starts_at", zonedToUtc(date, "00:00", tz).toISOString()).lt("starts_at", zonedToUtc(nextDay(date), "00:00", tz).toISOString()),
  ]);
  const off = new Set((b || []).map((x) => x.slot_time.slice(0, 5)));
  (a || []).filter((x) => x.id !== ignoreId).forEach((x) => off.add(localParts(x.starts_at, tz).time));
  return SLOTS.filter((s) => !off.has(s) && zonedToUtc(date, s, tz) > new Date());
}
const mine = async ({ clinic, patient }, id) =>
  (await admin.from("appointments").select("*").eq("id", id).eq("patient_id", patient.id).eq("clinic_id", clinic.id).maybeSingle()).data;

const str = { type: "string" };
export const tools = [
  { name: "check_availability", description: "List free appointment times (clinic local time, 24h HH:MM) on a date.", input_schema: { type: "object", properties: { date: { ...str, description: "YYYY-MM-DD" } }, required: ["date"] } },
  { name: "list_my_appointments", description: "List this patient's upcoming appointments with their ids.", input_schema: { type: "object", properties: {} } },
  { name: "book_appointment", description: "Book a new appointment.", input_schema: { type: "object", properties: { date: str, time: { ...str, description: "HH:MM 24h" }, treatment: { ...str, enum: TREATMENTS } }, required: ["date", "time", "treatment"] } },
  { name: "reschedule_appointment", description: "Move one of this patient's appointments.", input_schema: { type: "object", properties: { appointment_id: str, new_date: str, new_time: str }, required: ["appointment_id", "new_date", "new_time"] } },
  { name: "confirm_appointment", description: "Mark an appointment as confirmed by the patient.", input_schema: { type: "object", properties: { appointment_id: str }, required: ["appointment_id"] } },
  { name: "cancel_appointment", description: "Cancel an appointment.", input_schema: { type: "object", properties: { appointment_id: str }, required: ["appointment_id"] } },
];

export async function runTool(name, i, ctx) {
  const { clinic, patient } = ctx, tz = clinic.timezone, doc = await doctorOf(clinic);
  if (!doc) return { ok: false, error: "No doctor configured" };
  if (name === "check_availability") return okDate(i.date) ? { ok: true, date: i.date, free: await freeSlots(clinic, doc, i.date) } : { ok: false, error: "Bad date" };
  if (name === "list_my_appointments") {
    const { data } = await admin.from("appointments").select("id,treatment,starts_at,status").eq("patient_id", patient.id).gte("starts_at", new Date().toISOString()).not("status", "in", "(cancelled,completed)").order("starts_at");
    return { ok: true, appointments: (data || []).map((a) => ({ id: a.id, treatment: a.treatment, status: a.status, ...localParts(a.starts_at, tz) })) };
  }
  if (name === "book_appointment" || name === "reschedule_appointment") {
    const re = name === "reschedule_appointment", date = re ? i.new_date : i.date, time = re ? i.new_time : i.time;
    if (!okDate(date) || !SLOTS.includes(time)) return { ok: false, error: "Invalid date/time", valid_times: SLOTS };
    const appt = re ? await mine(ctx, i.appointment_id) : null;
    if (re && !appt) return { ok: false, error: "Appointment not found" };
    const free = await freeSlots(clinic, doc, date, appt?.id);
    if (!free.includes(time)) return { ok: false, error: "Slot not available", free: free.slice(0, 6) };
    const starts_at = zonedToUtc(date, time, tz).toISOString();
    const q = re
      ? admin.from("appointments").update({ starts_at, status: "rescheduled", saved_noshow: true, reminder_24h_sent_at: null, reminder_2h_sent_at: null }).eq("id", appt.id)
      : admin.from("appointments").insert({ clinic_id: clinic.id, doctor_id: doc.id, patient_id: patient.id, treatment: i.treatment, starts_at, status: "confirmed", source: "whatsapp" });
    const { data, error } = await q.select("id").single();
    return error ? { ok: false, error: "Slot was just taken", free: free.slice(0, 6) } : { ok: true, appointment_id: data.id, date, time, doctor: doc.name };
  }
  const appt = await mine(ctx, i.appointment_id);
  if (!appt) return { ok: false, error: "Appointment not found" };
  if (name === "confirm_appointment") {
    await admin.from("appointments").update({ status: "confirmed", saved_noshow: appt.saved_noshow || ["pending", "reminder_sent"].includes(appt.status) }).eq("id", appt.id);
    return { ok: true };
  }
  if (name === "cancel_appointment") { await admin.from("appointments").update({ status: "cancelled" }).eq("id", appt.id); return { ok: true }; }
  return { ok: false, error: "Unknown tool" };
}