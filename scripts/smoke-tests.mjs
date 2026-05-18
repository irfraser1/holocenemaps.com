import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const productionHtml = [
  "index.html",
  "scan.html",
  "collection.html",
  "gallery.html",
  "bowen.html",
  "chatelain.html",
  "gibson.html",
  "nyc.html",
  "texas.html"
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function fail(message) {
  failures.push(message);
}

function assertFile(relativePath) {
  if (!exists(relativePath)) {
    fail(`Missing required file: ${relativePath}`);
  }
}

function isExternalReference(value) {
  return /^(https?:)?\/\//i.test(value)
    || /^(mailto|tel|javascript|data|blob|chrome-extension):/i.test(value)
    || value.startsWith("#");
}

function normalizeLocalReference(fromFile, rawValue) {
  const value = rawValue.trim();
  if (!value || value.includes("${") || isExternalReference(value)) return null;

  const withoutHash = value.split("#")[0];
  const withoutQuery = withoutHash.split("?")[0];
  if (!withoutQuery || withoutQuery.startsWith("/")) return null;

  return path.normalize(path.join(path.dirname(fromFile), withoutQuery));
}

function checkLocalReferences(htmlFile) {
  const html = read(htmlFile);
  const referencePattern = /\b(?:src|href|poster)=["']([^"']+)["']/gi;
  let match;

  while ((match = referencePattern.exec(html)) !== null) {
    const reference = normalizeLocalReference(htmlFile, match[1]);
    if (!reference) continue;

    if (!exists(reference)) {
      fail(`${htmlFile} points to missing local file: ${match[1]}`);
    }
  }
}

function assertContains(relativePath, needle, reason) {
  const contents = read(relativePath);
  if (!contents.includes(needle)) {
    fail(`${relativePath} should contain "${needle}" (${reason})`);
  }
}

function assertNotContains(relativePath, needle, reason) {
  const contents = read(relativePath);
  if (contents.includes(needle)) {
    fail(`${relativePath} should not contain "${needle}" (${reason})`);
  }
}

function checkDetailEmptyStates() {
  const context = {
    console,
    document: {
      addEventListener() {}
    },
    window: {
      addEventListener() {}
    },
    addEventListener() {},
    setTimeout,
    clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(read("js/collection-ui-helpers.js"), context, { filename: "js/collection-ui-helpers.js" });
  vm.runInContext(read("js/collection-detail-manager.js"), context, { filename: "js/collection-detail-manager.js" });

  const rendered = vm.runInContext(`
    _renderDetailPanels({
      id: 'empty-map',
      title: 'Empty Map',
      act: 1,
      status: 'owned',
      priority: 3
    }, {
      catalog: {},
      notes: {},
      documents: []
    }, 'catalogue')
  `, context);

  if (!rendered.includes("No catalogue details added yet.")) {
    fail("Catalogue tab should render the promised empty-state message when catalog detail fields are blank");
  }
  if (!rendered.includes("No physical details recorded yet.")) {
    fail("Physical tab should render the promised empty-state message when physical detail fields are blank");
  }
  if (!rendered.includes(">Add catalogue details</button>")) {
    fail("Empty catalogue tab should show an obvious Add catalogue details action");
  }
  if (!rendered.includes(">Add physical details</button>")) {
    fail("Empty physical tab should show an obvious Add physical details action");
  }

  const physicalRendered = vm.runInContext(`
    _renderDetailPanels({
      id: 'physical-map',
      title: 'Physical Map',
      act: 1,
      status: 'owned',
      priority: 3
    }, {
      catalog: { physical_summary: 'Legacy physical note' },
      physical: {
        sheet_width: 12,
        sheet_height: 18,
        image_width: 10,
        image_height: 15,
        dimension_unit: 'in',
        medium: 'Copper engraving',
        materials: 'Laid paper',
        coloring: 'Original hand color',
        condition_grade: 'very_good',
        condition_summary: 'Clean example',
        inspected_at: '2026-05-15'
      },
      notes: {},
      documents: []
    }, 'physical')
  `, context);

  [
    "Legacy physical note",
    "Sheet Size",
    "12 x 18 in",
    "Copper engraving",
    "Laid paper",
    "Original hand color",
    "Clean example",
    "2026-05-15"
  ].forEach(expected => {
    if (!physicalRendered.includes(expected)) {
      fail(`Physical tab should render structured physical metadata: missing ${expected}`);
    }
  });

  const structuredReferenceRendered = vm.runInContext(`
    _renderDetailPanels({
      id: 'reference-map',
      title: 'Reference Map',
      act: 1,
      status: 'owned',
      priority: 3
    }, {
      catalog: {
        reference_entries: ['Legacy reference'],
        bibliography_notes: 'Legacy bibliography note'
      },
      references: [
        {
          citation: 'Phillips, Maps of America, entry 123',
          reference_type: 'bibliography',
          author: 'Phillips',
          title: 'Maps of America',
          year: '1901',
          page_or_entry: 'entry 123',
          url: 'https://example.com/reference',
          notes: 'Primary bibliographic reference'
        },
        {
          citation: 'Burden, Mapping of North America, no. 45',
          reference_type: 'book',
          author: 'Burden',
          title: 'Mapping of North America',
          page_or_entry: 'no. 45'
        }
      ],
      notes: {},
      documents: []
    }, 'catalogue')
  `, context);

  [
    "Structured References",
    "Phillips, Maps of America, entry 123",
    "Bibliography · Phillips · Maps of America · 1901 · entry 123",
    "Primary bibliographic reference",
    "Burden, Mapping of North America, no. 45",
    "Legacy reference",
    "Legacy bibliography note"
  ].forEach(expected => {
    if (!structuredReferenceRendered.includes(expected)) {
      fail(`Catalogue tab should render structured and legacy references: missing ${expected}`);
    }
  });

  const structuredReferenceEditRendered = vm.runInContext(`
    _detailEditState = { tab: 'catalogue', dirty: false, saving: false };
    _renderDetailPanels({
      id: 'reference-edit-map',
      title: 'Reference Edit Map',
      act: 1,
      status: 'owned',
      priority: 3
    }, {
      catalog: {
        reference_entries: ['Legacy reference'],
        bibliography_notes: 'Legacy bibliography note'
      },
      references: [
        {
          id: 'ref-1',
          citation: 'Existing citation',
          reference_type: 'book',
          author: 'Existing author'
        }
      ],
      notes: {},
      documents: []
    }, 'catalogue')
  `, context);
  vm.runInContext(`_detailEditState = { tab: null, dirty: false, saving: false };`, context);

  [
    "Add reference",
    "data-reference-id=\"ref-1\"",
    "name=\"ref_citation\"",
    "Existing citation",
    "name=\"ref_reference_type\"",
    "name=\"ref_author\"",
    "Legacy reference",
    "Legacy bibliography note"
  ].forEach(expected => {
    if (!structuredReferenceEditRendered.includes(expected)) {
      fail(`Catalogue edit mode should render structured reference controls: missing ${expected}`);
    }
  });

  const aiEditRendered = vm.runInContext(`
    _detailEditState = { tab: 'ai', dirty: false, saving: false };
    _renderDetailPanels({
      id: 'ai-map',
      title: 'AI Map',
      act: 1,
      status: 'owned',
      priority: 3
    }, {
      catalog: {},
      notes: {
        user_notes: 'User note',
        ai_summary: 'Generated summary',
        ai_thesis_fit: 'Generated fit',
        ai_recommendation: 'WATCH',
        ai_confidence: 'high',
        ai_uncertainties: ['Generated uncertainty'],
        ai_sources: ['Generated source']
      },
      documents: []
    }, 'ai')
  `, context);

  if (!aiEditRendered.includes('name="user_notes"')) {
    fail("AI edit form should keep user_notes editable");
  }
  for (const generatedField of ['ai_summary', 'ai_thesis_fit', 'ai_recommendation', 'ai_confidence', 'ai_uncertainties', 'ai_sources']) {
    if (aiEditRendered.includes(`name="${generatedField}"`)) {
      fail(`AI edit form should not render editable ${generatedField}`);
    }
  }
}

function checkCollectionHealthRules() {
  const context = { console };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read("js/collection-health.js"), context, { filename: "js/collection-health.js" });

  const health = vm.runInContext(`
    buildCollectionHealth([
      { id: 'complete-map', title: 'Complete Map', cartographer: 'De Fer', year: '1715', status: 'owned', image_url: 'cover.jpg' },
      { id: 'attention-map', title: 'Attention Map', status: 'watching' }
    ], {
      catalogs: [
        { map_id: 'complete-map', reference_entries: ['Legacy ref'], physical_summary: 'Framed', region: 'Mississippi', summary: 'Catalogued' }
      ],
      references: [
        { map_id: 'complete-map', citation: 'Structured ref' }
      ],
      physical: [
        { map_id: 'complete-map', medium: 'Engraving', condition_summary: 'Clean' }
      ],
      notes: [
        { map_id: 'complete-map', ai_thesis_fit: 'Strong fit', ai_confidence: 'high', last_ai_evaluated_at: '2026-05-18T00:00:00Z' },
        { map_id: 'attention-map', ai_confidence: 'low' }
      ],
      images: [
        { map_id: 'complete-map', id: 'img-1' }
      ]
    })
  `, context);

  const summary = health.summary;
  const expected = {
    missingReferences: 1,
    missingPhysicalDetails: 1,
    missingPhotos: 1,
    needsAiReview: 1,
    missingThesisFit: 1,
    incompleteCatalogue: 1,
    missingCoreIdentity: 1,
    watchlistNeedsReview: 1,
    lowConfidenceAi: 1
  };

  Object.entries(expected).forEach(([key, value]) => {
    if (summary[key] !== value) {
      fail(`Collection Health should count ${key}: expected ${value}, got ${summary[key]}`);
    }
  });

  if (!health.issuesByMapId["attention-map"]?.missingReferences) {
    fail("Collection Health should expose per-map issue flags");
  }
}

for (const htmlFile of productionHtml) {
  assertFile(htmlFile);
  if (exists(htmlFile)) checkLocalReferences(htmlFile);
}

checkDetailEmptyStates();
checkCollectionHealthRules();

assertFile("sql/core-schema.sql");
assertFile("sql/map-detail-phase-1.sql");
assertFile("sql/fix-map-images-storage-policies.sql");
assertFile("sql/storage-bucket.sql");
assertFile("collection.html");
assertFile("css/collection-base.css");
assertFile("css/collection-dialogs.css");
assertFile("css/collection-chat.css");
assertFile("js/collection-ui-helpers.js");
assertFile("js/collection-detail-manager.js");
assertFile("js/collection-photo-manager.js");
assertFile("js/collection-health.js");

assertNotContains("collection.html", "map-photos", "the live bucket is map-images");
assertContains("js/collection-photo-manager.js", ".from('map-images')", "map image uploads and rotation use the real storage bucket");
assertContains("js/collection-photo-manager.js", "${userId}/photos/", "new authenticated uploads should live under a user-owned folder");
assertContains("js/collection-photo-manager.js", "storage_path", "map image rows should track the underlying storage object");
assertContains("js/collection-detail-manager.js", "window.history.pushState({ hmDetailMapId", "opening a map detail should add a collection-local history state");
assertContains("js/collection-detail-manager.js", "window.addEventListener('popstate'", "browser Back should close the map detail panel before leaving the collection");
assertContains("js/collection-detail-manager.js", "aria-label=\"Close map details\"", "the map detail close button should be accessible and wired to close the panel");
assertContains("js/collection-detail-manager.js", "ontouchend=\"event.preventDefault();event.stopPropagation();closeDetail()\"", "the map detail close button should handle iOS touch events directly");
assertContains("collection.html", "css/collection-base.css", "collection styles should load from the extracted base stylesheet");
assertContains("collection.html", "css/collection-dialogs.css", "collection dialog styles should load from the extracted dialog stylesheet");
assertContains("collection.html", "css/collection-chat.css", "collection chat styles should load from the extracted chat stylesheet");
assertContains("collection.html", "js/collection-ui-helpers.js", "collection shared UI helpers should load before the main app script");
assertContains("collection.html", "js/collection-detail-manager.js", "collection detail manager should load before the photo manager and main app script");
assertContains("collection.html", "js/collection-photo-manager.js", "collection photo manager should load before the main app script");
assertContains("collection.html", "js/collection-health.js?v=20260518-collection-health-a", "collection health module should load before the main app script");
assertContains("collection.html", "id=\"home-view\"", "collection app should expose the new lightweight Home view");
assertContains("collection.html", "id=\"tab-home\"", "primary navigation should include Home");
assertContains("collection.html", ">Collection</button>", "primary navigation should include Collection");
assertContains("collection.html", "Watchlist <span class=\"tab-badge\" id=\"radar-badge\"", "Watching should be relabeled to Watchlist while preserving the radar badge");
assertContains("collection.html", "id=\"tab-advisor\" onclick=\"openCollectionAdvisor()\"", "primary navigation should include an Advisor entry point");
assertContains("collection.html", "nav-add-wrap", "primary navigation should keep Add Map prominent");
assertContains("collection.html", "function renderHome()", "Home dashboard should be rendered from existing app state");
assertContains("collection.html", "function openCollectionAdvisor()", "Advisor navigation should focus the existing chat advisor");
assertContains("collection.html", "Needs Attention", "Home dashboard should surface Collection Health");
assertContains("collection.html", "refreshCollectionHealth()", "Home should refresh Collection Health after maps load");
assertContains("collection.html", "let attentionFilter = null", "Needs Attention drill-down should use lightweight frontend state");
assertContains("collection.html", "function applyAttentionFilter", "Needs Attention rows should filter the Collection view");
assertContains("collection.html", "function clearAttentionFilter", "Needs Attention filter should be resettable");
assertContains("collection.html", "getMapAttentionItems(collectionHealth, m.id)", "Collection filtering should use existing health issue flags");
assertContains("collection.html", "function openCollectionMap", "Filtered maps should route detail opens through the collection helper");
assertContains("collection.html", "setDetailTab(detailTab)", "Attention-filtered map opens should route to relevant detail tabs");
assertContains("collection.html", "Showing ${label}.", "Collection should show a clear active attention filter label");
assertContains("collection.html", "renderAttentionAction('missingReferences'", "Missing references should expose a View action");
assertContains("collection.html", "renderAttentionAction('missingPhysicalDetails'", "Missing physical details should expose a View action");
assertContains("collection.html", "renderAttentionAction('missingPhotos'", "Missing photos should expose a View action");
assertContains("collection.html", "renderAttentionAction('needsAiReview'", "Needs AI review should expose a View action");
assertContains("collection.html", "renderAttentionAction('watchlistNeedsReview'", "Watchlist review should expose a View action");
assertContains("collection.html", "Collection Highlights", "Home should include a quiet visual Collection Highlights module");
assertContains("collection.html", "id=\"home-highlights\"", "Collection Highlights should have a dedicated render target");
assertContains("collection.html", "function getCollectionHighlights", "Collection Highlights should select maps from existing loaded state");
assertContains("collection.html", ".filter(m => m.image_url)", "Collection Highlights should use existing maps.image_url values");
assertContains("collection.html", "function openHomeHighlight", "Collection Highlights tiles should open the existing map detail flow");
assertContains("collection.html", "Add photos to see collection highlights here.", "Collection Highlights should have a graceful empty state");
assertContains("js/collection-health.js", "function loadCollectionHealth", "collection health should own shallow metadata loading");
assertContains("js/collection-health.js", ".from('map_references')", "collection health should read structured references");
assertContains("js/collection-health.js", ".from('map_physical_details')", "collection health should read physical details");
assertContains("js/collection-health.js", ".from('map_notes')", "collection health should read AI note signals");
assertContains("js/collection-health.js", ".from('map_images')", "collection health should read photo signals");
assertNotContains("js/collection-health.js", "_loadMapDetailData", "collection health must not load full detail records for every map");
assertContains("css/collection-base.css", ".home-view", "Home view should have conservative app-shell styling");
assertContains("css/collection-base.css", ".home-highlight-rail", "Collection Highlights should render as a lightweight horizontal rail");
assertContains("css/collection-base.css", "aspect-ratio: 4 / 3", "Collection Highlights should keep stable image proportions");
assertContains("css/collection-base.css", "width: 44px; height: 44px", "the map detail close button should have a reliable touch target");
assertContains("js/collection-photo-manager.js", ".from('map-images')", "photo manager should continue using the map-images storage bucket");
assertContains("js/collection-photo-manager.js", "Set Cover", "photo manager should preserve the visible set-cover action");
assertContains("js/collection-photo-manager.js", "Rotating", "photo manager should preserve the rotate loading label");
assertContains("js/collection-photo-manager.js", "async function _rotateCurrentImage", "photo manager should own detail image rotation");
assertContains("js/collection-photo-manager.js", "const activeDetailTab = document.querySelector('.detail-tab.active')?.dataset.detailTab || 'overview'", "detail photo upload should preserve the active detail tab");
assertContains("js/collection-photo-manager.js", "setDetailTab(activeDetailTab)", "detail photo upload should restore the active detail tab after refresh");
assertContains("js/collection-detail-manager.js", "detail-tabs", "map detail should expose read-only tabs");
assertContains("js/collection-detail-manager.js", "Photos & Files", "map detail should include the Phase 1 files tab");
assertContains("js/collection-detail-manager.js", "map_catalog_details", "map detail should read collector catalogue metadata");
assertContains("js/collection-detail-manager.js", "map_documents", "map detail should read private document metadata");
assertContains("collection.html", "ai_thesis_fit", "AI notes should be separated from user notes");
assertContains("js/collection-photo-manager.js", "Set Cover", "photo strip should expose a visible set-cover action");
assertContains("js/collection-photo-manager.js", "_doDeleteImageFromButton", "photo strip should expose an obvious delete action with confirmation");
assertContains("js/collection-detail-manager.js", "Rotating", "image rotation should show an in-progress state");
assertContains("js/collection-photo-manager.js", "OffscreenCanvas", "image rotation should use faster offscreen canvas when available");

assertFile("sql/edge-function-usage.sql");
assertFile("supabase/functions/_shared/edge-auth.ts");
assertContains("sql/edge-function-usage.sql", "CREATE TABLE IF NOT EXISTS edge_function_usage", "Edge Function calls should have a canonical usage log table");
assertContains("sql/core-schema.sql", "CREATE TABLE IF NOT EXISTS profiles", "core schema SQL should define profiles");
assertContains("sql/core-schema.sql", "CREATE TABLE IF NOT EXISTS maps", "core schema SQL should define maps");
assertContains("sql/core-schema.sql", "DROP POLICY IF EXISTS \"Allow insert for known user\" ON maps", "core schema SQL should remove the prototype known-user map policy");
assertContains("sql/core-schema.sql", "WITH CHECK (auth.uid() = user_id)", "core schema policies should enforce user ownership on writes");
assertContains("sql/map-detail-phase-1.sql", "CREATE TABLE IF NOT EXISTS map_catalog_details", "Phase 1 should add catalog detail metadata");
assertContains("sql/map-references.sql", "CREATE TABLE IF NOT EXISTS map_references", "Structured references table should be present");
assertContains("sql/map-references.sql", "Users manage own map references", "Structured references should enforce owner RLS");
assertContains("js/collection-detail-manager.js", "db.from('map_references').insert", "Catalogue save should insert new structured references");
assertContains("js/collection-detail-manager.js", "db.from('map_references').update", "Catalogue save should update existing structured references");
assertContains("js/collection-detail-manager.js", "db.from('map_references').delete", "Catalogue save should delete selected structured references");
assertContains("sql/map-detail-phase-1.sql", "CREATE TABLE IF NOT EXISTS map_notes", "Phase 1 should separate user and AI notes");
assertContains("sql/map-detail-phase-1.sql", "CREATE TABLE IF NOT EXISTS map_documents", "Phase 1 should add private document metadata");
assertContains("sql/map-detail-phase-1.sql", "VALUES ('map-documents', 'map-documents', false)", "map documents bucket should be private by default");
assertContains("sql/map-detail-phase-1.sql", "maps.user_id = auth.uid()", "Phase 1 detail policies should verify ownership of the parent map");
assertContains("sql/map-detail-phase-1.sql", "ON CONFLICT (map_id) DO NOTHING", "legacy maps.notes backfill should not overwrite existing separated notes");
assertContains("supabase/functions/evaluate-text/index.ts", "identifyActor(req)", "evaluate-text should require an authenticated user");
assertContains("supabase/functions/scrape-listing/index.ts", "identifyActor(req)", "scrape-listing should require an authenticated user");
assertContains("supabase/functions/scrape-image/index.ts", "identifyActor(req)", "scrape-image should require an authenticated user");
assertContains("supabase/functions/scrape-listing/index.ts", "validateDealerUrl", "scrape-listing should reject arbitrary URLs");
assertContains("supabase/functions/scrape-image/index.ts", "validateDealerUrl", "scrape-image should reject arbitrary URLs");
assertContains("supabase/functions/evaluate-map/index.ts", "allowAnonymous: true", "public map scans should be explicit and usage-limited");
assertContains("supabase/functions/evaluate-map/index.ts", "anonymousDaily: 5", "anonymous map scans should have a daily cap");
assertContains("supabase/functions/chat-advisor/index.ts", "enforceUsageLimit", "chat-advisor should be usage logged and limited");
assertContains("collection.html", "async function getFunctionHeaders", "collection Edge Function calls should attach auth headers");
assertContains("extension/popup.js", "async function getFunctionHeaders", "extension Edge Function calls should attach auth headers");

assertContains(
  "sql/fix-map-images-storage-policies.sql",
  "DROP POLICY IF EXISTS \"Users can delete their own map images\"",
  "the live migration replaces the old broad delete policy"
);
assertContains(
  "sql/fix-map-images-storage-policies.sql",
  "(storage.foldername(name))[1] = auth.uid()::text",
  "storage update/delete policy should check the user-owned folder"
);
assertContains(
  "sql/fix-map-images-storage-policies.sql",
  "public.map_images",
  "legacy objects should be protected through the map_images ownership record"
);
assertContains(
  "sql/fix-map-images-storage-policies.sql",
  "bucket_id = 'map-images'",
  "storage policies should be scoped to the map-images bucket"
);

if (failures.length > 0) {
  console.error("\nSmoke tests failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Smoke tests passed for ${productionHtml.length} production HTML files and storage policy guards.`);
