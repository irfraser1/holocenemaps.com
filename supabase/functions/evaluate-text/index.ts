// Supabase Edge Function: evaluate-text
// Deploy with: supabase functions deploy evaluate-text --no-verify-jwt
// This handles thesis-based text re-evaluation (no image required)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { thesis, mapTitle, mapYear, mapCartographer, dealer, price } = await req.json();

    if (!mapTitle) {
      return new Response(JSON.stringify({ error: "Map title is required." }), {
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

    const mapDesc = [
      mapTitle,
      mapCartographer ? `by ${mapCartographer}` : null,
      mapYear ? `(${mapYear})` : null,
      dealer ? `Listed by ${dealer}` : null,
      price ? `at ${price}` : null,
    ].filter(Boolean).join(" ");

    const prompt = `You are an expert antique map advisor. A collector has asked you to evaluate this map for fit in their collection.

Collector's thesis / focus:
${thesis || "General antique map collecting"}

Map being evaluated:
${mapDesc}

Provide a concise 3-sentence evaluation:
1. How well this map fits their stated collecting thesis (narrative fit)
2. Whether it fills a gap or would be redundant in a collection with this focus
3. A one-line verdict: BUY, WATCH, or PASS — with brief reasoning

Be direct. No headers, no bullet points, just 3 flowing sentences.`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    const openaiData = await openaiRes.json();
    const evaluation = openaiData?.choices?.[0]?.message?.content || "";

    return new Response(
      JSON.stringify({ evaluation, title: mapTitle }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Evaluation failed: " + e.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
