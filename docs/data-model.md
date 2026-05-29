# Holocene Maps Data Model

Holocene Maps is evolving from a simple antique map collection tracker into a serious collector-grade archival system for historical cartography. The near-term goal is not to become dealer SaaS, a marketplace, an institutional integration platform, or a public provenance graph. The near-term goal is to make each collector record structurally sound, extensible, and intellectually serious while preserving the current lightweight workflow.

The guiding rule is: the UI may present fields, dropdowns, tabs, notes, and AI summaries, but the underlying data should still describe real-world collecting entities. New fields and migrations should avoid blocking a future Work -> Edition -> State -> Physical Copy model, even when that model is not fully implemented yet.

## Current Implemented Model

The app is currently a static GitHub Pages frontend backed by Supabase. The primary logged-in collection application is `collection.html`, with detail rendering and in-tab editing in `js/collection-detail-manager.js`, photo management in `js/collection-photo-manager.js`, and collection completeness signals in `js/collection-health.js`.

Implemented tables today:

| Table | Current role | Model layer today |
| --- | --- | --- |
| `profiles` | One profile per authenticated user, including collection thesis. | Collector/account context |
| `maps` | Primary collection/listing row with title, cartographer, year, act, status, priority, dealer, price, URL, notes, cover image, and timestamps. | Mixed: physical copy, acquisition target, and lightweight work identity |
| `map_catalog_details` | One optional sidecar row per map for display title, full title transcription, alternate titles, region, subject tags, map type, language, publisher, engraver, publication place/source, edition, state, plate number, bibliography notes, references JSON, summary, and physical summary. | Mixed: work, edition, state, bibliographic description, and legacy physical summary |
| `map_physical_details` | One optional sidecar row per map for dimensions, medium/materials/coloring, condition, margins, backing/lining, restoration, framing, and inspection date. | Physical copy |
| `map_references` | Structured reference rows with citation, type, author, title, publisher, year, page/entry, URL, notes, and sort order. | Bibliography/external reference attached to the physical-copy record for now |
| `map_notes` | Collector notes plus AI-generated summary, thesis fit, recommendation, confidence, uncertainties, sources, model, and evaluation timestamp. | Mixed: user notes and AI/analysis layer |
| `map_documents` | Private files such as invoices, certificates, condition reports, and provenance files. | Physical copy attachment |
| `map_images` | Photos/images per map, primary image state, ordering, and storage path. | Physical copy attachment |

This is already more than a flat collection list, but the main identity still flows through `maps`. In particular, `maps.title`, `maps.cartographer`, and `maps.year` are treated as core display/search fields, while `map_catalog_details` holds richer bibliographic facts and `map_physical_details` holds artifact facts.

## Long-Term Conceptual Model

These concepts describe the target intellectual structure. They should guide naming, migrations, and UI placement, but they do not all need to become tables immediately.

### Map Work

The abstract intellectual or cartographic work. A Work is not a physical sheet and not one dealer listing. It is the recognizable cartographic composition or intellectual object.

Examples:

- `Carte de la Louisiane et du cours du Mississippi`
- A named map design or cartographic lineage that may appear in multiple editions and states.

Likely future attributes:

- canonical title
- alternate titles
- cartographer or attributed cartographer
- broad date range
- subject/region
- cartographic lineage/tradition
- work-level notes
- authority identifiers, if useful later

### Edition

A specific publication version of a Work. Edition is where publication facts belong.

Examples:

- 1718 Paris edition of De L'Isle's Louisiana map
- Later Amsterdam/Covens & Mortier edition

Likely future attributes:

- work reference
- publication date or date range
- place of publication
- publisher
- publication source, atlas, book, or separately issued context
- language
- format notes
- edition-level bibliography

### State

A specific revised state within an Edition. State data should describe what distinguishes that state from other states in the same edition or publication lineage.

Important distinction:

- A map feature says what appears on the map.
- A state significance explains why that appearance distinguishes this state.

For example, "shows New Orleans" may be a general map feature across many editions. "First appearance of New Orleans in this publication lineage" is state-level significance.

Likely future attributes:

- edition reference
- state label or sequence
- distinguishing changes
- state significance
- plate changes
- imprint changes
- added/removed place names
- bibliographic references supporting the state attribution
- uncertainty/confidence notes

### Physical Copy

The unique artifact owned, watched, considered, or documented by the collector. This is the level currently represented most closely by `maps` plus sidecar tables.

Physical Copy is where these belong:

