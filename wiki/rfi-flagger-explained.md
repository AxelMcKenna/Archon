# How the RFI Flagger Works — A Plain-English Guide

*A non-technical explainer for talking to clients about Arro's RFI flagger. No code, no jargon. If you can explain what's on this page, you can explain the product.*

> The full engineering reference lives in [`rfi-engine.md`](./rfi-engine.md). This guide is the version you can read to a client.

---

## 1. The problem we solve (start here)

When someone submits building plans to a council for consent, the council reviews them. If anything is unclear, missing, or looks like it might not meet the Building Code, the council sends back a formal letter called an **RFI** — a *Request For Information*.

Every RFI is bad news for the client:

- **It stops the clock.** The council's review is paused until the client responds. A single RFI can add weeks.
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

## 3. How it works, step by step

Here's the journey from "client uploads a plan" to "client sees a list of flags." You can walk a client through this directly.

### Step 1 — Read the plan
The system opens every page of the plans and reads both the **drawings** and the **written notes** on them. Building plans are a mix of pictures and text, so it has to understand both.

### Step 2 — Look for problems (more than once)
This is the important part for building trust. The flagger doesn't look at each sheet just once. It reviews each sheet **several times independently**, then only keeps the issues that **show up consistently** across those reviews.

> **Analogy for clients:** It's like having three experienced reviewers look at the same drawing separately. If all three (or most of them) circle the same problem, it's almost certainly real. If only one mentions something once, we treat it as noise and drop it. This is why the results aren't random — agreement is the filter.

### Step 3 — Check the issue against the actual rules
For every potential issue, the system looks up the **relevant clause of the New Zealand Building Code** (the official MBIE "Acceptable Solutions") to confirm the concern is grounded in a real requirement — not just a hunch.

This does two things:
- It **confirms** genuine issues against the real rulebook.
- It **drops** issues where the plan actually *already complies* — so the client isn't bothered with false alarms.

### Step 4 — Double-check before showing the client
A second review pass acts as a skeptic. Its job is to throw out anything that:
- isn't actually visible on the drawing, or
- is already handled by an accepted standard solution.

### Step 5 — Pin each flag to the drawing
Finally, every surviving flag is anchored to the exact words or detail on the page that triggered it, so the client can click straight to it.

```
Upload plans  →  Read every sheet  →  Review each sheet several times
      →  Keep only issues that reviewers agree on
      →  Check each against the real Building Code
      →  Drop false alarms & things already compliant
      →  Pin the rest to the exact spot on the drawing
      →  Show the client a clean, clickable list of flags
```

---

## 4. Why clients can trust it (the credibility points)

These are the points that matter most when a client asks "but is it accurate?"

- **It agrees with itself before it tells you anything.** Issues only make the list if they show up across multiple independent reviews. One-off guesses are filtered out. *(see Step 2)*
- **It's tied to the real rulebook.** Flags are checked against the actual New Zealand Building Code clauses, and every flag carries a record of which clause it relates to. It's not making up rules.
- **It's deliberately cautious about staying quiet.** The system is built to **err on the side of showing you a flag**. If the checks can't confidently agree that something is fine, the flag stays. We would rather show one extra item to review than hide a real problem. *(In engineering terms this is called "fail-open" — but to a client, just say "when in doubt, it keeps the flag.")*
- **Everything is traceable.** Every flag points to a specific spot on the plan and the specific note or detail it came from. Nothing is hand-wavy.
- **It's tuned to local councils.** The system is built around how New Zealand councils (e.g. Christchurch, Selwyn, Waimakariri) actually review consents and the kinds of RFIs they actually raise.

---

## 5. What it is *not* (set expectations honestly)

Being straight about the limits builds more trust than overselling. Make these clear:

- **It is not the council, and it doesn't lodge your consent.** It predicts the questions a council is *likely* to ask. It can't guarantee the council won't ask something else.
- **It is not a guarantee of approval.** Clearing every flag makes a clean submission far more likely, but the council makes the final call.
- **It is not a replacement for your designer or a licensed professional.** It's a safety net that catches common, costly issues early — a powerful assistant, not a sign-off.
- **It's only as good as the plans it's given.** Clearer, more complete drawings produce sharper results. Very poor scans give it less to work with.

A good honest line for clients: *"It won't catch literally everything a reviewer might, but it catches the issues that cause the overwhelming majority of RFIs — the ones that cost you weeks."*

---

## 6. The value, in client terms

- **Submit with confidence.** Go in having already answered the questions a reviewer would ask.
- **Fewer RFIs, fewer delays.** Every issue fixed before submission is a letter that never gets sent — and weeks you don't lose.
- **Faster consent, lower holding costs.** A clean first submission keeps the council's clock running.
- **A second set of expert eyes, in minutes.** Not days of manual review.

---

## 7. A short script you can use with clients

> "When you send plans to the council, anything unclear or non-compliant comes back as an RFI — a formal request for more information. Each one pauses your consent and can add weeks.
>
> What our tool does is review your plans the same way a council reviewer would, *before* you submit. It reads every sheet, checks the details against the actual Building Code, and gives you a list of the things a council is most likely to query — each one pinned to the exact spot on your drawing, with a suggested fix.
>
> To make sure it's reliable, it reviews each sheet several times and only flags issues that come up consistently, and it checks every one against the real code. When it's unsure, it shows you the flag rather than hiding it — so you stay in control.
>
> It doesn't replace your designer and it doesn't lodge the consent. Think of it as a spell-checker for building consent: it catches the costly problems early, so you submit clean and keep the clock running."

---

## 8. Quick FAQ (likely client questions)

**"Does it submit my consent for me?"**
No. It reviews your plans and flags likely issues. You (or your designer) make the fixes and lodge as usual.

**"How accurate is it?"**
It only reports issues that survive multiple independent reviews and a check against the real Building Code, and it's deliberately cautious — when in doubt it keeps a flag rather than hiding one. It won't catch everything, but it catches the issues behind the large majority of RFIs.

**"Will it give me a load of false alarms?"**
It's built to minimise them: issues that don't show up consistently are dropped, and anything the plan already handles correctly is filtered out. Some borderline items are kept on purpose — better to glance at one extra item than miss a real one.

**"What kinds of plans can it read?"**
Architectural drawings and PDFs, written specifications, and CAD files. It reads both the drawn details and the written notes.

**"Does it understand New Zealand rules specifically?"**
Yes — it's built around the New Zealand Building Code and how local councils actually review consents.

**"What if my drawings are rough or incomplete?"**
It still helps, but clearer and more complete plans give sharper results — the same as for a human reviewer.

---

*Questions on anything here, or want a worked example to show a client? The technical detail behind every point above is in [`rfi-engine.md`](./rfi-engine.md).*
