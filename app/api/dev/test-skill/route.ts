import { NextResponse } from "next/server";
import { withSkillContext } from "@/lib/skill-action";
import { createClient } from "@/lib/supabase/server";
import { lookupFamily } from "@/lib/auth/current-family";
import * as captureRouter from "@/skills/family-capture-router";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 404 });
  }

  const supabase = await createClient();
  const family = await lookupFamily();
  if (!family.ok) {
    if (family.reason === "unauthenticated") {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    if (family.reason === "no-family") {
      return NextResponse.json({ error: "no family yet" }, { status: 400 });
    }
    return NextResponse.json({ error: family.message }, { status: 503 });
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("family_id", family.familyId);

  const result = await withSkillContext(captureRouter.run, {
    text: "need to pick up oregano, chili powder, and paper towels",
    categories: categories ?? [],
  });

  return NextResponse.json(result);
}
