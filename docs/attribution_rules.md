# Antique Map Attribution Rules

## Purpose
This system is being built to produce antique map identification and analysis that is genuinely useful to serious collectors, dealers, and institutions.

The standard is not “plausible output.”
The standard is disciplined, evidence-based attribution.

Wrong named attributions are worse than unresolved results.

---

## Core Principles

1. Identification must be open-world first.
   The system must identify maps from observed evidence in the image and available reference context.
   It must not assume the answer is in a small internal dataset.

2. Internal corpus is secondary only.
   Internal retrieval may corroborate, supplement, or contradict a hypothesis, but it must never be the primary basis for attribution.

3. The system must prefer unresolved over incorrect attribution.
   If the evidence is insufficient to support a named cartographer, publisher, date, or edition, the output must remain unresolved or partial.

4. Observed evidence must be separated from inferred conclusions.
   The system must clearly distinguish:
   - what is directly visible or extracted
   - what is inferred from that evidence
   - what is corroborated externally
   - what remains uncertain

5. Evidence is more important than fluency.
   The system must not generate elegant, generic, or persuasive language unless it is supported by specific observed evidence.

6. Specificity is mandatory.
   Avoid generic filler such as:
   - “French cartographic tradition”
   - “strategic significance”
   - “important example of”
   unless such claims are tied to the specific identified map and supported by evidence.

7. No hallucinated authority.
   The system must not name a cartographer, publisher, engraver, date, or edition unless that field is supported by direct evidence or strong bibliographic match.

---

## Evidence Hierarchy

### Tier A — Primary bibliographic evidence
These are the strongest signals and should drive attribution:

- engraved title
- imprint / publisher line
- explicit cartographer name
- explicit publisher name
- explicit engraver name
- explicit publication date
- privilege wording
- publication address
- plate number or atlas identifier when clearly visible

### Tier B — Strong secondary evidence
Useful but not sufficient alone:

- inset titles
- legend text
- dedication text
- language
- orthography
- scale formula
- border / graticule conventions
- geographic configuration
- stylistic features consistent with known schools or publishers

### Tier C — Weak contextual evidence
May assist but must never drive attribution on its own:

- dealer page text
- seller metadata
- user-provided guesses
- visual similarity alone
- internal corpus similarity alone
- generic region/subject overlap

---

## Resolution States

### Identified
Use only when there is strong, specific support for the attribution.

Requirements:
- at least one strong primary bibliographic anchor from the image or map itself
- no major unresolved contradiction
- candidate clearly stronger than alternatives

### Probable
Use when there is meaningful support for a candidate, but decisive evidence is incomplete, partially obscured, or still uncertain.

Requirements:
- multiple supporting signals
- no fatal contradiction
- still missing at least one decisive component needed for full identification

### Unresolved
Use when the evidence does not justify a named attribution.

Use unresolved when:
- there is no strong primary bibliographic anchor
- competing candidates remain live
- image quality is too poor
- title or imprint is incomplete
- support is mostly stylistic, contextual, or retrieval-based

Unresolved is acceptable.
Wrong attribution is not acceptable.

---

## Field Policy

Each output field must be marked as one of:
- observed
- inferred
- corroborated
- unresolved / null

Fields include:
- title
- cartographer
- publisher
- engraver
- publication place
- date
- edition / state

If a field cannot be supported, it must remain null or explicitly unresolved.

---

## Internal Corpus Rules

The internal corpus is a small, biased reference set.
It must never be treated as the world of possible answers.

Allowed roles:
- corroboration
- supplementary comparison
- contradiction detection
- providing examples for review

Forbidden roles:
- primary source of truth
- forced candidate selection
- automatic attribution
- confidence inflation

If an internal match has no meaningful title, imprint, or bibliographic overlap, it must not drive attribution.

---

## External Reference Rules

External sources may be used for:
- candidate generation
- candidate verification
- contradiction detection
- bibliographic corroboration

External search must be driven by observed evidence, especially:
- title fragments
- imprint text
- publisher formulas
- visible names
- visible dates
- publication place or address

External lookup must not replace evidence from the image.
It must support or challenge hypotheses generated from observed evidence.

---

## False Attribution Prevention Rules

The system must never:
- select the nearest match by default
- convert a weak retrieval hit into a named attribution
- treat dealer metadata as primary truth
- treat visual similarity as sufficient attribution
- smooth over contradictions with polished language

The system must always:
- consider unresolved as a valid outcome
- identify contradictions explicitly
- compare top candidates against observed evidence
- reject candidates that conflict with title or imprint evidence

---

## Output Rules

Every final report must clearly separate:

1. resolution status
2. proposed identification
3. directly observed evidence
4. inferred conclusions
5. contradictions and cautions
6. candidate comparison
7. corpus corroboration
8. concise analysis
9. next evidence needed

The report must not contain generic historical filler.

---

## Review Triggers

The system should route a case to review when:
- title or imprint is incomplete
- top candidates are close
- seller metadata conflicts with image evidence
- the case may be state-sensitive
- the value or consequence of error is high
- attribution depends on a weak OCR fragment
- evidence is mixed or contradictory

---

## Non-Negotiable Standard

The goal is to produce identification and analysis that a serious collector, dealer, or institution would regard as genuinely useful.

That means:
- correct identifications when justified
- disciplined uncertainty when not justified
- no generic padding
- no incorrect named attributions
- clear evidence-based reasoning