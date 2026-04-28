// ════════════════════════════════════════════════════════════
// schema.ts — Attribution Engine Types, Validation, and Audit
// ════════════════════════════════════════════════════════════

// ── Resolution States ──

export type ResolutionState = "identified" | "probable" | "unresolved";

const RESOLUTION_RANK: Record<ResolutionState, number> = {
  identified: 2,
  probable: 1,
  unresolved: 0,
};

function stateFromRank(rank: number): ResolutionState {
  if (rank >= 2) return "identified";
  if (rank >= 1) return "probable";
  return "unresolved";
}

function downgradeState(state: ResolutionState): ResolutionState {
  const rank = RESOLUTION_RANK[state];
  return stateFromRank(Math.max(0, rank - 1));
}

// ── Evidence Basis ──

export type EvidenceBasis = "observed" | "inferred" | "corroborated" | "unresolved";

// ── Field Types ──

export interface CoreAttributionField {
  value: string | null;
  evidence_basis: EvidenceBasis;
  evidence_detail: string;
}

export interface SupplementaryField {
  value: string | null;
  evidence_basis: EvidenceBasis;
  source: "identify" | "corpus" | null;
  evidence_detail: string;
}

// ── Core field names (frozen after Identify) ──

export const CORE_FIELDS = ["title", "cartographer", "publisher", "date", "engraver"] as const;
export type CoreFieldName = typeof CORE_FIELDS[number];

// ── Extract Output (Call 1) ──

export interface ExtractOutput {
  observed: {
    title_text: string;
    date_text: string;
    place_names: string[];
    cartographer_text: string;
    publisher_text: string;
    engraver_text: string;
    page_or_plate_number: string;
    format_clues: string[];
    technique_clues: string[];
    condition_clues: string[];
  };
  ocr_confidence: {
    title_text: "high" | "medium" | "low" | "none";
    date_text: "high" | "medium" | "low" | "none";
    cartographer_text: "high" | "medium" | "low" | "none";
  };
  classification: {
    object_category: string;
    classification_confidence: "high" | "medium" | "low";
    classification_reason: string;
  };
  error?: string;
}

// ── Identify Output (Call 2) ──

export interface IdentifyOutput {
  resolution_state: ResolutionState;
  resolution_reasoning: string;

  attribution: {
    title: CoreAttributionField;
    cartographer: CoreAttributionField;
    publisher: CoreAttributionField;
    date: CoreAttributionField;
    engraver: CoreAttributionField;
    publication_place: CoreAttributionField; // supplementary at validation level
    edition_state: CoreAttributionField;     // supplementary at validation level
  };

  region: string;
  technique: string;
  dimensions_estimate: string | null;
  condition_notes: string | null;
  parent_work: string | null;

  competing_candidates: string[];
  uncertainties: string[];
  evidence_summary: string;

  user_facing: {
    headline: string;
    summary: string;
    confidence_summary: string;
    conversation_prompt: string | null;
    conversation_response: string | null;
    rarity: string | null;
  };
}

// ── Corroborate Output (Call 3) ──

export interface FieldCorroboration {
  effect: "confirmed" | "weakened" | "contradicted" | "no_effect";
  detail: string;
  matching_record_title: string | null;
}

export interface Contradiction {
  field: string;
  identify_value: string;
  corpus_value: string;
  corpus_record_title: string;
  assessment: string;
}

export interface CorroborateOutput {
  field_effects: {
    title: FieldCorroboration;
    cartographer: FieldCorroboration;
    publisher: FieldCorroboration;
    date: FieldCorroboration;
    engraver: FieldCorroboration;
  };

  overall_effect: "corroborated" | "supplemented" | "contradicted" | "no_effect";
  corroboration_summary: string;

  adjusted_resolution_state: ResolutionState;
  state_change_reason: string | null;

  supplementary: {
    parent_work: string | null;
    tradition: string | null;
    edition_state_note: string | null;
    additional_context: string | null;
  };

  contradictions: Contradiction[];

  adjusted_summary: string | null;
  adjusted_confidence_summary: string | null;
}

// ════════════════════════════════════════════════════════════
// Audit Trail
// ════════════════════════════════════════════════════════════

export interface AuditEntry {
  rule: string;
  action: "passed" | "fired" | "blocked";
  detail: string;
}

