# Frontend Architecture

## Current Module Structure

The production frontend is a static GitHub Pages site. Most pages are standalone HTML files at the repo root, with `collection.html` currently serving as the primary logged-in collection application.

Collection styles are now loaded from ordered CSS files:

- `css/collection-base.css`: shared design tokens, reset rules, authentication screen, app shell, header, thesis panel, tabs, toolbar, map grid, map cards, detail sheet, forms, import bar, onboarding, market radar, and responsive collection layout rules.
- `css/collection-dialogs.css`: branded alert and confirm dialog styles.
- `css/collection-chat.css`: floating chat advisor, chat panel, message, citation, typing, search, image preview, and mobile chat rules.

Collection JavaScript still lives inline in `collection.html`. This first modularization step intentionally does not change script behavior or runtime data flow.

## Module Responsibilities

- Root HTML pages define static document structure and load page-specific assets.
- `collection.html` owns the collection app markup, Supabase client setup, authentication flow, collection rendering, detail sheet behavior, modal workflows, uploads, Edge Function calls, and chat advisor behavior.
- `css/collection-base.css` owns the main collection visual system and layout.
- `css/collection-dialogs.css` owns reusable branded blocking dialog presentation.
- `css/collection-chat.css` owns chat advisor presentation.
- `extension/` contains the browser extension surface and remains separate from the GitHub Pages frontend.
- `docs/` contains implementation notes and project documentation.

## Shared Global State

The collection app currently relies on shared globals inside `collection.html`, including authenticated user/session data, loaded map records, active filters, selected map/detail state, photo state, thesis state, and chat thread/message state.

Because JavaScript has not yet been extracted, functions share state through script-level variables and global browser event handlers. Future JavaScript modularization should make ownership explicit before splitting behavior across files.

## Load Order Expectations

`collection.html` should load in this order:

1. External vendor scripts required by the current inline JavaScript, including Supabase and Google Identity Services.
2. Font and icon resources.
3. Collection CSS files in cascade order: base, dialogs, chat.
4. Static body markup.
5. Existing inline JavaScript in its current order.

The CSS file order is part of the contract. Later files may rely on variables and reset rules from `collection-base.css`.

## Naming Conventions

- Page-specific assets use the page name as a prefix, such as `collection-*`.
- CSS class names should continue using the current kebab-case pattern.
- State classes should remain short and behavioral, such as `open`, `active`, `visible`, `loading`, `editing`, and `hidden`.
- JavaScript globals and functions should keep the existing camelCase style until they are extracted into modules.
- New CSS files should be static relative assets so GitHub Pages can serve them without a build step.

## Future Extraction Roadmap

1. Extract non-behavioral constants and small DOM helpers from `collection.html`.
2. Move Supabase setup and Edge Function header helpers into a collection API module.
3. Extract rendering functions for map cards, details, photos, dialogs, and chat into separate modules.
4. Isolate shared collection state behind a small state object with clear read/write ownership.
5. Replace inline event attributes with delegated listeners after equivalent behavior is covered by smoke or browser tests.
6. Split large workflows by responsibility: auth, collection list, detail sheet, import/evaluation, uploads, market radar, and chat advisor.
7. Keep each step rollback-safe by preserving file paths, DOM ids, public function names, and GitHub Pages static loading until a broader build strategy is intentionally introduced.
