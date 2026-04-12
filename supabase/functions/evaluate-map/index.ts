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

    const prompt = `You are a world-class antique map expert. Analyze this map image and return a JSON object with these exact fields:
{
  "title": "full title of the map",
  "year": "estimated year or date range",
  "cartographer": "mapmaker name",
  "region": "geographic region depicted",
  "publisher": "publisher if identifiable, or 'Not determined'",
  "edition": "edition or state if identifiable, or 'Not determined'",
  "technique": "printing technique (e.g. copperplate engraving, lithograph), or 'Not determined'",
  "dimensions_estimate": "estimated dimensions if possible, or 'Not determined'",
  "condition_notes": "visible condition observations from the image, or 'Not determined'",
  "rarity": "rarity assessment (common, uncommon, scarce, rare, very rare), or 'Not determined'",
  "summary": "A 2-3 sentence expert analysis describing the map's historical significance and estimated market value range",
  "overall_confidence": "high" | "medium" | "low",
  "confidence_summary": "1-3 sentence plain-English justification of the confidence score. Explain WHY you are confident or not. Reference specific visual evidence: legibility of cartouche, engraving style, plate marks, coloring, damage. Tone: knowledgeable friend. Example: 'The cartouche is clearly legible and the engraving style is consistent with De l'Isle's workshop. Date is estimated from the plate style.'",
  "confidence": {
    "title": "high" | "medium" | "low",
    "year": "high" | "medium" | "low",
    "cartographer": "high" | "medium" | "low",
    "region": "high" | "medium" | "low"
  },
  "uncertainties": "Brief note about anything you're unsure of, or null",
  "conversation_prompt": "A single short contextual prompt (max 12 words) to tease useful follow-up information. Choose from: dealer questions worth asking, edition/state uncertainties, condition red flags, or authentication concerns. Conversational and non-alarming. Set to null if nothing useful to add.",
  "conversation_response": "The follow-up content shown when the user taps the prompt. 3-5 sentences. Specific to this map. Include concrete questions to ask a dealer or specific things to look for. Tone: knowledgeable friend, not textbook. Set to null if conversation_prompt is null."
}

Rules for overall_confidence:
- "high": cartographer, date, and region are clearly identifiable from the image (legible cartouche, recognizable style)
- "medium": one or two key fields are uncertain but a reasonable attribution can still be made
- "low": image quality is poor, text is illegible, or attribution is genuinely unclear

Every field must have a value — use "Not determined" rather than null for publisher, edition, technique, dimensions_estimate, condition_notes, and rarity if you cannot determine them from the image.

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
        max_tokens: 900,
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
