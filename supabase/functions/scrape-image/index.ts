import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, enforceUsageLimit, identifyActor, optionsResponse } from "../_shared/edge-auth.ts";


function validateDealerUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }

  const host = parsed.hostname.toLowerCase();
  const allowed = ["geographicus.com", "raremaps.com"];
  if (!allowed.some((domain) => host === domain || host.endsWith("." + domain))) {
    throw new Error("This dealer domain is not supported for automatic scraping yet");
  }

  return parsed.toString();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const actor = await identifyActor(req);
    if (actor instanceof Response) return actor;
    const limitResponse = await enforceUsageLimit(actor, "scrape-image", { authenticatedDaily: 100 });
    if (limitResponse) return limitResponse;

    const { url: rawUrl } = await req.json();

    if (!rawUrl) {
      return new Response(
        JSON.stringify({ error: "Missing url parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = validateDealerUrl(rawUrl);

    // Fetch the dealer page
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch page: ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await res.text();

    // Extract og:image meta tag
    let imageUrl = null;

    // Try og:image first
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    if (ogMatch) {
      imageUrl = ogMatch[1];
    }

    // Fallback: try twitter:image
    if (!imageUrl) {
      const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
      if (twMatch) imageUrl = twMatch[1];
    }

    return new Response(
      JSON.stringify({ image_url: imageUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
