import crypto from "crypto";
import { after } from "next/server";
import { admin } from "../../../../lib/db";
import { sendText } from "../../../../lib/whatsapp";
import { handleInbound } from "../../../../lib/handle-message";
export const maxDuration = 60;

export async function GET(req) { // Meta webhook verification
  const p = new URL(req.url).searchParams;
  return p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WA_VERIFY_TOKEN
    ? new Response(p.get("hub.challenge")) : new Response("Forbidden", { status: 403 });
}

export async function POST(req) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256") || "";
  const want = "sha256=" + crypto.createHmac("sha256", process.env.META_APP_SECRET).update(raw).digest("hex");
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return new Response("Bad signature", { status: 401 });
  const body = JSON.parse(raw);
  after(async () => { // reply to Meta instantly, do the AI work afterwards
    for (const e of body.entry ?? []) for (const ch of e.changes ?? []) {
      const v = ch.value;
      const { data: clinic } = await admin.from("clinics").select("*").eq("wa_phone_number_id", v.metadata?.phone_number_id).maybeSingle();
      if (!clinic) continue;
      for (const m of v.messages ?? []) {
        try {
          await handleInbound({ clinic, phone: "+" + m.from, name: v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name, waId: m.id,
            text: m.type === "text" ? m.text.body : "[The patient sent a non-text message]", send: (t) => sendText(clinic, m.from, t) });
        } catch (err) { console.error("inbound failed", err); }
      }
    }
  });
  return new Response("ok");
}
