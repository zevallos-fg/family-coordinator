import { requireFamily } from "@/lib/auth/current-family";
import { DiaperPage } from "@/components/baby/DiaperPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { familyId } = await requireFamily();
  return <DiaperPage familyId={familyId} />;
}
