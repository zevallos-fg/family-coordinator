import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const { user } = authData;
  const { error } = await supabase.from("users").upsert({
    id: user.id,
    email: user.email!,
    full_name: user.user_metadata.full_name ?? null,
    avatar_url: user.user_metadata.avatar_url ?? null,
  });

  if (error) {
    console.error("[ensure-user] upsert failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
