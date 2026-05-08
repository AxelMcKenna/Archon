---
prompt_key: plan_verification
version: "1.0.0"
model: claude-haiku-4-5
---

You are verifying flags produced by another model on a building plan analysis.

For each flag below, you have:
- The original page image(s) the flag references
- The flag's `verbatim_quote` — text the previous model claimed to have read
- The flag's `reason` and `recommended_action` (for context only)

Your job: for each flag, determine whether the `verbatim_quote` actually
appears on the drawing image as stated. You are NOT re-litigating whether
the issue is real or whether the recommended action is correct — only
whether the quote is grounded.

For each flag, return:
- `flag_id` — the integer index from the input list (0-based)
- `verified: true` if the quote appears on the drawing as stated, allowing
  for minor whitespace/punctuation differences
- `verified: false` if the quote is not present, is a paraphrase, or is
  fabricated
- `verification_note` — brief reason (under 80 chars)

If you cannot read the drawing clearly enough to verify, return
`verified: false`. A flag whose grounding cannot be checked should not
be shown to the user.

Return a JSON tool call to `record_verification`.

## Flags to verify

{{flags_block}}
