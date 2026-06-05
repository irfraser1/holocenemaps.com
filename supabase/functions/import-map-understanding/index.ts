import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, enforceUsageLimit, identifyActor, jsonResponse, optionsResponse } from "../_shared/edge-auth.ts";

type ImportedMap = {
  title?: string;
  listing_title?: string;
  cartographer?: string;
  publication_date?: string;
  publication_place?: string;
  dealer?: string;
  price?: string;
  source_url?: string;
  source_domain?: string;
  description?: string;
  condition?: string;
  dimensions?: string;
  raw_import_snapshot?: unknown;
};

type ContextMap = {
  title?: string;
  maker?: string;
  date?: string;
  status?: string;
  period?: string;
  geography?: string;
  historical_themes?: unknown;
  why_this_matters?: string;
  ai_summary?: string;
  thesis_fit?: string;
  narrative_role?: string;
};

function cleanText(value: unknown, maxLength = 1200) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function compactMap(item: ContextMap) {
  const themes = Array.isArray(item.historical_themes)
    ? item.historical_themes.map((value) => cleanText(value, 120)).filter(Boolean).slice(0, 8)
    : [];

  return {
    title: cleanText(item.title, 180),
    maker: cleanText(item.maker, 120),
    date: cleanText(item.date, 80),
    status: cleanText(item.status, 80),
    period: cleanText(item.period, 120),
    geography: cleanText(item.geography, 160),
    historical_themes: themes,
    why_this_matters: cleanText(item.why_this_matters, 500),
    ai_summary: cleanText(item.ai_summary, 500),
    thesis_fit: cleanText(item.thesis_fit, 500),
    narrative_role: cleanText(item.narrative_role, 700),
  };
}

function compactImportedMap(item: ImportedMap) {
  return {
    title: cleanText(item.title, 260),
    listing_title: cleanText(item.listing_title, 260),
    cartographer: cleanText(item.cartographer, 160),
    publication_date: cleanText(item.publication_date, 120),
    publication_place: cleanText(item.publication_place, 120),
    dealer: cleanText(item.dealer, 160),
    price: cleanText(item.price, 80),
    source_url: cleanText(item.source_url, 500),
    source_domain: cleanText(item.source_domain, 120),
    dimensions: cleanText(item.dimensions, 260),
    condition: cleanText(item.condition, 400),
    description: cleanText(item.description, 3000),
  };
}

function collectSourceStrings(value: unknown, depth = 0): string[] {
  if (value == null || depth > 3) return [];
  if (typeof value === "string" || typeof value === "number") {
    const text = cleanText(value, 3000);
    return text ? [text] : [];
  }
  if (Array.isArray(value)) {
    return value.slice(0, 12).flatMap((item) => collectSourceStrings(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/\b(image|url|html|css|script|token|auth)\b/i.test(key))
      .slice(0, 30)
      .flatMap(([, nested]) => collectSourceStrings(nested, depth + 1));
  }
  return [];
}

function sourceTextForDistinctiveEvidence(imported: ImportedMap) {
  const primary = [
    imported.title,
    imported.listing_title,
    imported.cartographer,
    imported.publication_date,
    imported.publication_place,
    imported.dealer,
    imported.description,
    imported.condition,
    imported.dimensions,
    imported.source_domain,
  ].map((value) => cleanText(value, 3000)).filter(Boolean);

  const snapshotText = collectSourceStrings(imported.raw_import_snapshot)
    .filter((text) => !primary.includes(text))
    .slice(0, 12);

  return [...primary, ...snapshotText].join(" \n ");
}

function contextSnippet(text: string, index: number, length: number) {
  const start = Math.max(0, index - 180);
  const end = Math.min(text.length, index + length + 220);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < text.length ? " ..." : "";
  return cleanText(prefix + text.slice(start, end) + suffix, 520);
}

function findDistinctiveSnippets(text: string, patterns: RegExp[]) {
  const snippets: string[] = [];
  const seen = new Set<string>();
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    for (const match of text.matchAll(regex)) {
      if (match.index == null) continue;
      const snippet = contextSnippet(text, match.index, match[0].length);
      const key = snippet.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        snippets.push(snippet);
      }
      if (snippets.length >= 3) break;
    }
    if (snippets.length >= 3) break;
  }
  return snippets;
}

