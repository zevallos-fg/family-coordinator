"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { ShareLink } from "@/lib/baby/events";

interface Props {
  familyId: string;
  links: ShareLink[];
  onChanged: () => void;
}

const SCOPES = [
  { value: "contractions", label: "Contractions" },
  { value: "baby_today", label: "Feeds, diapers, sleep" },
] as const;

/**
 * A read-only window for someone outside the family — a midwife, a triage nurse.
 *
 * The URL is shown once, on creation, and never again. The token is the whole
 * credential, so a list that re-displays it turns "revoke" into theatre: anyone
 * who can see the list could copy the link back out. The list shows what a link
 * is for and when it dies; the link itself lives in whatever you pasted it into.
 */
export function ShareLinks({ familyId, links, onChanged }: Props) {
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<string>("contractions");
  const [hours, setHours] = useState(24);
  const [creating, setCreating] = useState(false);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);

  async function create() {
    const trimmed = label.trim();
    if (!trimmed) return;

    setCreating(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("fn_share_create", {
      p_family_id: familyId,
      p_label: trimmed,
      p_scope: scope,
      p_hours: hours,
    });
    setCreating(false);

    const row = data?.[0];
    if (error || !row) {
      toast.error("Couldn't create that link.");
      return;
    }

    setFreshUrl(`${window.location.origin}/share/${row.token}`);
    setLabel("");
    onChanged();
  }

  async function revoke(id: string, linkLabel: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("fn_share_revoke", { p_id: id });
    if (error) {
      toast.error("Couldn't revoke that link.");
      return;
    }
    toast.success(`"${linkLabel}" revoked`);
    onChanged();
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      // Clipboard is blocked outside a secure context, and on iOS outside a user
      // gesture. The URL is on screen either way, so say so rather than fail mute.
      toast.error("Couldn't copy — select the link and copy it by hand.");
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-stone-400">
        Share
      </h3>

      {freshUrl && (
        <div
          data-testid="fresh-share-url"
          className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
        >
          <p className="text-xs font-medium text-amber-900">
            Copy this now — it is not shown again.
          </p>
          <p className="break-all rounded-lg bg-white px-2 py-1.5 font-mono text-[11px] text-stone-700">
            {freshUrl}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => copy(freshUrl)}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs text-white"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => setFreshUrl(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-stone-500"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-stone-200 p-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Who is this for? e.g. Midwife"
          className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <div className="flex gap-2">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="What the link shows"
            className="flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-800"
          >
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-stone-500">
            <input
              type="number"
              min={1}
              max={168}
              value={hours}
              onChange={(e) =>
                setHours(Math.min(168, Math.max(1, Number(e.target.value) || 1)))
              }
              aria-label="Hours the link stays live"
              className="w-16 rounded-lg border border-stone-200 px-2 py-1.5 text-sm text-stone-800"
            />
            hours
          </label>
        </div>
        <button
          type="button"
          onClick={create}
          disabled={!label.trim() || creating}
          className="w-full rounded-lg bg-stone-800 px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          {creating ? "Creating…" : "Create link"}
        </button>
      </div>

      {links.length > 0 && (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm text-stone-800">
                  {link.label}
                </span>
                <span className="text-[11px] text-stone-400">
                  {SCOPES.find((s) => s.value === link.scope)?.label ?? link.scope} ·
                  expires{" "}
                  {new Date(link.expires_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {link.view_count} view{link.view_count === 1 ? "" : "s"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => revoke(link.id, link.label)}
                className="shrink-0 text-xs text-rose-600 underline underline-offset-2"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
