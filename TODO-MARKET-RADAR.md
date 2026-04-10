# ⚠️ TODO: Activate Market Radar

The code is deployed but the database tables haven't been created yet.

## Two steps needed:

1. **Supabase → SQL Editor** → paste contents of `sql/market-radar.sql` → Run
2. **Terminal:** `export GEMINI_API_KEY=your-key && python3 scout-radar.py 58a39606-7225-4949-93a1-88044b569f71`

Then say **"activate Market Radar"** to Antigravity to verify.

Delete this file when done.

---

# 🧠 Future: AI Accuracy Improvements

Current model: GPT-4o-mini with `detail: auto`

## Options (in order of effort):
1. **Switch to GPT-4o (full)** — ~1 min to implement. Better at reading old handwriting/inscriptions. Cost: ~$0.03/scan vs $0.003.
2. **Two-pass OCR approach** — First pass extracts all text from the map, second pass identifies using text + image. ~10 min to implement. Roughly doubles processing time.
3. **Reference database** — Build a DB of known maps from confirmed user corrections. Use vector search to match before asking AI. Significant effort but most accurate long-term.
4. **Prompt tuning** — Instruct model to read cartouches, publisher marks, and plate numbers before guessing. Free, quick.

---

# 🗄️ Phase 2/3: Canonical Map Database & Autocomplete

**Goal:** Build a searchable database of every known antique map — the "Spotify catalog" for maps. Enables typeahead search, improves AI accuracy via reference matching, and becomes a long-term competitive moat.

## Data Sources
1. **David Rumsey Collection** (~150K maps) — Harvest via IIIF manifests. Best structured metadata (title, cartographer, date, region). No bulk API but community tools exist on GitHub.
2. **User corrections** — Every time a user fixes an AI identification = a verified entry. Grows organically.
3. **Dealer listing scrapes** (Market Radar) — Already partially built. Adds current market inventory + pricing data.
4. **Library of Congress** (5M+ maps) — Poorly structured but massive. Lower priority.

## Cost Estimates
- **One-time build:** $0 infrastructure (development time only)
- **Recurring (at <50K users/mo):** $0/mo — fits within Supabase free tier
- **Recurring (at scale):** ~$25/mo for Supabase Pro when DB exceeds 500MB
- **Search:** Postgres full-text search (free, built into Supabase)

## Implementation Order
1. Create `maps_catalog` table in Supabase
2. Write David Rumsey IIIF harvester script
3. Add autocomplete search to scan flow (type title instead of photo)
4. Wire user corrections to feed back into catalog
5. Connect Market Radar scrapes to catalog

## Strategic Value
- No competitor has a structured, searchable database of antique maps
- This is the foundation for the reference database (AI Accuracy option #3 above)
- Dealers tell collectors to specialize with a thesis — this database is what makes thesis-based recommendations actually work at scale

## Action Items (Not Urgent)
- [ ] Email Stanford/Rumsey for permission to harvest metadata (draft below)
- [ ] Legal: factual metadata (titles, dates, names) not copyrightable in US (*Feist v. Rural Telephone*, 1991). EU database rights more complex. Getting written permission eliminates risk.
- [ ] Rumsey could block scraping access at any point — but data already harvested stays ours. No runtime dependency on their servers.

### Draft Email to Stanford/Rumsey
**To:** rumsey@stanford.edu
**Subject:** Metadata use request — building a map identification tool for collectors

> Building a free tool (holocenemaps.com) for antique map collectors. Would like to incorporate your collection's metadata (titles, cartographers, dates, regions) into a searchable reference database. No images hosted. Every record attributed with link back to davidrumsey.com. Harvest via IIIF manifests. Happy to adjust approach based on your guidance.
