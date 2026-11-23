import { admin } from "../../../lib/db";
const CUR = ["PKR", "USD", "GBP", "EUR", "AED", "SAR", "CAD", "AUD", "INR"];
const validTz = (tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };
const bad = (error, status = 400) => Response.json({ ok: false, error }, { status });

// Creates a clinic + first doctor + default reminder rules for a freshly signed-up user.
export async function POST(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return bad("Please sign in again.", 401);
  const { data: has } = await admin.from("profiles").select("user_id").eq("user_id", user.id).maybeSingle();
  if (has) return Response.json({ ok: true });

  const b = await req.json();
  const name = String(b.name || "").trim().slice(0, 80), doctor = String(b.doctor || "").trim().slice(0, 80);
  if (name.length < 2 || doctor.length < 2) return bad("Enter your clinic name and the doctor's name.");
  if (!validTz(b.timezone) || !CUR.includes(b.currency)) return bad("Choose a valid timezone and currency.");

  const { data: c, error } = await admin.from("clinics").insert({ name, timezone: b.timezone, currency: b.currency, avg_value: Math.max(0, Number(b.avg_value) || 0) }).select("id").single();
  if (error) return bad("Could not create the clinic. Try again.", 500);
  const res = await Promise.all([
    admin.from("doctors").insert({ clinic_id: c.id, name: doctor, role: "Doctor" }),
    admin.from("reminder_rules").insert([{ clinic_id: c.id, kind: "24h", enabled: true }, { clinic_id: c.id, kind: "2h", enabled: true }, { clinic_id: c.id, kind: "waitlist", enabled: false }]),
    admin.from("profiles").insert({ user_id: user.id, clinic_id: c.id }),
  ]);
  if (res.some((r) => r.error)) { await admin.from("clinics").delete().eq("id", c.id); return bad("Could not finish setup. Try again.", 500); }
  return Response.json({ ok: true });
}
