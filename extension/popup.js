// popup.js — Holocene Maps Collection Clipper
// Auth: uses Supabase JS client with chrome.storage adapter for session persistence.
// User identity always comes from db.auth.getUser() — never hardcoded.

const SUPABASE_URL = 'https://irfuhohbabtywbuchwpb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EwBThey-4JHJII0aNAu1Lg_vPnFvsyG';

// Custom storage adapter: Supabase sessions persist in chrome.storage.local
const chromeStorageAdapter = {
  getItem: (key) => new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result[key] || null));
  }),
  setItem: (key, value) => new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  }),
  removeItem: (key) => new Promise((resolve) => {
    chrome.storage.local.remove(key, resolve);
  }),
};

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
});

// Supported dealer domains
const SUPPORTED = ['geographicus.com', 'raremaps.com'];

let priority = 3;
let listingUrl = '';
let imageUrl = '';

function show(stateId) {
  ['state-auth','state-loading','state-no-map','state-form','state-success','state-error'].forEach(id => {
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
setStars(3);

// AI evaluation via Edge Function
async function getAIEvaluation(data, thesis) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/evaluate-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      thesis: thesis || '',
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

// Populate form with scraped data and AI evaluation
async function populate(data, thesis) {
  if (!data) { show('state-no-map'); return; }

  document.getElementById('f-title').value = data.title || '';
  document.getElementById('f-year').value = data.year || '';
  document.getElementById('f-cartographer').value = data.cartographer || '';
  document.getElementById('f-price').value = data.price || '';
  document.getElementById('f-dealer').value = data.dealer || '';

  if (data.image) imageUrl = data.image;

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

  // Fetch AI evaluation using user's thesis
  try {
    const evaluation = await getAIEvaluation(data, thesis);
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

// Save to Supabase — user_id comes from live auth session
async function saveMap() {
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const { data: { user }, error: authErr } = await db.auth.getUser();
    if (authErr || !user) throw new Error('Not signed in');

    const payload = {
      user_id: user.id,
      title: document.getElementById('f-title').value.trim(),
      year: parseInt(document.getElementById('f-year').value, 10) || null,
      cartographer: document.getElementById('f-cartographer').value.trim(),
      act: parseInt(document.getElementById('f-act').value, 10),
      status: document.getElementById('f-status').value,
      priority: priority,
      dealer: document.getElementById('f-dealer').value.trim(),
      price: parseInt(document.getElementById('f-price').value, 10) || 0,
      notes: document.getElementById('f-notes').value.trim(),
      url: listingUrl || null,
      image_url: imageUrl || null,
    };

    const { error } = await db.from('maps').insert(payload);
    if (error) throw new Error(JSON.stringify(error));

    document.getElementById('success-sub').textContent = payload.title || 'Map saved';
    show('state-success');

  } catch (e) {
    document.getElementById('error-msg').textContent = e.message || 'Unknown error';
    show('state-error');
    btn.disabled = false;
    btn.textContent = 'Add to Collection';
  }
}

// Auth: sign in with Google via chrome.identity
async function signIn() {
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  document.getElementById('btn-auth').textContent = 'Signing in…';

  try {
    const redirectUrl = chrome.identity.getRedirectURL();

    // Build Supabase Google OAuth URL
    const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;

    // Open Chrome's auth popup
    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        (url) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(url);
          }
        }
      );
    });

    // Parse tokens from the hash fragment
    const hashParams = new URLSearchParams(responseUrl.split('#')[1]);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (!accessToken) throw new Error('No access token received');

    // Set the Supabase session with the returned tokens
    const { error } = await db.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) throw error;

    // Signed in — proceed to scrape
    startScraping();

  } catch (e) {
    errEl.textContent = e.message || 'Sign-in failed';
    document.getElementById('btn-auth').textContent = 'Sign in with Google';
  }
}

// Scrape current tab
async function startScraping() {
  show('state-loading');

  // Load user's thesis for AI evaluation
  let thesis = '';
  try {
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      const { data } = await db.from('profiles').select('thesis').eq('user_id', user.id).single();
      if (data?.thesis) thesis = data.thesis;
    }
  } catch(e) { /* proceed without thesis */ }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { show('state-no-map'); return; }

  const url = tab.url || '';
  const isSupported = SUPPORTED.some(d => url.includes(d));

  if (!isSupported) {
    show('state-no-map');
    return;
  }

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

          // Title from h1
          const titleEl = document.querySelector('h1');
          if (titleEl) data.title = titleEl.textContent.trim();

          // Cartographer from /mapmaker/ link (raremaps uses structured links)
          const mapmakerLink = document.querySelector('a[href*="/mapmaker/"]');
          if (mapmakerLink) {
            data.cartographer = mapmakerLink.textContent.trim();
            // Normalize "DELISLE, Guillaume" → "Guillaume Delisle"
            if (data.cartographer.includes(',')) {
              const parts = data.cartographer.split(',').map(s => s.trim());
              if (parts.length === 2) {
                // "SURNAME, First" → "First Surname"
                const surname = parts[0].charAt(0) + parts[0].slice(1).toLowerCase();
                data.cartographer = parts[1] + ' ' + surname;
              }
            }
          }

          // Year: extract from title text first (most reliable)
          if (data.title) {
            // Match year in title like "... Juin 1718" or "... 1763"
            const titleYears = data.title.match(/\b(1[5-9]\d{2})\b/g);
            if (titleYears) {
              // Use the last year found in the title (usually the map date)
              data.year = parseInt(titleYears[titleYears.length - 1], 10);
            }
          }

          // Fallback: year from URL slug (e.g. /carte-de-la-louisiane-...-juin-1718)
          if (!data.year) {
            const urlYears = window.location.pathname.match(/\b(1[5-9]\d{2})\b/g);
            if (urlYears) {
              data.year = parseInt(urlYears[urlYears.length - 1], 10);
            }
          }

          // Price: try multiple selectors
          const priceEl = document.querySelector('div.text-2xl.font-text')
            || document.querySelector('[class*="price"]');
          if (priceEl) {
            const priceMatch = priceEl.innerText.match(/[\d,]+/);
            if (priceMatch) data.price = parseInt(priceMatch[0].replace(/,/g, ''), 10);
          }

          // Description: prefer the main description block, not the bio
          // Raremaps puts description before the condition/cartographer bio sections
          const descEls = document.querySelectorAll('div[class*="prose"], div[class*="description"], section p');
          if (descEls.length > 0) {
            data.description = descEls[0].innerText.trim().slice(0, 600);
          }

          // Image: og:image meta tag (OpenSeadragon renders canvas, no img tag)
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
    populate(data, thesis);

  } catch (e) {
    console.error('Scrape error:', e);
    populate({ dealer: '', url: tab.url }, thesis);
  }
}

// Init: check for existing session
async function init() {
  const { data: { session } } = await db.auth.getSession();

  if (session) {
    // Session exists — proceed to scrape
    startScraping();
  } else {
    // No session — show sign-in
    show('state-auth');
  }
}

// Event listeners
document.getElementById('btn-save').addEventListener('click', saveMap);
document.getElementById('btn-cancel').addEventListener('click', () => window.close());
document.getElementById('btn-retry').addEventListener('click', () => show('state-form'));
document.getElementById('btn-auth').addEventListener('click', signIn);
document.getElementById('btn-view-collection').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://holocenemaps.com/collection.html' });
  window.close();
});

init();
