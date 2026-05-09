# Plan analyser & bbox overlay

End-to-end documentation of the pre-lodgement building-plan analyser, the
bbox grounding it produces, and the overlay rendering / inline UI that
sits on top.

## What it does

The user uploads a building plan PDF (or image). The system flags items
in the plan that are likely to trigger an RFI from the BCA, and shows
each flag positioned on the actual drawing — clickable from the side
panel, downloadable as a marked-up PDF.

```
PDF upload                  ┌──────────────────────────────────────────┐
   │                        │                                          │
   ▼                        │   • Numbered red/amber rectangles        │
┌──────────────────┐        │   • Click flag → bbox highlights         │
│ Vision model     │        │   • Click bbox → flag scrolls into view  │
│ emits flags +    │        │   • "Download PDF" exports baked-in copy │
│ verbatim quote + │        │                                          │
│ tile-local bbox  │        └──────────────────────────────────────────┘
└──────────────────┘                          ▲
   │                                          │
   ▼                                          │
[ tile→page bbox ]  →  [ verifier pass ]  →  [ text-layer refine ]  →  Pillow overlay
```

## Provider configuration

Two providers; each can be selected per-touchpoint via env. Defaults
favour Gemini direct because it's already the model returning the
tightest bboxes on technical drawings.

| Touchpoint        | Env var                       | Default     |
|-------------------|-------------------------------|-------------|
| plan_analyser     | `PLAN_ANALYSER_PROVIDER`      | `gemini`    |
| plan_verifier     | `PLAN_VERIFIER_PROVIDER`      | `gemini`    |
| rfi_extractor     | `RFI_EXTRACTOR_PROVIDER`      | `gemini`    |
| classifier        | `CLASSIFIER_PROVIDER`         | `gemini`    |
| drafter           | `DRAFTER_PROVIDER`            | `gemini`    |

Models are selected per provider:

```
GEMINI_MODEL=gemini-2.5-flash             # main — analyser, extractor, etc.
GEMINI_VERIFIER_MODEL=gemini-2.5-flash    # verifier (smaller / faster)

OPENROUTER_MODEL=openai/gpt-chat-latest   # main on OR
OPENROUTER_VERIFIER_MODEL=openai/gpt-5.4-mini
```

Both wrappers run at `temperature=0` for determinism.

## Bbox grounding pipeline

Every flag exits the analyser with:
- `bbox`: `[x0, y0, x1, y1]` in normalised page coordinates (0–1, top-left origin)
- `bbox_source`: how that bbox was derived — `"text_layer"`, `"model"`, or
  `"tile_fallback"` (in descending order of confidence)
- `verbatim_quote`: text the model claims to have read on the drawing,
  used downstream for both verification and text-layer refinement

### 1. Tile-local → page-relative

Source: `api/app/plan_analyzer.py::_attach_page_bbox`

The vision model only sees one image at a time. Dense pages get split
into four quadrant tiles (`top-left`, `top-right`, `bottom-left`,
`bottom-right`); the model emits its bbox **relative to the tile** it's
looking at. We immediately map back to page-relative coords using the
tile's offset/scale.

If the model omitted the bbox, we fall back to the tile's bounding rect
(coarse — quarter of the page) and tag `bbox_source = "tile_fallback"`.

### 2. Verifier pass

Source: `api/app/plan_analyzer.py::_verify_flags`

A small/fast model (Gemini Flash or GPT-5-mini) re-reads the drawing
images and confirms each flag's `verbatim_quote` actually appears.
Flags whose quote doesn't verify are dropped with a `verification_note`
recorded in `verification_drops`.

### 3. Text-layer refinement

Source: `api/app/plan_bbox_refiner.py`

Native PDFs from CAD tools carry a text layer with exact pixel
positions for every word. Where a flag's `verbatim_quote` matches text
in the layer (extracted via PyMuPDF), we replace the model's coarse
bbox with the pixel-perfect rect of the matched span — `bbox_source`
becomes `"text_layer"`.

