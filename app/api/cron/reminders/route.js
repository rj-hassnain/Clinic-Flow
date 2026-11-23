import { admin } from "../../../../lib/db";
import { sendReminder } from "../../../../lib/reminders";
export const maxDuration = 60;
// Run every ~10 minutes. Sent-at columns make it idempotent.
export async function GET(req) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const { data: rules } = await admin.from("reminder_rules").select("clinic_id,kind").eq("enabled", true).in("kind", ["24h", "2h"]);
  let sent = 0, failed = 0;
  for (const r of rules || []) {
    const hrs = r.kind === "24h" ? 24 : 2, from = r.kind === "24h" ? 3 : 0; // skip 24h reminder for bookings made <3h ahead of the window
    const { data: appts } = await admin.from("appointments").select("*, patients(name,phone,opted_in), clinics(*)")
      .eq("clinic_id", r.clinic_id).is(`reminder_${r.kind}_sent_at`, null).in("status", ["pending", "confirmed", "rescheduled"])
      .gt("starts_at", new Date(Date.now() + from * 36e5).toISOString()).lte("starts_at", new Date(Date.now() + hrs * 36e5).toISOString());
    for (const a of appts || []) {
      try { (await sendReminder(a.clinics, a, r.kind)) && sent++; } catch (e) { failed++; console.error("reminder failed", a.id, e.message); }
    }
  }
  return Response.json({ sent, failed });
}
