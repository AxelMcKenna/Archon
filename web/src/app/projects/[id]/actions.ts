"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function deleteProject(projectId: string) {
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);

  if (error) {
    throw error;
  }

  revalidatePath("/projects");
  redirect("/projects");
}