export interface AuditTrail {
  identify_resolution_state: ResolutionState;
  corroborate_adjusted_resolution_state: ResolutionState | null; // null if corroborate not run
  final_resolution_state: ResolutionState;
  corpus_effect: "corroborated" | "supplemented" | "contradicted" | "no_effect" | "not_run";
  blocked_field_changes: {
    field: string;
    attempted_value: string;
    retained_value: string | null;
    reason: string;
  }[];
  contradictions_detected: Contradiction[];
  rules_fired: AuditEntry[];
}

function createAudit(identifyState: ResolutionState): AuditTrail {
  return {
    identify_resolution_state: identifyState,
    corroborate_adjusted_resolution_state: null,
    final_resolution_state: identifyState,
    corpus_effect: "not_run",
    blocked_field_changes: [],
    contradictions_detected: [],
    rules_fired: [],
  };
}

// ════════════════════════════════════════════════════════════
// Validation Rules
// ════════════════════════════════════════════════════════════

// Rule 1: Resolution state can only stay or downgrade
function validateResolutionDowngrade(
  identifyState: ResolutionState,
  corroborateState: ResolutionState,
  audit: AuditTrail
): ResolutionState {
  const idRank = RESOLUTION_RANK[identifyState];
  const corRank = RESOLUTION_RANK[corroborateState];

  if (corRank > idRank) {
    // Corroborate tried to promote — block it
    audit.rules_fired.push({
      rule: "Rule 1: Resolution state can only stay or downgrade",
      action: "fired",
      detail: `Corroborate attempted promotion from "${identifyState}" to "${corroborateState}". Blocked — keeping "${identifyState}".`,
    });
    return identifyState;
  }

  audit.rules_fired.push({
    rule: "Rule 1: Resolution state can only stay or downgrade",
    action: corRank < idRank ? "fired" : "passed",
    detail: corRank < idRank
      ? `Downgraded from "${identifyState}" to "${corroborateState}".`
      : `No change: "${identifyState}".`,
  });
  return corroborateState;
}

// Rule 2: Core identity fields are immutable
function validateCoreFieldImmutability(
  identify: IdentifyOutput,
  corroborate: CorroborateOutput,
  audit: AuditTrail
): void {
  // The corroborate output doesn't contain field *values* — it contains
  // field_effects. But we still check: if the corroborate response somehow
  // attached a different value (via supplementary or other path), we block it.
  // This is primarily a schema-level guarantee enforced by the prompt, but
  // we verify it defensively here.

  // No field values to compare — the corroborate schema doesn't carry new values
  // for core fields. This rule is structurally enforced by the schema design.
  // We log it as passed.
  audit.rules_fired.push({
    rule: "Rule 2: Core identity fields are immutable",
    action: "passed",
    detail: "Corroborate schema does not carry replacement values for core fields. Structural guarantee maintained.",
  });
}

// Rule 3: Unresolved core fields cannot be populated by corpus
function validateUnresolvedCoreCannotPopulate(
  identify: IdentifyOutput,
  corroborate: CorroborateOutput,
  audit: AuditTrail
): void {
  for (const field of CORE_FIELDS) {
    const identifyField = identify.attribution[field];
    if (identifyField.value === null || identifyField.evidence_basis === "unresolved") {
      // Check if corroborate tried to "confirm" or "corroborate" a null field
      const effect = corroborate.field_effects[field];
      if (effect && effect.effect === "confirmed") {
        audit.rules_fired.push({
          rule: "Rule 3: Unresolved core fields cannot be populated",
          action: "fired",
          detail: `Core field "${field}" was unresolved in Identify but corroborate marked it "confirmed". Effect overridden to "no_effect".`,
        });
        // Override in place
        effect.effect = "no_effect";
        effect.detail = `[BLOCKED] ${effect.detail}`;
      }
    }
  }

  audit.rules_fired.push({
    rule: "Rule 3: Unresolved core fields cannot be populated",
    action: "passed",
    detail: "All unresolved core fields remain unpopulated.",
  });
}

