"""Cost + timing instrumentation for extractors and classifier (NFR-9)."""

from __future__ import annotations

from dataclasses import dataclass, field

# Approximate Anthropic pricing for claude-opus-4-7 (USD per 1M tokens).
# Update when pricing changes; used for budget watchdog only.
PRICE_INPUT_PER_M = 15.00
PRICE_OUTPUT_PER_M = 75.00


@dataclass
class Metrics:
    processing_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    extra: dict[str, float] = field(default_factory=dict)

    @property
    def cost_usd(self) -> float:
        return (
            self.input_tokens * PRICE_INPUT_PER_M / 1_000_000
            + self.output_tokens * PRICE_OUTPUT_PER_M / 1_000_000
        )

    def add(self, other: "Metrics") -> "Metrics":
        return Metrics(
            processing_ms=self.processing_ms + other.processing_ms,
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
        )
