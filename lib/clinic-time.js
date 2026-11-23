const dtf = (tz, o) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", ...o });
const parts = (f, d) => Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
/** Clinic-local wall time -> UTC Date */
export function zonedToUtc(date, time, tz) {
  const guess = new Date(`${date}T${time}:00Z`);
  const p = parts(dtf(tz, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }), guess);
  return new Date(guess.getTime() - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess.getTime()));
}
export function localParts(iso, tz) {
  const d = new Date(iso);
  const p = parts(dtf(tz, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }), d);
  const h = +p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, time12: `${h % 12 || 12}:${p.minute} ${h < 12 ? "AM" : "PM"}`,
    longDate: d.toLocaleDateString("en", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }) };
}
export const todayIn = (tz) => `${new Date().toLocaleDateString("en-CA", { timeZone: tz })} (${new Date().toLocaleDateString("en", { timeZone: tz, weekday: "long" })})`;