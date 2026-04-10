#!/usr/bin/env python3
"""
scout-radar.py — Category-Agnostic Market Radar Scout

Pulls user theses from Supabase, evaluates a pool of market listings
against each thesis using AI, and writes matches to market_matches.

Architecture:
  - market_listings: shared pool of items from any category
  - market_matches: per-user AI-curated matches
  - This script is the "brain" — swap the listing pool or AI prompt
    for coins/stamps/cards and everything else stays the same.

Usage:
  python3 scout-radar.py                       # Run for all users
  python3 scout-radar.py <user-id>             # Run for one user
"""

import sys, json, urllib.request, urllib.error, os

# ── CONFIG ──────────────────────────────────────────────────────
SUPABASE_URL = 'https://irfuhohbabtywbuchwpb.supabase.co'
SERVICE_KEY  = os.environ.get('SUPABASE_SERVICE_KEY', '')
GEMINI_KEY   = os.environ.get('GEMINI_API_KEY', '')
CATEGORY     = 'maps'  # Change to 'coins', 'stamps', etc. for other verticals

HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
}

# ── LISTING POOL ────────────────────────────────────────────────
# Real maps currently or recently available from major dealers.
# In production, this is replaced by a scraper / API feed.
# The schema is category-agnostic: metadata holds domain-specific fields.

