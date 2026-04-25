"use client";

import { useState } from "react";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { createBirthdayEvent, getGiftSuggestions, recordGiftGiven } from "@/app/(app)/kids/birthday-actions";
import type { Output as BirthdayOutput } from "@/skills/family-birthday-social";

interface BirthdayEvent {
  id: string;
  party_date: string;
  host_name: string | null;
  rsvp_status: string | null;
  gift_planned: string | null;
  notes: string | null;
  kids: { name: string; birth_date: string | null } | null;
}

interface Kid {
  id: string;
  name: string;
}

interface BirthdayEventsViewProps {
  events: BirthdayEvent[];
  kids: Kid[];
  showAddButton?: boolean;
}

export function BirthdayEventsView({ events, kids, showAddButton }: BirthdayEventsViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [loadingGifts, setLoadingGifts] = useState<string | null>(null);
  const [giftModal, setGiftModal] = useState<{ eventId: string; output: BirthdayOutput } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAddEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const result = await createBirthdayEvent(formData);
    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }
    setShowForm(false);
    window.location.reload();
  }

  async function handleSuggestGift(eventId: string) {
    setLoadingGifts(eventId);
    setError(null);
    const result = await getGiftSuggestions(eventId);
    setLoadingGifts(null);

    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }

    setGiftModal({ eventId, output: result.data });
  }

  async function handlePickGift(eventId: string, idea: string) {
    const result = await recordGiftGiven(eventId, idea);
    if (!result.ok) {
      setError(result.error.userMessage);
      return;
    }
    setGiftModal(null);
    window.location.reload();
  }

  const upcoming = events.filter((e) => new Date(e.party_date) >= new Date());
  const past = events.filter((e) => new Date(e.party_date) < new Date());

  return (
    <div className="space-y-6">
      {error && <ErrorBanner userMessage={error} onRetry={() => setError(null)} />}

      {showAddButton && (
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          + Add party
        </button>
      )}

      {showForm && (
        <form onSubmit={handleAddEvent} className="p-4 border border-stone-200 rounded-xl space-y-3">
          <h3 className="text-sm font-medium text-stone-700">Add Birthday Party</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Kid</label>
              <select name="kid_id" className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm">
                <option value="">Select kid</option>
                {kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                name="party_date"
                type="date"
                required
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Host (leave blank if hosting)</label>
            <input
              name="host_name"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              placeholder="Birthday child's name if attending"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium">
              Add Party
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-stone-300 rounded-lg text-sm text-stone-600">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Gift suggestions modal */}
      {giftModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-stone-800">Gift Suggestions</h3>
              <button onClick={() => setGiftModal(null)} className="text-stone-400 hover:text-stone-600">✕</button>
            </div>
            {giftModal.output.etiquette_note && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                {giftModal.output.etiquette_note}
              </div>
            )}
            <div className="space-y-3">
              {giftModal.output.gift_suggestions.map((g, i) => (
                <div key={i} className="p-3 border border-stone-200 rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-stone-800">{g.idea}</p>
                      <p className="text-xs text-amber-700 font-medium">{g.price_range_usd}</p>
                      <p className="text-xs text-stone-500 mt-1">{g.why}</p>
                    </div>
                    <button
                      onClick={() => handlePickGift(giftModal.eventId, g.idea)}
                      className="text-xs text-amber-700 font-medium hover:underline shrink-0"
                    >
                      Pick this
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide">Upcoming</h2>
          {upcoming.map((e) => (
            <div key={e.id} className="p-3 border border-stone-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className="text-sm font-medium text-stone-800">
                    {e.host_name ? `${e.kids?.name ?? "?"}'s friend ${e.host_name}` : `${e.kids?.name ?? "?"}'s party (hosting)`}
                  </span>
                  <p className="text-xs text-stone-400">{new Date(e.party_date).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2 items-center">
                  {e.rsvp_status && (
                    <span className="text-xs text-stone-400">RSVP: {e.rsvp_status}</span>
                  )}
                  {!e.gift_planned && (
                    <button
                      onClick={() => handleSuggestGift(e.id)}
                      disabled={loadingGifts === e.id}
                      className="text-xs text-amber-700 hover:underline disabled:opacity-50"
                    >
                      {loadingGifts === e.id ? <LoadingState text="Thinking..." /> : "Suggest gift"}
                    </button>
                  )}
                  {e.gift_planned && (
                    <span className="text-xs text-green-600">Gift: {e.gift_planned}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide">Past</h2>
          {past.map((e) => (
            <div key={e.id} className="p-3 border border-stone-100 rounded-lg opacity-60">
              <span className="text-sm text-stone-600">
                {e.host_name ?? "Hosted"} — {new Date(e.party_date).toLocaleDateString()}
              </span>
              {e.gift_planned && (
                <span className="text-xs text-stone-400 ml-2">Gift: {e.gift_planned}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