- ownership status
- acquisition and sale history
- seller/dealer
- price paid or asking price
- condition
- dimensions
- coloring
- restoration
- framing/storage
- provenance events
- private documents
- photos
- collector notes about the specific copy

### Cartographer

A person, workshop, firm, or attributed maker. Today this is free text in `maps.cartographer`. It should remain easy to enter, but future migrations should allow it to become an authority-ready entity.

Near-term fields can remain text, but should be named so they can later map to:

- display name
- normalized name
- life dates or active dates
- role, such as cartographer, engraver, publisher, printer, surveyor, or editor
- authority references

### Publisher

A person, workshop, firm, or imprint responsible for publication. Today this is free text in `map_catalog_details.publisher` and in structured reference rows. It may later become a linked authority entity.

### Provenance Event

An event in the ownership or custody history of a physical copy. Provenance should be event-based, because the same copy may pass through many owners, dealers, auctions, estates, or institutions.

Likely future attributes:

- physical copy reference
- event type, such as ownership, sale, auction, dealer listing, exhibition, restoration, appraisal, loan, or inheritance
- party name
- event date or date range
- place
- source/reference
- notes
- confidence or evidence status

### Acquisition Event

A specialized provenance event representing the collector's acquisition or attempted acquisition. This is distinct from Work, Edition, and State facts.

Likely future attributes:

- physical copy reference
- acquisition date
- seller/dealer/auction house
- price paid
- currency
- fees/shipping/tax, if needed
- listing URL
- invoice/document link
- private notes

### Bibliography Reference

A reference source used to identify, describe, or support a Work, Edition, State, or Physical Copy claim.

Today, `map_references` is attached directly to `map_id`. That is safe for now. Later, references may need a scope field or join table so a citation can support a work attribution, edition attribution, state attribution, condition note, provenance event, or market comparison.

### External Reference

A non-bibliographic external pointer such as a dealer listing, auction lot, institutional catalog page, OCLC/WorldCat record, image repository, or web page. These can be stored in `map_references` today using `reference_type`, `url`, and notes, but a future model may separate bibliographic citations from external links.

### Photo/File Attachment

Photos and documents belong to the Physical Copy record by default. They should remain private unless a deliberate public-gallery or sharing feature is built.

Examples:

- front/back photos
- detail images
- condition photos
- invoice
- certificate of authenticity
- dealer description
- auction listing PDF
- conservation report

## Implemented Today vs Future-Facing

Implemented today:

- Core collection rows in `maps`
- Richer catalogue sidecar rows in `map_catalog_details`
- Structured physical details in `map_physical_details`
- Structured references in `map_references`
- Private documents in `map_documents`
- Multiple photos in `map_images`
- Collector notes and AI analysis separated into `map_notes`
- Collection health signals for missing references, missing physical details, missing photos, missing AI review, incomplete catalogue, missing core identity, watchlist review, and low-confidence AI

Future-facing, not implemented as first-class tables today:

- `map_works`
- `map_editions`
- `map_states`
- normalized cartographer/person/organization authorities
- normalized publisher authorities
- provenance event timeline
- acquisition event table
- scoped reference assertions
- public provenance graph
- dealer inventory, sales pipeline, CRM, or marketplace capabilities
- institutional interoperability layers

## Free-Text Fields That May Later Normalize

These fields should stay easy to enter now, but future migrations should treat them as authority-ready or entity-ready:

| Current field | Today | Likely future |
| --- | --- | --- |
| `maps.title` | Display/search title | Physical-copy display title or denormalized Work title |
| `map_catalog_details.display_title` | Preferred display title override | Display title derived from Work/Edition/State/Copy |
| `map_catalog_details.full_title_transcription` | Transcribed title | Edition or State-level transcription, possibly evidence-backed |
| `maps.cartographer` | Free-text maker | Link to cartographer/authority entity |
| `map_catalog_details.publisher` | Free-text publisher | Link to publisher/authority entity |
| `map_catalog_details.engraver` | Free-text engraver | Link to person/organization entity with role |
| `maps.year` | Free-text date/year | Work/Edition/State date fields plus physical copy acquisition dates |
| `map_catalog_details.place_of_publication` | Free text | Normalized place or authority-ready text |
| `map_catalog_details.publication_source` | Free text | Linked publication/atlas/book entity if needed |
| `map_catalog_details.edition` | Free text | Link to future Edition row |
| `map_catalog_details.state` | Free text | Link to future State row with distinguishing characteristics |
| `map_catalog_details.reference_entries` | JSON/list legacy references | Migrate toward `map_references` or scoped references |
| `map_references.author`, `publisher`, `title` | Structured citation text | Bibliography authority data, if needed |
| `maps.dealer` | Free-text seller/dealer | Acquisition party or provenance event party |
| `maps.price` | Free-text ask/price | Structured acquisition or listing price |
| `maps.url`, `maps.listing_url` | Listing/external URL | External reference or acquisition event source |
| `maps.notes` | Legacy mixed notes | Migrate to `map_notes.user_notes` or event-specific notes |
| `map_catalog_details.physical_summary` | Legacy physical summary | Keep as physical-copy summary, with structured details in `map_physical_details` |

