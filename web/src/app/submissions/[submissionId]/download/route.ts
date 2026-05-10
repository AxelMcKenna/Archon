import { buildSubmissionZipResponse } from "@/lib/submission-zip";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ submissionId: string }> },
) {
  const { submissionId } = await context.params;
  return buildSubmissionZipResponse({ submissionId });
}
