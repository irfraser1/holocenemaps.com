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
    setTimeout(() => window.close(), 2200);

  } catch (e) {
    document.getElementById('error-msg').textContent = e.message || 'Unknown error';
    show('state-error');
    btn.disabled = false;
    btn.textContent = 'Add to Collection';
  }
}

// Auth: sign in with email/password
async function signIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';

  if (!email || !password) {
    errEl.textContent = 'Enter email and password';
    return;
  }

  document.getElementById('btn-auth').textContent = 'Signing in…';

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    errEl.textContent = error.message;
    document.getElementById('btn-auth').textContent = 'Sign In';
    return;
  }

  // Signed in — proceed to scrape
  startScraping();
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

          const titleEl = document.querySelector('h1');
          if (titleEl) data.title = titleEl.textContent.trim();

          const bodyText = document.body.innerText;

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

// Allow Enter key to submit sign-in
document.getElementById('auth-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') signIn();
});

init();