## Where Information Belongs

Use this placement guide when adding fields or UI.

### Work-Level

Put information here when it describes the abstract cartographic work across copies, editions, or states.

Examples:

- common/canonical title
- cartographic subject or geographic scope
- cartographer attribution at the work level
- broad historical significance of the work
- general thesis relevance of the work

Do not put copy condition, seller, price, frame, invoice, or owner history here.

### Edition-Level

Put information here when it describes a particular publication version.

Examples:

- publication date
- publisher
- place of publication
- atlas/book/publication source
- language
- edition label
- edition-level bibliographic citations

Do not use Edition for physical copy condition or collector acquisition details.

### State-Level

Put information here when it distinguishes one state from another within an edition or publication lineage.

Examples:

- imprint changed from one publisher to another
- added/removed place name
- plate number change
- boundary/river/settlement revision
- first appearance of a feature within that lineage
- evidence supporting a state attribution

Avoid vague state notes that are just map descriptions. "Shows the Mississippi River" is usually a feature. "Revised Mississippi course compared with the first Paris state" is state-level.

### Physical-Copy-Level

Put information here when it describes the unique artifact or the collector's relationship to it.

Examples:

- owned/watching/target/negotiating status
- price paid, ask price, and seller
- acquisition date
- condition grade and details
- dimensions
- coloring
- restoration
- framing/storage
- provenance events
- invoices, COAs, condition reports, photos
- collector notes about this copy

### AI/Analysis Layer

Put information here when it is interpretive, generated, provisional, or strategic.

Examples:

- AI summary
- thesis fit
- recommendation
- confidence
- uncertainties
- generated source list
- market commentary
- collecting strategy
- historical context narrative

AI output must not silently overwrite canonical record facts. If AI suggests a title, publisher, state, or date, that suggestion should be treated as proposed evidence or analysis until a user accepts or curates it into the record.

## De L'Isle Louisiana Example

For a copy of De L'Isle's `Carte de la Louisiane et du cours du Mississippi`, the model should separate facts roughly as follows.

Work:

- canonical title: `Carte de la Louisiane et du cours du Mississippi`
- cartographer: Guillaume De L'Isle
- subject/region: Louisiana, Mississippi River, Gulf Coast, French North America
- work significance: foundational French cartographic representation of the Mississippi Valley and Louisiana

Edition:

- publication version: 1718 Paris edition
- publisher/place: Paris publication context
- language: French
- publication source, if known

State:

- state label, if known
- distinguishing changes relative to other states
- significance such as a first appearance or revised imprint only when supported by reference evidence
- state attribution references

Physical Copy:

- the collector's owned or watched artifact
- dimensions, margins, coloring, condition, backing/lining, restoration
- acquisition date, seller, price paid
- listing URL and invoice
- provenance notes
- front/back/detail photos

AI/Analysis:

- why the map matters to the collection thesis
- historical interpretation of French colonial ambitions
- collecting-market commentary
- uncertainty about edition/state attribution
- recommendation about whether to buy, pass, conserve, or research further

## Migration Guidance

Prefer additive, rollback-safe migrations:

- Add new tables or nullable columns instead of renaming or deleting active fields.
- Preserve `maps` and current sidecar tables until replacement behavior is proven.
- Backfill from existing free-text fields into new structures, but keep original text during transition.
- Keep user-entered canonical facts separate from AI-generated suggestions.
- When normalizing entities, keep a `display_name` or source text field so uncertain attributions are not forced into false precision.
- Avoid hard enums for scholarly concepts that vary by dealer, bibliography, or tradition; use light controlled vocabularies where they improve workflow, not where they erase uncertainty.
- Scope references carefully. A source may support a state attribution without supporting provenance, condition, or market value.
- Treat money and dates as structured only when there is a clear UI need. Until then, free text can coexist with future `amount`, `currency`, and date-range fields.
- Do not make the user choose Work/Edition/State before they can save a map. The collector workflow should remain simple.

