# ADR-0002: Server-owned alignment and stop rules

- Status: accepted
- Date: 2026-07-14

## Context

Model output is useful for semantic extraction but cannot be treated as a scientific score or the authority over workflow state.

## Decision

GPT-5.6 returns strict facts, assumptions, contradictions, eight assessments, and one proposed next question. The server normalizes all dimensions, calculates `sum / 24 × 100`, applies essential-dimension and contradiction rules, selects priority, and enforces 5–12 questions.

## Consequences

- Confidence is explainable and unit-testable.
- Malformed/refused model output fails safely and retains the answer for retry.
- The indicator communicates information completeness, not truth or precision.
