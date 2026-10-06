"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronRight, HeartPulse, Milk } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BP_ACTION, bpBand, checkInWarnings, daysSince, type CheckIn } from "@/lib/care/rules";
import { dailyStats, hm, startOfDay, type ReportEvent } from "@/lib/baby/reports";
import { formatWhen } from "@/lib/plan/events";
import { useCare } from "./useCare";
import { BpSection, readingsOf } from "./BpSection";
import { MedsSection } from "./MedsSection";
import { CheckInSection } from "./CheckInSection";
import { NotesSection } from "./NotesSection";
import { FoodSection } from "./FoodSection";
import { MoveSection, WeekTable } from "./MoveSection";
import { SupportLines, WarningSigns } from "./WarningSigns";

type Person = { id: string; name: string };
type Visit = { id: string; title: string; starts_at: string };

/** Today's nursing from the baby log — her side of the same feeds. */
function useNursingToday(familyId: string, nowMs: number | null) {
  const [stat, setStat] = useState<{ feeds: number; nursingMs: number; bottles: number } | null>(null);
  useEffect(() => {
    if (nowMs === null) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const day = startOfDay(nowMs);
      const { data, error } = await supabase
        .from("baby_events")
        .select("id, event_type, started_at, ended_at, payload")
        .eq("family_id", familyId)
        .eq("event_type", "feed")
        .gte("started_at", new Date(day).toISOString());
      if (cancelled || error) return;
      const s = dailyStats((data ?? []) as ReportEvent[], day, 1, nowMs)[0];
      setStat({ feeds: s.feeds, nursingMs: s.nursingMs, bottles: s.bottles });
    })();
    return () => {
      cancelled = true;
    };
    // Recount at most once a minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, nowMs === null ? null : Math.floor(nowMs / 60_000)]);
  return stat;
}

