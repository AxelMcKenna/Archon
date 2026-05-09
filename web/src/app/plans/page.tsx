import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// All drawing analysis and RFI work now lives inside a project. The legacy
// global page used to handle uploads and review here directly; we now route
// users to pick a project first so their work is always project-scoped.
export default function PlansPage() {
  redirect("/projects");
}
