# How the RFI Flagger Works — A Plain-English Guide

*A guide for talking to clients about Arro's RFI flagger, with a deeper "under the hood" section so you can field harder questions confidently. No code required.*

> **How to use this doc.** **Part A** is what you say to clients — plain, no jargon. **Part B** is for *your* understanding: it explains how the machine actually works (data sources, how it reads plans, how it finds the right rule). You wouldn't read Part B aloud to a client, but it means you'll never be caught out by a technical question.
>
> The full engineering reference is [`rfi-engine.md`](./rfi-engine.md).

---

# Part A — For clients

## 1. The problem we solve (start here)

When someone submits building plans to a council for consent, the council reviews them. If anything is unclear, missing, or looks like it might not meet the Building Code, the council sends back a formal letter called an **RFI** — a *Request For Information*.

Every RFI is bad news for the client:

- **It stops the clock.** The council's statutory 20-working-day review clock is paused until the client responds. A single RFI can add weeks.
- **It costs money.** Delays mean holding costs, idle trades, and pushed-back start dates.
- **It's stressful and avoidable.** Most RFIs are raised over things that could have been caught and fixed *before* submitting.

**The pitch in one sentence:** Arro's RFI flagger reads your building plans the way a council reviewer would, and tells you — before you submit — the things a council is likely to ask about, so you can fix them first.

Think of it as a **spell-checker for building consent**: it doesn't lodge the plans for you, but it catches the problems that would otherwise come back as a letter.

---

## 2. What the flagger actually does

The client uploads their plans. The flagger reads every sheet and produces a list of **flags**.

A **flag** is one specific potential issue. Each flag tells the client, in plain terms:

| The flag answers… | Example |
|---|---|
| **Where** is it? | "Sheet A-201, the bathroom wet area detail" |
| **What** is the concern? | "No waterproofing membrane shown to the shower" |
| **How serious** is it? | "Must resolve" vs "nice to have" |
| **Why** is it flagged? | The exact note or detail on the plan it's reacting to |
| **What to do** about it | A suggested fix |

Crucially, every flag points to the **exact spot on the drawing** it came from — it's pinned to the plan, like a comment in the margin. The client isn't handed a vague report; they're shown the precise detail to look at.

---

## 3. How it works (the simple version)

Here's the journey from "client uploads a plan" to "client sees a list of flags." You can walk a client through this directly.

1. **Read the plan.** It opens every page and reads both the **drawings** and the **written notes** on them.
2. **Look for problems — more than once.** It reviews each sheet **several times independently**, then keeps only the issues that **show up consistently**. *(Like three reviewers circling the same problem separately — agreement is the filter.)*
3. **Check against the real rules.** For each issue it looks up the relevant clause of the **New Zealand Building Code** to confirm the concern is genuine — and to drop things the plan already complies with.
4. **Double-check before showing you.** A second, skeptical pass throws out anything not actually visible on the drawing or already handled by an accepted solution.
5. **Pin each flag to the drawing.** Every surviving flag is anchored to the exact words or detail that triggered it.

```
Upload plans  →  Read every sheet  →  Review each sheet several times
      →  Keep only issues the reviews agree on
      →  Check each against the real Building Code
      →  Drop false alarms & things already compliant
      →  Pin the rest to the exact spot on the drawing
      →  Show the client a clean, clickable list of flags
```

---

# Part B — Under the hood (for your own understanding)

*This is the deeper picture: where the system's knowledge comes from, how it actually reads a drawing, and how it finds the right rule to check against. Use it to answer "but how does it really work?" — not as a client script.*

## 4. Where the knowledge comes from (the data sources)

The flagger isn't running on an AI's general impressions. Its judgments trace back to specific, curated sources:

**1. The New Zealand Building Code rulebook.**
The official MBIE **Acceptable Solutions** and Verification Methods — the documents that state, clause by clause, what counts as compliant (e.g. **E2** external moisture, **C** fire safety, **F7** warning systems). We ingest these PDFs into a searchable database of roughly **2,000 individual clauses**. Each clause is stored as its text *plus* a numerical "meaning fingerprint" (an embedding — explained in §6) so it can be found by meaning, not just keywords. Each clause is tagged with its code (e.g. `E2/AS1`, `C/AS2`).

**2. Local council process knowledge.**
Summaries and raw source documents for the councils we support — **Christchurch City, Selwyn District, Waimakariri District**: their forms, checklists, the statutory **20-working-day clock**, and the PS1–PS4 producer-statement system. This is what makes the tool *council-aware* rather than generic.

**3. A library of real and synthetic RFIs.**
- A **taxonomy** — a unified catalogue of RFI types, each keyed to the Building Code clause it relates to.
- Worked example RFIs written in each council's actual voice (realistic, generated from how those councils write), plus a handful of verbatim excerpts from real MBIE determinations.
- **National and per-council RFI statistics** — how often each type of RFI actually gets raised — which feed the risk and forecasting scores.

**4. Sample plans.**
A library of sample and synthetically-generated building plans used to test and tune the plan-reading pipeline.

