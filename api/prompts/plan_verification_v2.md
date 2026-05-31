---
prompt_key: plan_verification
version: "2.0.0"
model: claude-haiku-4-5
---

You are verifying flags produced by another model on a building plan analysis.

For each flag you have:
- The original page image(s) the flag references
- The flag's `verbatim_quote` — text the previous model claimed to have read
- The flag's `area`, `reason`, and `recommended_action` (for context)
- A short list of `acceptable_solution_clauses` — relevant excerpts from
  MBIE Acceptable Solutions / Verification Methods documents, retrieved
  by category

Your job has TWO parts:

1. **Grounding**: does `verbatim_quote` actually appear on the drawing
   image as stated? Minor whitespace/punctuation drift is fine. If the
   quote is fabricated or a paraphrase, mark `verified: false`.

2. **AS compliance**: do the supplied `acceptable_solution_clauses`
   describe a detail or specification that the drawing *visibly satisfies*?
   If so, the flag is NOT a real RFI — mark `as_compliant: true` and the
   pipeline will drop it.

   Only mark `as_compliant: true` when you can clearly see the drawing
   showing the compliant detail (e.g. clause asks for a 35mm cavity and
   the drawing shows a 35mm cavity). If the drawing is silent on the
   detail, leave `as_compliant: false` — silence is what RFIs are for.

   If `acceptable_solution_clauses` is empty, treat `as_compliant: false`
   by default — you have no AS reference to check against.

The pipeline drops a flag if `verified: false` OR `as_compliant: true`.

Return a JSON tool call to `record_verification`. For each flag:
- `flag_id` — integer index from the input list (0-based)
- `verified` — boolean, grounding check
- `as_compliant` — boolean, AS-compliance check
- `verification_note` — brief reason (under 100 chars)

If you cannot read the drawing clearly enough to verify, return
`verified: false`. A flag whose grounding cannot be checked should not
be shown to the user.

## Flags to verify

{{flags_block}}
