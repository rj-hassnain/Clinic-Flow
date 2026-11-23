"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase-browser";
import { localParts } from "./clinic-time";

const ST = { pending: "Pending", reminder_sent: "Reminder Sent", confirmed: "Confirmed", rescheduled: "Rescheduled", cancelled: "Cancelled" };
const RULE_META = [["24h", "24 hours before", "Ask the patient to confirm or reschedule on WhatsApp."], ["2h", "2 hours before", "Final reminder with arrival and parking details."], ["waitlist", "Offer freed slots to waitlist", "When someone cancels, message the next waiting patient."]];
const EMPTY = { clinic: null, doctors: [], blocked: {}, rules: [], appts: [], saved: 0 };

export function useLive() {
  const enabled = !!supabase;
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!enabled);
  const [d, setD] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [enabled]);

  const load = useCallback(async () => {
    const { data: prof } = await supabase.from("profiles").select("clinics(*)").maybeSingle();
    const clinic = prof?.clinics;
    if (!clinic) { setNeedsSetup(true); setLoading(false); return; }
    setNeedsSetup(false);
    const now = new Date(), monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [dr, bl, ru, ap, sv] = await Promise.all([
      supabase.from("doctors").select("id,name,role").order("name"),
      supabase.from("blocked_slots").select("doctor_id,slot_time"),
      supabase.from("reminder_rules").select("kind,enabled"),
      supabase.from("appointments").select("id,treatment,starts_at,status,patients(name,phone)").gte("starts_at", new Date(Date.now() - 2 * 864e5).toISOString()).order("starts_at"),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("saved_noshow", true).gte("starts_at", monthStart),
    ]);
    const blocked = Object.fromEntries((dr.data || []).map((x) => [x.id, []]));
    (bl.data || []).forEach((b) => blocked[b.doctor_id]?.push(b.slot_time.slice(0, 5)));
    setD({
      clinic, doctors: dr.data || [], blocked, saved: sv.count || 0,
      rules: RULE_META.map(([id, label, desc]) => ({ id, label, desc, on: !!ru.data?.find((r) => r.kind === id)?.enabled })),
      appts: (ap.data || []).map((a) => ({ id: a.id, patient: a.patients?.name || a.patients?.phone, phone: a.patients?.phone, treatment: a.treatment, status: ST[a.status] || a.status, ...localParts(a.starts_at, clinic.timezone) })),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!session) { setD(EMPTY); setLoading(true); return; }
    load();
    const ch = supabase.channel("appts").on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, load]);

  const api = (path, body) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) }).then((r) => r.json());
  return {
    enabled, ready, session, loading, needsSetup, ...d,
    signOut: () => supabase.auth.signOut(),
    onboard: async (body) => { const r = await api("/api/onboard", body); if (r.ok) await load(); return r; },
    remind: async (id) => { const r = await api("/api/reminders/send", { appointment_id: id }); await load(); return r; },
    simulate: async (text) => { const r = await api("/api/simulate", { text }); await load(); return r.reply || "Something went wrong. Please try again."; },
    toggleSlot: async (doctorId, time, block) => {
      if (block) await supabase.from("blocked_slots").insert({ doctor_id: doctorId, clinic_id: d.clinic.id, slot_time: time });
      else await supabase.from("blocked_slots").delete().eq("doctor_id", doctorId).eq("slot_time", time);
      await load();
    },
    setRule: async (kind, enabled) => { await supabase.from("reminder_rules").upsert({ clinic_id: d.clinic.id, kind, enabled }); await load(); },
  };
}