> **The credibility line:** every flag is grounded in the official code, real council process, and observed RFI patterns — not an AI's gut feel.

## 5. How it reads your plans (vision + PDF extraction)

Building plans are unusually hard for software to read: a dense mix of line drawings, dimensions, symbols and text notes, often at A1/A0 size. The flagger uses several techniques *together*, in layers:

**1. Read the invisible text layer first.**
Most PDFs carry a hidden text layer (the actual characters behind the drawing). The system extracts this first — it's the fastest and most accurate source of notes, dimensions and labels. This structured text is handed to the AI as "ground truth" so it isn't relying on eyesight alone.

**2. Turn each page into images the AI can "see."**
It renders every sheet to a high-resolution image, at an **adaptive resolution** — standard detail at 200 DPI, fine detail at 300 DPI for busy sheets.

**3. Tile big sheets so detail stays legible.**
A whole A1 sheet shrunk to one image loses the fine print. So when a page image is too large, it's split into a **2×2 grid of overlapping tiles** (10% overlap, so nothing on a seam is cut in half) and each tile is read separately. This is how it keeps small annotations readable.

**4. OCR for "drawn" text.**
CAD programs often output labels as vector linework rather than real characters — so there's no text layer to extract. When the system detects the text layer missed something, it falls back to **OCR** (optical character recognition — reading text out of the image pixels) to recover those labels.

**5. Cope with deliberately awkward documents.**
Some official PDFs are hostile to extraction. For example, one MBIE Acceptable Solution uses an **obfuscated font** that maps its digits into a private region of the character set, so naive extraction produces garbage numbers. The ingestion pipeline detects this and **remaps the glyphs back to the correct digits** — which matters a lot when those numbers are legal requirements. If it can't do that safely, it falls back to OCR.

> **The strategy in one line:** text layer first → render and see → tile for detail → OCR fallback → special handling for obfuscated/scanned docs. The net result: it reliably reads both the drawings *and* the words on them.

## 6. How it finds the right rule (retrieval)

When the flagger spots a potential issue, it must pull the *relevant* Building Code clause to check it against. With ~2,000 clauses it can't read them all every time — it has to **retrieve** the right handful. This is the part people are usually most curious about.

**1. Narrow to the right family first.**
Each issue carries a category (e.g. "external moisture / cladding" → clause family **E2**). The system filters the corpus down to that family before searching — so a cladding issue only ever searches moisture clauses, never fire clauses.

**2. Search two ways at once.**
- **Keyword search** — does the clause text literally contain these words?
- **Meaning search** — which clauses are about the same *concept*, even in different words? This works by comparing **embeddings**: each clause and each search query is turned into a long list of numbers (a vector), and clauses whose numbers sit closest to the query's are the most similar in meaning.

These are complementary: keyword nails exact terminology; meaning catches the same idea phrased differently.

**3. Combine the two lists fairly.**
The two searches return two ranked lists on different scales that can't be compared directly. The system merges them with **Reciprocal Rank Fusion** — a method that ranks by *position* in each list rather than raw score, so a clause that ranks high in *both* rises to the top. The top few clauses then go to the checking step.

**4. Pick the right Acceptable Solution for the building type.**
The same requirement can have different solutions depending on the building. For example, fire clause `C/AS1` applies only to standalone houses (Risk Group SH); other building types use `C/AS2`. The system biases the search toward the correct document for the project's risk group.

**5. Never break.**
The mechanism **degrades gracefully**: if the meaning-search component is unavailable, it falls back to keyword-only; if the combined search fails, it falls back to a simpler keyword search. It always returns *something* to check against rather than failing outright.

> **A real tuning story (good for credibility):** an early version of the keyword search required a clause to contain *every* search word — which made it almost never match (it found the right clause only ~9% of the time). Switching it to "match on *any* of these words" fixed it. That kind of tuning is the difference between flags that are genuinely grounded and flags that aren't.

## 7. How it pins each flag to the exact spot

A flag is only useful if the client can find what it's about. The system locates each flag through a chain of increasingly precise steps:

1. The AI gives a **rough location** (which tile, roughly where).
2. That's converted to a **position on the full page**.
3. The system then tries to **snap it to the exact text**: it takes the flag's *verbatim quote* (the note it's reacting to) and finds that phrase in the PDF text layer — tolerating small typos (an ~85% similarity match) — and pins the flag right there.
4. If the text layer didn't contain it (drawn/CAD text), it **snaps via OCR** instead.

Every flag records *how* it was located (AI estimate → text-layer match → OCR), so there's a provenance trail behind each pin. That's why flags land on the right detail instead of floating on the sheet.

## 8. The AI models involved

- The plan-reading ("vision") and the checking passes use large AI models accessed through **OpenRouter** (GPT-class models) and **Google Gemini**, with **automatic failover** between providers so one outage doesn't stop an analysis.
- The "meaning fingerprints" (embeddings) use a dedicated embedding model (1,536 numbers per item).
- Different steps deliberately use different model tiers — a stronger model for the first read, a cheaper one for parts of the checking — to balance accuracy against cost.

