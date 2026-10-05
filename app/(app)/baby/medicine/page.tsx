import { requireFamily } from "@/lib/auth/current-family";
import { MedicinePage } from "@/components/baby/MedicinePage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { familyId } = await requireFamily();
  return <MedicinePage familyId={familyId} />;
}
