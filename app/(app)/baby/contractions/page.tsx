import { requireFamily } from "@/lib/auth/current-family";
import { ContractionsPage } from "@/components/baby/ContractionsPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { familyId } = await requireFamily();
  return <ContractionsPage familyId={familyId} />;
}
