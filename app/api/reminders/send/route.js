import { admin } from "../../../../lib/db";
import { clinicFromRequest } from "../../../../lib/auth";
import { sendReminder } from "../../../../lib/reminders";
export async function POST(req) {
  const clinic = await clinicFromRequest(req);
  if (!clinic) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { appointment_id } = await req.json();
  const { data: a } = await admin.from("appointments").select("*, patients(name,phone,opted_in)").eq("id", appointment_id).eq("clinic_id", clinic.id).maybeSingle();
  if (!a) return Response.json({ ok: false, error: "Appointment not found" }, { status: 404 });
  try { return Response.json({ ok: await sendReminder(clinic, a, "24h"), error: "Patient has opted out" }); }
  catch (e) { return Response.json({ ok: false, error: e.message }, { status: 502 }); }
}
