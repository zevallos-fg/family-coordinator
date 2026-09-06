import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/baby/format";

interface Props {
  params: Promise<{ token: string }>;
}

// A link handed to a clinician is short-lived and personal. It should never end
// up in an index, a preview card, or a cached copy.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

const SCOPE_TITLE: Record<string, string> = {
  contractions: "Contractions",
  baby_today: "Feeds, diapers and sleep",
};

/**
 * Public, unauthenticated, and outside the (app) route group — so no layout guard,
 * no nav, no session. `fn_share_read` takes the token and nothing else: there is no
 * family id to supply and therefore none to tamper with.
 *
 * Numbers only, here as everywhere else in the baby lane.
 */
export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_share_read", { p_token: token });

  if (error) {
    // The function raises one exception for not-found, expired and revoked alike,
    // and that vagueness is deliberate — it keeps the page from confirming which
    // tokens ever existed.
    return (
      <Message
        title="This link isn't available"
        body="It may have expired or been turned off. Ask the family for a new one."
      />
    );
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    return (
      <Message
        title="Nothing recorded yet"
        body="The link is live — anything logged inside its window will show up here when you reload."
      />
    );
  }

  const { label, scope } = rows[0];
  const isContractions = scope === "contractions";

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8">
      <div className="mx-auto max-w-md space-y-5">
        <header>
          <h1 className="text-lg font-semibold text-stone-800">
            {SCOPE_TITLE[scope] ?? scope}
          </h1>
          <p className="text-sm text-stone-500">Shared as “{label}”</p>
        </header>

        <table className="w-full overflow-hidden rounded-xl border border-stone-200 bg-white text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-[11px] uppercase tracking-wide text-stone-400">
              <th className="px-3 py-2 font-medium">Start</th>
              <th className="px-3 py-2 text-right font-medium">Duration</th>
              <th className="px-3 py-2 text-right font-medium">
                {isContractions ? "Interval" : "Since prev."}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((row, i) => (
              <tr key={`${row.started_at}-${i}`}>
                <td className="px-3 py-2 text-stone-700">
                  {new Date(row.started_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-700">
                  {row.ended_at ? formatDuration(row.duration_s) : "running"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-stone-500">
                  {formatDuration(row.since_prev_s)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-stone-400">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"} · times shown in your
          device&apos;s timezone. Reload for the latest.
        </p>
      </div>
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-base font-semibold text-stone-800">{title}</h1>
        <p className="mt-1.5 text-sm text-stone-500">{body}</p>
      </div>
    </main>
  );
}
