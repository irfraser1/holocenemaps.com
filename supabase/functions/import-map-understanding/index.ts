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

  return {
    what_this_map_is: cleanText(value?.what_this_map_is, 900),
    historical_significance: cleanText(value?.historical_significance, 1100),
    collection_relationship: cleanText(value?.collection_relationship, 1200),
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
  "what_this_map_is": "Plain-language explanation, 2-3 sentences. Not dealer prose.",
  "historical_significance": "Why this map matters historically, 2-4 concise sentences.",
  "collection_relationship": "How this may relate to owned maps, reference maps, target maps, thesis, or notes. Mention specific related maps only when supported by the provided context.",
  "evidence": [
    "Short evidence point connecting the conclusion to imported source text or a named collection map."
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
        max_tokens: 900,
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
