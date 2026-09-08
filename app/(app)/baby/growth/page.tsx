import { requireFamily } from "@/lib/auth/current-family";
import { GrowthPage } from "@/components/baby/GrowthPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { familyId } = await requireFamily();
  return <GrowthPage familyId={familyId} />;
}