Algorithm:
1. Parse all words from the cited page via pdfplumber
2. Slide a window of 1..(2 × target word count) over the page words
3. Levenshtein-similarity score each window against the normalised quote
4. Keep candidates above 0.85 ratio
5. Tie-break by **proximity to the model's original bbox** (handles cases
   like "Ground Floor Plan" appearing in both the title block and a
   sheet caption)
6. Snap the bbox to the matched span, padded slightly (±0.5% page) so
   the rectangle frames the text rather than clipping it

Falls back gracefully when:
- Upload is non-PDF (no text layer)
- Quote is shorter than 5 chars (too ambiguous)
- No window matches above the threshold (often because CAD vectorised
  the text into paths — Phase G picks these up)

### 4. OCR refinement (Phase G)

Source: `api/app/plan_ocr_refiner.py`

When the text-layer phase couldn't find a quote (typical for CAD
drawings where labels like "Garage", "Kitchen" are vector paths, not
text), we render the page at 300 DPI and run **RapidOCR** — the same
PP-OCRv4 detection + recognition models as PaddleOCR, packaged for
ONNX Runtime so it runs on every platform.

For each pending flag, the same sliding-window fuzzy match is applied
to the OCR'd regions (with proximity tiebreak to the model's hint
bbox). On match, the bbox snaps to the OCR polygon's bounding rect
and `bbox_source` becomes `"ocr"`.

Toggle via `PLAN_OCR_REFINER_ENABLED` (default `true`). On platforms
without `rapidocr-onnxruntime` wheels (Intel Mac), the import fails
quietly and refinement is skipped — the model's bbox stays.

Cost: ~2–3s per analysed page on CPU (8-core deploy box), ~600MB
resident model weights.

## Endpoints

All under `/plans/{plan_id}`:

| Endpoint                          | Returns                                          |
|-----------------------------------|--------------------------------------------------|
| `POST /plans`                     | Upload + analyse — kicks off the pipeline above |
| `GET /pages`                      | `{pages: [{page, width, height}]}` — overlay sizing |
| `GET /pages/{n}.png`              | Plain rendered page (no overlay)                 |
| `GET /overlay.pdf`                | Multi-page PDF with bboxes baked in (download)  |
| `GET /bbox-stats`                 | Diagnostic counts + bbox area stats             |
| `GET /signed-url`                 | Pre-signed URL to the original upload           |

`bbox-stats` example:
```json
{
  "total_flags": 6,
  "text_layer": 2,
  "model_grounded": 4,
  "tile_fallback": 0,
  "text_layer_pct": 33.3,
  "grounded_pct": 100.0,
  "avg_bbox_area": 0.0184,
  "median_bbox_area": 0.0143,
  "prompt_version": "2.1.0",
  "analyser_version": "2.0.0",
  "status": "analysed"
}
```

Lower `median_bbox_area` = tighter / more useful boxes. Higher
`text_layer_pct` = more of the flags are pixel-perfect ground truth.

## Inline UI

`web/src/app/plans/plan-review.tsx`

Each page is rendered via the `/pages/{n}.png` endpoint with an
absolutely-positioned overlay layer that draws the bboxes as HTML divs
— so they're truly clickable, not baked into the image.

- **Numbered pin**: each flag gets a circle with its index, anchored to
  the bbox's top-left corner; same number appears on the side-panel
  flag card so the user can map between them.
- **Severity colour**: `must_resolve` = red, `nice_to_have` = amber.
- **Line style**: solid for `model` and `text_layer` (both trustworthy);
  dashed for `tile_fallback` (coarse — only know which quadrant).
- **Bidirectional selection**: clicking a flag card scrolls/highlights
  its bbox; clicking a bbox scrolls the flag card into view and rings it.
- **Overlay toggle**: turn boxes off to see the clean drawing.
- **Download PDF**: link to `/overlay.pdf` for sharing the marked-up
  artefact.

## Known limitations

### CAD-vectorised text — handled by OCR fallback

Many CAD tools convert drawing labels to outlines/paths when exporting
to PDF. PyMuPDF / pdfplumber see no text in those regions, so
text-layer refinement alone can't snap the bbox. We now run RapidOCR
on the rendered page as Phase G to recover those labels — see "OCR
refinement" above.

