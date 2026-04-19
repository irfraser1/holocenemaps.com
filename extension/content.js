// content.js — scrapes map listing data from Geographicus and Ruderman

function scrapeGeographicus() {
  const data = {};

  // Title — format: "Cartographer - Map Title"
  const titleEl = document.querySelector('h1.product-title, h1[itemprop="name"], h1');
  if (titleEl) data.title = titleEl.textContent.trim();

  // Price
  const priceEl = document.querySelector('[itemprop="price"], .price, .product-price');
  if (priceEl) {
    const priceText = priceEl.getAttribute('content') || priceEl.textContent;
    const match = priceText.match(/[\d,]+\.?\d*/);
    if (match) data.price = parseInt(match[0].replace(/,/g, ''), 10);
  }

  // Description block — look for cartographer, date
  const descEls = document.querySelectorAll('.product-description p, .description p, p');
  let descText = '';
  descEls.forEach(el => { descText += ' ' + el.textContent; });

  // Try to extract year from page text
  const yearMatch = descText.match(/\b(1[6-9]\d{2})\b/);
  if (yearMatch) data.year = parseInt(yearMatch[1], 10);

  // Cartographer from title (usually "Cartographer - Title" or "Title by Cartographer")
  if (data.title) {
    const dashMatch = data.title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[—\-]/);
    if (dashMatch) data.cartographer = dashMatch[1].trim();
  }

  // Listing URL
  data.url = window.location.href;
  data.dealer = 'Geographicus';

  // Grab first image
  const imgEl = document.querySelector('.product-image img, [itemprop="image"], .gallery img');
  if (imgEl) data.image = imgEl.src;

  // Pull full description for notes
  const fullDesc = document.querySelector('.product-description, .description, #description');
  if (fullDesc) data.description = fullDesc.textContent.trim().slice(0, 800);

  return data;
}

function scrapeRuderman() {
  const data = {};

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
        const surname = parts[0].charAt(0) + parts[0].slice(1).toLowerCase();
        data.cartographer = parts[1] + ' ' + surname;
      }
    }
  }

  // Year: extract from title text first (most reliable)
  if (data.title) {
    const titleYears = data.title.match(/\b(1[5-9]\d{2})\b/g);
    if (titleYears) {
      data.year = parseInt(titleYears[titleYears.length - 1], 10);
    }
  }

  // Fallback: year from URL slug
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

  data.url = window.location.href;
  data.dealer = 'Barry Ruderman';

  // Image: og:image or construct from stock number
  const ogImg = document.querySelector('meta[property="og:image"]');
  if (ogImg) {
    data.image = ogImg.getAttribute('content');
  } else {
    const stockMatch = window.location.pathname.match(/\/detail\/([a-zA-Z0-9]+)/);
    if (stockMatch) data.image = `https://storage.googleapis.com/raremaps/img/large/${stockMatch[1]}.jpg`;
  }

  // Description: prefer main description block, not bio
  const descEls = document.querySelectorAll('div[class*="prose"], div[class*="description"], section p');
  if (descEls.length > 0) {
    data.description = descEls[0].innerText.trim().slice(0, 800);
  }

  return data;
}

function scrape() {
  const host = window.location.hostname;
  if (host.includes('geographicus')) return scrapeGeographicus();
  if (host.includes('raremaps')) return scrapeRuderman();
  return null;
}

// Listen for message from popup requesting scrape
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrape') {
    const data = scrape();
    sendResponse(data);
  }
  return true;
});
