from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

Provider = Literal["gemini", "openrouter"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""

    # ── Address checklist / geocoding ────────────────────────────────────
    geoapify_api_key: str = ""

    # ── Gemini (direct) ──────────────────────────────────────────────────
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-pro-preview"
    gemini_verifier_model: str = "gemini-2.5-flash"

    # ── OpenRouter ───────────────────────────────────────────────────────
    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-5"
    openrouter_verifier_model: str = "openai/gpt-4o-mini"
    openrouter_referer: str = ""
    # Dense embeddings for RFI clause grounding (hybrid retrieval). Dimension
    # must match the mbie_clauses.embedding column + the migration's vector(N).
    openrouter_embedding_model: str = "openai/text-embedding-3-small"
    embedding_dim: int = 1536

    # Retry/backoff for LLM provider calls. Transient failures (429/5xx/
    # network blips/flaky tool calls) are retried with exponential backoff
    # before the call is allowed to fail.
    llm_max_attempts: int = 3
    # On exhausting retries against the primary provider, fail over to the
    # other provider (OpenRouter <-> Gemini) when its API key is configured.
    # Survives a single-provider outage at the cost of a model swap.
    llm_provider_fallback: bool = True

    # Per-touchpoint provider toggle. Values: gemini | openrouter
    plan_analyser_provider: Provider = "gemini"
    plan_verifier_provider: Provider = "gemini"
    rfi_extractor_provider: Provider = "gemini"
    # Max page count accepted for an RFI letter upload. The extractor sends all
    # pages in a single vision call, so this bounds context/cost on that one
    # request (the plan analyser, by contrast, is per-sheet and already
    # unbounded). 0 = unlimited — only the 25MB upload cap then applies. Set
    # RFI_MAX_PAGES in the env to override (e.g. larger commercial RFI sets).
    rfi_max_pages: int = 50
    classifier_provider: Provider = "gemini"
    drafter_provider: Provider = "gemini"
    # CAD analyser routes through OpenRouter by default — keeps using a
    # Gemini-class vision model but bills via OR so we don't trip the
    # Gemini direct free-tier daily quota.
    cad_analyser_provider: Provider = "openrouter"
    cad_analyser_model: str = "google/gemini-3.1-pro-preview"

    # Self-consistency voting on the analyser. N parallel runs; keep flags
    # appearing in >= threshold of them. N=1 short-circuits the threadpool.
    #
    # Kept at 3/2. A determinism test (wiki/issues/0001) showed voting is a
    # *stabiliser*, not a no-op: the >=2-of-3 threshold filters out per-pass
    # provider jitter, so n=3 is measurably MORE reproducible run-to-run
    # (mean flag-set Jaccard ~0.58 vs ~0.50 at n=1) at equal accuracy.
    # Dropping to n=1 made determinism worse, so the "gut the voting" change
    # was reverted. Real reproducibility still needs temp>0 + per-pass seed
    # (the seed wiring is in place) or provider-level determinism — voting
    # alone only damps the jitter, it doesn't remove it.
    plan_analyser_voting_n: int = 3
    plan_analyser_voting_threshold: int = 2

    # Analyser sampling temperature (option B from wiki/issues/0001). At 0.0
    # the per-pass seed is inert (greedy decoding has no RNG to pin) and
    # voting only damps uncontrolled provider jitter. >0 makes the passes
    # *purposefully* diverse while the existing per-pass seed keeps each one
    # reproducible - the design voting always implied. Validated 2026-07-02 on
    # the eden box (OpenRouter analyser): run-to-run flag-set Jaccard 0.584 ->
    # 0.700 at identical accuracy (recall 0.625 both configs) - see
    # wiki/issues/0001. Seeds are best-effort, so this reduces flicker rather
    # than eliminating it; exact re-uploads are fully deterministic via the
    # service-level content-hash cache.
    plan_analyser_temperature: float = 0.5

    # ── Accuracy mechanisms (spike — all default OFF until validated on a
    # labelled real-plan eval set; see spike/accuracy-mechanisms) ─────────
    #
    # Precision: a voting bucket whose best hit is low-confidence needs one
    # extra vote to survive (threshold+1, clamped to n). High/medium buckets
    # are unaffected.
    plan_low_confidence_extra_vote: bool = False
    # Recall: a bucket seen in only one pass but at high confidence is not
    # discarded — it is sent to the verifier marked `singleton_rescue` and
    # kept ONLY if the verifier positively verifies it (fail-closed, unlike
    # normal flags which are fail-open).
    plan_singleton_rescue: bool = False
    # Precision: a flag whose verbatim_quote could not be located by either
    # the PDF text layer or OCR is demoted to low confidence and annotated
    # (`quote_located: false`) — the classic hallucination signature. Only
    # applies when OCR actually ran, so a missing OCR wheel can't demote
    # everything.
    plan_unlocated_quote_demotion: bool = False
    # Precision: a building_code:* flag for which MBIE clause retrieval
    # returned nothing is demoted to low confidence and annotated
    # (`mbie_grounding: "none"`). Retrieval already runs for the verifier,
    # so the signal is free.
    plan_ungrounded_code_demotion: bool = False
    # Recall: run the analyser voting passes on BOTH providers (primary +
    # the other one when its API key is configured), vote each provider's
    # passes separately, union the survivors, and let the verifier
    # arbitrate. ~2x analyser cost; different model families have different
    # blind spots.
    plan_analyser_ensemble: bool = False

    # Self-consistency voting on the *verifier* — the destructive step that
    # drops flags from the user's view. N verification passes per sheet; a flag
    # is only dropped when >= threshold passes agree on dropping it (fail-open:
    # a split vote keeps the flag). N=1 reproduces single-shot verification.
    # Defaults to 1 because verification cost is per-sheet × per-flag; raise it
    # (e.g. 3/2) when wrong drops cost more than verifier spend.
    plan_verifier_voting_n: int = 1
    plan_verifier_voting_threshold: int = 2

    # Max flags per verifier call. Busy sheets are verified in chunks of this
    # size so the verdict list always fits well inside the 6000-token output
    # budget — a truncated call used to silently drop verdicts for the trailing
    # flag_ids, making keep/drop depend on a flag's position in the list
    # (wiki/issues/0004). ~10 verdicts ≈ 1-2k output tokens; each extra chunk
    # re-sends the sheet images, so don't set this too low.
    plan_verifier_flags_per_call: int = 10

    # Cross-view reconciliation: build a per-sheet ViewRecord (view type,
    # level/datum, callouts), register views that describe the same region,
    # and run a reconciliation pass that flags inter-view contradictions
    # (e.g. a section FFL that disagrees with the floor-plan FFL). When False
    # the analyser behaves exactly as before (no view object is requested, no
    # extra passes run); set PLAN_CROSS_VIEW_ENABLED=false to revert.
    plan_cross_view_enabled: bool = True
    # Bounds on the reconciliation fan-out (no silent truncation — the
    # analyser logs whatever it drops). Sets larger than this many views are
    # capped; at most this many sets are reconciled per document.
    plan_cross_view_max_set_size: int = 5
    plan_cross_view_max_sets: int = 12

    # Cross-discipline coordination pass (Phase 6): compares same-level sheets of
    # different disciplines (arch vs structural vs fire vs MEP) for coordination
    # conflicts. Reuses the cross-view set caps. Gated off by default until
    # validated against real commercial multi-discipline drawing sets.
    plan_coordination_enabled: bool = False

    # Specification / product-document understanding. The deterministic spec +
    # coordination flaggers always run (free, per-upload). spec_coordination_
    # enabled gates the LLM Tier-2 pass - semantic spec/material<->drawing
    # reconciliation, including product scope-of-use vs the design. Tier 2 runs
    # ONLY on an explicit deep cross-check (never on the per-upload auto-trigger),
    # so enabling this does not add per-upload LLM cost. Set
    # SPEC_COORDINATION_ENABLED=false to hide the deep cross-check entirely.
    spec_coordination_enabled: bool = True

    # OCR fallback (RapidOCR/PP-OCRv4) for flags whose verbatim_quote isn't
    # in the PDF text layer — typical when CAD vectorises drawing labels.
    # Disable to skip the refinement step (e.g. local dev without OCR
    # wheels available).
    plan_ocr_refiner_enabled: bool = True

    # Shared secret for admin-only ingestion endpoints (POST /admin/ingest/*).
    # Empty default forces the route to 500 in deployments that haven't
    # explicitly set it, so we don't accidentally expose an open trigger.
    admin_ingest_token: str = ""

    env: str = "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
