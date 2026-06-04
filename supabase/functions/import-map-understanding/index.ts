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
  cartographer?: string;
  year?: string;
  status?: string;
  act?: string;
  dealer?: string;
  notes?: string;
};

function cleanText(value: unknown, maxLength = 1200) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function compactMap(item: ContextMap) {
  return {
    title: cleanText(item.title, 180),
    cartographer: cleanText(item.cartographer, 120),
    year: cleanText(item.year, 80),
    status: cleanText(item.status, 80),
    act: cleanText(item.act, 80),
    dealer: cleanText(item.dealer, 120),
    notes: cleanText(item.notes, 260),
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
  "collection_relationship": "How this may relate to owned maps, reference maps, target maps, thesis, or notes. This is about relationship strength and narrative/contextual fit only, not whether to buy it. Mention specific related maps only when supported by the provided context.",
  "suggested_action": "A provisional next step, distinct from relationship. Examples: retain as reference, compare with owned copy, add notes to existing owned map, watch as acquisition target, or no action. If the collector appears to already own this map or a close equivalent, say that acquisition value may be low even if relationship is high.",
  "collection_gap_analysis": {
    "current_strengths": ["Themes, periods, geographies, or map roles that appear well represented based on the provided context."],
    "potential_gaps": ["Themes, periods, geographies, or map roles that appear underrepresented based on the thesis and collection context."],
    "collection_insight": "Explain whether the imported map reinforces an existing strength, fills an underrepresented gap, has comparative/reference value, has low acquisition value due to redundancy, or points toward better future targets.",
    "higher_value_directions": ["Guarded examples of map types or historical areas that may add more new collection value than this import, if the import is redundant."]
  },
  "evidence": [
    "Thesis evidence: Short point showing how the thesis affects the conclusion.",
    "Imported source evidence: Short point showing what in the listing supports the conclusion.",
    "Collection evidence: Short point naming relevant owned/reference/target/narrative maps where possible.",
    "Gap evidence: Short point explaining why a strength or possible gap was identified. Do not merely restate metadata."
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
