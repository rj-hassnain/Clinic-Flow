import { clinicFromRequest } from "../../../lib/auth";
import { handleInbound } from "../../../lib/handle-message";
export const maxDuration = 60;
// Dashboard simulator: same AI + database as real WhatsApp, but nothing is sent to Meta.
export async function POST(req) {
  const clinic = await clinicFromRequest(req);
  if (!clinic) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { text } = await req.json();
  let debug;
  const reply = await handleInbound({ clinic, phone: "+92 300 1234567", name: "Ayesha Khan", text: String(text).slice(0, 1000), onError: (e) => { debug = String(e.message).slice(0, 240); } });
  return Response.json({ reply, debug });
}
