"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function resolveCaptureAction(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("captures")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/organized");
  revalidatePath("/dashboard");
  revalidatePath("/capture");
  return { ok: true };
}

export async function moveCaptureAction(id: string, newCategoryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("captures")
    .update({ category_id: newCategoryId })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/organized");
  return { ok: true };
}

export async function deleteCaptureAction(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("captures").delete().eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/organized");
  revalidatePath("/capture");
  revalidatePath("/dashboard");
  return { ok: true };
}