LISTING_POOL = [
    {
        'category': 'maps',
        'title': 'Carte de la Louisiane et du Cours du Mississipi',
        'description': 'Guillaume De l\'Isle\'s landmark 1718 map, first to accurately depict the Mississippi drainage. Copper engraving with original hand color. Excellent impression.',
        'dealer_name': 'Barry Lawrence Ruderman',
        'dealer_url': 'https://www.raremaps.com/gallery/detail/94827',
        'image_url': 'https://www.raremaps.com/maps/medium/94827.jpg',
        'price': '$8,500',
        'source': 'dealer',
        'metadata': {'cartographer': 'Guillaume De l\'Isle', 'year': '1718', 'region': 'North America / Mississippi'},
    },
    {
        'category': 'maps',
        'title': 'A New and Accurate Map of North America',
        'description': 'Emanuel Bowen\'s large folio map from the Complete System of Geography, 1747. Detailed British colonial geography with fine decorative cartouche.',
        'dealer_name': 'Geographicus',
        'dealer_url': 'https://www.geographicus.com/P/AntiqueMap/NorthAmerica-bowen-1747',
        'image_url': 'https://www.geographicus.com/mm5/graphics/00000001/3/NorthAmerica-bowen-1747-sm.jpg',
        'price': '$1,200',
        'source': 'dealer',
        'metadata': {'cartographer': 'Emanuel Bowen', 'year': '1747', 'region': 'North America'},
    },
    {
        'category': 'maps',
        'title': 'Carte Nouvelle de la Mer du Sud',
        'description': 'Henri Abraham Chatelain\'s stunning double-hemisphere Pacific map from Atlas Historique. Rich with ethnographic detail and navigation routes.',
        'dealer_name': 'Old World Auctions',
        'dealer_url': 'https://www.oldworldauctions.com/',
        'image_url': '',
        'price': '$3,200',
        'source': 'auction_house',
        'metadata': {'cartographer': 'Henri Abraham Chatelain', 'year': '1719', 'region': 'Pacific / World'},
    },
    {
        'category': 'maps',
        'title': 'Plan of the City of New York, Drawn from Actual Survey',
        'description': 'Bernard Ratzer\'s celebrated survey of colonial New York, 1770. One of the finest 18th-century city plans ever produced.',
        'dealer_name': 'Arader Galleries',
        'dealer_url': 'https://www.aradergalleries.com/',
        'image_url': '',
        'price': '$45,000',
        'source': 'dealer',
        'metadata': {'cartographer': 'Bernard Ratzer', 'year': '1770', 'region': 'New York City'},
    },
    {
        'category': 'maps',
        'title': 'Mer de l\'Ouest — Carte des Nouvelles Découvertes',
        'description': 'Philippe Buache & Joseph-Nicolas De l\'Isle, 1752. The controversial "Sea of the West" map that fueled Pacific exploration myths for decades.',
        'dealer_name': 'Daniel Crouch Rare Books',
        'dealer_url': 'https://www.crouchrarebooks.com/',
        'image_url': '',
        'price': '$6,800',
        'source': 'dealer',
        'metadata': {'cartographer': 'Philippe Buache', 'year': '1752', 'region': 'Pacific Northwest / Mythical'},
    },
    {
        'category': 'maps',
        'title': 'A Map of the British Empire in America',
        'description': 'Henry Popple\'s monumental 20-sheet wall map, 1733. The first large-scale printed map of North America by an Englishman. Rare complete set.',
        'dealer_name': 'Sotheby\'s',
        'dealer_url': 'https://www.sothebys.com/',
        'image_url': '',
        'price': '$120,000',
        'source': 'auction_house',
        'metadata': {'cartographer': 'Henry Popple', 'year': '1733', 'region': 'North America'},
    },
    {
        'category': 'maps',
        'title': 'Carte du Canada ou de la Nouvelle France',
        'description': 'Guillaume De l\'Isle, 1703. Foundational map of French territorial claims. Shows the Great Lakes, missions, and indigenous territories in remarkable detail.',
        'dealer_name': 'Martayan Lan',
        'dealer_url': 'https://www.martayanlan.com/',
        'image_url': '',
        'price': '$4,500',
        'source': 'dealer',
        'metadata': {'cartographer': 'Guillaume De l\'Isle', 'year': '1703', 'region': 'Canada / Great Lakes'},
    },
    {
        'category': 'maps',
        'title': 'A Chart of the Gulf Stream',
        'description': 'Benjamin Franklin and Timothy Folger, c. 1769. The first published chart of the Gulf Stream. Extraordinarily rare, fewer than 10 known copies.',
        'dealer_name': 'Christie\'s',
        'dealer_url': 'https://www.christies.com/',
        'image_url': '',
        'price': '$280,000',
        'source': 'auction_house',
        'metadata': {'cartographer': 'Benjamin Franklin', 'year': '1769', 'region': 'Atlantic Ocean'},
    },
    {
        'category': 'maps',
        'title': 'Americae Sive Quartae Orbis Partis Nova et Exactissima Descriptio',
        'description': 'Diego Gutiérrez, 1562. The largest engraved map of the Americas produced in the 16th century. Only two complete examples survive.',
        'dealer_name': 'Heritage Auctions',
        'dealer_url': 'https://www.ha.com/',
        'image_url': '',
        'price': 'Estimate on Request',
        'source': 'auction_house',
        'metadata': {'cartographer': 'Diego Gutiérrez', 'year': '1562', 'region': 'Americas'},
    },
    {
        'category': 'maps',
        'title': 'Map of Texas and Part of New Mexico',
        'description': 'Jacob De Cordova, 1849. The first large-scale map of Texas produced within the state. Shows counties, rivers, settlements in extraordinary detail.',
        'dealer_name': 'Dorothy Sloan Auctions',
        'dealer_url': 'https://www.dsbooks.com/',
        'image_url': '',
        'price': '$18,000',
        'source': 'auction_house',
        'metadata': {'cartographer': 'Jacob De Cordova', 'year': '1849', 'region': 'Texas'},
    },
]

# ── SUPABASE HELPERS ────────────────────────────────────────────

def supa_get(path):
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/{path}', headers=HEADERS)
    return json.loads(urllib.request.urlopen(req).read())

def supa_post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/{path}', data=body, headers=HEADERS, method='POST')
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        # Duplicate key (already matched) is fine
        if '23505' in err:
            return None
        print(f'  POST error: {e.code} — {err}')
        return None

def supa_upsert(path, data):
    h = {**HEADERS, 'Prefer': 'return=representation,resolution=merge-duplicates'}
    body = json.dumps(data).encode()
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/{path}', data=body, headers=h, method='POST')
    return json.loads(urllib.request.urlopen(req).read())

