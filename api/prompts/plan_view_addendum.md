---
prompt_key: plan_view_addendum
version: "1.0.0"
---

## Also: register this view

In addition to the flags above, populate the `view` object describing what
this sheet depicts, so it can be cross-checked against other views of the
same building.

- `view_type` — one of: plan, section, elevation, detail, schedule, site,
  3d, other. (A deterministic hint may be supplied below; correct it if the
  drawing clearly shows otherwise.)
- `level_id` — the storey/level this view depicts as labelled on the sheet
  (e.g. "Ground Floor", "Level 1"). Omit when the view spans no single level.
- `scale` — the drawing scale if stated (e.g. "1:100").
- `datums` — every floor level / reduced level stated on this sheet: finished
  floor levels (FFL), reduced levels (RL), datum notes. For each, give the
  `label` (e.g. "FFL Ground Floor"), the `value` exactly as written (e.g.
  "100.500"), and a `verbatim_quote` copied from the drawing. These are the
  values that must agree between the floor plan and the sections, so quote
  them precisely.
- `callouts` — section and detail markers on this sheet that point to another
  drawing (e.g. a section bubble labelled "A-A" referencing sheet "S2.01").
  Give the `marker`, the `target_sheet` if shown, and a `verbatim_quote`.

Quote rules are the same as for flags: copy text exactly, never paraphrase,
and omit a field rather than guess.
