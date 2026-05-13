"""Cost + timing instrumentation for extractors and classifier (NFR-9)."""

from __future__ import annotations

from dataclasses import dataclass, field

# Approximate Anthropic pricing per 1M tokens. Update when pricing changes;
# used for budget watchdog only.
PRICE_INPUT_PER_M_OPUS = 15.00
PRICE_OUTPUT_PER_M_OPUS = 75.00
PRICE_INPUT_PER_M_HAIKU = 1.00
PRICE_OUTPUT_PER_M_HAIKU = 5.00

# Back-compat constants (still referenced by other extractors).
PRICE_INPUT_PER_M = PRICE_INPUT_PER_M_OPUS
PRICE_OUTPUT_PER_M = PRICE_OUTPUT_PER_M_OPUS


@dataclass
class Metrics:
    processing_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    # Verification pass tokens are tracked separately so we can attribute
    # cost between the Opus analysis call and the Haiku verification call.
    verification_input_tokens: int = 0
    verification_output_tokens: int = 0
    extra: dict[str, float] = field(default_factory=dict)

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

    def add(self, other: Metrics) -> Metrics:
        return Metrics(
            processing_ms=self.processing_ms + other.processing_ms,
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            verification_input_tokens=self.verification_input_tokens
            + other.verification_input_tokens,
            verification_output_tokens=self.verification_output_tokens
            + other.verification_output_tokens,
        )
