import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, enforceUsageLimit, identifyActor, jsonResponse, optionsResponse } from "../_shared/edge-auth.ts";

type Draft = {
  title: string | null;
  listing_title: string | null;
  actual_map_title: string | null;
  cartographer: string | null;
  publication_date: string | null;
  publication_place: string | null;
  dealer: string | null;
  price: string | null;
  sold_status: string | null;
  inventory_number: string | null;
  dimensions: string | null;
  description: string | null;
  condition: string | null;
  image_urls: string[];
  source_url: string;
  source_domain: string;
  status: "reference";
};

function cleanText(value: unknown, maxLength = 2000) {
  if (value == null) return null;
  const text = String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function attr(html: string, tagPattern: RegExp, attrName: string) {
  const match = html.match(tagPattern);
  if (!match) return null;
  const tag = match[0];
  const attrMatch = tag.match(new RegExp(`${attrName}=["']([^"']+)["']`, "i"));
  return attrMatch?.[1] ? cleanText(attrMatch[1], 1000) : null;
}

function metaContent(html: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const byProperty = attr(html, new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"), "content");
    if (byProperty) return byProperty;
    const byContentFirst = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"));
    if (byContentFirst?.[1]) return cleanText(byContentFirst[1], 1000);
  }
  return null;
}

function absolutizeUrl(url: string | null, base: string) {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function parseJsonLd(html: string) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const parsed: any[] = [];
  for (const block of blocks) {
    try {
      const value = JSON.parse(block[1].trim());
      parsed.push(...(Array.isArray(value) ? value : [value]));
    } catch (_) {
      // Ignore invalid JSON-LD blocks.
    }
  }
  return parsed.flatMap(flattenJsonLd);
}

function flattenJsonLd(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  const graph = Array.isArray(node["@graph"]) ? node["@graph"].flatMap(flattenJsonLd) : [];
  return [node, ...graph];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstString(...value);
      if (nested) return nested;
    } else if (typeof value === "object" && value !== null) {
      const nested = firstString((value as any).name, (value as any).text, (value as any).value);
      if (nested) return nested;
    } else {
      const text = cleanText(value, 2000);
      if (text) return text;
    }
  }
  return null;
}

function imageValues(value: unknown, baseUrl: string): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => {
    if (typeof item === "string") return [absolutizeUrl(item, baseUrl)].filter(Boolean) as string[];
    if (typeof item === "object" && item) {
      return [absolutizeUrl((item as any).url || (item as any).contentUrl, baseUrl)].filter(Boolean) as string[];
    }
    return [];
  });
}