# ── AI MATCHING ─────────────────────────────────────────────────

def ai_match(thesis, listing):
    """Ask Gemini if a listing fits the user's collecting thesis."""
    meta = listing.get('metadata', {})
    meta_str = ', '.join(f'{k}: {v}' for k, v in meta.items()) if meta else ''

    prompt = f"""You are an expert collectibles advisor. A collector has this thesis:

"{thesis}"

A new listing has appeared on the market:
Title: {listing['title']}
Description: {listing.get('description', '')}
Details: {meta_str}
Price: {listing.get('price', 'Unknown')}
Dealer: {listing.get('dealer_name', 'Unknown')}

Evaluate whether this listing fits the collector's thesis.
Respond in EXACTLY this JSON format, no markdown:
{{"match": true/false, "confidence": "high"/"medium"/"low", "reason": "2-3 sentence explanation of why this does or doesn't fit their thesis. Be specific about how it connects to their collection goals."}}
"""

    body = json.dumps({
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'temperature': 0.3, 'maxOutputTokens': 300}
    }).encode()

    req = urllib.request.Request(
        f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_KEY}',
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )

    try:
        res = urllib.request.urlopen(req)
        data = json.loads(res.read())
        text = data['candidates'][0]['content']['parts'][0]['text']
        # Strip markdown fences if present
        text = text.strip()
        if text.startswith('```'):
            text = text.split('\n', 1)[1]
        if text.endswith('```'):
            text = text.rsplit('```', 1)[0]
        return json.loads(text.strip())
    except Exception as e:
        print(f'  AI error: {e}')
        return None

# ── MAIN ────────────────────────────────────────────────────────

def run(target_user=None):
    # 1. Seed listings into market_listings (idempotent via upsert on title+dealer)
    print(f'📡 Seeding {len(LISTING_POOL)} listings into market_listings...')
    listing_ids = {}
    for item in LISTING_POOL:
        result = supa_upsert('market_listings', item)
        if result and len(result) > 0:
            listing_ids[item['title']] = result[0]['id']
            print(f'  ✓ {item["title"][:50]}')

    # 2. Get users with theses
    if target_user:
        users = supa_get(f'profiles?user_id=eq.{target_user}&select=user_id,thesis')
    else:
        users = supa_get('profiles?select=user_id,thesis&thesis=neq.')

    if not users:
        print('No users with theses found.')
        return

    print(f'\n🎯 Evaluating matches for {len(users)} user(s)...\n')

    for user in users:
        uid = user['user_id']
        thesis = user.get('thesis', '')
        if not thesis:
            continue

        print(f'User: {uid[:8]}… | Thesis: "{thesis[:60]}…"')

        # 3. Get all listings for this category
        listings = supa_get(f'market_listings?category=eq.{CATEGORY}&select=*')

        match_count = 0
        for listing in listings:
            result = ai_match(thesis, listing)
            if not result:
                continue

            if result.get('match'):
                match_data = {
                    'user_id': uid,
                    'listing_id': listing['id'],
                    'category': CATEGORY,
                    'match_reason': result.get('reason', ''),
                    'confidence': result.get('confidence', 'medium'),
                    'status': 'new',
                }
                inserted = supa_post('market_matches', match_data)
                if inserted:
                    match_count += 1
                    conf_emoji = '🟢' if result['confidence'] == 'high' else '🟡'
                    print(f'  {conf_emoji} MATCH: {listing["title"][:50]}')
                else:
                    print(f'  ⏭  Already matched: {listing["title"][:50]}')
            else:
                print(f'  ⬜ Skip: {listing["title"][:50]}')

        print(f'  → {match_count} new matches\n')

    print('✅ Scout complete.')


if __name__ == '__main__':
    if not GEMINI_KEY:
        print('Set GEMINI_API_KEY environment variable first.')
        print('  export GEMINI_API_KEY=your-key-here')
        sys.exit(1)

    target = sys.argv[1] if len(sys.argv) > 1 else None
    run(target)
