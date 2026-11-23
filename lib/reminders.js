import { admin } from "./db";
import { sendTemplate } from "./whatsapp";
import { localParts } from "./clinic-time";
/** kind: "24h" | "2h". Needs Meta templates appointment_reminder_24h / appointment_reminder_2h with 4 body variables. */
export async function sendReminder(clinic, a, kind) {
  if (!a.patients.opted_in) return false;
  const d = localParts(a.starts_at, clinic.timezone);
  await sendTemplate(clinic, a.patients.phone, `appointment_reminder_${kind}`, [a.patients.name || "there", a.treatment, d.longDate, d.time12]);
  await admin.from("appointments").update({ [`reminder_${kind}_sent_at`]: new Date().toISOString(), ...(a.status === "pending" ? { status: "reminder_sent" } : {}) }).eq("id", a.id);
  return true;
}