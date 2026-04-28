// ════════════════════════════════════════════════════════════
// test-buckets.ts — Six verification buckets for the attribution engine
// Run manually against the deployed edge function.
// Usage: deno run --allow-net test-buckets.ts <bucket_number>
// ════════════════════════════════════════════════════════════

const FUNCTION_URL = "https://irfuhohbabtywbuchwpb.supabase.co/functions/v1/evaluate-map";

// ── Validation helpers ──

interface TestResult {
  bucket: string;
  passed: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
}

function check(name: string, condition: boolean, detail: string) {
  return { name, passed: condition, detail };
}

function printResult(result: TestResult) {
  const icon = result.passed ? "✅" : "❌";
  console.log(`\n${icon} BUCKET: ${result.bucket}`);
  for (const c of result.checks) {
    console.log(`  ${c.passed ? "✓" : "✗"} ${c.name}: ${c.detail}`);
  }
  console.log("");
}

// ════════════════════════════════════════════════════════════
// BUCKET 1: Clean Positive
// A well-labeled map with clear title, cartographer, and date.
// Corpus contains a matching record.
// ════════════════════════════════════════════════════════════

function validateBucket1(data: any): TestResult {
  const checks = [];
  const attr = data._attribution || {};
  const audit = data._audit || {};
  const fields = attr.fields || {};

  // Must be identified
  checks.push(check(
    "Resolution state is 'identified'",
    data.resolution_state === "identified",
    `Got: ${data.resolution_state}`
  ));

  // Core fields populated
  checks.push(check(
    "Cartographer has a value",
    !!fields.cartographer?.value,
    `Got: ${fields.cartographer?.value || "(null)"}`
  ));

  // At least one observed field
  const hasObserved = Object.values(fields).some((f: any) => f?.evidence_basis === "observed");
  checks.push(check(
    "At least one field has evidence_basis 'observed'",
    hasObserved,
    `Found observed: ${hasObserved}`
  ));

  // Corpus had an effect (corroborated or supplemented)
  checks.push(check(
    "Corpus effect is 'corroborated' or 'supplemented'",
    audit.corpus_effect === "corroborated" || audit.corpus_effect === "supplemented",
    `Got: ${audit.corpus_effect}`
  ));

  // No blocked changes
  checks.push(check(
    "No blocked field changes",
    (audit.blocked_field_changes || []).length === 0,
    `Blocked: ${(audit.blocked_field_changes || []).length}`
  ));

  return {
    bucket: "1 — Clean Positive",
    passed: checks.every(c => c.passed),
    checks,
  };
}

// ════════════════════════════════════════════════════════════
// BUCKET 2: Hard Positive
// Partial labels — title legible but cartographer obscured.
// Corpus contains the correct record.
// ════════════════════════════════════════════════════════════

function validateBucket2(data: any): TestResult {
  const checks = [];
  const attr = data._attribution || {};
  const fields = attr.fields || {};

  // Should be probable (missing decisive anchor for cartographer)
  checks.push(check(
    "Resolution state is 'probable' or 'identified'",
    data.resolution_state === "probable" || data.resolution_state === "identified",
    `Got: ${data.resolution_state}`
  ));

  // Title should be observed
  checks.push(check(
    "Title has evidence_basis 'observed' or 'corroborated'",
    fields.title?.evidence_basis === "observed" || fields.title?.evidence_basis === "corroborated",
    `Got: ${fields.title?.evidence_basis}`
  ));

  // Cartographer may be inferred
  checks.push(check(
    "Cartographer evidence_basis is 'inferred' or 'corroborated'",
    fields.cartographer?.evidence_basis === "inferred" || fields.cartographer?.evidence_basis === "corroborated",
    `Got: ${fields.cartographer?.evidence_basis}`
  ));

  // Not promoted to identified if cartographer was only inferred
  if (fields.cartographer?.evidence_basis === "inferred") {
    checks.push(check(
      "Not promoted to 'identified' with only inferred cartographer",
      data.resolution_state !== "identified",
      `State: ${data.resolution_state}, cartographer basis: ${fields.cartographer?.evidence_basis}`
    ));
  }

  return {
    bucket: "2 — Hard Positive",
    passed: checks.every(c => c.passed),
    checks,
  };
}

// ════════════════════════════════════════════════════════════
// BUCKET 3: False-Nearest-Match Trap  *** CRITICAL ***
// A map NOT in the corpus. Corpus contains a plausible-but-wrong
// near match (same region, similar era, different cartographer).
// ════════════════════════════════════════════════════════════

