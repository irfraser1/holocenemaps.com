// ════════════════════════════════════════════════════════════
// prompts.ts — Combined Extract+Identify, and Corroborate Prompts
// ════════════════════════════════════════════════════════════

// ── Call 1: EXTRACT + IDENTIFY (combined — single image pass) ──
// Observation AND identification in one call to eliminate double image processing.

export const EXTRACT_IDENTIFY_PROMPT = `You are a senior specialist at a major map auction house. Examine this map photograph carefully and complete TWO tasks in sequence:

TASK 1 — EXTRACT: Record what you directly observe in the image.
TASK 2 — IDENTIFY: Using those observations and your expert knowledge, identify the map.

ARCHAIC TEXT GUIDANCE:
Maps from the 15th–18th centuries use period conventions you must recognize:
- V often substitutes for U (NVEVA = Nueva, VNIVERSALIS = Universalis)
- Long-S (ſ) resembles f — transcribe as s
- I often substitutes for J (IAPAN = Japan)
- Latin abbreviations are common: q̃ = que, ñ = nn
- Titles may be in Latin, Italian, French, Spanish, Dutch, or German
- Decorative engraved capitals are still title text — read them carefully
- Check the TOP CENTER of the map first for the main title
- Check BELOW the map image and in CARTOUCHES for imprint/credits
- Transcribe as printed, preserving period spelling (e.g., TIERRA NVEVA not Tierra Nueva)

If NOT a map: {"error": "I only know about maps, unfortunately! Point your camera at an antique or vintage map and I'll tell you everything about it. 🗺️"}

Return this JSON with BOTH sections:
{
  "extracted": {
    "observed": {
      "title_text": "Transcribe any title text exactly as printed. Empty string if illegible.",
      "date_text": "Transcribe any date text. Empty string if none.",
      "place_names": ["Legible place names on the map"],
      "cartographer_text": "Any cartographer/author credit visible. Empty string if none.",
      "publisher_text": "Any publisher/printer credit visible anywhere. Empty string if none.",
      "engraver_text": "Any engraver credit visible (e.g., 'sculp.', 'del.', 'fecit'). Empty string if none.",
      "page_or_plate_number": "Any page/plate number. Empty string if none.",
      "format_clues": ["Physical clues: 'plate mark visible', 'wide margins', 'book gutter', 'fold lines', etc."],
      "technique_clues": ["Technique evidence: 'plate mark', 'stipple shading', 'lithographic texture', etc."],
      "condition_clues": ["Condition: 'foxing', 'centerfold', 'original hand colour', 'trimmed margins', etc."]
    },
    "ocr_confidence": {
      "title_text": "high | medium | low | none",
      "date_text": "high | medium | low | none",
      "cartographer_text": "high | medium | low | none"
    },
    "classification": {
      "object_category": "separately_issued_map | book_plate | atlas_plate | magazine_map | guide_map | other_component | undetermined",
      "classification_confidence": "high | medium | low",
      "classification_reason": "OBSERVED: [evidence]. INFERRED: [conclusion]."
    }
  },

  "identified": {
    "resolution_state": "identified | probable | unresolved",
    "resolution_reasoning": "Why you chose this resolution state. Reference specific evidence.",

    "attribution": {
      "title": {
        "value": "Best title, or null if unknown",
        "evidence_basis": "observed | inferred | unresolved",
        "evidence_detail": "What evidence supports this value"
      },
      "cartographer": {
        "value": "Named cartographer or null",
        "evidence_basis": "observed | inferred | unresolved",
        "evidence_detail": "What evidence supports this"
      },
      "publisher": {
        "value": "Named publisher or null",
        "evidence_basis": "observed | inferred | unresolved",
        "evidence_detail": "What evidence supports this"
      },
      "date": {
        "value": "Date or null",
        "evidence_basis": "observed | inferred | unresolved",
        "evidence_detail": "What evidence supports this"
      },
      "engraver": {
        "value": "Named engraver or null",
        "evidence_basis": "observed | inferred | unresolved",
        "evidence_detail": "What evidence supports this"
      },
      "publication_place": {
        "value": "Place or null",
        "evidence_basis": "observed | inferred | unresolved",
        "evidence_detail": "What evidence supports this"
      },
      "edition_state": {
        "value": "Edition/state or null",
        "evidence_basis": "observed | inferred | unresolved",
        "evidence_detail": "What evidence supports this"
      }
    },

    "region": "Geographic region depicted",
    "technique": "Printing technique with evidence",
    "dimensions_estimate": "Estimated dimensions or null",
    "condition_notes": "Condition observations or null",
    "parent_work": "Parent atlas or publication, or null",

    "competing_candidates": ["Other plausible identifications, if any"],
    "uncertainties": ["Unresolved questions"],
    "evidence_summary": "Summary of what observed evidence supports your identification",

    "user_facing": {
      "headline": "Concise result title for the user",
      "summary": "3-4 sentences, specialist dealer catalogue style. Every sentence specific to THIS map. First: [map category + maker] + [period] + [characteristics]. Second: Historical context. Third: Distinguishing features. Fourth (optional): Copy-specific observations. PROHIBITED: 'historical significance', 'artistic detail', 'collectors value', 'beautifully detailed', 'fine example', 'rich history', 'testament to', 'a window into'.",
      "confidence_summary": "What you CAN vs CANNOT identify, in plain language",
      "conversation_prompt": "A compelling question about the map. Max 12 words. null if not appropriate.",
      "conversation_response": "3-5 sentence answer. null if prompt is null.",
      "rarity": "Rarity assessment with reasoning, or null"
    }
  }
}

RESOLUTION STATE — choose exactly one:
- "identified": Strong evidence — at least one primary bibliographic anchor (visible title, imprint, cartographer name, or date) — no major contradictions. Candidate clearly stronger than alternatives.
- "probable": Meaningful support (multiple signals, style match, partial text) but missing at least one decisive component. No fatal contradiction.
- "unresolved": Evidence does not justify a named attribution. Use when: no primary anchor, competing candidates, poor image quality, or support is mainly stylistic.

CRITICAL RULES:
- Transcribe EXACTLY what you see — no corrections or expansions in the extracted section.
- Check the ENTIRE image: margins, corners, edges for credits.
- Unresolved is acceptable. Wrong attribution is NOT acceptable.
- Do NOT name a cartographer, publisher, or title unless you have specific evidence.
- If resolution_state is "unresolved", then cartographer.value and publisher.value MUST be null.
- Every attribution field must have evidence_basis: "observed" (directly visible), "inferred" (concluded from evidence), or "unresolved" (insufficient evidence, value is null).
- No market value, price ranges, or dollar figures.

Return ONLY valid JSON.`;

