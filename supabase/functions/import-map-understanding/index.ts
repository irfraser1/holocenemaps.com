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
    collection_relationship: cleanText(value?.collection_relationship, 1200),
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const actor = await identifyActor(req);
    if (actor instanceof Response) return actor;
    const limitResponse = await enforceUsageLimit(actor, "import-map-understanding", { authenticatedDaily: 100 });
    if (limitResponse) return limitResponse;

    const { imported_map, thesis, collection_maps } = await req.json();
    const imported = compactImportedMap(imported_map || {});
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
- Relationship to the collection and suggested action are separate concepts. A map can be highly related but low acquisition priority because the collector already owns it or owns a close equivalent.
- Gap analysis must compare the imported map, the collector's thesis, and the distribution of existing owned/reference/target/narrative maps. Do not infer gaps from the imported map alone.
- Use guarded language such as "appears underrepresented", "based on the provided collection context", and "may be a gap if this is central to the thesis." Avoid "your collection lacks", "you need", and "the next acquisition should be."
- Before writing the response, infer a provisional collection narrative model from the thesis and collection context. Think in story chapters: major historical phases, themes, or transitions anchored by existing maps. Use this inferred model internally; do not present it as permanent collector-approved structure.
- Reason over whether the imported map belongs to an existing narrative chapter, bridges chapters, fills a thin chapter, or mostly duplicates/reinforces a well-anchored chapter.
- Assign a collection role that describes what this map does for the collection, not just where it fits. Consider roles such as Reinforcement, Comparative Research, Narrative Advancement, Branch Narrative, Foundational Context, Intellectual Lineage, Geographic Diversification, Reference Evidence, or Acquisition Target.
- Do not let chronology dominate. Consider theme, map function, geography, cartographic significance, intellectual lineage, geographic uncertainty, and evolution of geographic knowledge.

Architecture distinction:
Map Intelligence answers what the map is and why it matters historically.
Collection Intelligence answers why it may matter to this collector.

Imported map:
${JSON.stringify(imported, null, 2)}

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
    "reason": "Why this role fits. Distinguish relationship from advancement. For example, another owned-anchor example may be Comparative Research or Reinforcement, while a map that opens a new story chapter may be Narrative Advancement or Branch Narrative."
  },
  "collection_relationship": "How this may relate to the inferred collection narrative, owned maps, reference maps, target maps, thesis, or notes. This is about relationship strength, narrative chapter, and contextual fit only, not whether to buy it. Mention specific related maps only when supported by the provided context.",
  "suggested_action": "A provisional next step, distinct from relationship. Examples: retain as reference, compare with owned copy, add notes to existing owned map, watch as acquisition target, or no action. If the imported map belongs to a well-represented chapter or the collector appears to already own this map or a close equivalent, say acquisition value may be low even if relationship is high.",
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
    const understanding = normalizeUnderstanding(parseJsonObject(raw));

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
