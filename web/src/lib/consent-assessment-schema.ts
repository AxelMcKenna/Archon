export function isMissingConsentAssessmentsTableError(
  error:
    | {
        message?: string | null;
        code?: string | null;
      }
    | null
    | undefined,
) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("could not find the table 'public.consent_assessments'") ||
    message.includes('relation "public.consent_assessments" does not exist') ||
    message.includes('relation "consent_assessments" does not exist')
  );
}

export function isMissingConsentAssessmentSubmissionColumnsError(error: {
  message?: string | null;
}) {
  const message = String(error.message ?? "");
  return (
    message.includes("submission_packages") ||
    message.includes("document_submission_ids")
  );
}