// Legacy export for backward compatibility
export const EXTRACT_PROMPT = EXTRACT_IDENTIFY_PROMPT;
export function buildIdentifyPrompt(_extractedJson: string): string {
  // No longer used — Extract+Identify are now combined
  return '';
}

// ── Call 2: CORROBORATE ──
// Review independent identification against corpus records.
// Cannot change core attribution fields.

export function buildCorroboratePrompt(
  extractedJson: string,
  identifyJson: string,
  candidateBlock: string,
  candidateCount: number
): string {
  return `You are a senior map specialist reviewing an independent identification against reference records from a small internal corpus.

YOUR ROLE: Assess whether the reference records corroborate, weaken, or contradict the independent identification below. You are a reviewer, not a re-identifier.

EXTRACTED OBSERVATIONS (from the original image — you cannot see the image):
${extractedJson}

INDEPENDENT IDENTIFICATION (already completed — treat as SETTLED INPUT):
${identifyJson}

REFERENCE RECORDS (${candidateCount} records, unranked, arbitrary order — from a small, biased internal corpus):
${candidateBlock}

═══════════════════════════════════════════════════════════════
ABSOLUTE RULES — VIOLATION OF THESE IS UNACCEPTABLE:

1. You CANNOT change the value of any core attribution field:
   - title, cartographer, publisher, date, engraver
   These values are set by the independent identification. You may only assess them.

2. You CANNOT populate a core field that was null/unresolved in the identification.
   If the identification could not determine a cartographer, you cannot supply one from corpus.

3. You CANNOT promote the resolution state.
   If the identification said "probable", you cannot upgrade to "identified".
   You CAN downgrade: "identified" → "probable" → "unresolved".

4. You CANNOT replace the independent attribution with a different named
   cartographer/publisher/title just because a corpus record looks plausible.
   A weak or approximate corpus match must NEVER become the final answer.

5. The corpus is a small, biased internal dataset. It is NOT the world of
   possible answers. Most maps that exist are NOT in this corpus.
═══════════════════════════════════════════════════════════════

WHAT YOU CAN DO:
- Confirm: a corpus record matches the independent identification → mark as "confirmed"
- Weaken: a corpus record raises doubt about an inferred attribution → mark as "weakened"
- Contradict: a corpus record directly conflicts with the identification → mark as "contradicted", explain
- Supplement: add parent_work, tradition, edition notes from corpus (clearly labeled)
- Downgrade resolution state if warranted
- Adjust the user-facing summary and confidence summary if the corpus changes the picture

Return this JSON:
{
  "field_effects": {
    "title": {
      "effect": "confirmed" | "weakened" | "contradicted" | "no_effect",
      "detail": "What corpus evidence led to this assessment",
      "matching_record_title": "Title of the matching corpus record, or null"
    },
    "cartographer": { same structure },
    "publisher": { same structure },
    "date": { same structure },
    "engraver": { same structure }
  },

  "overall_effect": "corroborated" | "supplemented" | "contradicted" | "no_effect",
  "corroboration_summary": "Brief summary of what the corpus comparison found",

  "adjusted_resolution_state": "identified" | "probable" | "unresolved",
  "state_change_reason": "Why change, or null if no change",

  "supplementary": {
    "parent_work": "Parent publication from corpus, or null",
    "tradition": "Cartographic tradition from corpus, or null",
    "edition_state_note": "Edition/state detail from corpus that does NOT change core identity, or null",
    "additional_context": "Brief factual supplement from corpus, or null"
  },

  "contradictions": [
    {
      "field": "which core field",
      "identify_value": "what the identification said",
      "corpus_value": "what the corpus says",
      "corpus_record_title": "which record",
      "assessment": "your analysis of the contradiction"
    }
  ],

  "adjusted_summary": "Revised user-facing summary incorporating corpus findings, or null to keep original",
  "adjusted_confidence_summary": "Revised confidence summary, or null to keep original"
}

Remember:
- No market value, price ranges, or dollar figures.
- Core field values are IMMUTABLE. You assess them, you do not replace them.
- If no corpus record is relevant, overall_effect should be "no_effect".
- If a corpus record is a near-match but not a true match, say so explicitly — do NOT treat it as confirmation.

Return ONLY valid JSON.`;
}
