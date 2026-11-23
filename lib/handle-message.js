import { admin } from "./db";
import { reply } from "./ai";
/** One inbound patient message -> AI -> logged reply. Used by the WhatsApp webhook and the dashboard simulator. */
const FALLBACK = "Sorry, I am having trouble right now. A team member will contact you shortly.";
export async function handleInbound({ clinic, phone, name, text, waId, send, onError }) {
  const { data: patient } = await admin.from("patients").upsert({ clinic_id: clinic.id, phone, ...(name ? { name } : {}) }, { onConflict: "clinic_id,phone" }).select("*").single();
  const { data: rows } = await admin.from("messages").select("direction,body").eq("clinic_id", clinic.id).eq("phone", phone).order("created_at", { ascending: false }).limit(12);
  const history = [];
  for (const r of (rows || []).reverse()) {
    const role = r.direction === "in" ? "user" : "assistant";
    if (!history.length && role === "assistant") continue;
    if (history.at(-1)?.role === role) history.at(-1).content += "\n" + r.body; else history.push({ role, content: r.body });
  }
  const { error } = await admin.from("messages").insert({ clinic_id: clinic.id, phone, direction: "in", body: text, wa_message_id: waId || null });
  if (error?.code === "23505") return null; // Meta retried a message we already handled
  let answer;
  if (/^\s*(stop|unsubscribe)\s*$/i.test(text)) {
    await admin.from("patients").update({ opted_in: false }).eq("id", patient.id);
    answer = "You've been unsubscribed and won't receive further reminders. Reply START to opt back in.";
  } else {
    try { answer = await reply({ clinic, patient, history, text }); }
    catch (e) { console.error("AI failed:", e.message); onError?.(e); answer = FALLBACK; }
  }
  await admin.from("messages").insert({ clinic_id: clinic.id, phone, direction: "out", body: answer });
  if (send) await send(answer);
  return answer;
}
