#!/usr/bin/env python3
"""
Seed maps into Supabase using the service role key.
Deletes all existing maps for the user before inserting.
Usage: python3 seed-maps.py [service-role-key] [user-id]
Defaults to the hardcoded values below if no args provided.
"""
import sys, json, urllib.request, urllib.error

SUPABASE_URL = 'https://irfuhohbabtywbuchwpb.supabase.co'
DEFAULT_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZnVob2hiYWJ0eXdidWNod3BiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTI2NzAxOSwiZXhwIjoyMDkwODQzMDE5fQ.Jb6xQWcXPqKSB3v9QNZod7oOnjRHpFdlRhZWstClGRY'
DEFAULT_USER_ID    = 'd24bb44d-858f-47a2-a2e3-c80996538ac8'

SERVICE_KEY = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SERVICE_KEY
USER_ID     = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_USER_ID

MAPS = [
    {
        'user_id': USER_ID,
        'title': 'Chatelain — Carte de la Nouvelle France',
        'year': '1719',
        'cartographer': 'Henri Abraham Chatelain',
        'act': 1,
        'status': 'owned',
        'priority': 5,
        'dealer': 'New World Cartographic',
        'price': '2000',
        'notes': "Act I anchor. Seven-sheet atlas map overlaying De l'Isle's 1718 geography with rich ethnographic annotation — cave-dwelling peoples, tribal nations, Jesuit mission routes. Published in Amsterdam's Atlas Historique at the height of John Law's Mississippi Bubble. Literally cartographic propaganda for Louisiana settlement. The most visually complex French statement of the era. Excellent condition, strong impression, ample margins.",
    },
    {
        'user_id': USER_ID,
        'title': 'Bowen — Atlantic World',
        'year': '1740',
        'cartographer': 'Emanuel Bowen',
        'act': 2,
        'status': 'owned',
        'priority': 5,
        'dealer': 'Geographicus',
        'price': '0',
        'notes': "Act II anchor. Large-format Atlantic World map showing the full contest zone between French Louisiana and British colonial America at peak tension. Bowen held dual appointment as Geographer to George II and Louis XV simultaneously — extraordinary credential for the period. Definitive English commercial map of mid-century imperial rivalry. Purchased from Geographicus.",
    },
    {
        'user_id': USER_ID,
        'title': 'Gibson — Proclamation Map',
        'year': '1763',
        'cartographer': 'John Gibson',
        'act': 3,
        'status': 'owned',
        'priority': 5,
        'dealer': 'New World Cartographic',
        'price': '600',
        'notes': "Act III anchor. Published in The Gentleman's Magazine immediately after the Treaty of Paris. Documents the Proclamation Line of 1763 — the moment Britain reorganised its North American empire and ended French territorial ambition on the continent. High print run makes it collectible but not scarce; historically it is the cartographic record of the contest's resolution.",
    },
    {
        'user_id': USER_ID,
        'title': 'Harrison — New York City',
        'year': '1939',
        'cartographer': 'Richard Edes Harrison',
        'act': 3,
        'status': 'owned',
        'priority': 3,
        'dealer': 'Fortune Magazine',
        'price': '0',
        'notes': "Fortune Magazine, July 1939. Harrison's aerial perspective NYC map — modernist counterpoint to the 18th-century imperial collection. Acquired as a complete Fortune Magazine issue. Large-format scan at Dallas print shop planned. Outside the Franco-British framework but a significant cartographic object in its own right.",
    },
    {
        'user_id': USER_ID,
        'title': 'Texas Homeseekers Map',
        'year': '1909',
        'cartographer': 'Unknown',
        'act': 3,
        'status': 'owned',
        'priority': 2,
        'dealer': 'Unknown',
        'price': '0',
        'notes': '1909 Houston promotional map targeting homesteaders. Outside the Franco-British imperial framework but holds personal and regional significance. Deep zoom tiles live on holocenemaps.com/texas.html.',
    },
    {
        'user_id': USER_ID,
        'title': "De l'Isle — Carte de la Louisiane",
        'year': '1718',
        'cartographer': "Guillaume De l'Isle",
        'act': 1,
        'status': 'target',
        'priority': 5,
        'dealer': 'Barry Ruderman',
        'price': '3500',
        'notes': "The foundational French territorial assertion of 1718 — De l'Isle's masterwork establishing Louisiana's boundaries in explicit contest with Spanish and British claims. Direct source map for Chatelain's 1719 reworking. Acquisition of this alongside Chatelain would make the Act I argument irrefutable. Paris first state commands $3,000-5,000+; Amsterdam reissue editions available around $1,800.",
    },
    {
        'user_id': USER_ID,
        'title': "De Fer — Carte de l'Amérique Septentrionale",
        'year': '1718',
        'cartographer': 'Nicolas De Fer',
        'act': 1,
        'status': 'target',
        'priority': 4,
        'dealer': '',
        'price': '0',
        'notes': "Four-sheet 1718 map with direct ties to John Law and the Mississippi Bubble. The source material Chatelain condensed into the one-sheet version we own. Potential alternative Act I centrepiece — its commercial propaganda context and physical scale may be more compelling than De l'Isle's scholarly precision. Under active research. Geographer to the King of Spain.",
    },
    {
        'user_id': USER_ID,
        'title': 'Coronelli/Nolin — Amérique Septentrionale',
        'year': '1689',
        'cartographer': 'Vincenzo Coronelli / Jean-Baptiste Nolin',
        'act': 1,
        'status': 'passed',
        'priority': 3,
        'dealer': 'RareMaps',
        'price': '5000',
        'notes': "Evaluated and passed. Act I prologue piece — pre-contest French dominance, Great Lakes data from Jesuit sources, scarce on the market. $5,000 reflects genuine rarity. Coronelli was Cosmographer to the Republic of Venice with Louis XIV patronage. Visually exceptional but expensive for a prologue piece. Revisit as capstone acquisition if collection matures.",
    },
    {
        'user_id': USER_ID,
        'title': 'Coronelli/Petrini — America Settentrionale',
        'year': '1700',
        'cartographer': 'Paolo Petrini after Vincenzo Coronelli',
        'act': 1,
        'status': 'passed',
        'priority': 2,
        'dealer': 'RareMaps',
        'price': '2400',
        'notes': "Evaluated and passed. Neapolitan reissue of Coronelli's original Venetian plates — not a first edition. Uncolored condition reduces appeal. At $2,400 feels rich for a secondary reissue. The Chatelain at $2,000 is more narratively on-point for the French imperial thesis.",
    },
    {
        'user_id': USER_ID,
        'title': "De l'Isle — Carte du Mississipi",
        'year': '1700',
        'cartographer': "Guillaume De l'Isle",
        'act': 1,
        'status': 'target',
        'priority': 4,
        'dealer': 'Arader Galleries',
        'price': '1800',
        'notes': "Amsterdam reissue edition, not Paris first state — which explains the $1,800 price vs $3,000-5,000 for a first state. Depicts the Mississippi months after d'Iberville's 1698-99 expedition found the river mouth. One of the most consequential maps in North American cartographic history at an accessible price. The intellectual achievement is identical to first state; price difference reflects bibliographic hierarchy only. Strong recommendation.",
    },
    {
        'user_id': USER_ID,
        'title': "De l'Isle — Dezauche Reissue",
        'year': '1783',
        'cartographer': "Guillaume De l'Isle / Dezauche",
        'act': 3,
        'status': 'passed',
        'priority': 2,
        'dealer': 'Geographicus',
        'price': '1200',
        'notes': "Evaluated and passed. 1783 Dezauche reissue of De l'Isle's plate — impression pulled ~57 years after De l'Isle's death from aging copper. Lines softened, detail muddied. $1,200 reflects accurately what it is. Narratively useful 1783 date for the post-Revolutionary period but wrong framing — French Canada focus when Act III needs British reckoning with losing the colonies.",
    },
    {
        'user_id': USER_ID,
        'title': "Mortier — Carte Nouvelle de l'Amérique Angloise",
        'year': '1700',
        'cartographer': 'Pierre Mortier',
        'act': 1,
        'status': 'passed',
        'priority': 2,
        'dealer': 'Geographicus',
        'price': '3200',
        'notes': "Evaluated and passed. Dutch publisher, French-language map of British colonial America — a layered object. Amsterdam cartographic tradition transitioning to French dominance. Compelling as a prologue 'before' piece showing the landscape before the imperial contest ignites. At $3,200 it is the most expensive non-anchor piece evaluated — too much for prologue work when core narrative gaps remain open.",
    },
    {
        'user_id': USER_ID,
        'title': 'Homann — North America',
        'year': '1720',
        'cartographer': 'Johann Baptist Homann',
        'act': 2,
        'status': 'target',
        'priority': 4,
        'dealer': 'Various',
        'price': '1800',
        'notes': "Three-empire view — French, British, and Spanish territorial claims shown in competing colors simultaneously. The neutral German perspective makes this uniquely valuable: no national bias, pure geographic documentation of the contested interior. Most efficient single purchase to fill the Spanish perspective gap. Homann was Geographer to the Holy Roman Emperor. Est. $1,800.",
    },
    {
        'user_id': USER_ID,
        'title': 'Moll — Beaver Map',
        'year': '1715',
        'cartographer': 'Herman Moll',
        'act': 2,
        'status': 'watching',
        'priority': 3,
        'dealer': 'Geographicus',
        'price': '0',
        'notes': "One of the most accurate maps of the period and the first large-scale map to show American postal routes. Segregates a large territory for the Iroquois League — staunch British allies who shaped the French and Indian War. Shows British confidence building while France and Spain still loom. Geographicus inventory. Price on request.",
    },
    {
        'user_id': USER_ID,
        'title': 'Palairet/Kitchin — European Colonies in North America',
        'year': '1755',
        'cartographer': 'Jean Palairet / Thomas Kitchin',
        'act': 2,
        'status': 'target',
        'priority': 4,
        'dealer': 'Barry Ruderman',
        'price': '0',
        'notes': "Striking, rare map at the outbreak of the Seven Years' War. Intricately colored to show disputed lands, forts, roads, and extent of settlement. Multiple states exist — 1755 first state is most valuable. Perfect bridge between Bowen 1740 and Gibson 1763. Price on request from Ruderman. High priority gap piece.",
    },
    {
        'user_id': USER_ID,
        'title': "Le Rouge — Carte de l'Amérique Septentrionale",
        'year': '1755',
        'cartographer': 'Georges-Louis Le Rouge',
        'act': 2,
        'status': 'target',
        'priority': 4,
        'dealer': 'Unknown',
        'price': '1500',
        'notes': "Act II/III hinge piece. Shows dashed lines separating competing imperial claims at the exact moment the Seven Years' War breaks out. The French perspective on the contest at maximum tension. $1,500 estimated. Strong recommendation as the hinge narrative piece — fills the gap between Bowen's mid-century contest and Gibson's 1763 resolution.",
    },
    {
        'user_id': USER_ID,
        'title': 'Kitchin — British Empire in North America',
        'year': '1770',
        'cartographer': 'Thomas Kitchin',
        'act': 3,
        'status': 'target',
        'priority': 4,
        'dealer': 'Geographicus',
        'price': '2400',
        'notes': "Evaluated very positively. Title alone does enormous narrative work: 'British Empire in North America' — seven years after the Treaty of Paris, Britain at maximum territorial confidence. The settled reality rather than the legal settlement. Complements Gibson 1763 perfectly: Gibson as legal resolution, Kitchin 1770 as consolidation. Full continental scope including Caribbean. $2,400 at Geographicus. Buy-worthy.",
    },
    {
        'user_id': USER_ID,
        'title': 'Faden — British Colonies in North America',
        'year': '1777',
        'cartographer': 'William Faden',
        'act': 3,
        'status': 'target',
        'priority': 5,
        'dealer': 'Boston Rare Maps',
        'price': '0',
        'notes': "Geographer to the King. Issued while the Revolutionary War was raging — Britain at the very moment it is losing its dominance. The cartouche depicts America as fundamentally primitive and subordinate, expressing the mercantilist-imperialist view of the colonies. Extraordinarily powerful Act III piece. Rare. Demand growing as American Revolution 250th anniversary approaches 2026. Price on request from Boston Rare Maps.",
    },
    {
        'user_id': USER_ID,
        'title': 'Kitchin — British Dominions agreeable to Treaty of 1763',
        'year': '1763',
        'cartographer': 'Thomas Kitchin',
        'act': 3,
        'status': 'watching',
        'priority': 3,
        'dealer': 'Barry Ruderman',
        'price': '0',
        'notes': "Shows the full extent of British dominion immediately after the Treaty of Paris — the high water mark of British North American power. Alternative to or complement of Gibson 1763. Ruderman inventory, price on request.",
    },
    {
        'user_id': USER_ID,
        'title': 'Mitchell — Map of the British and French Dominions',
        'year': '1755',
        'cartographer': 'John Mitchell',
        'act': 2,
        'status': 'target',
        'priority': 5,
        'dealer': 'Various',
        'price': '0',
        'notes': "Crown jewel. Arguably the single most important political map in American history — used in Treaty of Paris negotiations and subsequent boundary disputes for over a century. Rare and expensive; originals surface infrequently. Long-term aspirational acquisition. Multiple states exist with significant price variation. When budget and opportunity align, this is the pinnacle piece for the collection.",
    },
]

headers = {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Prefer': 'return=minimal',
}

# Delete all existing maps for this user first
print(f'Deleting existing maps for user {USER_ID}...')
del_req = urllib.request.Request(
    f'{SUPABASE_URL}/rest/v1/maps?user_id=eq.{USER_ID}',
    headers={**headers, 'Prefer': 'return=minimal'},
    method='DELETE'
)
try:
    with urllib.request.urlopen(del_req) as r:
        print(f'Deleted. HTTP {r.status}\n')
except urllib.error.HTTPError as e:
    print(f'Delete failed: {e.code} — {e.read().decode()}\n')

print(f'Inserting {len(MAPS)} maps...\n')

ok = 0
for m in MAPS:
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/maps',
        data=json.dumps(m).encode(),
        headers=headers,
        method='POST'
    )
    try:
        with urllib.request.urlopen(req) as r:
            print(f'OK:     {m["title"]}')
            ok += 1
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'FAILED: {m["title"]}')
        print(f'        {e.code} — {body}')

print(f'\n{ok}/{len(MAPS)} inserted.')