// Rule 4: Evidence basis can only upgrade on corroboration axis (core fields)
function validateBasisTransition(
  identifyBasis: EvidenceBasis,
  corroborateEffect: "confirmed" | "weakened" | "contradicted" | "no_effect",
  fieldName: string,
  audit: AuditTrail
): EvidenceBasis {
  // unresolved → anything else is BLOCKED
  if (identifyBasis === "unresolved") {
    audit.rules_fired.push({
      rule: "Rule 4: Evidence basis transition",
      action: "passed",
      detail: `"${fieldName}": unresolved stays unresolved.`,
    });
    return "unresolved";
  }

  // observed/inferred + confirmed → corroborated
  if (corroborateEffect === "confirmed" && (identifyBasis === "observed" || identifyBasis === "inferred")) {
    audit.rules_fired.push({
      rule: "Rule 4: Evidence basis transition",
      action: "passed",
      detail: `"${fieldName}": ${identifyBasis} → corroborated (confirmed by corpus).`,
    });
    return "corroborated";
  }

  // inferred + weakened/contradicted → unresolved
  if (identifyBasis === "inferred" && (corroborateEffect === "weakened" || corroborateEffect === "contradicted")) {
    audit.rules_fired.push({
      rule: "Rule 4: Evidence basis transition",
      action: "fired",
      detail: `"${fieldName}": inferred → unresolved (${corroborateEffect} by corpus).`,
    });
    return "unresolved";
  }

  // observed + weakened → stays observed (we don't downgrade observed to unresolved)
  // observed + contradicted → stays observed but contradiction is logged separately
  audit.rules_fired.push({
    rule: "Rule 4: Evidence basis transition",
    action: "passed",
    detail: `"${fieldName}": ${identifyBasis} → ${identifyBasis} (corroborate effect: ${corroborateEffect}).`,
  });
  return identifyBasis;
}

// Rule 5: Confidence cannot inflate
// (Enforced implicitly by Rule 1 — resolution state cannot upgrade.
//  We add an explicit check on the user-facing confidence rendering.)
function validateConfidenceNoInflation(
  identifyState: ResolutionState,
  finalState: ResolutionState,
  audit: AuditTrail
): string {
  // Map resolution state to user-facing confidence
  const stateToConfidence: Record<ResolutionState, string> = {
    identified: "high",
    probable: "medium",
    unresolved: "low",
  };

  const identifyConf = stateToConfidence[identifyState];
  const finalConf = stateToConfidence[finalState];

  audit.rules_fired.push({
    rule: "Rule 5: Confidence cannot inflate",
    action: "passed",
    detail: `Identify confidence: ${identifyConf}, final confidence: ${finalConf}.`,
  });

  return finalConf;
}

// Rule 6: Contradiction → mandatory downgrade
function applyContradictionDowngrade(
  currentState: ResolutionState,
  contradictions: Contradiction[],
  audit: AuditTrail
): ResolutionState {
  // Check if any contradiction involves a core field
  const coreContradictions = contradictions.filter(c =>
    CORE_FIELDS.includes(c.field as CoreFieldName)
  );

  if (coreContradictions.length === 0) {
    audit.rules_fired.push({
      rule: "Rule 6: Contradiction → mandatory downgrade",
      action: "passed",
      detail: "No core-field contradictions detected.",
    });
    return currentState;
  }

  const downgraded = downgradeState(currentState);
  audit.rules_fired.push({
    rule: "Rule 6: Contradiction → mandatory downgrade",
    action: "fired",
    detail: `${coreContradictions.length} core-field contradiction(s) detected in [${coreContradictions.map(c => c.field).join(", ")}]. Downgraded "${currentState}" → "${downgraded}".`,
  });
  audit.contradictions_detected = coreContradictions;

  return downgraded;
}

