import { requireFamily } from "@/lib/auth/current-family";
import { SleepPatterns } from "@/components/baby/SleepPatterns";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { familyId } = await requireFamily();
  return <SleepPatterns familyId={familyId} />;
}
