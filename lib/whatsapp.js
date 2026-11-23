import { admin } from "./db";
const API = `https://graph.facebook.com/${process.env.WA_API_VERSION || "v21.0"}`;
async function post(clinic, payload) {
  const { data } = await admin.from("clinic_secrets").select("wa_token").eq("clinic_id", clinic.id).single();
  const res = await fetch(`${API}/${clinic.wa_phone_number_id}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${data.wa_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  return res.json();
}
const digits = (p) => p.replace(/\D/g, "");
export const sendText = (clinic, to, body) => post(clinic, { to: digits(to), type: "text", text: { body } });
/** Business-initiated messages (reminders) must use a Meta-approved template. */
export const sendTemplate = (clinic, to, name, params) => post(clinic, {
  to: digits(to), type: "template",
  template: { name, language: { code: clinic.language || "en" }, components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] },
});