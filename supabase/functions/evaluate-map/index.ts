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

      // Chunked base64 encode to avoid call stack overflow on large files
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
  "summary": "A 2-3 sentence expert analysis describing the map's historical significance and estimated market value range",
  "confidence": {
    "title": "high" | "medium" | "low",
    "year": "high" | "medium" | "low",
    "cartographer": "high" | "medium" | "low",
    "region": "high" | "medium" | "low"
  },
  "uncertainties": "Brief note about anything you're unsure of, or null"
}

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
                image_url: { url: imageUrl, detail: "low" },
              },
            ],
          },
        ],
        max_tokens: 600,
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
