import { requireFamily } from "@/lib/auth/current-family";
import { BabyIndex } from "@/components/baby/BabyIndex";

export const dynamic = "force-dynamic";

export default async function BabyPage() {
  const { familyId } = await requireFamily();
  return <BabyIndex familyId={familyId} />;
}
