"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useBabyLane } from "../useBabyLane";
import { useKidEvents } from "./useKidEvents";
import { DayTimeline } from "./DayTimeline";
import { WeekGrid } from "./WeekGrid";
import { Legend, TrendChart, type BarDatum, type Series } from "./TrendChart";
import { RangeTiles } from "./RangeTiles";
import { GuideSheet } from "../GuideSheet";
import { rangeTiles, type Tile } from "@/lib/baby/rangeTiles";
import { guidesFor } from "@/lib/baby/glance";
import { eventDuration, eventSummary } from "@/lib/baby/summary";
import { formatTimeOfDay } from "@/lib/baby/format";
import {
  REPORT_COLORS,
  RANGES,
  addDays,
  bucketLabel,
  buckets,
  dailyStats,
  dayMarks,
  hm,
  startOfDay,
  type Grain,
  type ReportEvent,
} from "@/lib/baby/reports";

type View = "day" | "week" | "summary";
type Topic = "sleep" | "feed" | "diaper";

const LABEL: Record<string, string> = { sleep: "Sleep", feed: "Feed", diaper: "Diaper" };

function Tabs<T extends string>({
  options,
  value,
  onChange,
  testId,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <div className={`grid gap-1 rounded-xl bg-stone-100 p-1`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          data-testid={`${testId}-${o.value}`}
          aria-pressed={value === o.value}
          className={`rounded-lg py-1.5 text-sm ${value === o.value ? "bg-sky-600 font-medium text-white" : "text-stone-600"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function readout(e: ReportEvent): string {
  const end = e.ended_at ? formatTimeOfDay(e.ended_at) : null;
  const when =
    e.event_type === "diaper" || !end || end === formatTimeOfDay(e.started_at)
      ? formatTimeOfDay(e.started_at)
      : `${formatTimeOfDay(e.started_at)}–${end}`;
  const parts = [LABEL[e.event_type] ?? e.event_type, when];
  if (!e.ended_at && e.event_type !== "diaper") parts.push("running");
  else {
    const d = eventDuration(e);
    if (d && e.event_type !== "diaper") parts.push(d);
  }
  const s = eventSummary(e.event_type, e.payload as Record<string, unknown>);
  if (s) parts.push(s);
  return parts.join(" · ");
}

/**
 * Reports: the log as pictures. Day — one day as a timeline. Week — seven days
 * side by side; tap one to open it. Summary — bars per day for 7, 14 or 30 days,
 * per week for 90, per month for a year, where a week or month bar is the
 * average logged day. Numbers only; ranges live on the Kids cards.
 */
export function ReportsPage({ familyId }: { familyId: string }) {
  const lane = useBabyLane(familyId);
  const [today, setToday] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState<number | null>(null);
  const [weekEndState, setWeekEnd] = useState<number | null>(null);
  const [rangeKey, setRangeKey] = useState("7D");
  const [topic, setTopic] = useState<Topic>("sleep");
  const [markId, setMarkId] = useState<string | null>(null);
  const [bar, setBar] = useState<number | null>(null);
  const [info, setInfo] = useState<Tile | null>(null);

  // Dates come from the phone after mount, so the server (UTC) never draws the
  // wrong day.
  useEffect(() => {
    const tick = () =>
      startTransition(() => {
        const n = Date.now();
        setNowMs(n);
        setToday(startOfDay(n));
      });
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0];
  const selectedDay = day ?? today;
  const weekEnd = weekEndState ?? today;
  // Enough history for whichever view is open, plus a day for spans that began
  // before midnight.
  const since =
    today === null || selectedDay === null || weekEnd === null
      ? null
      : Math.min(addDays(weekEnd, -7), addDays(selectedDay, -1), addDays(today, -(view === "summary" ? range.days : 7) - 1));
  const { events, failed } = useKidEvents(lane.kidId, since);

  // The strip and the week view show the 7 days ending at weekEnd; picking a day
  // inside it doesn't move it.
  const weekDays = useMemo(() => {
    if (weekEnd === null) return [];
    return Array.from({ length: 7 }, (_, i) => addDays(weekEnd, i - 6));
  }, [weekEnd]);

  const kid = lane.kids.find((k) => k.id === lane.kidId) ?? null;

  if (today === null || nowMs === null || selectedDay === null || weekEnd === null) return <div className="min-h-screen" />;

  const marks = events ? dayMarks(events, selectedDay, nowMs) : [];
  const selectedMark = marks.find((m) => m.id === markId) ?? null;
  const dayStat = events ? dailyStats(events, selectedDay, 1, nowMs)[0] : null;

  // Ranges are by age on the day in question (noon, so the date is unambiguous).
  const guideAt = (dayStart: number) => guidesFor(kid?.birth_date, new Date(dayStart + 12 * 3_600_000));
  const dayTiles = dayStat
    ? rangeTiles(dayStat.logged ? [dayStat] : [], guideAt(selectedDay), guideAt, { partial: selectedDay === today, average: false })
    : [];
  // Week and range averages use complete days only: today isn't over.
  const weekComplete = events
    ? dailyStats(events, weekDays[0], 7, nowMs).filter((d) => d.logged && d.dayStart < today)
    : [];
  const weekLast = weekComplete.length ? weekComplete[weekComplete.length - 1].dayStart : addDays(today, -1);
  const weekTiles = rangeTiles(weekComplete, guideAt(weekLast), guideAt, { partial: false, average: true });

  // Summary series
  const from = addDays(today, -(range.days - 1));
  const grain: Grain = range.grain;
  const dense = range.days > 14;
  const bks = events ? buckets(dailyStats(events, from, range.days, nowMs), grain) : [];
  const logged = bks.filter((b) => b.loggedDays > 0);
  const avgDays = events ? dailyStats(events, from, range.days, nowMs).filter((d) => d.logged && d.dayStart < today) : [];
  const rangeLast = avgDays.length ? avgDays[avgDays.length - 1].dayStart : addDays(today, -1);
  const summaryTiles = rangeTiles(avgDays, guideAt(rangeLast), guideAt, { partial: false, average: true });
  const currentGuides = guideAt(today);
  const avg = (f: (d: (typeof avgDays)[number]) => number) => (avgDays.length ? avgDays.reduce((n, d) => n + f(d), 0) / avgDays.length : 0);

  let series: Series[] = [];
  let data: BarDatum[] = [];
  let format: (v: number) => string = (v) => String(v);
  const mode = "stack" as const;
  let headline = "";
  let tickStep: number | undefined;
  let band: { min?: number; max?: number; label: string } | undefined;
  const H_MS = 3_600_000;
  if (topic === "sleep") {
    series = [
      { name: "Night (7pm–7am)", color: REPORT_COLORS.sleep },
      { name: "Naps", color: REPORT_COLORS.nap },
    ];
    data = bks.map((b) => ({ key: String(b.start), tick: bucketLabel(b.start, grain, true, dense), values: [b.nightMs / H_MS, b.napMs / H_MS] }));
    format = (v) => `${v}h`;
    tickStep = 4;
    if (currentGuides.sleep?.bounds) band = { ...currentGuides.sleep.bounds, label: `typ. ${currentGuides.sleep.range}` };
    headline = `Avg ${hm(avg((d) => d.nightMs + d.napMs))} a day · night ${hm(avg((d) => d.nightMs))} · naps ${hm(avg((d) => d.napMs))}`;
  } else if (topic === "feed") {
    series = [{ name: "Feeds", color: REPORT_COLORS.feed }];
    data = bks.map((b) => ({ key: String(b.start), tick: bucketLabel(b.start, grain, true, dense), values: [b.feeds] }));
    format = (v) => String(v);
    if (currentGuides.feeds?.bounds) band = { ...currentGuides.feeds.bounds, label: `typ. ${currentGuides.feeds.range}` };
    headline = `Avg ${avg((d) => d.feeds).toFixed(1)} feeds a day · nursing ${hm(avg((d) => d.nursingMs))} a day`;
  } else {
    // Exclusive kinds stack to the day's total; wet and dirty (the counts the
    // AAP describes) are read out above, where mixed counts toward both.
    series = [
      { name: "Pee", color: REPORT_COLORS.wet },
      { name: "Mixed", color: REPORT_COLORS.mixed },
      { name: "Poo", color: REPORT_COLORS.dirty },
    ];
    data = bks.map((b) => ({ key: String(b.start), tick: bucketLabel(b.start, grain, true, dense), values: [b.peeOnly, b.mixed, b.pooOnly] }));
    format = (v) => String(v);
    headline = `Avg ${avg((d) => d.wet).toFixed(1)} wet · ${avg((d) => d.dirty).toFixed(1)} dirty a day`;
  }
  const selBar = bar !== null && bar < data.length ? bar : data.length - 1;
  const sel = bks[selBar];
  const selText = !sel
    ? ""
    : sel.loggedDays === 0
      ? `${bucketLabel(sel.start, grain, false)} · nothing logged`
      : `${bucketLabel(sel.start, grain, false)}${grain === "day" ? "" : ` · avg of ${sel.loggedDays} day${sel.loggedDays === 1 ? "" : "s"}`} · ` +
        (topic === "sleep"
          ? `${hm(sel.nightMs + sel.napMs)} (night ${hm(sel.nightMs)}, naps ${hm(sel.napMs)})`
          : topic === "feed"
            ? `${grain === "day" ? sel.feeds : sel.feeds.toFixed(1)} feeds · nursing ${hm(sel.nursingMs)}${sel.bottles ? ` · ${grain === "day" ? sel.bottles : sel.bottles.toFixed(1)} bottles` : ""}`
            : `${grain === "day" ? sel.wet : sel.wet.toFixed(1)} wet · ${grain === "day" ? sel.dirty : sel.dirty.toFixed(1)} dirty${sel.dry ? ` · ${grain === "day" ? sel.dry : sel.dry.toFixed(1)} dry` : ""}`);

  return (
    <div className="mx-auto max-w-md space-y-4 pb-6" data-testid="reports">
      <header className="flex items-center justify-between">
        <Link href="/baby" className="flex items-center gap-1 text-sm text-stone-500">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Kids
        </Link>
        {lane.kids.length > 1 && (
          <div className="flex gap-1.5">
            {lane.kids.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => lane.chooseKid(k.id)}
                className={`rounded-full px-3 py-1 text-xs ${lane.kidId === k.id ? "bg-stone-800 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}
              >
                {k.name}
              </button>
            ))}
          </div>
        )}
      </header>
      <h1 className="text-lg font-medium text-stone-800">Reports{kid ? ` · ${kid.name}` : ""}</h1>

      <Tabs
        options={[
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
          { value: "summary", label: "Summary" },
        ]}
        value={view}
        onChange={(v) => {
          setView(v);
          setMarkId(null);
        }}
        testId="report-view"
      />

      {failed && <p className="text-xs text-rose-700">Some entries didn&apos;t load. Reload to try again.</p>}

      {view !== "summary" && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Earlier week"
            onClick={() => {
              setWeekEnd(addDays(weekEnd, -7));
              setDay(addDays(weekEnd, -7));
              setMarkId(null);
            }}
            className="p-1 text-stone-500"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="grid flex-1 grid-cols-7 gap-1">
            {weekDays.map((d) => {
              const date = new Date(d);
              const on = d === selectedDay;
              const future = d > today;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={future}
                  onClick={() => {
                    setDay(d);
                    setMarkId(null);
                  }}
                  className={`flex flex-col items-center rounded-full py-1 text-xs disabled:opacity-30 ${on ? "bg-stone-800 text-white" : "text-stone-600"}`}
                >
                  <span className="text-[10px]">{date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}</span>
                  <span className="text-sm tabular-nums">{date.getDate()}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label="Later week"
            disabled={weekEnd >= today}
            onClick={() => {
              const next = Math.min(today, addDays(weekEnd, 7));
              setWeekEnd(next);
              setDay(next);
              setMarkId(null);
            }}
            className="p-1 text-stone-500 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {view === "day" && (
        <section className="space-y-2">
          <p className="text-sm text-stone-800">
            {new Date(selectedDay).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </p>
          {dayStat && (
            <RangeTiles
              title={dayStat.logged ? "Totals vs typical" : "Nothing logged this day"}
              tiles={dayTiles}
              partial={selectedDay === today}
              onInfo={setInfo}
            />
          )}
          <p className="min-h-[2.5rem] rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-700" data-testid="mark-readout">
            {selectedMark ? readout(selectedMark.event) : "Tap a block or dot to see it."}
          </p>
          <div className="rounded-2xl border border-stone-200 bg-white p-2">
            {events === null ? (
              <p className="py-10 text-center text-sm text-stone-500">Loading…</p>
            ) : (
              <DayTimeline
                marks={marks}
                nowMinute={selectedDay === today ? (nowMs - today) / 60_000 : null}
                selectedId={markId}
                onSelect={setMarkId}
              />
            )}
          </div>
          <Legend
            series={[
              { name: "Sleep", color: REPORT_COLORS.sleep },
              { name: "Feed", color: REPORT_COLORS.feed },
              { name: "Pee", color: REPORT_COLORS.wet },
              { name: "Mixed", color: REPORT_COLORS.mixed },
              { name: "Poo", color: REPORT_COLORS.dirty },
            ]}
            note="○ dry"
          />
        </section>
      )}

      {view === "week" && (
        <section className="space-y-2">
          <RangeTiles
            title={weekComplete.length ? `Average day · ${weekComplete.length} full day${weekComplete.length === 1 ? "" : "s"}` : "No full days logged this week"}
            tiles={weekTiles}
            partial={false}
            onInfo={setInfo}
          />
          <div className="rounded-2xl border border-stone-200 bg-white p-2">
            {events === null ? (
              <p className="py-10 text-center text-sm text-stone-500">Loading…</p>
            ) : (
              <WeekGrid
                days={weekDays.map((d) => ({ start: d, marks: d > today ? [] : dayMarks(events, d, nowMs) }))}
                todayStart={today}
                onOpen={(d) => {
                  if (d > today) return;
                  setDay(d);
                  setView("day");
                }}
              />
            )}
          </div>
          <Legend
            series={[
              { name: "Sleep", color: REPORT_COLORS.sleep },
              { name: "Feed", color: REPORT_COLORS.feed },
              { name: "Pee", color: REPORT_COLORS.wet },
              { name: "Mixed", color: REPORT_COLORS.mixed },
              { name: "Poo", color: REPORT_COLORS.dirty },
            ]}
            note="Tap a day to open it"
          />
        </section>
      )}

      {view === "summary" && (
        <section className="space-y-3">
          <Tabs
            options={RANGES.map((r) => ({ value: r.key, label: r.key }))}
            value={rangeKey}
            onChange={(v) => {
              setRangeKey(v);
              setBar(null);
            }}
            testId="report-range"
          />
          <Tabs
            options={[
              { value: "sleep" as Topic, label: "Sleep" },
              { value: "feed" as Topic, label: "Feeding" },
              { value: "diaper" as Topic, label: "Diapers" },
            ]}
            value={topic}
            onChange={(v) => {
              setTopic(v);
              setBar(null);
            }}
            testId="report-topic"
          />
          {events === null ? (
            <p className="py-10 text-center text-sm text-stone-500">Loading…</p>
          ) : logged.length === 0 ? (
            <p className="rounded-xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
              Nothing logged in this range yet.
            </p>
          ) : (
            <>
              <RangeTiles
                title={avgDays.length ? `Average day · ${avgDays.length} full day${avgDays.length === 1 ? "" : "s"}` : "No full days logged yet"}
                tiles={summaryTiles}
                partial={false}
                onInfo={setInfo}
              />
              <p className="text-sm text-stone-800" data-testid="summary-headline">
                {headline}
              </p>
              <p className="min-h-[2.25rem] rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-700" data-testid="bar-readout">
                {selText}
              </p>
              <div className="rounded-2xl border border-stone-200 bg-white p-2">
                <TrendChart
                  data={data}
                  series={series}
                  mode={mode}
                  format={format}
                  tickStep={tickStep}
                  band={band}
                  selected={selBar}
                  onSelect={setBar}
                  label={`${topic} by ${grain}`}
                />
              </div>
              {series.length > 1 && <Legend series={series} />}
              <p className="text-[11px] text-stone-400">
                {grain === "day" ? "Each bar is one day." : `Each bar is the average logged day that ${grain}.`} Days with nothing logged are left
                out of averages.
              </p>
              <details className="text-xs text-stone-600">
                <summary className="cursor-pointer text-stone-500">Show as a table</summary>
                <table className="mt-2 w-full">
                  <thead>
                    <tr className="text-left text-[11px] text-stone-500">
                      <th className="font-normal">{grain === "day" ? "Day" : grain === "week" ? "Week of" : "Month"}</th>
                      {series.map((s) => (
                        <th key={s.name} className="font-normal">
                          {s.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((d, i) => (
                      <tr key={d.key}>
                        <td className="py-0.5">{bucketLabel(bks[i].start, grain, false)}</td>
                        {d.values.map((v, vi) => (
                          <td key={vi} className="tabular-nums">
                            {topic === "sleep" ? hm(v * H_MS) : grain === "day" ? v : v.toFixed(1)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </section>
      )}

      <GuideSheet
        open={!!info}
        onClose={() => setInfo(null)}
        title={info?.label ?? ""}
        guides={info?.guide ? [info.guide] : []}
        kidName={kid?.name ?? "your child"}
      />
    </div>
  );
}