function validateBucket3(data: any): TestResult {
  const checks = [];
  const attr = data._attribution || {};
  const audit = data._audit || {};
  const fields = attr.fields || {};

  // Core fields must NOT have been changed by corroboration
  // The audit trail should show no blocked changes OR Rule 2 passing
  const rule2 = (audit.rules_fired || []).find((r: any) =>
    r.rule.includes("Rule 2")
  );
  checks.push(check(
    "Rule 2 (core field immutability) passed",
    rule2?.action === "passed",
    `Rule 2 status: ${rule2?.action || "not found"}`
  ));

  // Corpus should NOT have "corroborated" — it should be "no_effect" or "contradicted"
  checks.push(check(
    "Corpus effect is NOT 'corroborated'",
    audit.corpus_effect !== "corroborated",
    `Got: ${audit.corpus_effect}`
  ));

  // If the identify step said probable/unresolved, it must stay that way or lower
  const identifyState = audit.identify_resolution_state;
  checks.push(check(
    "Final state not promoted above identify state",
    stateRank(data.resolution_state) <= stateRank(identifyState),
    `Identify: ${identifyState}, Final: ${data.resolution_state}`
  ));

  // The cartographer in the final output should match the identify output, not the corpus
  // (We can't directly compare without the identify output, but we can check the audit)
  const noBlockedCartographer = !(audit.blocked_field_changes || []).some(
    (b: any) => b.field === "cartographer"
  );
  checks.push(check(
    "Cartographer not overridden by corpus (no blocked change needed = structural guarantee held)",
    noBlockedCartographer,
    `Blocked cartographer changes: ${!noBlockedCartographer}`
  ));

  // If unresolved, cartographer should be null
  if (data.resolution_state === "unresolved") {
    checks.push(check(
      "Unresolved: cartographer is null",
      !fields.cartographer?.value,
      `Cartographer value: ${fields.cartographer?.value || "(null)"}`
    ));
  }

  return {
    bucket: "3 — False-Nearest-Match Trap *** CRITICAL ***",
    passed: checks.every(c => c.passed),
    checks,
  };
}

// ════════════════════════════════════════════════════════════
// BUCKET 4: Weak-Image Unresolved
// Poor photo — blurry, partial, glare-obscured. Text illegible.
// ════════════════════════════════════════════════════════════

function validateBucket4(data: any): TestResult {
  const checks = [];
  const attr = data._attribution || {};
  const audit = data._audit || {};
  const fields = attr.fields || {};

  // Must be unresolved
  checks.push(check(
    "Resolution state is 'unresolved'",
    data.resolution_state === "unresolved",
    `Got: ${data.resolution_state}`
  ));

  // Cartographer and publisher must be null
  checks.push(check(
    "Cartographer is null",
    !fields.cartographer?.value,
    `Got: ${fields.cartographer?.value || "(null)"}`
  ));

  checks.push(check(
    "Publisher is null",
    !fields.publisher?.value,
    `Got: ${fields.publisher?.value || "(null)"}`
  ));

  // If corpus ran, it should not have populated any core fields
  if (audit.corpus_effect !== "not_run") {
    const rule3 = (audit.rules_fired || []).find((r: any) =>
      r.rule.includes("Rule 3")
    );
    checks.push(check(
      "Rule 3 (unresolved core fields not populated) passed",
      rule3?.action === "passed" || rule3?.action === "fired",
      `Rule 3 status: ${rule3?.action || "not found"}`
    ));
  }

  // No named cartographer in the flat output
  checks.push(check(
    "No cartographer in flat output",
    !data.cartographer || data.cartographer === "",
    `Flat cartographer: "${data.cartographer}"`
  ));

  return {
    bucket: "4 — Weak-Image Unresolved",
    passed: checks.every(c => c.passed),
    checks,
  };
}

// ════════════════════════════════════════════════════════════
// BUCKET 5: Wrong Seller Metadata
// Image of a De l'Isle map. Seller claims "Bellin".
// System must attribute to De l'Isle based on image evidence.
// ════════════════════════════════════════════════════════════

function validateBucket5(data: any): TestResult {
  const checks = [];
  const fields = data._attribution?.fields || {};

  // Cartographer should be based on image evidence, not seller metadata
  // We can't programmatically know the "right" answer, but we can check
  // that the evidence_basis is "observed" or "inferred" (not from external metadata)
  checks.push(check(
    "Cartographer evidence_basis is 'observed' or 'inferred' (not from seller metadata)",
    fields.cartographer?.evidence_basis === "observed" ||
    fields.cartographer?.evidence_basis === "inferred" ||
    fields.cartographer?.evidence_basis === "corroborated",
    `Got: ${fields.cartographer?.evidence_basis}`
  ));

  // Resolution state should not be unresolved if image has clear evidence
  checks.push(check(
    "Resolution state is 'identified' or 'probable'",
    data.resolution_state === "identified" || data.resolution_state === "probable",
    `Got: ${data.resolution_state}`
  ));

  return {
    bucket: "5 — Wrong Seller Metadata",
    passed: checks.every(c => c.passed),
    checks,
  };
}

