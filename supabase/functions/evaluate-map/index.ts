// Supabase Edge Function: evaluate-map
// Accepts BOTH multipart/form-data (file upload) AND JSON (base64)
// Deploy with: supabase functions deploy evaluate-map --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let base64Image: string;
    let mimeType = "image/jpeg";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // ── MULTIPART: browser streams raw file, zero client-side memory ──
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
      // ── JSON: legacy base64 path (desktop, etc.) ──
      const body = await req.json();
      base64Image = body.imageBase64;
    }

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

    const prompt = `You are a senior specialist at a major map auction house (Sotheby's, Christie's, or Swann). A collector has photographed a map and wants your expert analysis. Study the image carefully and return a JSON object.

CRITICAL FIRST STEP — Object Classification:
Before identifying the map, determine what the image shows:
- Is this a STANDALONE MAP (a separately published sheet map, atlas plate sold individually, or broadside)?
- Or is this a COMPONENT of a larger work (a plate from a book/atlas still bound, a page from a guide, a map from a magazine, a detail/inset)?

Look for evidence: page numbers, book gutters, text on verso showing through, headers/footers from a publication, boards or binding visible, quire marks.

Return this JSON structure:
{
  "object_type": "standalone_map" | "book_plate" | "atlas_plate" | "magazine_map" | "guide_map" | "other_component",
  "object_type_reasoning": "One sentence explaining what visual evidence indicates this classification. E.g. 'Page number visible upper right and text bleed-through suggest this is a plate from a bound volume.'",
  "parent_work": "If a component, identify the parent publication (e.g. 'Dennys, The Treaty Ports of China and Japan, 1867'). null if standalone.",
  "title": "Full title of the visible map as printed. Transcribe exactly what you can read.",
  "year": "Year or date range. State basis: 'dated 1867 (printed on plate)' or 'c.1780 (estimated from engraving style)'",
  "cartographer": "Mapmaker name if identifiable. State source: 'signed in cartouche', 'attributed from style', or 'Not determined'",
  "region": "Geographic region depicted",
  "publisher": "Publisher if identifiable. Check margins, cartouche, imprint line, and any visible text anywhere in the image. State source.",
  "edition": "Edition or state if identifiable, or 'Not determined'",
  "technique": "Printing technique with specific evidence. E.g. 'Copperplate engraving — visible plate mark and ink impression consistent with intaglio printing' rather than just 'engraving'",
  "dimensions_estimate": "Estimated dimensions from visual proportions if possible, or 'Not determined'",
  "condition_notes": "Specific visible condition observations. Describe: foxing, toning, tears, folds, margins trimmed, coloring (original vs later). Do NOT say 'good condition' without evidence.",
  "rarity": "Rarity assessment with reasoning: 'Scarce — fewer than 10 auction records in the past decade' or 'Common — frequently encountered' or 'Not determined'",
  "summary": "3-4 sentences. First sentence: what this object IS (standalone map or component of what work). Second sentence: specific historical context (who made it, why, what it shows). Third sentence: market value range with basis (recent auction comparables, dealer pricing). Fourth sentence (optional): what makes this example notable or ordinary. Write like a specialist speaking to a collector, not a Wikipedia article.",
  "overall_confidence": "high" | "medium" | "low",
  "confidence_summary": "Scope your confidence precisely. Example: 'High confidence in map plate identification (title cartouche clearly legible). Medium confidence in parent work attribution (consistent with Dennys 1867 but no title page visible). Low confidence in edition/state (would need to examine watermark).' Always state what you CAN identify vs what you're inferring.",
  "confidence": {
    "title": "high" | "medium" | "low",
    "year": "high" | "medium" | "low",
    "cartographer": "high" | "medium" | "low",
    "region": "high" | "medium" | "low",
    "object_type": "high" | "medium" | "low"
  },
  "uncertainties": "What would resolve remaining questions? E.g. 'Examining the title page would confirm the parent work. Watermark analysis would help date the paper stock.' null if fully confident.",
  "conversation_prompt": "A single short contextual prompt (max 12 words) for useful follow-up. Choose from: dealer questions worth asking, edition/state uncertainties, condition red flags, authentication concerns, or parent-work identification. Conversational and specific. null if nothing useful to add.",
  "conversation_response": "Follow-up content shown when the user taps the prompt. 3-5 sentences. Specific to this map. Include concrete questions to ask a dealer or specific things to look for. Tone: knowledgeable colleague, not textbook. null if conversation_prompt is null."
}

Rules for overall_confidence:
- "high": the complete collectible object can be identified with certainty (cartographer, date, region, AND whether standalone or component are all clear)
- "medium": the visible map content can be identified but the full collectible object cannot (e.g., you can name the map but not the specific edition, atlas, or publication it comes from)
- "low": identification is uncertain — image quality, legibility, or ambiguity prevents reliable attribution

Evidence requirements:
- ALWAYS cite specific visual evidence for your identifications. "The cartouche reads..." / "Plate mark visible at..." / "Page number 247 in upper right..."
- NEVER use generic significance language like "historically significant" or "important contribution to cartography" without specific reasoning.
- Examine the ENTIRE image for printed credits, publisher marks, magazine headers, page numbers, or branding — not just the cartouche. These may appear in margins, corners, or along edges.

Attribution guidance:
- For 20th century maps: if the map shows an oblique aerial or bird's-eye projection of a major American city with bold graphic colours typical of mid-century magazine illustration, check for Fortune Magazine branding or credits visible anywhere in the image. If present, attribute the publisher as "Fortune Magazine" and consider Richard Edes Harrison as the likely cartographer.
- Always report any visible text credits for cartographer or publisher, even if they appear outside the main map area.

Partial identification:
- When full identification is not possible, DO NOT fall back to generic descriptions.
- Instead: state exactly what you CAN identify (region, era, technique, style), what specific visual clues you see, and what the most likely candidates are.
- Example of BAD output: "This appears to be a historically significant map of Hong Kong."
- Example of GOOD output: "This copperplate-engraved plan of Victoria, Hong Kong shows the harbor and peak district. The engraving style and typography are consistent with British colonial survey maps of the 1860s. Page number visible in margin suggests this is a plate from a larger published work, most likely a treaty port guide."

If the image is NOT a map, respond with exactly: {"error": "I only know about maps, unfortunately! Point your camera at an antique or vintage map and I'll tell you everything about it. 🗺️"}

Return ONLY valid JSON, no markdown fences, no extra text.`;

    const imageUrl = `data:${mimeType};base64,${base64Image}`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: imageUrl, detail: "auto" },
              },
            ],
          },
        ],
        max_tokens: 1200,
        temperature: 0.3,
      }),
    });

    const openaiData = await openaiRes.json();
    const rawText = openaiData?.choices?.[0]?.message?.content || "";

    // Parse JSON from response (strip markdown fences if present)
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({
          error: "I only know about maps, unfortunately! Point your camera at an antique or vintage map and I'll tell you everything about it. 🗺️",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Something went wrong: " + e.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
