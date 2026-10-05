import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFamily } from "@/lib/auth/current-family";
import { EventDetail } from "@/components/plan/EventDetail";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { familyId } = await requireFamily();

  const { data: event, error } = await supabase
    .from("family_events")
    .select("*")
    .eq("id", id)
    .eq("family_id", familyId)
    .maybeSingle();
  if (error) throw new Error(`Could not load this event: ${error.message}`);
  if (!event) notFound();

  const [itemsRes, kidRes, cardsRes, famRes] = await Promise.all([
    supabase.from("event_items").select("*").eq("event_id", id).order("position").order("created_at"),
    event.kid_id
      ? supabase.from("kids").select("id, name, birth_date").eq("id", event.kid_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("evidence_cards")
      .select("id, question, answer, citations, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("families").select("timezone").eq("id", familyId).maybeSingle(),
  ]);
  if (itemsRes.error) throw new Error(`Could not load the checklist: ${itemsRes.error.message}`);

  return (
    <EventDetail
      familyId={familyId}
      event={event}
      items={itemsRes.data ?? []}
      kid={kidRes.data ?? null}
      cards={cardsRes.data ?? []}
      timeZone={famRes.data?.timezone ?? "America/New_York"}
    />
  );
}
