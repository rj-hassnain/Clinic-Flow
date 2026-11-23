import { createClient } from "@supabase/supabase-js";
// Server only. The service-role key bypasses RLS, so every query below filters by clinic_id itself.
export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });