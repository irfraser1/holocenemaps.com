// popup.js

const SUPABASE_URL = 'https://irfuhohbabtywbuchwpb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZnVob2hiYWJ0eXdidWNod3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjcwMTksImV4cCI6MjA5MDg0MzAxOX0.1Xf5K5r3_GLyN0eiY4tyUbbb91HPasUkqSmSmiEwYKY';
// User ID loaded from chrome.storage (set during login)
let USER_ID = null;
chrome.storage.local.get('holocene_user_id', (result) => {
  USER_ID = result.holocene_user_id || 'd24bb44d-858f-47a2-a2e3-c80996538ac8';
});

const COLLECTION_CONTEXT = `Ian's antique map collection focuses on Imperial North America 1680–1780, structured as a three-act narrative:
- Act I (1688–1719): French dominance — Mississippi basin & Great Lakes claims. Owned: Chatelain 1719 Carte de la Nouvelle France ($2,000, Act I anchor).
- Act II (1720–1754): The Imperial Contest — Franco-British rivalry. Owned: Bowen c.1740 Atlantic World map (Act II anchor).
- Act III (1763–1780): British Resolution — post-Seven Years' War consolidation. Owned: Gibson 1763 Proclamation Map (Act III anchor).
Investment principle: blue-chip only — recognised collector value, strong provenance, long-term market liquidity.
Priority gaps: De l'Isle 1718 Carte de la Louisiane (Act I), Palairet/Kitchin 1755 (Act II hinge), Faden 1777 (Act III), Mitchell 1755 (crown jewel).`;

async function getAIEvaluation(data) {
  const prompt = `You are an expert antique map advisor. Evaluate this map listing for fit in Ian's collection in exactly 3 sentences. Be direct and specific — mention the Act it fits, whether it fills a gap or is redundant, and a one-line verdict (buy / watch / pass).

Collection context:
${COLLECTION_CONTEXT}

Map being evaluated:
Title: ${data.title || 'Unknown'}
Cartographer: ${data.cartographer || 'Unknown'}
Year: ${data.year || 'Unknown'}
Price: $${data.price || 'Unknown'}
Dealer: ${data.dealer || 'Unknown'}
Description: ${data.description || 'No description available'}

Respond in exactly 3 sentences. No headers, no bullet points.`;

  const res = await fetch('https://irfuhohbabtywbuchwpb.supabase.co/functions/v1/evaluate-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      thesis: COLLECTION_CONTEXT,
      mapTitle: data.title || 'Unknown',
      mapYear: data.year || 'Unknown',
      mapCartographer: data.cartographer || 'Unknown',
      dealer: data.dealer || '',
      price: data.price || ''
    })
  });

  const json = await res.json();
  return json?.evaluation || null;
}

// Supported domains
const SUPPORTED = ['geographicus.com', 'raremaps.com'];

let priority = 3;
let listingUrl = '';
let imageUrl = '';

function show(stateId) {
  ['state-loading','state-no-map','state-form','state-success','state-error'].forEach(id => {
    document.getElementById(id).style.display = id === stateId ? 'block' : 'none';
  });
}

function setStars(val) {
  priority = val;
  document.querySelectorAll('.star').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.val) <= val);
  });
}

// Star interaction
document.getElementById('stars').addEventListener('click', e => {
  if (e.target.classList.contains('star')) setStars(parseInt(e.target.dataset.val));
});

setStars(3); // default

// Populate form with scraped data and AI evaluation
async function populate(data) {
  if (!data) { show('state-no-map'); return; }

  document.getElementById('f-title').value = data.title || '';
  document.getElementById('f-year').value = data.year || '';
  document.getElementById('f-cartographer').value = data.cartographer || '';
  document.getElementById('f-price').value = data.price || '';
  document.getElementById('f-dealer').value = data.dealer || '';

  // Image URL
  if (data.image) imageUrl = data.image;

  // Listing URL preview
  if (data.url) {
    listingUrl = data.url;
    const preview = document.getElementById('url-preview');
    preview.textContent = data.url.replace('https://', '').slice(0, 55) + '…';
  }

  // Smart act detection based on year
  const year = parseInt(data.year, 10);
  const actEl = document.getElementById('f-act');
  if (year && year <= 1719) actEl.value = '1';
  else if (year && year <= 1762) actEl.value = '2';
  else actEl.value = '3';

  // Show form immediately with loading state in notes
  const notesEl = document.getElementById('f-notes');
  notesEl.value = 'Evaluating collection fit…';
  notesEl.style.opacity = '0.4';
  show('state-form');

  // Fetch AI evaluation
  try {
    const evaluation = await getAIEvaluation(data);
    if (evaluation) {
      notesEl.value = evaluation;
    } else {
      notesEl.value = data.description ? data.description.slice(0, 400) : '';
    }
  } catch (e) {
    notesEl.value = data.description ? data.description.slice(0, 400) : '';
  }
  notesEl.style.opacity = '1';
}

// Save to Supabase
async function saveMap() {
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const payload = {
    user_id: USER_ID,
    title: document.getElementById('f-title').value.trim(),
    year: parseInt(document.getElementById('f-year').value, 10) || null,
    cartographer: document.getElementById('f-cartographer').value.trim(),
    act: parseInt(document.getElementById('f-act').value, 10),
    status: document.getElementById('f-status').value,
    priority: priority,
    dealer: document.getElementById('f-dealer').value.trim(),
    price: parseInt(document.getElementById('f-price').value, 10) || 0,
    notes: document.getElementById('f-notes').value.trim(),
    listing_url: listingUrl || null,
    image_url: imageUrl || null,
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/maps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok || res.status === 201) {
      document.getElementById('success-sub').textContent = payload.title || 'Map saved';
      show('state-success');
      setTimeout(() => window.close(), 2200);
    } else {
      const err = await res.text();
      throw new Error(err);
    }
  } catch (e) {
    document.getElementById('error-msg').textContent = e.message || 'Unknown error';
    show('state-error');
    btn.disabled = false;
    btn.textContent = 'Add to Collection';
  }
}

// Init
document.getElementById('btn-save').addEventListener('click', saveMap);
document.getElementById('btn-cancel').addEventListener('click', () => window.close());
document.getElementById('btn-retry').addEventListener('click', () => show('state-form'));

// Check current tab and scrape
async function init() {
  show('state-loading');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { show('state-no-map'); return; }

  const url = tab.url || '';
  const isSupported = SUPPORTED.some(d => url.includes(d));

  if (!isSupported) {
    show('state-no-map');
    return;
  }

  // Inject content script if needed and scrape
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Geographicus scraper
        function scrapeGeographicus() {
          const data = { dealer: 'Geographicus', url: window.location.href };

          const titleEl = document.querySelector('h1.product-title, h1[itemprop="name"], h1');
          if (titleEl) data.title = titleEl.textContent.trim();

          const priceEl = document.querySelector('[itemprop="price"], .price, .product-price, [class*="price"]');
          if (priceEl) {
            const pt = priceEl.getAttribute('content') || priceEl.textContent;
            const m = pt.match(/[\d,]+/);
            if (m) data.price = parseInt(m[0].replace(/,/g, ''), 10);
          }

          const bodyText = document.body.innerText;
          const yearMatch = bodyText.match(/\b(1[5-9]\d{2})\b/);
          if (yearMatch) data.year = parseInt(yearMatch[1], 10);

          if (data.title) {
            const m = data.title.match(/^([A-Z][a-zA-Z\s\.]+?)\s*[—\-–]/);
            if (m) data.cartographer = m[1].trim();
          }

          const descEl = document.querySelector('.product-description, #product-description, [class*="description"]');
          if (descEl) data.description = descEl.innerText.trim().slice(0, 600);

          // Primary: zoomify modal image. Fallback: og:image meta tag
          const imgEl = document.querySelector('a[href="#modal_zoomify"] img');
          if (imgEl && imgEl.src) {
            data.image = imgEl.src;
          } else {
            const ogImg = document.querySelector('meta[property="og:image"]');
            if (ogImg) data.image = ogImg.getAttribute('content');
          }

          return data;
        }

        // Ruderman scraper
        function scrapeRuderman() {
          const data = { dealer: 'Barry Ruderman', url: window.location.href };

          const titleEl = document.querySelector('h1');
          if (titleEl) data.title = titleEl.textContent.trim();

          const bodyText = document.body.innerText;

          // Ruderman has structured metadata
          const cartMatch = bodyText.match(/(?:Cartographer|Maker|Author)[:\s]+([^\n\r]+)/i);
          if (cartMatch) data.cartographer = cartMatch[1].trim();

          const dateMatch = bodyText.match(/(?:Date|Year)[:\s]+([^\n\r]+)/i);
          if (dateMatch) {
            const ym = dateMatch[1].match(/\b(1[5-9]\d{2})\b/);
            if (ym) data.year = parseInt(ym[1], 10);
          }

          if (!data.year) {
            const ym = bodyText.match(/\b(1[5-9]\d{2})\b/);
            if (ym) data.year = parseInt(ym[1], 10);
          }

          const priceText = document.querySelector('div.text-2xl.font-text')?.innerText;
          if (priceText) data.price = parseInt(priceText.replace(/[$,]/g, ''), 10);

          const descEl = document.querySelector('[class*="description"], [class*="desc"], .content p');
          if (descEl) data.description = descEl.innerText.trim().slice(0, 600);

          // Ruderman uses OpenSeadragon (canvas) — no img tag for main image
          // Use og:image meta tag which always has a valid static image URL
          const ogImg = document.querySelector('meta[property="og:image"]');
          if (ogImg) {
            data.image = ogImg.getAttribute('content');
          }

          return data;
        }

        const host = window.location.hostname;
        if (host.includes('geographicus')) return scrapeGeographicus();
        if (host.includes('raremaps')) return scrapeRuderman();
        return null;
      }
    });

    const data = results?.[0]?.result;
    populate(data);

  } catch (e) {
    console.error('Scrape error:', e);
    // Still show form, just empty
    populate({ dealer: '', url: tab.url });
  }
}

init();
