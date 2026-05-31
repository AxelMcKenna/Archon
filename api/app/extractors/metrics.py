"""Cost + timing instrumentation for extractors and classifier (NFR-9)."""

from __future__ import annotations

from dataclasses import dataclass

# Approximate Anthropic pricing per 1M tokens. Update when pricing changes;
# used for budget watchdog only.
PRICE_INPUT_PER_M_OPUS = 15.00
PRICE_OUTPUT_PER_M_OPUS = 75.00
PRICE_INPUT_PER_M_HAIKU = 1.00
PRICE_OUTPUT_PER_M_HAIKU = 5.00


@dataclass
class Metrics:
    processing_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    # Verification pass tokens are tracked separately so we can attribute
    # cost between the Opus analysis call and the Haiku verification call.
    verification_input_tokens: int = 0
    verification_output_tokens: int = 0

    @property
    def cost_usd(self) -> float:
        primary = (
            self.input_tokens * PRICE_INPUT_PER_M_OPUS / 1_000_000
            + self.output_tokens * PRICE_OUTPUT_PER_M_OPUS / 1_000_000
        )
        verification = (
            self.verification_input_tokens * PRICE_INPUT_PER_M_HAIKU / 1_000_000
            + self.verification_output_tokens * PRICE_OUTPUT_PER_M_HAIKU / 1_000_000
        )
        return primary + verification
