import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function scrapeGeographicus(html: string, url: string) {
  const data: Record<string, any> = { dealer: "Geographicus", url };

  // Title: og:title or <title>
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitle) {
    data.title = ogTitle[1].replace(/\s*[|\-–—].*$/, "").trim();
  } else {
    const titleTag = html.match(/<title>([^<]+)<\/title>/i);
    if (titleTag) data.title = titleTag[1].replace(/\s*[|\-–—].*$/, "").trim();
  }

  // Price from structured data or text
  const priceMatch = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (priceMatch) {
    data.price = parseInt(priceMatch[1].replace(/[,\.]/g, ""), 10);
    if (data.price > 100000) data.price = Math.round(data.price / 100); // fix cents
  }

  // Year from body text
  const yearMatch = html.match(/\b(1[4-9]\d{2})\b/);
  if (yearMatch) data.year = parseInt(yearMatch[1], 10);

  // Cartographer from title pattern "Cartographer — Title"
  if (data.title) {
    const cm = data.title.match(/^([A-Z][a-zA-Z\s\.]+?)\s*[—\-–]/);
    if (cm) data.cartographer = cm[1].trim();
  }

  // Description
  const descMatch = html.match(/<div[^>]*class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) {
    data.description = descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
  }

  // Image: og:image
  const ogImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogImg) data.image_url = ogImg[1];

  return data;
}

function scrapeRuderman(html: string, url: string) {
  const data: Record<string, any> = { dealer: "Barry Ruderman", url };

  // Title from og:title or <title>
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitle) {
    data.title = ogTitle[1].replace(/\s*[|\-–—].*$/, "").trim();
  } else {
    const titleTag = html.match(/<title>([^<]+)<\/title>/i);
    if (titleTag) data.title = titleTag[1].replace(/\s*[|\-–—].*$/, "").trim();
  }

  // Cartographer from structured text
  const cartMatch = html.match(/(?:Cartographer|Maker|Author)[:\s]+([^\n\r<]+)/i);
  if (cartMatch) data.cartographer = cartMatch[1].replace(/<[^>]+>/g, "").trim();

  // Date/Year
  const dateMatch = html.match(/(?:Date|Year)[:\s]+([^\n\r<]+)/i);
  if (dateMatch) {
    const ym = dateMatch[1].match(/\b(1[4-9]\d{2})\b/);
    if (ym) data.year = parseInt(ym[1], 10);
  }
  if (!data.year) {
    const ym = html.match(/\b(1[5-9]\d{2})\b/);
    if (ym) data.year = parseInt(ym[1], 10);
  }

  // Price
  const priceMatch = html.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (priceMatch) {
    data.price = parseInt(priceMatch[1].replace(/[,]/g, ""), 10);
  }

  // Description from og:description
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  if (ogDesc) data.description = ogDesc[1].trim().slice(0, 600);

  // Image: og:image
  const ogImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogImg) data.image_url = ogImg[1];

  return data;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "Missing url parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Route to the appropriate scraper
    let data;
    if (url.includes("geographicus")) {
      data = scrapeGeographicus(html, url);
    } else if (url.includes("raremaps")) {
      data = scrapeRuderman(html, url);
    } else {
      // Generic: try og:image and og:title
      data = { url };
      const ogImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (ogImg) data.image_url = ogImg[1];
      const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
      if (ogTitle) data.title = ogTitle[1];
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
