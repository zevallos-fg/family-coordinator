import { requireFamily } from "@/lib/auth/current-family";
import { FeedPage } from "@/components/baby/FeedPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { familyId } = await requireFamily();
  return <FeedPage familyId={familyId} />;
}