On the current evaluation plan, the layered pipeline produces:
- Title-block items → `text_layer` (pixel-perfect)
- Drawing labels (Garage, Kitchen, Ensuite, etc.) → `ocr` (pixel-perfect)
- Concept-only flags with no text anchor → `model` (room-level tightness)

### Non-determinism

Same file, two runs of the analyser → could produce different flag
counts. Observed swings of 2 vs 6 vs 7 flags on identical input pre-fix.
Bbox grounding was always fine; flag *coverage* was the variable.

Mitigations now in place:

- **`temperature=0`** in both Gemini and OpenRouter wrappers.
- **Verifier** is a separate deterministic pass that drops ungrounded
  flags.
- **Self-consistency voting** — `analyse_plan` runs the vision pass
  `PLAN_ANALYSER_VOTING_N=3` times in parallel (ThreadPoolExecutor) and
  keeps flags appearing in `>= PLAN_ANALYSER_VOTING_THRESHOLD=2` of the
  runs. The voting helper buckets by `(page, normalised_area)` —
  intentionally NOT category, because the model labels the same
  observation with different categories across runs (e.g. a Garage
  fire-separation concern as `building_code:C` on one run and
  `building_code:F` on another); a 3-tuple key splits the vote and
  drops genuine consensus. Within-run duplicates count once, so a
  hyperactive run can't pad the vote. Surviving representative is the
  highest-confidence hit; ties are broken by most-common category in the
  bucket. Implementation: `_vote_flags()` and `_run_single_vision_pass()`
  in `api/app/plan_analyzer.py`. Set `PLAN_ANALYSER_VOTING_N=1` to disable
  voting (cheap dev mode).
- **Content-hash idempotency cache** — every `plan_uploads` row carries
  `content_hash` (sha256 of file bytes), `provider`, and `model_id`.
  When a user re-uploads a file we already analysed under the same
  `(content_hash, analyser_version, prompt_version, provider, model_id)`,
  the upload route copies the prior analysis into the new row and skips
  the LLM calls entirely (`processing_ms < 200ms`, `cost_usd = 0`,
  response includes `"cached": true`). Implemented in
  `api/app/routes/plans.py::upload_and_analyse` with a partial index
  `plan_uploads_cache_lookup_idx` on the same five columns.

Trade-off worth knowing: voting is precision-favouring. A single-run
catch (e.g. a "Logfire" fire-safety flag we saw earlier that only
appeared in 1 of 2 runs) gets dropped. If you want recall over
precision, set `PLAN_ANALYSER_VOTING_THRESHOLD=1` to keep the union
across runs (still de-duplicated, just no voting filter).

### Image-gen overlays (considered, not built)

We considered using Nano Banana / `google/gemini-3.1-flash-image-preview`
for "handwritten redline" overlays. Concluded that Pillow geometry
(deterministic, free, instant) is preferable to generative annotations
for this use case — image-edit models are bad at honouring pixel
coordinates from prompts, and the current redline aesthetic is already
clean and professional.

If revisited, the right architecture is a **crop-and-paste pipeline**:
crop the page at each bbox, send the crop to the image model with a
small prompt, paste the annotated crop back at the original location.
Decouples placement (deterministic, by Pillow) from aesthetic
(generative, by the model).

## File map

```
api/app/
├── plan_analyzer.py        # main pipeline; vision pass; verifier pass; voting; cache
├── plan_bbox_refiner.py    # text-layer fuzzy-match → snap bbox (Phase F)
├── plan_ocr_refiner.py     # RapidOCR fallback for vectorised labels (Phase G)
├── plan_overlay.py         # Pillow renderer (page PNGs + multi-page PDF)
├── llm/
│   ├── gemini.py           # google-genai wrapper (temp=0 by default)
│   └── openrouter.py       # OR wrapper, OpenAI-compatible chat completions
├── routes/plans.py         # all /plans/* endpoints
└── prompts/
    ├── plan_analyser_v2.md       # main analyser prompt (v2.1.0 — bbox-aware)
    └── plan_verification_v1.md   # verifier prompt

web/src/app/plans/plan-review.tsx   # inline canvas + clickable bboxes + flag list
```
