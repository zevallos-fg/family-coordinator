import { NextResponse } from "next/server";
import { withSkillContext } from "@/lib/skill-action";
import { createClient } from "@/lib/supabase/server";
import * as captureRouter from "@/skills/family-capture-router";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "no family yet" }, { status: 400 });
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("family_id", membership.family_id);

  const result = await withSkillContext(captureRouter.run, {
    text: "need to pick up oregano, chili powder, and paper towels",
    categories: categories ?? [],
  });

  return NextResponse.json(result);
}
