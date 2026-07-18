# Public demo script — target 2:45

## 0:00–0:20 — Problem and claim

“AI often starts too quickly from incomplete context. Lumixia Brief does not rush to generate work from a vague prompt. It interviews until we can see what is known, what is assumed, and what still needs a human decision.”

Show the landing page and the private-workspace claim.

## 0:20–0:45 — Vague founder idea

Create **Founder preparing a brief for Codex** with one deliberately incomplete sentence. Explain that all project routes require Google plus TOTP and that no project content enters logs.

Before recording, keep `npm run codex:bridge` running, pair it from **Connections**, and leave the small local relay window open. Do not show the setup step unless needed; the green `gpt-5.6-sol` local-Codex indicator is sufficient evidence during the interview.

## 0:45–1:25 — Adaptive interview

Answer representative Problem, Audience, Outcome, Scope, Success criteria, and Constraint questions. Show that:

- only one question appears at a time;
- confidence changes across eight dimensions;
- facts cite answers;
- assumptions and contradictions are visible; and
- the server—not GPT—calculates readiness.

Voiceover: “Codex implemented the app and tests, and this demo also uses Codex on my computer as the alignment model. Each submitted answer is processed as strict structured output; the Lumixia server calculates confidence and decides whether to continue. This uses my Codex plan, not a paid API key, and nothing runs while I type.”

## 1:25–1:55 — Brief and alignment evidence

Generate the structured brief. Show Summary, Success criteria, Non-goals, Assumptions, Open questions, Decisions requiring approval, and the Alignment Improvement panel. Edit one line.

## 1:55–2:15 — Human control

Open Reject & revise and show the required section/dimension/reason, then cancel to preserve time. Approve the current version. Point out disabled fields, approver/time/version, and that Review v2 creates a new draft rather than mutating the snapshot.

## 2:15–2:35 — Notion handoff

Select a Notion parent page and sync. Re-run sync to demonstrate the same page/version is reused.

## 2:35–2:45 — Evidence

Show the repository README, CI **Required CI** check, Build Ledger, the recorded `gpt-5.6-sol` bridge smoke, and core `/feedback` Session ID `019f614d-cd80-76d3-8151-b8271f575a3f`.

End: “Lumixia Brief makes alignment a visible, human-approved product step before AI work begins.”
