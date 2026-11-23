import { admin } from "../../../lib/db";
// Visit /api/health?k=YOUR_CRON_SECRET to see what is misconfigured. Returns booleans/status only, never secret values.
export async function GET(req) {
  if (new URL(req.url).searchParams.get("k") !== process.env.CRON_SECRET || !process.env.CRON_SECRET) return new Response("Forbidden", { status: 403 });
  const env = Object.fromEntries(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GROQ_API_KEY", "GROQ_MODEL", "META_APP_SECRET", "WA_VERIFY_TOKEN", "CRON_SECRET"].map((k) => [k, !!process.env[k]]));
  let groq;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "user", content: "Say ok" }], max_tokens: 5 }),
    });
    groq = r.ok ? "ok" : `${r.status}: ${(await r.text()).slice(0, 250)}`;
  } catch (e) { groq = e.message; }
  let db;
  try {
    const { data, error } = await admin.from("clinics").select("name,wa_phone_number_id");
    db = error ? error.message : { clinics: data.length, with_whatsapp_number: data.filter((c) => c.wa_phone_number_id).length };
  } catch (e) { db = e.message; }
  return Response.json({ env, groq, db });
}
