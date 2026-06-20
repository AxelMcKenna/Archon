import { redirect } from "next/navigation";

// Dashboard is hidden for the demo. Projects is the single landing surface.
export default function Dashboard() {
  redirect("/projects");
}