// ════════════════════════════════════════════════════════════
// BUCKET 6: Contradiction Downgrade
// Map that Identify resolves confidently. Corpus contains
// a record for the same title but a different date/publisher.
// ════════════════════════════════════════════════════════════

function validateBucket6(data: any): TestResult {
  const checks = [];
  const attr = data._attribution || {};
  const audit = data._audit || {};
  const fields = attr.fields || {};

  // Should have contradictions
  const contradictions = attr.contradictions || [];
  checks.push(check(
    "Contradictions detected",
    contradictions.length > 0,
    `Found: ${contradictions.length} contradiction(s)`
  ));

  // Rule 6 should have fired
  const rule6 = (audit.rules_fired || []).find((r: any) =>
    r.rule.includes("Rule 6")
  );
  checks.push(check(
    "Rule 6 (contradiction downgrade) fired",
    rule6?.action === "fired",
    `Rule 6 status: ${rule6?.action || "not found"}`
  ));

  // Final state should be lower than identify state
  if (audit.identify_resolution_state) {
    checks.push(check(
      "Final state is lower than identify state",
      stateRank(data.resolution_state) < stateRank(audit.identify_resolution_state),
      `Identify: ${audit.identify_resolution_state}, Final: ${data.resolution_state}`
    ));
  }

  // Core field values should still match identify output (not changed to corpus values)
  checks.push(check(
    "Rule 2 (core field immutability) passed despite contradictions",
    (audit.rules_fired || []).some((r: any) =>
      r.rule.includes("Rule 2") && r.action === "passed"
    ),
    "Core fields remain from identify output"
  ));

  // Contradictions should be surfaced in the response
  checks.push(check(
    "Contradictions are in the response for display",
    contradictions.length > 0 && contradictions[0].field && contradictions[0].assessment,
    `First contradiction: ${contradictions[0]?.field || "(none)"}`
  ));

  return {
    bucket: "6 — Contradiction Downgrade",
    passed: checks.every(c => c.passed),
    checks,
  };
}

// ── Utilities ──

function stateRank(state: string): number {
  if (state === "identified") return 2;
  if (state === "probable") return 1;
  return 0;
}

// ════════════════════════════════════════════════════════════
// Manual test runner
// Accepts a JSON response (pipe from curl) and validates
// against the specified bucket.
// ════════════════════════════════════════════════════════════

async function main() {
  const bucketArg = Deno.args[0];
  const jsonFile = Deno.args[1];

  if (!bucketArg || !jsonFile) {
    console.log(`
Attribution Engine — Test Bucket Validator

Usage:
  deno run --allow-read test-buckets.ts <bucket_number> <response.json>

Buckets:
  1  Clean Positive
  2  Hard Positive
  3  False-Nearest-Match Trap (CRITICAL)
  4  Weak-Image Unresolved
  5  Wrong Seller Metadata
  6  Contradiction Downgrade

Example workflow:
  # 1. Scan a map and save the response
  curl -X POST ${FUNCTION_URL} \\
    -F "image=@my-map-photo.jpg" \\
    -o response.json

  # 2. Validate against a bucket
  deno run --allow-read test-buckets.ts 3 response.json
`);
    return;
  }

  const data = JSON.parse(await Deno.readTextFile(jsonFile));
  const bucket = parseInt(bucketArg);

  const validators: Record<number, (d: any) => TestResult> = {
    1: validateBucket1,
    2: validateBucket2,
    3: validateBucket3,
    4: validateBucket4,
    5: validateBucket5,
    6: validateBucket6,
  };

  const validator = validators[bucket];
  if (!validator) {
    console.error(`Unknown bucket: ${bucket}. Valid: 1-6`);
    return;
  }

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  Attribution Engine — Bucket ${bucket} Test`);
  console.log(`═══════════════════════════════════════════`);

  // Print audit summary
  const audit = data._audit;
  if (audit) {
    console.log(`\nAudit Summary:`);
    console.log(`  Identify state:     ${audit.identify_resolution_state}`);
    console.log(`  Corroborate state:  ${audit.corroborate_adjusted_resolution_state || "(not run)"}`);
    console.log(`  Final state:        ${audit.final_resolution_state}`);
    console.log(`  Corpus effect:      ${audit.corpus_effect}`);
    console.log(`  Blocked changes:    ${(audit.blocked_field_changes || []).length}`);
    console.log(`  Contradictions:     ${(audit.contradictions_detected || []).length}`);
    console.log(`  Rules fired:        ${(audit.rules_fired || []).filter((r: any) => r.action === "fired").length}`);
  }

  const result = validator(data);
  printResult(result);

  // Exit with appropriate code
  Deno.exit(result.passed ? 0 : 1);
}

main();
