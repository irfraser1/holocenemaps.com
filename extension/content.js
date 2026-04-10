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

  // Title
  const titleEl = document.querySelector('h1.map-title, h1[class*="title"], h1');
  if (titleEl) data.title = titleEl.textContent.trim();

  // Price
  const priceText = document.querySelector('div.text-2xl.font-text')?.innerText;
  if (priceText) data.price = parseInt(priceText.replace(/[$,]/g, ''), 10);

  // Meta fields — Ruderman often has a structured table
  const rows = document.querySelectorAll('table tr, .map-details tr, dl dt, .detail-row');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    if (text.includes('date') || text.includes('year')) {
      const match = row.textContent.match(/\b(1[6-9]\d{2})\b/);
      if (match) data.year = parseInt(match[1], 10);
    }
    if (text.includes('cartographer') || text.includes('maker') || text.includes('author')) {
      const cells = row.querySelectorAll('td, dd');
      if (cells.length > 1) data.cartographer = cells[1].textContent.trim();
    }
  });

  // Fallback year from page text
  if (!data.year) {
    const bodyText = document.body.textContent;
    const yearMatch = bodyText.match(/\b(1[6-9]\d{2})\b/);
    if (yearMatch) data.year = parseInt(yearMatch[1], 10);
  }

  data.url = window.location.href;
  data.dealer = 'Barry Ruderman';

  // Extract stock number from URL (e.g. raremaps.com/gallery/detail/79764)
  const stockMatch = window.location.pathname.match(/\/detail\/([a-zA-Z0-9]+)/);
  if (stockMatch) data.image = `https://storage.googleapis.com/raremaps/img/large/${stockMatch[1]}.jpg`;

  const descEl = document.querySelector('.map-description, .description, #description, [class*="desc"]');
  if (descEl) data.description = descEl.textContent.trim().slice(0, 800);

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
