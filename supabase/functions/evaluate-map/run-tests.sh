#!/bin/bash
# ════════════════════════════════════════════════════════════
# run-tests.sh — Six-bucket test runner for evaluate-map
# Sends three real map images, applies appropriate bucket validators
# ════════════════════════════════════════════════════════════

FUNCTION_URL="https://irfuhohbabtywbuchwpb.supabase.co/functions/v1/evaluate-map"
IMAGE_DIR="/Users/ianfraser/.gemini/antigravity/scratch/holocenemaps.com"
OUT_DIR="/Users/ianfraser/.gemini/antigravity/scratch/holocenemaps.com/supabase/functions/evaluate-map/test-results"

mkdir -p "$OUT_DIR"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Attribution Engine — Six-Bucket Test Suite"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Test function: sends image, saves response ──
run_test() {
  local label="$1"
  local image="$2"
  local outfile="$3"

  echo "────────────────────────────────────────────"
  echo "  Sending: $label"
  echo "  Image:   $(basename "$image")"
  echo "────────────────────────────────────────────"

  curl -s -X POST "$FUNCTION_URL" \
    -F "image=@${image}" \
    -o "$outfile"

  if [ $? -ne 0 ]; then
    echo "  ❌ curl failed"
    return 1
  fi

  # Pretty-print response
  echo ""
  echo "  📄 Raw response saved to: $(basename "$outfile")"

  # Print the full JSON (pretty)
  python3 -m json.tool "$outfile" 2>/dev/null || cat "$outfile"
  echo ""
}

# ═══════════════════════════════════════════════════════════
# BUCKET 3 — False-Nearest-Match Trap (CRITICAL — run first)
# texas-1909.jpg: A 1909 Texas map — likely NOT in the corpus
# The corpus may contain other Texas/Southwest maps as near-matches
# ═══════════════════════════════════════════════════════════

echo ""
echo "▶▶▶ BUCKET 3: FALSE-NEAREST-MATCH TRAP (CRITICAL) ◀◀◀"
echo ""
run_test "Bucket 3 — False-Nearest-Match Trap" \
  "$IMAGE_DIR/texas-1909.jpg" \
  "$OUT_DIR/bucket3-response.json"

# ═══════════════════════════════════════════════════════════
# BUCKET 1 — Clean Positive
# chatelain-1719.jpg: Well-labeled Chatelain map, corpus likely has match
# ═══════════════════════════════════════════════════════════

echo ""
echo "▶▶▶ BUCKET 1: CLEAN POSITIVE ◀◀◀"
echo ""
run_test "Bucket 1 — Clean Positive" \
  "$IMAGE_DIR/chatelain-1719.jpg" \
  "$OUT_DIR/bucket1-response.json"

# ═══════════════════════════════════════════════════════════
# BUCKET 2 — Hard Positive
# bowen-1740.jpg: Bowen map — may have partial label visibility
# ═══════════════════════════════════════════════════════════

echo ""
echo "▶▶▶ BUCKET 2: HARD POSITIVE ◀◀◀"
echo ""
run_test "Bucket 2 — Hard Positive" \
  "$IMAGE_DIR/bowen-1740.jpg" \
  "$OUT_DIR/bucket2-response.json"

# ═══════════════════════════════════════════════════════════
# Print _audit objects for all three tests
# ═══════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  📊 AUDIT TRAILS"
echo "═══════════════════════════════════════════════════════════"

for f in "$OUT_DIR"/bucket*-response.json; do
  name=$(basename "$f" .json)
  echo ""
  echo "── $name ──"
  python3 -c "
import json, sys
try:
    with open('$f') as fh:
        data = json.load(fh)
    audit = data.get('_audit', {})
    print(json.dumps(audit, indent=2))
except Exception as e:
    print(f'Error: {e}')
" 2>/dev/null || echo "(could not parse)"
done

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Test complete. Results in: $OUT_DIR"
echo "═══════════════════════════════════════════════════════════"