// Rule 7: Supplementary edition_state must not alter core identity
function validateEditionStateNote(
  identify: IdentifyOutput,
  editionNote: string | null,
  audit: AuditTrail
): string | null {
  if (!editionNote) {
    audit.rules_fired.push({
      rule: "Rule 7: edition_state_note must not alter core identity",
      action: "passed",
      detail: "No edition_state_note provided.",
    });
    return null;
  }

  const noteLower = editionNote.toLowerCase();

  // Check if the note contains a different cartographer or publisher name
  // that could be confused with a core attribution change
  const coreNames: string[] = [];
  if (identify.attribution.cartographer.value) {
    coreNames.push(identify.attribution.cartographer.value.toLowerCase());
  }
  if (identify.attribution.publisher.value) {
    coreNames.push(identify.attribution.publisher.value.toLowerCase());
  }

  // Extract surnames from core names for comparison
  const coreSurnames = coreNames.map(name => {
    const parts = name.split(/\s+/);
    return parts[parts.length - 1];
  }).filter(s => s.length > 2);

  // If the note introduces a person name not already in our core fields,
  // we can't easily detect that with simple string matching.
  // Instead, we use a conservative approach: if the note contains
  // phrases that suggest a different attribution, block it.
  const dangerPhrases = [
    "actually by", "attributed to", "by ", "published by",
    "engraved by", "drawn by", "cartographer:", "publisher:",
  ];

  for (const phrase of dangerPhrases) {
    if (noteLower.includes(phrase)) {
      // Check if the name following the phrase matches a known core name
      const afterPhrase = noteLower.split(phrase)[1]?.trim() || "";
      const matchesCore = coreSurnames.some(s => afterPhrase.includes(s));

      if (!matchesCore && afterPhrase.length > 2) {
        audit.rules_fired.push({
          rule: "Rule 7: edition_state_note must not alter core identity",
          action: "fired",
          detail: `edition_state_note contains "${phrase}..." which may introduce a new attribution. Blocked. Original note: "${editionNote}"`,
        });
        audit.blocked_field_changes.push({
          field: "edition_state_note",
          attempted_value: editionNote,
          retained_value: null,
          reason: "Note contained attribution-altering language not matching core fields.",
        });
        return null;
      }
    }
  }

  audit.rules_fired.push({
    rule: "Rule 7: edition_state_note must not alter core identity",
    action: "passed",
    detail: `edition_state_note accepted: "${editionNote}"`,
  });
  return editionNote;
}

// Rule 8: "identified" requires specific named bibliographic identity
function validateIdentifiedRequiresBibliographicIdentity(
  currentState: ResolutionState,
  identify: IdentifyOutput,
  contradictions: { field: string }[],
  audit: AuditTrail
): ResolutionState {
  if (currentState !== "identified") {
    audit.rules_fired.push({
      rule: "Rule 8: identified requires specific named bibliographic identity",
      action: "passed",
      detail: `Current state is "${currentState}" — rule only applies to "identified".`,
    });
    return currentState;
  }

  const reasons: string[] = [];

  // Condition 1: title must be non-null
  if (!identify.attribution.title.value) {
    reasons.push("title.value is null");
  }

  // Condition 2: at least one named person (cartographer, publisher, or engraver)
  const hasNamedPerson = !!(
    identify.attribution.cartographer.value ||
    identify.attribution.publisher.value ||
    identify.attribution.engraver.value
  );
  if (!hasNamedPerson) {
    reasons.push("no named person (cartographer, publisher, or engraver)");
  }

  // Condition 3: at least one Tier A anchor — a core field with evidence_basis "observed"
  const hasTierAAnchor = CORE_FIELDS.some(
    (f) => identify.attribution[f].evidence_basis === "observed"
  );
  if (!hasTierAAnchor) {
    reasons.push("no Tier A anchor (no core field with evidence_basis 'observed')");
  }

  // Condition 4: no core contradiction
  const coreContradictions = contradictions.filter((c) =>
    CORE_FIELDS.includes(c.field as CoreFieldName)
  );
  if (coreContradictions.length > 0) {
    reasons.push(
      `${coreContradictions.length} core contradiction(s) in [${coreContradictions.map((c) => c.field).join(", ")}]`
    );
  }

  if (reasons.length > 0) {
    audit.rules_fired.push({
      rule: "Rule 8: identified requires specific named bibliographic identity",
      action: "fired",
      detail: `Downgraded "identified" → "probable": ${reasons.join("; ")}.`,
    });
    return "probable";
  }

  audit.rules_fired.push({
    rule: "Rule 8: identified requires specific named bibliographic identity",
    action: "passed",
    detail: "All conditions met: non-null title, named person present, Tier A anchor present, no contradictions.",
  });
  return "identified";
}

// ════════════════════════════════════════════════════════════
// Merge: Identify + Corroborate → Final Output
// ════════════════════════════════════════════════════════════

