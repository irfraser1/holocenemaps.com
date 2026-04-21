// ════════════════════════════════════════════════════════════
// Supabase Edge Function: evaluate-map
// Two-call pipeline: Extract+Identify → (Retrieve) → Corroborate
// Deploy with: supabase functions deploy evaluate-map --no-verify-jwt
// ════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  EXTRACT_IDENTIFY_PROMPT,
  buildCorroboratePrompt,
} from "./prompts.ts";
import {
  type ExtractOutput,
  type IdentifyOutput,
  type CorroborateOutput,
  type MergedResult,
  CORE_FIELDS,
  mergeIdentifyOnly,
  mergeIdentifyCorroborate,
} from "./schema.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  const T0 = Date.now();
  const log = (phase: string) => console.log(`[evaluate-map] ${phase} — ${Date.now() - T0}ms`);
  log("START");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let base64Image: string;
    let mimeType = "image/jpeg";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // ── MULTIPART: browser streams raw file ──
      const formData = await req.formData();
      const file = formData.get("image") as File;
      if (!file) {
        return new Response(JSON.stringify({ error: "No image file provided." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
      mimeType = file.type || "image/jpeg";
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Chunked base64 encode to avoid call stack overflow
      const CHUNK = 8192;
      let binary = "";
      for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.subarray(i, i + CHUNK);
        binary += String.fromCharCode(...slice);
      }
      base64Image = btoa(binary);

    } else {
      // ── JSON: legacy base64 path ──
      const body = await req.json();
      base64Image = body.imageBase64;
    }

    log(`IMAGE_PARSED — base64 length: ${base64Image?.length || 0}`);

    if (!base64Image || base64Image.length < 100) {
      return new Response(JSON.stringify({ error: "Invalid image data." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://irfuhohbabtywbuchwpb.supabase.co";
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    // ── Helper: call OpenAI ──
    async function callLLM(prompt: string, withImage: boolean, maxTokens: number) {
      const content: any[] = [{ type: "text", text: prompt }];
      if (withImage) {
        content.push({ type: "image_url", image_url: { url: imageUrl, detail: "high" } });
      }
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content }],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      });
      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content || "";
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(cleaned);
    }

    // ══════════════════════════════════════════════════════════
    // CALL 1: EXTRACT + IDENTIFY (combined — single image pass)
    // ══════════════════════════════════════════════════════════

    log("EXTRACT_IDENTIFY_START");
    let extracted: ExtractOutput;
    let identified: IdentifyOutput;
    try {
      const combined = await callLLM(EXTRACT_IDENTIFY_PROMPT, true, 2400);
      log("EXTRACT_IDENTIFY_DONE");

      // Handle not-a-map error
      if (combined.error) {
        return new Response(JSON.stringify(combined), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Split combined response into extract and identify parts
      extracted = combined.extracted;
      identified = combined.identified;

      // Validate we got both parts
      if (!extracted?.observed || !identified?.resolution_state) {
        throw new Error("Combined response missing extracted or identified section");
      }
    } catch (e) {
      log(`EXTRACT_IDENTIFY_FAILED — ${(e as Error).message}`);
      return new Response(
        JSON.stringify({ error: "I only know about maps, unfortunately! Point your camera at an antique or vintage map and I'll tell you everything about it. 🗺️" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════════════════════
    // RETRIEVAL: Query corpus using Identify output (primary)
    //            with Extract fragments (supporting)
    // ══════════════════════════════════════════════════════════

    const shouldRetrieve = computeShouldRetrieve(identified, extracted);
    log(`RETRIEVE_DECISION — shouldRetrieve: ${shouldRetrieve}`);
    let retrievedCandidates: any[] = [];

    if (shouldRetrieve && SUPABASE_SERVICE_KEY) {
      retrievedCandidates = await queryReferenceCorpus(
        identified,
        extracted,
        SUPABASE_URL,
        SUPABASE_SERVICE_KEY
      );
      log(`RETRIEVE_DONE — ${retrievedCandidates.length} candidates`);
    }

    // ══════════════════════════════════════════════════════════
    // CALL 2: CORROBORATE (only if candidates found; text-only)
    // ══════════════════════════════════════════════════════════

    let finalResult: MergedResult;

    if (retrievedCandidates.length > 0) {
      // Shuffle to prevent positional anchoring
      const shuffled = [...retrievedCandidates].sort(() => Math.random() - 0.5);
      const candidateBlock = shuffled.map((c) => {
        const meta = c.metadata || {};
        return `— "${c.title}"\n  ${c.description || ""}\n  Cartographer: ${meta.cartographer || "?"}, Date: ${meta.year || "?"}, Region: ${meta.region || "?"}\n  Tradition: ${meta.tradition || "?"}, Parent work: ${meta.parent_work || "?"}`;
      }).join("\n\n");

      const corroboratePrompt = buildCorroboratePrompt(
        JSON.stringify(extracted, null, 2),
        JSON.stringify(identified, null, 2),
        candidateBlock,
        shuffled.length
      );

      log("CORROBORATE_START");
      try {
        const corroborated: CorroborateOutput = await callLLM(corroboratePrompt, false, 1400);
        log("CORROBORATE_DONE");
        // Server-side validation: merge with all 7 rules
        log("MERGE_START");
        finalResult = mergeIdentifyCorroborate(identified, corroborated);
        log("MERGE_DONE");
      } catch (e) {
        log(`CORROBORATE_FAILED — ${(e as Error).message}`);
        // Corroborate failed — use identify output only
        finalResult = mergeIdentifyOnly(identified);
      }
    } else {
      log("NO_CANDIDATES — mergeIdentifyOnly");
      // No candidates — use identify output only
      finalResult = mergeIdentifyOnly(identified);
    }

    // ══════════════════════════════════════════════════════════
    // BUILD BACKWARD-COMPATIBLE RESPONSE
    // ══════════════════════════════════════════════════════════

    const compatResponse = buildCompat(extracted, finalResult);
    log(`RESPONSE_READY — resolution: ${finalResult.resolution_state}`);

    return new Response(JSON.stringify(compatResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Something went wrong: " + (e as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

// ════════════════════════════════════════════════════════════
// Retrieval trigger: uses Identify output as primary source
// ════════════════════════════════════════════════════════════

function computeShouldRetrieve(identify: IdentifyOutput, extract: ExtractOutput): boolean {
  // Primary: Identify produced a named attribution
  if (identify.attribution.cartographer.value) return true;
  if (identify.attribution.title.value) return true;

  // Fallback: Extract signals (raw OCR)
  const ocr = extract.ocr_confidence;
  const obs = extract.observed;
  const titleConfHigh = ocr.title_text === "high";
  const hasCartographer = !!(obs.cartographer_text && obs.cartographer_text.length > 2);
  const hasDate = !!(obs.date_text && obs.date_text.length > 0);
  const hasPlaces = !!(obs.place_names && obs.place_names.length >= 2);
  return titleConfHigh || (hasCartographer && hasDate) || (titleConfHigh && hasPlaces);
}

// ════════════════════════════════════════════════════════════
// Corpus query: Identify output primary, Extract supporting
// ════════════════════════════════════════════════════════════

async function queryReferenceCorpus(
  identify: IdentifyOutput,
  extract: ExtractOutput,
  supabaseUrl: string,
  serviceKey: string
): Promise<any[]> {
  const orParts: string[] = [];
  const skip = new Set(["a","an","the","of","de","du","des","la","le","les","et","and","or","new","map","carte","plan"]);

  // ── Primary source: Identify output ──

  // Resolved title keywords
  const resolvedTitle = identify.attribution.title.value || "";
  if (resolvedTitle) {
    const words = resolvedTitle.split(/\s+/)
      .filter(w => !skip.has(w.toLowerCase()) && w.length > 2)
      .slice(0, 4);
    for (const w of words) {
      orParts.push(`title.ilike.*${encodeURIComponent(w)}*`);
    }
  }

  // Resolved cartographer surname
  const resolvedCartographer = identify.attribution.cartographer.value || "";
  if (resolvedCartographer) {
    const parts = resolvedCartographer.split(/\s+/);
    const surname = parts[parts.length - 1];
    if (surname && surname.length > 2) {
      orParts.push(`description.ilike.*${encodeURIComponent(surname)}*`);
      orParts.push(`title.ilike.*${encodeURIComponent(surname)}*`);
    }
  }

  // Resolved region
  if (identify.region && identify.region.length > 3) {
    const regionWords = identify.region.split(/[\s\/,]+/)
      .filter(w => !skip.has(w.toLowerCase()) && w.length > 3)
      .slice(0, 2);
    for (const w of regionWords) {
      orParts.push(`title.ilike.*${encodeURIComponent(w)}*`);
    }
  }

  // ── Supporting source: Extract fragments (fallback/broadening) ──

  // Raw OCR title fragments (may catch things the resolved title normalized away)
  const rawTitle = extract.observed.title_text || "";
  if (rawTitle && rawTitle !== resolvedTitle) {
    const words = rawTitle.split(/\s+/)
      .filter(w => !skip.has(w.toLowerCase()) && w.length > 2)
      .slice(0, 2);
    for (const w of words) {
      orParts.push(`title.ilike.*${encodeURIComponent(w)}*`);
    }
  }

  // Raw cartographer
  const rawCartographer = extract.observed.cartographer_text || "";
  if (rawCartographer && rawCartographer !== resolvedCartographer) {
    const parts = rawCartographer.split(/\s+/);
    const surname = parts[parts.length - 1];
    if (surname && surname.length > 2) {
      orParts.push(`description.ilike.*${encodeURIComponent(surname)}*`);
    }
  }

  // Place names
  const places = extract.observed.place_names || [];
  if (places.length > 0 && places[0].length > 3) {
    orParts.push(`title.ilike.*${encodeURIComponent(places[0])}*`);
  }

  // Deduplicate
  const uniqueParts = [...new Set(orParts)];

  if (uniqueParts.length === 0) return [];

  const queryUrl = `${supabaseUrl}/rest/v1/market_listings?category=eq.maps&select=title,description,metadata&limit=8&or=(${uniqueParts.join(",")})`;

  try {
    const res = await fetch(queryUrl, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ════════════════════════════════════════════════════════════
// Fallback: minimal unresolved IdentifyOutput from extraction
// ════════════════════════════════════════════════════════════

function buildFallbackIdentify(extracted: ExtractOutput): IdentifyOutput {
  const obs = extracted.observed || {} as ExtractOutput["observed"];
  const unresolvedField = (detail: string) => ({
    value: null as string | null,
    evidence_basis: "unresolved" as const,
    evidence_detail: detail,
  });
  const observedField = (value: string | null, detail: string) => ({
    value,
    evidence_basis: (value ? "observed" : "unresolved") as "observed" | "unresolved",
    evidence_detail: detail,
  });

  return {
    resolution_state: "unresolved",
    resolution_reasoning: "Identification call failed. Returning extraction data only.",
    attribution: {
      title: observedField(obs.title_text || null, "Raw OCR from extraction"),
      cartographer: unresolvedField("Identification failed"),
      publisher: unresolvedField("Identification failed"),
      date: observedField(obs.date_text || null, "Raw OCR from extraction"),
      engraver: unresolvedField("Identification failed"),
      publication_place: unresolvedField("Identification failed"),
      edition_state: unresolvedField("Identification failed"),
    },
    region: (obs.place_names || []).join(", ") || "Undetermined",
    technique: (obs.technique_clues || []).join(", ") || "Undetermined",
    dimensions_estimate: null,
    condition_notes: (obs.condition_clues || []).join(", ") || null,
    parent_work: null,
    competing_candidates: [],
    uncertainties: ["Identification could not be completed"],
    evidence_summary: "Limited to extraction observations only.",
    user_facing: {
      headline: obs.title_text || "Map — Identification Pending",
      summary: "The identification engine could not complete analysis. The map requires manual review.",
      confidence_summary: "Identification could not be completed automatically.",
      conversation_prompt: null,
      conversation_response: null,
      rarity: null,
    },
  };
}

// ════════════════════════════════════════════════════════════
// Backward-compatibility mapping
// Frontends expect flat fields: title, cartographer, year, etc.
// ════════════════════════════════════════════════════════════

function buildCompat(extracted: ExtractOutput, merged: MergedResult) {
  const obs = extracted?.observed || {} as ExtractOutput["observed"];
  const ocrConf = extracted?.ocr_confidence || {} as ExtractOutput["ocr_confidence"];
  const cls = extracted?.classification || {} as ExtractOutput["classification"];

  const normConf = (v: string | undefined) => {
    if (v === "high" || v === "medium" || v === "low") return v;
    return "low";
  };

  return {
    // ── Structured attribution data ──
    _attribution: {
      resolution_state: merged.resolution_state,
      fields: merged.attribution,
      contradictions: merged.contradictions,
      supplementary: {
        parent_work: merged.parent_work,
        parent_work_source: merged.parent_work_source,
        tradition: merged.tradition,
        edition_state_note: merged.edition_state_note,
        additional_context: merged.additional_context,
      },
      evidence_summary: merged.evidence_summary,
      competing_candidates: merged.competing_candidates,
    },

    // ── Machine-readable audit trail ──
    _audit: merged._audit,

    // ── Raw extraction data ──
    _reasoning: {
      observed: extracted?.observed,
      ocr_confidence: extracted?.ocr_confidence,
      classification: extracted?.classification,
    },

    // ── Flat backward-compatible fields ──
    title: merged.user_facing.headline || merged.attribution.title.value || obs.title_text || "",
    cartographer: merged.attribution.cartographer.value || "",
    year: merged.attribution.date.value || obs.date_text || "",
    region: merged.region || "",
    publisher: merged.attribution.publisher.value || "",
    edition: merged.attribution.edition_state.value || merged.edition_state_note || "",
    technique: merged.technique || "",
    dimensions_estimate: merged.dimensions_estimate || "",
    condition_notes: merged.condition_notes || "",
    rarity: merged.user_facing.rarity || "",
    summary: merged.user_facing.summary || "",
    overall_confidence: merged.user_facing.confidence_level || "medium",
    resolution_state: merged.resolution_state,
    confidence_summary: merged.user_facing.confidence_summary || "",
    confidence: {
      title: normConf(ocrConf.title_text),
      year: normConf(ocrConf.date_text),
      cartographer: normConf(ocrConf.cartographer_text),
      region: "medium",
      object_type: normConf(cls.classification_confidence),
    },
    uncertainties: merged.uncertainties.length > 0
      ? merged.uncertainties.join(" ")
      : null,
    conversation_prompt: merged.user_facing.conversation_prompt || null,
    conversation_response: merged.user_facing.conversation_response || null,
    object_type: cls.object_category || "undetermined",
    parent_work: merged.parent_work || null,
  };
}