function labelValue(text: string, labels: string[]) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:${labelPattern})\\s*[:\\-]?\\s*([^|\\n\\r]{2,220})`, "i"));
  return cleanText(match?.[1], 500);
}

function extractTitle(html: string, jsonLd: any[]) {
  const product = jsonLd.find((item) => /Product|CreativeWork|Book|VisualArtwork/.test(String(item["@type"] || "")));
  const metaTitle = metaContent(html, ["og:title", "twitter:title"]);
  const titleTag = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 500);
  return firstString(product?.name, product?.headline, metaTitle, titleTag)?.replace(/\s+[|–—-]\s+(Antique|Rare|Old|Vintage)?\s*Maps?.*$/i, "").trim() || null;
}

function extractListingTitle(html: string, jsonLd: any[]) {
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => cleanText(match[1], 500))
    .find((heading) => heading && !/\b(boston rare maps|rare maps|contact|inventory)\b/i.test(heading));
  return firstString(h1, metaContent(html, ["og:title", "twitter:title"]), extractTitle(html, jsonLd));
}

function normalizeActualTitle(value: string | null) {
  if (!value) return null;
  let text = value
    .replace(/\s*\[[^\]]+\]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "");

  const citationPrefix = text.match(/^(.{1,100}?),\s+([A-Z0-9][A-Z0-9 .,'’:&;\-]{15,})$/);
  if (citationPrefix && !/\b(map|chart|plan|governments|america|proclamation|colonies|province)\b/i.test(citationPrefix[1])) {
    text = citationPrefix[2].trim();
  }

  return text || null;
}

function extractActualMapTitle(html: string, pageText: string) {
  const candidates = [
    ...[...pageText.matchAll(/(?:engraver|cartographer|maker|author)\)?(?:,|\s)\s*([A-Z0-9][A-Z0-9 .,'’:&;\-]{15,260}(?:AMERICA|GOVERNMENTS|MAP|CHART|PLAN|PROCLAMATION|COLONIES|PROVINCES)[A-Z0-9 .,'’:&;\-]{0,160})/gi)].map((m) => cleanText(m[1], 500)),
    ...[...html.matchAll(/<(?:em|i|cite)[^>]*>([\s\S]{12,500}?)<\/(?:em|i|cite)>/gi)].map((m) => cleanText(m[1], 500)),
    ...[...html.matchAll(/(?:alt|title)=["']([^"']{12,500})["']/gi)].map((m) => cleanText(m[1], 500)),
    ...[...pageText.matchAll(/(?:^|\s)([A-Z][A-Z0-9 .,'’:&;\-]+(?:AMERICA|GOVERNMENTS|MAP|CHART|PLAN|PROCLAMATION|COLONIES|PROVINCES)[A-Z0-9 .,'’:&;\-]{8,260})/g)].map((m) => cleanText(m[1], 500)),
    cleanText(pageText.match(/\b[A-Z][^.\n]{0,120}\b(?:map|chart|plan)\b[^.\n]{0,260}/i)?.[0], 500),
  ].filter(Boolean) as string[];

  const scored = candidates
    .map((candidate) => {
      const title = normalizeActualTitle(candidate);
      if (!title) return null;
      let score = 0;
      if (/[A-Z]{4,}/.test(title)) score += 3;
      if (/\b(map|chart|plan|governments|america|proclamation|colonies|province)\b/i.test(title)) score += 4;
      if (/\b(laid down|according|agreeable|proclamation|octr|north america|n\.?\s*america)\b/i.test(title)) score += 3;
      if (/\b(engraving|colored|uncolored|sold|references|related items|sign up)\b/i.test(title)) score -= 3;
      if (title.length >= 20 && title.length <= 260) score += 2;
      if (title.split(/\s+/).length >= 4) score += 1;
      return { title, score };
    })
    .filter((item): item is { title: string; score: number } => !!item)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score >= 5 ? scored[0].title : null;
}

function extractPrice(jsonLd: any[], pageText: string) {
  for (const item of jsonLd) {
    const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
    const price = firstString(offer?.price, item.price);
    if (price) {
      const currency = firstString(offer?.priceCurrency);
      return currency && !String(price).includes(currency) ? `${currency} ${price}` : price;
    }
  }
  return cleanText(pageText.match(/(?:US)?\$\s?[\d,]+(?:\.\d{2})?/)?.[0], 80);
}

function extractSoldStatus(jsonLd: any[], pageText: string) {
  const availability = firstString(...jsonLd.map((item) => item.offers?.availability || item.availability));
  if (availability) {
    if (/soldout|outofstock|sold/i.test(availability)) return "Sold";
    if (/instock|available/i.test(availability)) return "Available";
    return availability.split("/").pop() || availability;
  }
  if (/\b(sold|sold out|sale pending|reserved|on hold)\b/i.test(pageText)) return pageText.match(/\b(sold out|sale pending|reserved|on hold|sold)\b/i)?.[1] || null;
  return null;
}

function extractImages(html: string, jsonLd: any[], baseUrl: string) {
  const metaImages = [
    metaContent(html, ["og:image", "twitter:image", "twitter:image:src"]),
    ...[...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)].slice(0, 20).map((m) => m[1])
  ];
  const jsonImages = jsonLd.flatMap((item) => imageValues(item.image || item.primaryImageOfPage, baseUrl));
  return unique([...jsonImages, ...metaImages.map((url) => absolutizeUrl(url, baseUrl))])
    .filter((url) => url && !/logo|icon|sprite|avatar/i.test(url))
    .slice(0, 8) as string[];
}

function confidenceFor(draft: Draft) {
  const weighted: Array<[keyof Draft, number]> = [
    ["title", 0.18],
    ["cartographer", 0.12],
    ["publication_date", 0.1],
    ["dealer", 0.08],
    ["price", 0.08],
    ["description", 0.14],
    ["condition", 0.08],
    ["dimensions", 0.08],
    ["inventory_number", 0.06],
    ["publication_place", 0.04],
    ["sold_status", 0.02],
    ["image_urls", 0.02],
  ];
  const score = weighted.reduce((sum, [field, weight]) => {
    const value = draft[field];
    return sum + ((Array.isArray(value) ? value.length > 0 : !!value) ? weight : 0);
  }, 0);
  return Math.max(0.1, Math.min(0.98, Number(score.toFixed(2))));
}

function extractDraft(html: string, url: string): Draft {
  const parsedUrl = new URL(url);
  const sourceDomain = parsedUrl.hostname.replace(/^www\./, "");
  const jsonLd = parseJsonLd(html);
  const pageText = cleanText(html, 120000) || "";
  const product = jsonLd.find((item) => /Product|CreativeWork|Book|VisualArtwork/.test(String(item["@type"] || ""))) || {};
  const listingTitle = extractListingTitle(html, jsonLd);
  const actualMapTitle = extractActualMapTitle(html, pageText);
  const title = actualMapTitle || null;
  const description = firstString(product.description, metaContent(html, ["og:description", "description", "twitter:description"]), labelValue(pageText, ["Description", "Catalogue Note", "Summary"]));
  const cartographer = firstString(product.creator, product.author, labelValue(pageText, ["Cartographer", "Maker", "Author", "Creator", "Artist"]));
  const publicationDate = firstString(product.datePublished, product.productionDate, labelValue(pageText, ["Date", "Publication Date", "Year"])) || pageText.match(/\b(1[4-9]\d{2}|20\d{2})\b/)?.[1] || null;
  const dealer = firstString(product.seller, product.provider, jsonLd.find((item) => /Organization|LocalBusiness/.test(String(item["@type"] || "")))?.name, sourceDomain);

  return {
    title,
    listing_title: listingTitle,
    actual_map_title: actualMapTitle,
    cartographer,
    publication_date: publicationDate,
    publication_place: labelValue(pageText, ["Place of Publication", "Publication Place", "Published", "Place"]),
    dealer,
    price: extractPrice(jsonLd, pageText),
    sold_status: extractSoldStatus(jsonLd, pageText),
    inventory_number: labelValue(pageText, ["Inventory", "Stock", "Stock No", "Stock Number", "Item Number", "Reference"]),
    dimensions: labelValue(pageText, ["Dimensions", "Size", "Sheet Size", "Image Size"]),
    description,
    condition: labelValue(pageText, ["Condition", "Condition Report"]),
    image_urls: extractImages(html, jsonLd, url),
    source_url: url,
    source_domain: sourceDomain,
    status: "reference",
  };
}

function validateImportUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }
  return parsed.toString();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const actor = await identifyActor(req);
    if (actor instanceof Response) return actor;
    const limitResponse = await enforceUsageLimit(actor, "import-map-from-url", { authenticatedDaily: 100 });
    if (limitResponse) return limitResponse;

    const { url: rawUrl } = await req.json();
    if (!rawUrl) return jsonResponse({ error: "Missing url parameter" }, 400);
    const url = validateImportUrl(rawUrl);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!res.ok) return jsonResponse({ error: `Failed to fetch page: ${res.status}` }, 502);

    const html = await res.text();
    if (
      html.includes("Attention Required! | Cloudflare") ||
      html.includes("you have been blocked") ||
      html.includes("cf-error-details") ||
      html.includes("Just a moment...") ||
      html.includes("Enable JavaScript and cookies to continue")
    ) {
      return jsonResponse({
        error: "This site is blocking automated requests. The source URL can still be saved for manual review.",
        blocked: true,
        url,
      });
    }

    const draft = extractDraft(html, url);
    const extractionConfidence = confidenceFor(draft);
    return jsonResponse({
      draft,
      imported_at: new Date().toISOString(),
      source_url: draft.source_url,
      source_domain: draft.source_domain,
      extraction_confidence: extractionConfidence,
      raw_import_snapshot: {
        source_url: draft.source_url,
        source_domain: draft.source_domain,
        fetched_at: new Date().toISOString(),
        html_title: cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 500),
        meta_title: metaContent(html, ["og:title", "twitter:title"]),
        meta_description: metaContent(html, ["og:description", "description", "twitter:description"]),
        json_ld_count: parseJsonLd(html).length,
        extracted_fields: draft,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Import failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