## Current Assumptions That May Conflict Later

These are not bugs, but they are architectural pressure points.

- `maps` mixes physical-copy workflow with work identity. Title, cartographer, year, seller, price, status, notes, and image all live together.
- `maps.year` is free text and can mean map date, publication date, state date, listing date, or an approximate date.
- `maps.cartographer` is free text and currently acts as the primary maker field; future models may need multiple contributors and roles.
- `maps.dealer`, `maps.price`, `maps.url`, and `maps.listing_url` are acquisition/listing fields, but they are not modeled as acquisition events or external references.
- `maps.notes` is a legacy mixed note field. The app now copies/splits notes into `map_notes.user_notes`, but old notes may still contain condition, acquisition, provenance, thesis, and AI-adjacent content.
- `map_catalog_details.edition` and `state` are free-text fields attached directly to the copy. That is acceptable now, but later these should become links or assertions rather than copy-owned entities.
- `map_catalog_details.summary` is close to analysis/historical interpretation, while neighboring fields are canonical record facts.
- `map_catalog_details.physical_summary` overlaps with `map_physical_details`.
- `map_references` is attached only to `map_id`, so references cannot yet declare whether they support Work, Edition, State, Physical Copy, condition, provenance, or acquisition claims.
- `map_notes` correctly separates AI fields from catalogue facts, but the UI tab is named "AI" while it also contains user notes. Long term, collector notes and AI analysis may deserve clearer separation.
- `map_documents.document_type` is simple free text. It can represent invoices, COAs, condition reports, and provenance files, but cannot yet link a file to a specific acquisition or provenance event.
- Collection health has useful completeness indicators, but it currently checks for the presence of broad fields rather than evidence quality or scoped record completeness.
- The AI evaluation endpoint returns flat backward-compatible fields such as title, cartographer, year, publisher, edition, dimensions, and condition notes. These should remain suggestions unless explicitly curated into the archive record.

## Recommended Near-Term Schema Improvements

The next improvements should strengthen the physical-copy archive without forcing full Work -> Edition -> State normalization.

Recommended additions:

1. `map_acquisition_events`

   Add one optional acquisition row per map, or allow multiple events if the collector wants acquisition attempts and final acquisition separately. Start simple.

   Suggested fields:

   - `id`
   - `map_id`
   - `user_id`
   - `event_date`
   - `seller_name`
   - `seller_url`
   - `price_amount`
   - `price_currency`
   - `fees_amount`
   - `listing_url`
   - `invoice_document_id`
   - `notes`
   - `created_at`
   - `updated_at`

2. `map_provenance_events`

   Add event-based provenance attached to the physical copy. Keep it private and collector-facing.

   Suggested fields:

   - `id`
   - `map_id`
   - `user_id`
   - `event_type`
   - `event_date_text`
   - `party_name`
   - `place`
   - `source_reference_id`
   - `source_document_id`
   - `confidence`
   - `notes`
   - `sort_order`
   - `created_at`
   - `updated_at`

3. Reference scoping

   Add optional fields to `map_references`, rather than replacing it:

   - `scope` with values like `work`, `edition`, `state`, `physical_copy`, `condition`, `provenance`, `acquisition`, `market`, `analysis`
   - `claim_summary`
   - `confidence`

4. Authority-ready names

   Keep current text fields, but add optional raw/normalized/source fields only when the UI is ready to use them. Avoid introducing normalized authority tables before there is a clear workflow.

5. Record completeness indicators

   Extend collection health from "field present" toward collector-grade completeness:

   - has core identity
   - has publication details
   - has edition/state attribution or explicit unknown
   - has at least one supporting reference
   - has physical dimensions
   - has condition record
   - has acquisition record for owned maps
   - has provenance reviewed or explicitly unknown
   - has photos
   - has private documents for owned maps, where available

## Small Safe Next Implementation Step

The safest next implementation step is to add acquisition/provenance structure for the Physical Copy layer, behind the existing UI and without changing the current add/edit modal.

Suggested first commit:

- Add an additive SQL migration for `map_acquisition_events` and `map_provenance_events`.
- Add RLS policies matching the existing `map_*` sidecar pattern.
- Do not remove or rename `maps.dealer`, `maps.price`, `maps.url`, or `maps.notes`.
- Do not build Work, Edition, or State tables yet.
- Do not change AI writebacks.
- Optionally add read-only or minimal in-tab sections later in the detail sheet, after the schema is present.

This improves serious collector archival structure where the current model is weakest, while preserving the simple collector workflow and keeping future normalization open.