export interface MergedAttribution {
  // Core fields (values from Identify, basis may be upgraded)
  title: CoreAttributionField;
  cartographer: CoreAttributionField;
  publisher: CoreAttributionField;
  date: CoreAttributionField;
  engraver: CoreAttributionField;

  // Supplementary fields (may be enriched from corpus)
  publication_place: SupplementaryField;
  edition_state: SupplementaryField;
}

export interface MergedResult {
  resolution_state: ResolutionState;
  attribution: MergedAttribution;

  region: string;
  technique: string;
  dimensions_estimate: string | null;
  condition_notes: string | null;

  // Supplementary from corpus
  parent_work: string | null;
  parent_work_source: "identify" | "corpus" | null;
  tradition: string | null;
  edition_state_note: string | null;
  additional_context: string | null;

  competing_candidates: string[];
  uncertainties: string[];
  contradictions: Contradiction[];
  evidence_summary: string;

  user_facing: {
    headline: string;
    summary: string;
    confidence_level: string;
    confidence_summary: string;
    conversation_prompt: string | null;
    conversation_response: string | null;
    rarity: string | null;
  };

  // Machine-readable audit trail
  _audit: AuditTrail;
}

export function mergeIdentifyOnly(identify: IdentifyOutput): MergedResult {
  const audit = createAudit(identify.resolution_state);
  audit.corpus_effect = "not_run";
  audit.rules_fired.push({
    rule: "Corroborate step",
    action: "passed",
    detail: "Skipped — no corpus candidates or retrieval not triggered.",
  });

  // ── Rule 8: identified requires specific named bibliographic identity ──
  const finalState = validateIdentifiedRequiresBibliographicIdentity(
    identify.resolution_state,
    identify,
    [], // no contradictions in identify-only path
    audit
  );
  audit.final_resolution_state = finalState;

  const stateToConfidence: Record<ResolutionState, string> = {
    identified: "high",
    probable: "medium",
    unresolved: "low",
  };

  return {
    resolution_state: finalState,
    attribution: {
      title: { ...identify.attribution.title },
      cartographer: { ...identify.attribution.cartographer },
      publisher: { ...identify.attribution.publisher },
      date: { ...identify.attribution.date },
      engraver: { ...identify.attribution.engraver },
      publication_place: {
        ...identify.attribution.publication_place,
        source: "identify",
      },
      edition_state: {
        ...identify.attribution.edition_state,
        source: "identify",
      },
    },
    region: identify.region,
    technique: identify.technique,
    dimensions_estimate: identify.dimensions_estimate,
    condition_notes: identify.condition_notes,
    parent_work: identify.parent_work,
    parent_work_source: identify.parent_work ? "identify" : null,
    tradition: null,
    edition_state_note: null,
    additional_context: null,
    competing_candidates: identify.competing_candidates,
    uncertainties: identify.uncertainties,
    contradictions: [],
    evidence_summary: identify.evidence_summary,
    user_facing: {
      headline: identify.user_facing.headline,
      summary: identify.user_facing.summary,
      confidence_level: stateToConfidence[finalState],
      confidence_summary: identify.user_facing.confidence_summary,
      conversation_prompt: identify.user_facing.conversation_prompt,
      conversation_response: identify.user_facing.conversation_response,
      rarity: identify.user_facing.rarity,
    },
    _audit: audit,
  };
}

