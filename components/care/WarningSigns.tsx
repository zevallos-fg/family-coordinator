"use client";

import { Phone, ShieldAlert } from "lucide-react";
import { SOURCES } from "@/lib/care/rules";

function Src({ s }: { s: { title: string; url: string } }) {
  return (
    <a href={s.url} target="_blank" rel="noreferrer" className="block text-[11px] text-amber-700 underline underline-offset-2">
      {s.title}
    </a>
  );
}

/**
 * The POST-BIRTH warning signs and the blood pressure actions, word for word
 * from the sources, always one tap away. "All you need is one sign."
 */
export function WarningSigns({ deliveredOn }: { deliveredOn: string | null }) {
  const born = deliveredOn
    ? new Date(`${deliveredOn}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "____";
  return (
    <details className="group rounded-2xl border border-stone-200 bg-white" data-testid="warning-signs">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium text-stone-800">
          <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden /> Warning signs — when to call
        </span>
        <span className="text-xs text-stone-500 group-open:hidden">Show</span>
      </summary>
      <div className="space-y-4 border-t border-stone-100 px-4 py-3 text-sm text-stone-700">
        <div>
          <p className="font-medium text-stone-800">Call 911</p>
          <p>Chest pain · trouble breathing or shortness of breath · a seizure · thoughts of hurting yourself or someone else (or call 988).</p>
        </div>
        <div>
          <p className="font-medium text-stone-800">Call your OB — you only need one sign</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Bleeding soaking a pad an hour, or clots egg-size or bigger</li>
            <li>An incision that isn&apos;t healing, is red, or is draining</li>
            <li>A red or swollen leg that&apos;s painful or warm</li>
            <li>Temperature 100.4°F or higher, or 96.8°F or lower</li>
            <li>A headache that doesn&apos;t get better after medicine, or a bad headache with vision changes</li>
          </ul>
          <p className="mt-1 text-xs text-stone-500">Can&apos;t reach them? Call 911 or go to the ER.</p>
          <Src s={SOURCES.awhonn} />
        </div>
        <div>
          <p className="font-medium text-stone-800">Blood pressure — act on either number</p>
          <ul className="space-y-0.5">
            <li>
              <span className="font-medium">160/110 or higher:</span> get medical care right away (Labor & Delivery or the ER).
            </li>
            <li>
              <span className="font-medium">140–159 / 90–109:</span> call your OB.
            </li>
            <li>
              <span className="font-medium">Under 140/90:</span> keep checking.
            </li>
          </ul>
          <p className="mt-1 text-xs text-stone-500">
            Postpartum preeclampsia is most common in the first 7 days after delivery, and possible up to 6 weeks.
          </p>
          <Src s={SOURCES.pfBp} />
          <Src s={SOURCES.pfPostpartum} />
        </div>
        <div className="rounded-lg bg-stone-100 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs text-stone-600">
            <Phone className="h-3.5 w-3.5" aria-hidden /> What to say
          </p>
          <p className="text-sm text-stone-800">&ldquo;I gave birth on {born} and I am having ____.&rdquo;</p>
        </div>
      </div>
    </details>
  );
}

/** Support lines, as each organisation describes itself. */
export function SupportLines() {
  return (
    <section className="space-y-1.5 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm" data-testid="support-lines">
      <p className="text-xs uppercase tracking-wide text-stone-400">Support, any time</p>
      <p className="text-stone-800">
        <a href="tel:18338526262" className="font-medium underline underline-offset-2">
          1-833-TLC-MAMA
        </a>{" "}
        — National Maternal Mental Health Hotline: free, confidential, 24/7, English and Spanish. Partners can call too.
      </p>
      <Src s={SOURCES.hrsa} />
      <p className="text-stone-800">
        <a href="tel:18009444773" className="font-medium underline underline-offset-2">
          1-800-944-4773
        </a>{" "}
        — Postpartum Support International. Leave a message and a trained volunteer calls back; not a crisis line.
      </p>
      <Src s={SOURCES.psi} />
      <p className="text-stone-800">
        In a crisis: call or text <a href="tel:988" className="font-medium underline underline-offset-2">988</a>, or 911.
      </p>
    </section>
  );
}
