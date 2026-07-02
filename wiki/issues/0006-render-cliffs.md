# [0006] Rendering DPI / tiling are version-sensitive cliffs

- **Severity:** Medium
- **Area:** rendering (`vision/core/renderer.py`)
- **Status:** **Fixed 2026-07-02** (tiling cliff; DPI cliff mitigated — see
  "Fix landed" below). Pending one eval-harness run on a keyed box before the
  next deploy, since borderline pages can change processing path.
- **Client impact:** Not run-to-run random, but non-reproducible across environments / library upgrades, and brittle to trivial source-PDF edits.

## Summary

Two rendering decisions are hard thresholds with a cliff on either side:

1. **DPI:** `classify_sheet` flips a page between 200 and 300 DPI at `> 500` text
   objects or `> 2000` vector paths. A page sitting one annotation either side of
   the boundary renders at a different resolution → different model input →
   different flags.
2. **Tiling:** a page is split into 4 tiles when its PNG exceeds
   `MAX_IMAGE_BYTES = 3.5 MB`. PNG size depends on Pillow/zlib (`optimize=True`),
   so a dependency bump can flip a borderline page between "full" and "4 tiles" →
   different image set → different flags. The `tile` value also feeds downstream
   identity (flag `tile` field, verifier prompt).

## Evidence

- `api/app/vision/core/renderer.py:17-19` — thresholds `HIGH_DETAIL_TEXT_OBJECTS=500`, `HIGH_DETAIL_VECTOR_PATHS=2000`, `DPI_STANDARD=200`, `DPI_HIGH_DETAIL=300`.
- `:30-37` — `classify_sheet`.
- `:39-43` — `png_bytes(..., optimize=True)`.
- `:90` — tiling triggered by `len(png) > MAX_IMAGE_BYTES`.

## Why it breaks determinism

These are deterministic for a *fixed* PDF + library set, but the engine is not
reproducible across Pillow/zlib/pdfplumber versions, and a one-object change to a
borderline source PDF can flip the whole sheet's processing path.

## Proposed fix

- **Decouple the tiling decision from compressed byte size:** decide tiling from
  rendered pixel dimensions / a fixed DPI policy, not PNG bytes, so zlib version
  can't move the boundary. Re-encode only to satisfy the upload size cap.
- **Pin rendering deps** (Pillow, pdfplumber) and treat bumps as
  flag-affecting changes (run the eval harness on upgrade).
- Optionally add hysteresis / record the chosen DPI+tiling on the analysis row so
  a path change is auditable.

## Effort / risk

- Medium. Touches the render path that all vision passes depend on; needs an eval
  run to confirm flags don't move for the corpus.

## Fix landed (2026-07-02)

- **Tiling decoupled from compressed bytes:** `needs_tiling` decides from
  rendered **pixel dimensions** (`TILE_PIXEL_THRESHOLD = 18 MP`), a pure
  function of the PDF + DPI policy. The byte cap survives only as
  `encode_capped`, which downscales an already-chosen image to fit
  `MAX_IMAGE_BYTES` — an encoder change can degrade pixel density but can
  never flip a page between full and tiled. Calibration: 18 MP ≈ a 3.5 MB PNG
  at ~0.19 B/px (mid-density drawing); A3/A2 render full at both DPI tiers,
  A1@200dpi tiles. The synthetic corpus (A3@200dpi = 7.7 MP, ~0.008 B/px)
  is unaffected under both rules.
- **Per-page render provenance:** `dpi_breakdown.by_page` now records
  `{dpi, tiled, classification}` per page on the analysis row, so a
  render-path change between runs is auditable instead of looking like model
  noise.
- **DPI cliff:** unchanged by design — it's deterministic for a fixed
  PDF + deps. Policy: `uv.lock` pins the rendering deps; treat
  Pillow/pdfplumber/pymupdf bumps as flag-affecting (run the eval harness on
  upgrade).

Tests: `test_plan_tiling.py` (pixel-decided tiling, downscale-not-retile).
Remaining gate: one eval run on the eden box to confirm corpus flags don't
move for real drawings near the old byte boundary.
</content>