function buildDistinctiveEvidence(inputText: string, importedMetadata: ImportedMap) {
  const text = cleanText(
    [
      inputText,
      importedMetadata.title,
      importedMetadata.listing_title,
      importedMetadata.cartographer,
      importedMetadata.publication_date,
      importedMetadata.description,
      importedMetadata.condition,
      importedMetadata.dimensions,
    ].filter(Boolean).join(" \n "),
    18000,
  );
  if (!text) return "";

  const categories: Array<{ label: string; support: string; patterns: RegExp[] }> = [
    {
      label: "Foundational / speculative early geography",
      support: "Supports Foundational Context / Intellectual Lineage and Speculative Geography / Foundational Reference when central.",
      patterns: [
        /California as an Island/i,
        /Island of California/i,
        /Quivira/i,
        /Lago d[eo] Oro/i,
        /Lake of Gold/i,
        /\bAnian\b/i,
        /Northwest Passage/i,
        /speculative geography/i,
        /mythical geography/i,
        /imagined geography/i,
        /pre-scientific geography/i,
        /early geographic worldview/i,
        /Sanson(?: geography)?/i,
        /foundational cartography/i,
      ],
    },
    {
      label: "Scientific-theoretical / cartographic controversy",
      support: "Supports Branch Narrative / Intellectual Lineage and Speculative Geography / Scientific-Theoretical Cartography when central.",
      patterns: [
        /Sea of the West/i,
        /Mer de l[’']Ouest/i,
        /Admiral de Fonte/i,
        /\bDe Fonte\b/i,
        /\bFonte\b/i,
        /\bBuache\b/i,
        /\bDe(?:\s+|l['’])?L['’]?Isle\b/i,
        /Northwest Passage/i,
        /\bBering\b/i,
        /Russian discoveries/i,
        /Kamchatka/i,
        /Tschirikow/i,
        /Chirikov/i,
        /scientific debate/i,
        /cartographic controversy/i,
        /competing geographic theories/i,
        /theoretical geography/i,
        /speculative geography/i,
      ],
    },
    {
      label: "Corrective cartography",
      support: "Supports Intellectual Lineage / Branch Narrative and Scientific / Corrective Cartography when the map corrects or refines prior models.",
      patterns: [
        /correct(?:ed|ion|ive)?/i,
        /refutes?/i,
        /rebuts?/i,
        /rejects?/i,
        /updates?/i,
        /revised/i,
        /improved/i,
        /later discoveries/i,
        /Russian discoveries/i,
        /Imperial Academy of St\.? Petersburg/i,
        /M[üu]ller/i,
        /St[äa]hlin/i,
        /\bBering\b/i,
        /Chirikov/i,
        /Tschirikow/i,
        /North Pacific/i,
      ],
    },
    {
      label: "Apocryphal / reference compilation geography",
      support: "Supports Branch Narrative / Intellectual Lineage and Speculative Geography / Reference Compilation when central.",
      patterns: [
        /apocryphal/i,
        /mythical/i,
        /imaginary/i,
        /legendary/i,
        /Admiral de Fonte/i,
        /\bDe Fonte\b/i,
        /Fonte waterways/i,
        /speculative waterways/i,
        /reference compilation/i,
        /public imagination/i,
        /French public/i,
        /cartographic myth/i,
        /\bNolin\b/i,
      ],
    },
    {
      label: "Post-Revolutionary / diplomatic recognition / treaty settlement",
      support: "Supports Narrative Advancement / Anchor Candidate and Political Boundary / Treaty Settlement / Diplomatic Recognition / Post-Revolutionary Reference Map when it extends the observed narrative.",
      patterns: [
        /Benjamin Franklin/i,
        /\bFranklin\b/i,
        /Treaty of Paris/i,
        /\b1783\b/i,
        /\b1791\b/i,
        /United States/i,
        /[EÉ]tats-Unis/i,
        /first French map of the United States/i,
        /French recognition/i,
        /recognition of the United States/i,
        /American independence/i,
        /post-Revolutionary/i,
        /Revolutionary War/i,
        /treaty settlement/i,
        /diplomatic recognition/i,
        /Mitchell map/i,
        /John Mitchell/i,
      ],
    },
  ];

  const sections = categories
    .map((category) => {
      const snippets = findDistinctiveSnippets(text, category.patterns);
      if (!snippets.length) return "";
      return `${category.label}: ${category.support} Evidence snippets: ${snippets.map((snippet) => `"${snippet}"`).join(" | ")}`;
    })
    .filter(Boolean);

  return cleanText(sections.join("\n"), 1600);
}

function parseJsonObject(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object returned");
    return JSON.parse(match[0]);
  }
}

function normalizeUnderstanding(value: any) {
  const evidence = Array.isArray(value?.evidence)
    ? value.evidence.map((item: unknown) => cleanText(item, 260)).filter(Boolean).slice(0, 5)
    : [];
  const gap = value?.collection_gap_analysis || {};

  return {
    what_this_map_is: cleanText(value?.what_this_map_is, 900),
    historical_significance: cleanText(value?.historical_significance, 1100),
    likely_narrative_chapter: cleanText(value?.likely_narrative_chapter, 180),
    collection_role: {
      role: cleanText(value?.collection_role?.role, 120),
      reason: cleanText(value?.collection_role?.reason, 700),
    },
    map_function: {
      function: cleanText(value?.map_function?.function, 120),
      reason: cleanText(value?.map_function?.reason, 600),
    },
    collection_relationship: cleanText(value?.collection_relationship, 1200),
    collection_advancement: {
      level: cleanText(value?.collection_advancement?.level, 80),
      reason: cleanText(value?.collection_advancement?.reason, 800),
    },
    suggested_action: cleanText(value?.suggested_action, 900),
    collection_gap_analysis: {
      current_strengths: Array.isArray(gap.current_strengths)
        ? gap.current_strengths.map((item: unknown) => cleanText(item, 180)).filter(Boolean).slice(0, 5)
        : [],
      potential_gaps: Array.isArray(gap.potential_gaps)
        ? gap.potential_gaps.map((item: unknown) => cleanText(item, 180)).filter(Boolean).slice(0, 5)
        : [],
      collection_insight: cleanText(gap.collection_insight, 900),
      higher_value_directions: Array.isArray(gap.higher_value_directions)
        ? gap.higher_value_directions.map((item: unknown) => cleanText(item, 180)).filter(Boolean).slice(0, 5)
        : [],
    },
    evidence,
  };
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasDistinctAcquisitionReason(text: string) {
  const distinctSignals = [
    /\bdistinct\s+(?:state|edition|issue|provenance|condition|price|perspective|content|variant|copy)\b/i,
    /\bunique\s+(?:perspective|content|provenance|state|edition|variant|copy)\b/i,
    /\bmaterially\s+new\s+(?:content|evidence|perspective)\b/i,
    /\bunusually\s+favo[u]?rable\s+price\b/i,
    /\bcondition\s+advantage\b/i,
  ];
  return hasAny(text, distinctSignals) && !hasAny(text, [
    /\bunless\s+(?:there\s+is\s+|it\s+has\s+|a\s+)?(?:a\s+)?distinct\b/i,
    /\bonly\s+if\s+(?:there\s+is\s+|it\s+has\s+|a\s+)?(?:a\s+)?distinct\b/i,
    /\bif\s+(?:there\s+is\s+|it\s+has\s+|a\s+)?(?:a\s+)?distinct\b/i,
    /\bno\s+(?:clear\s+)?distinct\b/i,
  ]);
}

function normalizeOwnedAnchorRedundancy(value: any) {
  const text = [
    value?.likely_narrative_chapter,
    value?.collection_role?.role,
    value?.collection_role?.reason,
    value?.map_function?.function,
    value?.map_function?.reason,
    value?.collection_relationship,
    value?.collection_advancement?.level,
    value?.collection_advancement?.reason,
    value?.suggested_action,
    value?.collection_gap_analysis?.collection_insight,
    ...(Array.isArray(value?.evidence) ? value.evidence : []),
  ].map((item) => cleanText(item, 1000)).filter(Boolean).join(" ");

  const ownedAnchor = hasAny(text, [
    /\bowned\s+(?:anchor|map|copy|example|Gibson|Proclamation)\b/i,
    /\balready\s+own(?:s|ed)?\b/i,
    /\bexisting\s+owned\b/i,
    /\bowned\s+.*\banchor\b/i,
  ]);
  const redundantSameMoment = hasAny(text, [
    /\bsame\s+(?:chapter|event|date|period|policy|historical moment|map family|narrative function|Proclamation|1763)\b/i,
    /\bduplicates?\b/i,
    /\bredundan(?:t|cy)\b/i,
    /\breinforces?\b/i,
    /\bcomplements?\b/i,
    /\badds?\s+context\b/i,
    /\bcompar(?:e|ison|ative)\b/i,
    /\bclose equivalent\b/i,
    /\bwell-represented\b/i,
  ]);

  if (!ownedAnchor || !redundantSameMoment || hasDistinctAcquisitionReason(text)) {
    return value;
  }

  return {
    ...value,
    collection_role: {
      role: "Reference Evidence / Reinforcement",
      reason: cleanText(
        value?.collection_role?.reason ||
          "The imported map appears to document or reinforce an already-owned anchor moment rather than opening a new collection chapter.",
        700,
      ),
    },
    collection_advancement: {
      level: "Low",
      reason: "An owned anchor or close equivalent already appears to cover the same chapter, event, policy, map family, or narrative function. Without a distinct state, edition, provenance, condition advantage, unusually favorable price, unique perspective, or materially new content, this should be treated as reinforcement/reference value rather than narrative advancement.",
    },
    suggested_action: "Use as reference evidence or compare against the owned anchor; consider attaching useful notes to the existing record. Do not treat as an acquisition candidate by default unless a distinct state, edition, provenance, condition advantage, unusually favorable price, unique perspective, or materially new content is identified.",
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const actor = await identifyActor(req);
    if (actor instanceof Response) return actor;
    const limitResponse = await enforceUsageLimit(actor, "import-map-understanding", { authenticatedDaily: 100 });
    if (limitResponse) return limitResponse;

    const { imported_map, thesis, collection_maps } = await req.json();
    const rawImportedMap = (imported_map || {}) as ImportedMap;
    const imported = compactImportedMap(rawImportedMap);
    const distinctiveEvidence = buildDistinctiveEvidence(
      sourceTextForDistinctiveEvidence(rawImportedMap),
      rawImportedMap,
    );
    const collection = Array.isArray(collection_maps)
      ? collection_maps.slice(0, 18).map(compactMap)
      : [];

    if (!imported.title && !imported.listing_title && !imported.description) {
      return jsonResponse({ error: "Imported map metadata or description is required." }, 400);
    }

    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_KEY) {
      return jsonResponse({ error: "API key not configured." }, 500);
    }

    const prompt = `You are Holocene Maps' import understanding layer.

Goal:
Help an antique map collector understand why an imported dealer listing may matter to their collection.

Important product principles:
- Metadata identifies the map.
- Narrative explains why the map matters.
- Dealer content is source material, not final interpretation.
- Be provisional and evidence-based.
- Do not invent certainty. If collection fit is unclear, say so plainly.
- Relationship to the collection, collection advancement, and suggested action are separate concepts. A map can be highly related but low acquisition priority because the collector already owns it or owns a close equivalent.
- Gap analysis must compare the imported map, the collector's thesis, and the distribution of existing owned/reference/target/narrative maps. Do not infer gaps from the imported map alone.
- Use guarded language such as "appears underrepresented", "based on the provided collection context", and "may be a gap if this is central to the thesis." Avoid "your collection lacks", "you need", and "the next acquisition should be."
- Before writing the response, infer a provisional collection narrative model from the thesis and collection context. Think in story chapters: major historical phases, themes, or transitions anchored by existing maps. Use this inferred model internally; do not present it as permanent collector-approved structure.
- Let the observed collection narrative evolve beyond the stated thesis when the existing maps point that way. Low stated-thesis fit should not automatically mean low advancement if the map extends the observed narrative into a plausible next chapter.
- Reason over whether the imported map belongs to an existing narrative chapter, bridges chapters, fills a thin chapter, or mostly duplicates/reinforces a well-anchored chapter.
- Assign a collection role that describes what this map does for the collection, not just where it fits. Consider roles such as Reinforcement, Comparative Research, Narrative Advancement, Branch Narrative, Foundational Context, Intellectual Lineage, Geographic Diversification, Reference Evidence, or Acquisition Target.
- Keep relationship and advancement separate. Relationship asks "does this connect strongly to the collection?" Advancement asks "does this move the collection story forward, open a new chapter, fill a thin branch, or mostly reinforce what is already anchored?"
- Do not infer importance from date alone.
- Do not treat uniqueness, rarity, or "firsts" as automatic collection advancement.
- High historical importance does not automatically imply high acquisition value.
- High relationship does not automatically imply high acquisition value.
- Do not collapse intellectual-history maps into the nearest political chapter.
- Do not let chronology dominate. Consider political events, geographic knowledge, speculative geography, cartographic controversy, intellectual lineage, map function, geographic diversification, comparison with an owned anchor, and advancement of the observed narrative.
- Distinguish Core Narrative from Branch Narrative when useful. A map may be deeply valuable as a branch, foundational context, or intellectual lineage object even if it does not advance the core political chronology.
- Identify map function as a lightweight reasoning output. Consider labels such as Boundary Map, Administrative Map, Maritime Chart, Commercial Geography, Settlement Geography, Exploration Map, Scientific / Survey Map, Speculative Geography, Propaganda / Claims Map, Reference / Compilation Map, or another concise function label if better supported.
- Do not hard-code outcomes by cartographer, publisher, or mapmaker name. Use names only as supporting evidence when the dealer description, title, and collection context support the classification.
- Use the distinctive cartographic / narrative evidence block as source evidence when classifying Collection Role, Map Function, Collection Advancement, and Suggested Action. It surfaces snippets from the imported source; it should inform reasoning, not force a conclusion.

Reasoning order:
1. Infer the observed narrative from the thesis plus collection context.
2. Classify the likely narrative chapter, allowing emerging chapters beyond the stated thesis when supported by existing maps.
3. Classify collection role and map function before writing suggested_action.
4. Evaluate relationship strength separately from collection advancement.
5. Write suggested_action as the conclusion of role + relationship + advancement + map function + observed narrative. Do not recommend acquisition if those fields point to reference, comparison, redundancy, or research-only value.

Decision guardrails:
- High relationship + low advancement + existing owned anchor = reference / compare, not acquire by default.
- If an owned or close-equivalent anchor appears in collection context, suggest acquisition only when there is a distinct state, provenance, condition, price, or research reason.
- Moderate relationship + high advancement = investigate; it may represent an emerging chapter.
- Low stated-thesis fit + high observed-narrative advancement = possible thesis expansion, not automatic downgrade.
- Speculative geography, cartographic controversy, scientific debate, or evolution of geographic knowledge = consider Branch Narrative or Intellectual Lineage.
- Early precursor maps that explain later maps = consider Foundational Context or Intellectual Lineage.
- Unique feature / rarity / first-use claim = research value, not automatic acquisition value.
- Maps about California as an Island, Quivira, Lago do Oro, Sea of the West, Northwest Passage, Russian discoveries, Bering, Admiral de Fonte, or Delisle/Buache debates should be evaluated for intellectual/cartographic lineage, not only political chronology.

Final owned-anchor consistency check:
- Before writing collection_role, collection_advancement, collection_gap_analysis, and suggested_action, check whether the imported map covers an already-owned anchor's same chapter, event, date/period, policy, historical moment, map family, or narrative function.
- If it does, and the source does not clearly identify a distinct state, edition, provenance, condition advantage, unusually favorable price, unique perspective, or materially new content, normalize the conclusion to Reference Evidence / Reinforcement, Low or Very Low advancement, and reference/compare/do-not-acquire-by-default.
- High historical importance must not override redundancy.
- High relationship must not imply high advancement.
- Additional context/detail is not enough for High advancement when an owned anchor already covers the same narrative moment.
- Do not call it an emerging chapter when it covers an already-owned anchor chapter/event.
- If you want Moderate or High advancement despite an owned anchor, you must explicitly name the distinct non-redundant reason.
- This owned-anchor redundancy rule does not apply to successor chapters that genuinely extend the observed narrative, such as post-Revolutionary / Treaty Settlement / American Independence material that is not already anchored.

Classification calibration:
- Preserve the acquisition guardrail: high relationship + low advancement + existing owned anchor should remain reference / compare / do not acquire by default.
- Do not default to political claims if the description emphasizes speculative geography, cartographic controversy, scientific debate, geographic uncertainty, mapmaking lineage, or evolution of knowledge.
- If the map matters because it shows how geographic knowledge evolved, strongly consider Intellectual Lineage.
- If the map opens an adjacent story rather than advancing the core narrative, strongly consider Branch Narrative.
- If the map explains the intellectual/cartographic background for later maps, strongly consider Foundational Context.
- If the map depicts imagined, disputed, mythical, or uncertain geography, strongly consider Speculative Geography.
- If the map corrects, rejects, updates, or disputes earlier geographic models, consider Scientific / Corrective Cartography.
- If the description emphasizes early geographic worldview, pre-modern geographic assumptions, California as an Island, Quivira, or Lago de Oro, consider Foundational Context / Intellectual Lineage and Speculative Geography / Foundational Reference before Claims Map.
- If the description emphasizes Sea of the West, Northwest Passage, Russian discoveries, Bering, Admiral de Fonte, Delisle/Buache context, scientific debate, cartographic controversy, or competing geographic theories, consider Branch Narrative / Intellectual Lineage and Speculative Geography / Scientific-Theoretical Cartography before Exploration Map.
- If the description emphasizes correction or refinement of earlier North Pacific speculative geography, consider Intellectual Lineage / Branch Narrative and Scientific / Corrective Cartography.
- If the description emphasizes apocryphal geography, De Fonte waterways, cartographic myth, speculative French geographic imagination, or compiled disputed geographic claims, consider Branch Narrative / Intellectual Lineage and Speculative Geography / Reference Compilation.
- Exploration Map should be reserved for maps whose primary function is documenting exploration routes, discoveries, or geographic reporting, not maps whose primary value is theoretical debate.
- Claims Map should be reserved for maps whose primary function is territorial or political assertion, not maps whose main value is speculative geography or cartographic worldview.
- When a map extends the observed collection narrative into a major next chapter, do not cap advancement at Moderate solely because it sits beyond the original thesis. Consider High or Very High advancement when it completes or opens a major transition.

Architecture distinction:
Map Intelligence answers what the map is and why it matters historically.
Collection Intelligence answers why it may matter to this collector.

Imported map:
${JSON.stringify(imported, null, 2)}

Distinctive cartographic / narrative evidence surfaced from source:
${distinctiveEvidence || "No distinctive cartographic or narrative trigger evidence was surfaced from the imported source text."}

Collector thesis:
${cleanText(thesis, 1500) || "No collection thesis provided."}

Existing collection context:
${collection.length ? JSON.stringify(collection, null, 2) : "No existing maps provided."}

Return strict JSON only with this shape:
{
  "what_this_map_is": "Plain-language explanation of the object, 2-3 sentences. Explain what kind of map/object this is, its edition/state/lineage if evident, and its role as an artifact. Do not repeat or lightly paraphrase the title.",
  "historical_significance": "Why this map matters historically, 2-4 concise sentences.",
  "likely_narrative_chapter": "Optional short guarded chapter label inferred from the collection story, e.g. British Reorganization / Proclamation of 1763. Empty string if unclear.",
  "collection_role": {
    "role": "One concise role label: Reinforcement, Comparative Research, Narrative Advancement, Branch Narrative, Foundational Context, Intellectual Lineage, Geographic Diversification, Reference Evidence, Acquisition Target, or another short role if none fit.",
    "reason": "Why this role fits based on evidence from the listing and collection context, not cartographer name alone. Distinguish relationship from advancement. For example, another owned-anchor example may be Comparative Research or Reinforcement, a map that opens a new story chapter may be Narrative Advancement or Branch Narrative, and a map that explains earlier geographic thought may be Foundational Context or Intellectual Lineage."
  },
  "map_function": {
    "function": "One concise object/function label such as Boundary Map, Administrative Map, Maritime Chart, Commercial Geography, Settlement Geography, Exploration Map, Scientific / Survey Map, Scientific-Theoretical Cartography, Scientific / Corrective Cartography, Speculative Geography, Foundational Reference, Propaganda / Claims Map, Reference / Compilation Map, or another short label if better supported.",
    "reason": "What the map does as an object. Explain whether its importance comes from boundaries, administration, navigation, settlement, exploration, scientific correction, theoretical debate, speculative geography, claims-making, compilation/reference use, foundational worldview, or another supported function."
  },
  "collection_relationship": "How this may relate to the inferred collection narrative, owned maps, reference maps, target maps, thesis, or notes. This is about relationship strength, narrative chapter, and contextual fit only, not whether to buy it. Mention specific related maps only when supported by the provided context.",
  "collection_advancement": {
    "level": "Very High, High, Moderate, Low, Very Low, or Unclear.",
    "reason": "Whether this moves the collection story forward, fills an underrepresented chapter or branch, opens a branch narrative, deepens intellectual lineage, or mostly reinforces/duplicates an existing anchor. Keep this separate from relationship strength."
  },
  "suggested_action": "A provisional next step that explicitly follows from collection_role, collection_relationship, collection_advancement, map_function, and the observed narrative. Examples: retain as reference, compare with owned copy, add notes to existing owned map, investigate as emerging chapter, watch as acquisition target, or no action. If relationship is high but advancement is low and an owned anchor or close equivalent appears in the provided context, default to reference/compare rather than acquisition unless a distinct state, provenance, condition, price, or research reason is evident. If stated-thesis fit is low but observed-narrative advancement is high, frame it as a possible thesis/narrative expansion rather than an automatic downgrade.",
  "collection_gap_analysis": {
    "current_strengths": ["Narrative chapters, themes, periods, geographies, or map roles that appear well represented based on the provided context."],
    "potential_gaps": ["Narrative chapters, transitions, themes, periods, geographies, or map roles that appear underrepresented based on the thesis and collection context."],
    "collection_insight": "Explain whether the imported map advances the collection story, reinforces an existing chapter, fills a thin chapter, has comparative/reference value, has low acquisition value due to redundancy, or points toward better future targets.",
    "higher_value_directions": ["Guarded examples of map types or historical areas that may advance the next or thinner chapter more than this import, if the import is redundant."]
  },
  "evidence": [
    "Thesis evidence: Short point showing how the thesis affects the conclusion.",
    "Imported source evidence: Short point showing what in the listing supports the conclusion.",
    "Collection evidence: Short point naming relevant owned/reference/target/narrative maps or inferred narrative chapter anchors where possible.",
    "Gap evidence: Short point explaining why a chapter appears strong, thin, reinforced, or advanced. Do not merely restate metadata."
  ]
}`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Return valid JSON only. Do not wrap it in Markdown." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1200,
        temperature: 0.35,
      }),
    });

    if (!openaiRes.ok) {
      const message = await openaiRes.text();
      console.error("[import-map-understanding] OpenAI request failed", openaiRes.status, message);
      return jsonResponse({ error: "Understanding generation failed." }, 502);
    }

    const openaiData = await openaiRes.json();
    const raw = openaiData?.choices?.[0]?.message?.content || "";
    const understanding = normalizeUnderstanding(normalizeOwnedAnchorRedundancy(parseJsonObject(raw)));

    return jsonResponse({
      understanding,
      generated_at: new Date().toISOString(),
      model: "gpt-4o-mini",
    });
  } catch (e) {
    console.error("[import-map-understanding] failed", e);
    const message = e instanceof Error ? e.message : "Understanding generation failed";
    return jsonResponse({ error: message }, 500);
  }
});