function useVisits(personId: string | null) {
  const [visits, setVisits] = useState<Visit[]>([]);
  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from("family_events")
        .select("id, title, starts_at")
        .eq("person_user_id", personId)
        .eq("status", "planned")
        .gte("starts_at", new Date(Date.now() - 6 * 3600_000).toISOString())
        .order("starts_at")
        .limit(5);
      // supabase-error-ignored: an empty list reads as "nothing booked", and the Plan page shows the full list.
      if (!cancelled) setVisits((data ?? []) as Visit[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [personId]);
  return visits;
}

/**
 * /care — a grown-up's recovery and health, starting with Yenny after birth:
 * blood pressure against the published action thresholds, medicines with
 * reminders, a quick check-in that knows the warning signs, notes, her visits,
 * today's nursing from the baby log, food against the breastfeeding intakes,
 * and movement. Everything here is also what Claude
 * reads (family_brief → care) before answering her questions in chat.
 */
export function CarePage({ familyId, people, defaultPersonId }: { familyId: string; people: Person[]; defaultPersonId: string }) {
  const [personId, setPersonId] = useState(defaultPersonId);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const care = useCare(personId);
  const nursing = useNursingToday(familyId, nowMs);
  const visits = useVisits(personId);
  const [editing, setEditing] = useState(false);
  const [delivered, setDelivered] = useState("");
  const [type, setType] = useState<"cesarean" | "vaginal" | "">("");
  const [lactating, setLactating] = useState(false);
  const [ra, setRa] = useState(false);

  useEffect(() => {
    const tick = () => startTransition(() => setNowMs(Date.now()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const person = people.find((p) => p.id === personId) ?? people[0];
  const first = person?.name.split(" ")[0] ?? "";
  const profile = care.profile;
  const day = daysSince(profile?.delivered_on, nowMs ? new Date(nowMs) : new Date());
  const readings = readingsOf(care.logs);
  const latest = readings[0] ?? null;
  const lastCheckIn = care.logs.find((l) => l.kind === "checkin") ?? null;

  // A banner when the latest reading (last 24h) is in an action band, or the
  // latest check-in matched a call/911 sign.
  const recent = (iso: string) => nowMs !== null && nowMs - Date.parse(iso) < 24 * 3600_000;
  const band = latest && recent(latest.at) ? bpBand(latest.systolic, latest.diastolic) : null;
  const ciWarn =
    lastCheckIn && recent(lastCheckIn.at)
      ? checkInWarnings(lastCheckIn.payload as CheckIn, latest).filter((w) => w.level !== "info")
      : [];

  async function saveProfile() {
    const { error } = await createClient()
      .from("care_profiles")
      .upsert({
        person_user_id: personId,
        family_id: familyId,
        delivered_on: delivered || null,
        delivery_type: type || null,
        lactating,
        conditions: ra ? ["rheumatoid_arthritis"] : [],
        bp_reminders: profile?.bp_reminders ?? false,
        updated_at: new Date().toISOString(),
      });
    if (error) toast.error("That didn't save.");
    else {
      setEditing(false);
      care.refresh();
    }
  }

  async function toggleReminders() {
    const { error } = await createClient()
      .from("care_profiles")
      .upsert({ person_user_id: personId, family_id: familyId, bp_reminders: !profile?.bp_reminders, updated_at: new Date().toISOString(), delivered_on: profile?.delivered_on ?? null, delivery_type: profile?.delivery_type ?? null });
    if (error) toast.error("Couldn't change reminders.");
    else {
      toast.success(profile?.bp_reminders ? "BP reminders off" : "BP reminders on at 9am and 9pm");
      care.refresh();
    }
  }

  if (nowMs === null) return <div className="min-h-screen" />;

  return (
    <div className="mx-auto max-w-md space-y-5 pb-6" data-testid="care">
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-lg font-medium text-stone-800">
            <HeartPulse className="h-5 w-5 text-amber-600" aria-hidden /> {first}
          </h1>
          {people.length > 1 && (
            <div className="flex gap-1.5">
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersonId(p.id)}
                  className={`rounded-full px-3 py-1 text-xs ${p.id === personId ? "bg-stone-800 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}
                >
                  {p.name.split(" ")[0]}
                </button>
              ))}
            </div>
          )}
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => {
              setDelivered(profile?.delivered_on ?? "");
              setType((profile?.delivery_type as "cesarean" | "vaginal" | null) ?? "");
              setLactating(!!profile?.lactating);
              setRa(!!profile?.conditions?.includes("rheumatoid_arthritis"));
              setEditing(true);
            }}
            className="text-left text-sm text-stone-600"
          >
            {day !== null
              ? `Day ${day} after birth${profile?.delivery_type === "cesarean" ? " · C-section" : ""}`
              : "Recovering after a birth? Add the date"}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-2.5">
            <input type="date" className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm" value={delivered} onChange={(e) => setDelivered(e.target.value)} aria-label="Birth date" />
            <select className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Delivery">
              <option value="">Delivery…</option>
              <option value="cesarean">C-section</option>
              <option value="vaginal">Vaginal</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-stone-700">
              <input type="checkbox" checked={lactating} onChange={(e) => setLactating(e.target.checked)} className="h-4 w-4 accent-violet-600" /> Breastfeeding
            </label>
            <label className="flex items-center gap-1.5 text-xs text-stone-700">
              <input type="checkbox" checked={ra} onChange={(e) => setRa(e.target.checked)} className="h-4 w-4 accent-violet-600" /> Rheumatoid arthritis
            </label>
            <button type="button" onClick={() => void saveProfile()} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white">
              Save
            </button>
          </div>
        )}
      </header>

      {care.failed && <p className="text-xs text-rose-700">Some of this didn&apos;t load. Reload to try again.</p>}

      {(band === "severe" || band === "high" || ciWarn.length > 0) && (
        <div className="space-y-1 rounded-2xl bg-white p-3.5 ring-2 ring-amber-600" data-testid="care-alert">
          <p className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden /> Needs a call
          </p>
          {band && band !== "under" && latest && (
            <p className="text-sm text-stone-800">
              {latest.systolic}/{latest.diastolic} at {new Date(latest.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}:{" "}
              {BP_ACTION[band].action}
            </p>
          )}
          {ciWarn.map((w, i) => (
            <p key={i} className="text-sm text-stone-800">
              {w.level === "911" ? "Call 911 · " : ""}
              {w.text}
            </p>
          ))}
        </div>
      )}

      <BpSection familyId={familyId} personId={personId} logs={care.logs} onSaved={care.refresh} />
      {profile && (
        <label className="-mt-2 flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700">
          Remind to check BP at 9am and 9pm
          <input type="checkbox" checked={profile.bp_reminders} onChange={() => void toggleReminders()} className="h-5 w-5 accent-violet-600" />
        </label>
      )}

      <MedsSection familyId={familyId} personId={personId} meds={care.meds} logs={care.logs} nowMs={nowMs} onSaved={care.refresh} />

      <CheckInSection familyId={familyId} personId={personId} logs={care.logs} latestBp={latest} onSaved={care.refresh} />

      {profile?.delivered_on && nursing && (
        <Link href="/baby/reports" className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3" data-testid="care-nursing">
          <span className="flex items-center gap-2 text-sm text-stone-800">
            <Milk className="h-4 w-4 text-amber-600" aria-hidden /> Nursing today
          </span>
          <span className="text-sm tabular-nums text-stone-600">
            {nursing.feeds} feeds · {hm(nursing.nursingMs)}
            {nursing.bottles ? ` · ${nursing.bottles} bottles` : ""}
          </span>
        </Link>
      )}

      <FoodSection
        familyId={familyId}
        personId={personId}
        first={first}
        logs={care.logs}
        profile={profile}
        goals={care.goals}
        nowMs={nowMs}
        onSaved={care.refresh}
      />
      <MoveSection familyId={familyId} personId={personId} first={first} logs={care.logs} profile={profile} nowMs={nowMs} onSaved={care.refresh} />
      <WeekTable logs={care.logs} profile={profile} goals={care.goals} nowMs={nowMs} />


      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-stone-400">{first}&apos;s visits</h2>
        {visits.length === 0 ? (
          <Link href="/plan" className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-600">
            <span className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-violet-600" aria-hidden /> Add a visit — the postpartum checkup comes with a prep list
            </span>
            <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden />
          </Link>
        ) : (
          <ul className="space-y-1.5">
            {visits.map((v) => (
              <li key={v.id}>
                <Link href={`/plan/${v.id}`} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm">
                  <span>
                    <span className="block text-stone-800">{v.title}</span>
                    <span className="block text-xs text-stone-500">{formatWhen(v.starts_at)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NotesSection familyId={familyId} personId={personId} logs={care.logs} onSaved={care.refresh} />

      <WarningSigns deliveredOn={profile?.delivered_on ?? null} />
      <SupportLines />
    </div>
  );
}
