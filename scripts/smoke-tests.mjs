import fs from "node:fs";
import path from "node:path";
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

for (const htmlFile of productionHtml) {
  assertFile(htmlFile);
  if (exists(htmlFile)) checkLocalReferences(htmlFile);
}

assertFile("sql/core-schema.sql");
assertFile("sql/map-detail-phase-1.sql");
assertFile("sql/fix-map-images-storage-policies.sql");
assertFile("sql/storage-bucket.sql");
assertFile("collection.html");

assertNotContains("collection.html", "map-photos", "the live bucket is map-images");
assertContains("collection.html", ".from('map-images')", "map image uploads and rotation use the real storage bucket");
assertContains("collection.html", "${userId}/photos/", "new authenticated uploads should live under a user-owned folder");
assertContains("collection.html", "storage_path", "map image rows should track the underlying storage object");
assertContains("collection.html", "window.history.pushState({ hmDetailMapId", "opening a map detail should add a collection-local history state");
assertContains("collection.html", "window.addEventListener('popstate'", "browser Back should close the map detail panel before leaving the collection");
assertContains("collection.html", "aria-label=\"Close map details\"", "the map detail close button should be accessible and wired to close the panel");
assertContains("collection.html", "ontouchend=\"event.preventDefault();event.stopPropagation();closeDetail()\"", "the map detail close button should handle iOS touch events directly");
assertContains("collection.html", "width: 44px; height: 44px", "the map detail close button should have a reliable touch target");
assertContains("collection.html", "detail-tabs", "map detail should expose read-only tabs");
assertContains("collection.html", "Photos & Files", "map detail should include the Phase 1 files tab");
assertContains("collection.html", "map_catalog_details", "map detail should read collector catalogue metadata");
assertContains("collection.html", "map_documents", "map detail should read private document metadata");
assertContains("collection.html", "ai_thesis_fit", "AI notes should be separated from user notes");

assertFile("sql/edge-function-usage.sql");
assertFile("supabase/functions/_shared/edge-auth.ts");
assertContains("sql/edge-function-usage.sql", "CREATE TABLE IF NOT EXISTS edge_function_usage", "Edge Function calls should have a canonical usage log table");
assertContains("sql/core-schema.sql", "CREATE TABLE IF NOT EXISTS profiles", "core schema SQL should define profiles");
assertContains("sql/core-schema.sql", "CREATE TABLE IF NOT EXISTS maps", "core schema SQL should define maps");
assertContains("sql/core-schema.sql", "DROP POLICY IF EXISTS \"Allow insert for known user\" ON maps", "core schema SQL should remove the prototype known-user map policy");
assertContains("sql/core-schema.sql", "WITH CHECK (auth.uid() = user_id)", "core schema policies should enforce user ownership on writes");
assertContains("sql/map-detail-phase-1.sql", "CREATE TABLE IF NOT EXISTS map_catalog_details", "Phase 1 should add catalog detail metadata");
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