---

# Part A (continued) — Talking to clients

## 9. Why clients can trust it (the credibility points)

These are the points that matter most when a client asks "but is it accurate?"

- **It agrees with itself before it tells you anything.** Issues only make the list if they appear across multiple independent reviews. One-off guesses are filtered out. *(§3 step 2)*
- **It's tied to the real rulebook.** Flags are checked against the actual New Zealand Building Code clauses, and every flag carries a record of which clause it relates to. *(§4, §6)*
- **It reads the real drawing, not a summary.** It extracts the PDF's own text, renders and tiles each sheet for detail, and OCRs anything drawn rather than typed. *(§5)*
- **It's deliberately cautious about staying quiet.** The system is built to **err on the side of showing you a flag**. If the checks can't confidently agree something is fine, the flag stays. We'd rather show one extra item than hide a real problem. *(In engineering terms, "fail-open"; to a client, just say "when in doubt, it keeps the flag.")*
- **Everything is traceable.** Every flag points to a specific spot on the plan and the specific note it came from, with a record of how it was located. *(§7)*
- **It's tuned to local councils.** Built around how Christchurch, Selwyn and Waimakariri actually review consents and the RFIs they actually raise. *(§4)*

## 10. What it is *not* (set expectations honestly)

Being straight about the limits builds more trust than overselling:

- **It is not the council, and it doesn't lodge your consent.** It predicts the questions a council is *likely* to ask. It can't guarantee the council won't ask something else.
- **It is not a guarantee of approval.** Clearing every flag makes a clean submission far more likely, but the council makes the final call.
- **It is not a replacement for your designer or a licensed professional.** It's a safety net that catches common, costly issues early — a powerful assistant, not a sign-off.
- **It's only as good as the plans it's given.** Clearer, more complete drawings produce sharper results; very poor scans give it less to work with.

A good honest line: *"It won't catch literally everything a reviewer might, but it catches the issues that cause the overwhelming majority of RFIs — the ones that cost you weeks."*

## 11. The value, in client terms

- **Submit with confidence** — having already answered the questions a reviewer would ask.
- **Fewer RFIs, fewer delays** — every issue fixed before submission is a letter that never gets sent.
- **Faster consent, lower holding costs** — a clean first submission keeps the council's clock running.
- **A second set of expert eyes, in minutes** — not days of manual review.

## 12. A short script you can use with clients

> "When you send plans to the council, anything unclear or non-compliant comes back as an RFI — a formal request for more information. Each one pauses your consent clock and can add weeks.
>
> What our tool does is review your plans the same way a council reviewer would, *before* you submit. It reads every sheet — the drawings and the written notes — checks the details against the actual New Zealand Building Code, and gives you a list of the things a council is most likely to query, each one pinned to the exact spot on your drawing, with a suggested fix.
>
> To make sure it's reliable, it reviews each sheet several times and only flags issues that come up consistently, and it checks every one against the real code. When it's unsure, it shows you the flag rather than hiding it — so you stay in control.
>
> It doesn't replace your designer and it doesn't lodge the consent. Think of it as a spell-checker for building consent: it catches the costly problems early, so you submit clean and keep the clock running."

## 13. Quick FAQ (likely client questions)

**"Does it submit my consent for me?"**
No. It reviews your plans and flags likely issues. You (or your designer) make the fixes and lodge as usual.

**"How accurate is it?"**
It only reports issues that survive multiple independent reviews and a check against the real Building Code, and it's deliberately cautious — when in doubt it keeps a flag rather than hiding one. It won't catch everything, but it catches the issues behind the large majority of RFIs.

**"Where does it get its rules from?"**
From the official MBIE Building Code Acceptable Solutions (about 2,000 clauses), the consent processes of the local councils we support, and a library of real-world RFI patterns and statistics. *(§4)*

**"How does it read my drawings? Can it handle CAD-style text?"**
It extracts the PDF's hidden text, renders each sheet to a high-resolution image (tiling big sheets so detail stays legible), and uses OCR to read labels that were drawn rather than typed — including some deliberately awkward source documents. *(§5)*

**"How does it know which rule applies?"**
It narrows to the right clause family, then searches both by keyword and by meaning, combines the results, and picks the Acceptable Solution that fits your building type. *(§6)*

**"Will it give me a load of false alarms?"**
It's built to minimise them: issues that don't show up consistently are dropped, and anything the plan already handles correctly is filtered out. Some borderline items are kept on purpose — better to glance at one extra item than miss a real one.

**"What kinds of plans can it read?"**
Architectural drawings and PDFs, written specifications, and CAD files. It reads both the drawn details and the written notes.

**"Does it understand New Zealand rules specifically?"**
Yes — it's built around the New Zealand Building Code and how local councils actually review consents.

---

*Questions on anything here, or want a worked example to show a client? The technical detail behind every point above is in [`rfi-engine.md`](./rfi-engine.md).*
