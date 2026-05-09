import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getCccViewModel } from "@/lib/ccc";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await getSupabaseServer();
  const ccc = await getCccViewModel(supabase, id);

  if (ccc.readinessStatus !== "green") {
    return NextResponse.json(
      { error: "CCC package is only available when readiness is green." },
      { status: 400 },
    );
  }

  const lines = [
    "Code Compliance Certificate Readiness Report",
    `Project: ${id}`,
    `Generated: ${new Date().toISOString()}`,
    `Consent grant date: ${ccc.consentGrantDate ?? "Unknown"}`,
    `CCC deadline: ${ccc.deadlineDate ?? "Unknown"}`,
    "",
    "Inspection Checklist",
    ...ccc.inspectionChecklist.map((item) => `- [${item.status === "complete" ? "x" : " "}] ${item.name}`),
    "",
    "Document Checklist",
    ...ccc.documentChecklist.map(
      (item) => `- [${item.status === "complete" ? "x" : " "}] ${item.label} (${item.matchedDocument ?? "not uploaded"})`,
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="ccc-checklist-${id}.txt"`,
    },
  });
}
