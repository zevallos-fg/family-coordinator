import { requireFamily } from "@/lib/auth/current-family";
import { ReportsPage } from "@/components/baby/reports/ReportsPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { familyId } = await requireFamily();
  return <ReportsPage familyId={familyId} />;
}
