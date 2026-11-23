import { tools, runTool, TREATMENTS } from "./booking";
import { todayIn } from "./clinic-time";

// Groq (OpenAI-compatible chat completions with tool calling). No SDK needed.
const URL = "https://api.groq.com/openai/v1/chat/completions";
const FN_TOOLS = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
const FALLBACK = "Sorry, I'm having trouble right now. A team member will contact you shortly.";

export async function reply({ clinic, patient, history, text }) {
  const system = `You are the WhatsApp receptionist for ${clinic.name}. Today is ${todayIn(clinic.timezone)} in ${clinic.timezone}. Clinic hours are 09:00-18:00 in 30-minute slots.
Treatments: ${TREATMENTS.join(", ")}. The patient is ${patient.name || "a patient"}.
Rules: always call check_availability before offering times; never say something is booked, moved, confirmed or cancelled unless the tool returned ok:true; repeat the final date and time back to the patient; if a slot is taken, offer the free times returned. Use list_my_appointments to find ids; ask which one if there are several. Dates passed to tools must be YYYY-MM-DD and times HH:MM (24h).
Style: warm, brief, plain text (no markdown), reply in the patient's language. Give no medical advice; for emergencies tell them to contact local emergency services. If you cannot help, say a team member will call them back.`;
  const messages = [{ role: "system", content: system }, ...history, { role: "user", content: text }];

  for (let n = 0; n < 6; n++) {
    let msg;
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages, tools: FN_TOOLS, tool_choice: "auto", temperature: 0.2, max_tokens: 500 }),
      });
      if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
      msg = (await res.json()).choices[0].message;
    } catch (e) { console.error("AI call failed", e.message); if (/tool_use_failed/.test(e.message) && n < 3) continue; throw e; }

    if (!msg.tool_calls?.length) return (msg.content || "").trim() || FALLBACK;
    messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
    for (const c of msg.tool_calls) {
      let out;
      try { out = await runTool(c.function.name, JSON.parse(c.function.arguments || "{}"), { clinic, patient }); } catch (e) { out = { ok: false, error: e.message }; }
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out) });
    }
  }
  return FALLBACK;
}
