import { admin } from "./db";
/** Resolve the logged-in dashboard user's clinic from the Bearer token, or null. */
export async function clinicFromRequest(req) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  const { data } = await admin.from("profiles").select("clinics(*)").eq("user_id", user.id).maybeSingle();
  return data?.clinics || null;
}