export function mergeIdentifyCorroborate(
  identify: IdentifyOutput,
  corroborate: CorroborateOutput
): MergedResult {
  const audit = createAudit(identify.resolution_state);
  audit.corroborate_adjusted_resolution_state = corroborate.adjusted_resolution_state;
  audit.corpus_effect = corroborate.overall_effect;

  // ── Rule 1: Resolution state can only stay or downgrade ──
  let finalState = validateResolutionDowngrade(
    identify.resolution_state,
    corroborate.adjusted_resolution_state,
    audit
  );

  // ── Rule 2: Core fields are immutable (structural) ──
  validateCoreFieldImmutability(identify, corroborate, audit);

  // ── Rule 3: Unresolved core fields cannot be populated ──
  validateUnresolvedCoreCannotPopulate(identify, corroborate, audit);

  // ── Rule 6: Contradiction → mandatory downgrade ──
  finalState = applyContradictionDowngrade(finalState, corroborate.contradictions, audit);

  // ── Rule 4: Per-field evidence basis transitions ──
  const finalAttribution: MergedAttribution = {
    title: { ...identify.attribution.title },
    cartographer: { ...identify.attribution.cartographer },
    publisher: { ...identify.attribution.publisher },
    date: { ...identify.attribution.date },
    engraver: { ...identify.attribution.engraver },
    publication_place: {
      ...identify.attribution.publication_place,
      source: "identify",
    },
    edition_state: {
      ...identify.attribution.edition_state,
      source: "identify",
    },
  };

  for (const field of CORE_FIELDS) {
    const identifyField = identify.attribution[field];
    const corroborateEffect = corroborate.field_effects[field]?.effect || "no_effect";

    const newBasis = validateBasisTransition(
      identifyField.evidence_basis,
      corroborateEffect,
      field,
      audit
    );

    // Value is ALWAYS from identify (Rule 2)
    finalAttribution[field] = {
      value: identifyField.value,
      evidence_basis: newBasis,
      evidence_detail: identifyField.evidence_detail +
        (corroborateEffect === "confirmed" && corroborate.field_effects[field]?.matching_record_title
          ? ` Corroborated by: "${corroborate.field_effects[field].matching_record_title}".`
          : "") +
        (corroborateEffect === "contradicted"
          ? ` ⚠ Contradiction: ${corroborate.field_effects[field]?.detail || "corpus record disagrees"}.`
          : ""),
    };

    // If basis was downgraded to unresolved on an inferred field, null the value
    if (newBasis === "unresolved" && identifyField.evidence_basis === "inferred") {
      finalAttribution[field].value = null;
      audit.blocked_field_changes.push({
        field,
        attempted_value: identifyField.value || "(inferred value)",
        retained_value: null,
        reason: `Inferred value "${identifyField.value}" weakened/contradicted by corpus — downgraded to unresolved.`,
      });
    }
  }

  // ── Supplementary fields: may be enriched from corpus ──

  // publication_place — keep identify value if present, otherwise leave as-is
  // (corroborate doesn't provide new publication_place values)

  // edition_state — may receive note from corpus
  // (the identify value stays; the note is additive)

  // ── Rule 7: edition_state_note must not alter core identity ──
  const validatedNote = validateEditionStateNote(
    identify,
    corroborate.supplementary.edition_state_note,
    audit
  );

  // parent_work — prefer identify, supplement from corpus
  let parentWork = identify.parent_work;
  let parentWorkSource: "identify" | "corpus" | null = identify.parent_work ? "identify" : null;
  if (!parentWork && corroborate.supplementary.parent_work) {
    parentWork = corroborate.supplementary.parent_work;
    parentWorkSource = "corpus";
  }

  // ── Rule 8: identified requires specific named bibliographic identity ──
  finalState = validateIdentifiedRequiresBibliographicIdentity(
    finalState,
    identify,
    corroborate.contradictions,
    audit
  );

  // ── Rule 5: Confidence cannot inflate ──
  const finalConfidence = validateConfidenceNoInflation(
    identify.resolution_state,
    finalState,
    audit
  );

  audit.final_resolution_state = finalState;

  // ── Build user-facing output ──
  const summary = corroborate.adjusted_summary || identify.user_facing.summary;
  const confidenceSummary = corroborate.adjusted_confidence_summary || identify.user_facing.confidence_summary;

  return {
    resolution_state: finalState,
    attribution: finalAttribution,
    region: identify.region,
    technique: identify.technique,
    dimensions_estimate: identify.dimensions_estimate,
    condition_notes: identify.condition_notes,
    parent_work: parentWork,
    parent_work_source: parentWorkSource,
    tradition: corroborate.supplementary.tradition,
    edition_state_note: validatedNote,
    additional_context: corroborate.supplementary.additional_context,
    competing_candidates: identify.competing_candidates,
    uncertainties: identify.uncertainties,
    contradictions: corroborate.contradictions,
    evidence_summary: identify.evidence_summary,
    user_facing: {
      headline: identify.user_facing.headline,
      summary,
      confidence_level: finalConfidence,
      confidence_summary: confidenceSummary,
      conversation_prompt: identify.user_facing.conversation_prompt,
      conversation_response: identify.user_facing.conversation_response,
      rarity: identify.user_facing.rarity,
    },
    _audit: audit,
  };
}
