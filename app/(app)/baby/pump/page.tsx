import { requireFamily } from "@/lib/auth/current-family";
import { TimerPage } from "@/components/baby/TimerPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { familyId } = await requireFamily();
  return <TimerPage familyId={familyId} type="pump" title="Pump" emoji="🫙" />;
}
