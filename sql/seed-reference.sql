-- ============================================================
-- Seed Reference Corpus for Map Identification Retrieval
-- Self-contained: creates table if needed, then inserts seed data.
-- ============================================================

-- Create the table (idempotent)
CREATE TABLE IF NOT EXISTS market_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'maps',
  title TEXT NOT NULL,
  description TEXT,
  dealer_name TEXT,
  dealer_url TEXT,
  image_url TEXT,
  price TEXT,
  source TEXT DEFAULT 'manual',
  listed_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for retrieval queries
CREATE INDEX IF NOT EXISTS idx_listings_category ON market_listings(category);

-- RLS: table is private by default, service role has full access
ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'market_listings' AND policyname = 'Service role manages listings'
  ) THEN
    CREATE POLICY "Service role manages listings"
      ON market_listings FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- Seed data (source = 'reference')
-- Focus: 18th-century French colonial / Franco-British contest
-- Plus commonly encountered antique maps and tricky/confusable cases
-- ============================================================

INSERT INTO market_listings (category, title, description, source, metadata) VALUES

-- ═══════════════════════════════════════════════════════════════
-- CORE: French Colonial / Mississippi / Louisiana
-- ═══════════════════════════════════════════════════════════════

('maps',
 'Carte de la Louisiane et du Cours du Mississipi',
 'Guillaume De l''Isle''s landmark 1718 map of Louisiana and the Mississippi River. First printed map to accurately depict the Mississippi drainage basin. Copper engraving, typically with original outline colour. Multiple states exist; first state has "Mississipi" spelling. Published in Paris by the author.',
 'reference',
 '{"cartographer": "Guillaume De l''Isle", "year": "1718", "region": "Louisiana / Mississippi", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "French Enlightenment cartography"}'),

('maps',
 'Carte du Canada ou de la Nouvelle France',
 'Guillaume De l''Isle, 1703. Foundational map of French territorial claims in North America. Shows the Great Lakes with improved accuracy based on Jesuit reports, plus indigenous territories, missions, and portages. Influential for decades — widely copied by English and Dutch publishers.',
 'reference',
 '{"cartographer": "Guillaume De l''Isle", "year": "1703", "region": "Canada / Great Lakes", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "French Enlightenment cartography"}'),

('maps',
 'Carte de la Nouvelle France et des Pays Voisins',
 'Jacques-Nicolas Bellin, 1755. Large-format map of New France on the eve of the Seven Years'' War. Shows French territorial claims at maximum extent. Published in the Hydrographie Françoise. Characteristic restrained Dépôt de la Marine style.',
 'reference',
 '{"cartographer": "Jacques-Nicolas Bellin", "year": "1755", "region": "New France / Great Lakes / Mississippi", "technique": "copperplate engraving", "parent_work": "Hydrographie Françoise", "tradition": "French hydrographic charting"}'),

('maps',
 'Carte des Nouvelles Découvertes au Nord de la Mer du Sud',
 'Philippe Buache and Joseph-Nicolas De l''Isle, 1752. The controversial "Sea of the West" map that fueled Pacific exploration myths. Shows the apocryphal Mer de l''Ouest. Published by the Académie Royale des Sciences. Multiple states.',
 'reference',
 '{"cartographer": "Philippe Buache / J.N. De l''Isle", "year": "1752", "region": "Pacific Northwest / Mythical", "technique": "copperplate engraving", "parent_work": "Académie Royale presentation", "tradition": "French speculative cartography"}'),

('maps',
 'Le Cours du Fleuve St. Louis depuis son Embouchure jusqu''à la Riviere d''Iberville',
 'Jacques-Nicolas Bellin, 1744. Detailed chart of the lower Mississippi from its mouth to the Iberville River. Shows French settlements, bayous, and navigation hazards. From the Petit Atlas Maritime.',
 'reference',
 '{"cartographer": "Jacques-Nicolas Bellin", "year": "1744", "region": "Lower Mississippi / Louisiana", "technique": "copperplate engraving", "parent_work": "Petit Atlas Maritime", "tradition": "French hydrographic charting"}'),

('maps',
 'Carte de la Louisiane, Cours du Mississipi et Pays Voisins',
 'Jean Baptiste Bourguignon d''Anville, 1732. D''Anville''s careful delineation of Louisiana based on critical evaluation of French exploration reports. Less speculative than contemporaries. Shows the Illinois Country in detail.',
 'reference',
 '{"cartographer": "Jean Baptiste Bourguignon d''Anville", "year": "1732", "region": "Louisiana / Mississippi / Illinois", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "French critical cartography"}'),

('maps',
 'Carte Particulière de l''Entrée du Fleuve St. Louis dans le Golfe du Mexique',
 'Bellin, c.1764. Detailed chart of the Mississippi River delta and passes. Shows depths, sandbars, and the challenging navigation into the river mouth. Small quarto format typical of Bellin''s insert charts.',
 'reference',
 '{"cartographer": "Jacques-Nicolas Bellin", "year": "1764", "region": "Mississippi Delta", "technique": "copperplate engraving", "parent_work": "Petit Atlas Maritime", "tradition": "French hydrographic charting"}'),

('maps',
 'Partie Occidentale de la Nouvelle France ou du Canada',
 'Jacques-Nicolas Bellin, 1755. Western section of Bellin''s large New France map. Focuses on the pays d''en haut — the Upper Country around the Great Lakes and upper Mississippi. Shows fur trade routes and indigenous nations.',
 'reference',
 '{"cartographer": "Jacques-Nicolas Bellin", "year": "1755", "region": "Upper Great Lakes / Upper Mississippi", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "French hydrographic charting"}'),

-- ═══════════════════════════════════════════════════════════════
-- CORE: Franco-British Contest / Seven Years' War era
-- ═══════════════════════════════════════════════════════════════

('maps',
 'A New and Accurate Map of the English Empire in North America',
 'Society of Anti-Gallicans / Emanuel Bowen, 1755. Propaganda map published at the outbreak of the Seven Years'' War. Deliberately extends British claims into French-claimed territory. Decorative cartouche with anti-French iconography.',
 'reference',
 '{"cartographer": "Emanuel Bowen", "year": "1755", "region": "North America", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "British colonial mapping"}'),

('maps',
 'A General Map of the Middle British Colonies in America',
 'Lewis Evans, 1755. One of the most important colonial American maps. Shows the contested Ohio Country. Published in Philadelphia. Franklin was involved in its distribution. Multiple pirated editions appeared in London.',
 'reference',
 '{"cartographer": "Lewis Evans", "year": "1755", "region": "Middle Colonies / Ohio Country", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "American colonial cartography"}'),

('maps',
 'A Map of the British and French Dominions in North America',
 'John Mitchell, 1755. The "most important map in American history." Used in every boundary negotiation from the Treaty of Paris (1763) through the Webster-Ashburton Treaty (1842). Multiple editions and states.',
 'reference',
 '{"cartographer": "John Mitchell", "year": "1755", "region": "North America", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "British colonial mapping"}'),

('maps',
 'An Accurate Map of North America Describing and Distinguishing the British, Spanish and French Dominions',
 'Emanuel Bowen and John Gibson, 1775. Large wall map published by Bowen''s son-in-law, drawn from Bowen''s materials. Shows post-1763 British territorial gains. Multiple sheets.',
 'reference',
 '{"cartographer": "Emanuel Bowen / John Gibson", "year": "1775", "region": "North America", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "British colonial mapping"}'),

('maps',
 'Carte de l''Amérique Septentrionale',
 'Jean Baptiste Bourguignon d''Anville, 1746. D''Anville''s definitive map of North America. Noted for leaving blank areas where information was lacking — a radical departure from the speculative tradition. Highly influential.',
 'reference',
 '{"cartographer": "Jean Baptiste Bourguignon d''Anville", "year": "1746", "region": "North America", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "French critical cartography"}'),

('maps',
 'Amérique Septentrionale',
 'Robert de Vaugondy, 1750. From the Atlas Universel. Shows French and British claims in North America. Vaugondy adopted a middle position between the speculative Buache school and the critical D''Anville approach.',
 'reference',
 '{"cartographer": "Robert de Vaugondy", "year": "1750", "region": "North America", "technique": "copperplate engraving", "parent_work": "Atlas Universel", "tradition": "French academic cartography"}'),

-- ═══════════════════════════════════════════════════════════════
-- COMMON: Frequently encountered 18th-century maps
-- ═══════════════════════════════════════════════════════════════

('maps',
 'A New Map of the Whole Continent of America',
 'Herman Moll, 1720. Large two-sheet "Codfish Map." Named for the prominent vignette of cod drying in Newfoundland. Shows Moll''s distinctive cartographic style with abundant text and inset views.',
 'reference',
 '{"cartographer": "Herman Moll", "year": "1720", "region": "Americas", "technique": "copperplate engraving", "parent_work": "separately issued / Atlas Geographus", "tradition": "English commercial cartography"}'),

('maps',
 'Carte d''Amérique',
 'Henri Abraham Chatelain, 1719. From the Atlas Historique. Large encyclopedic map surrounded by text panels, vignettes, and ethnographic illustrations. Characteristic Chatelain layout.',
 'reference',
 '{"cartographer": "Henri Abraham Chatelain", "year": "1719", "region": "Americas", "technique": "copperplate engraving", "parent_work": "Atlas Historique", "tradition": "Dutch encyclopedic cartography"}'),

('maps',
 'Plan de la Nouvelle Orléans',
 'Jacques-Nicolas Bellin, various dates (1744-1764). Bellin produced multiple plans of New Orleans across his career. Small quarto format. Shows the grid layout of the Vieux Carré and surrounding plantations.',
 'reference',
 '{"cartographer": "Jacques-Nicolas Bellin", "year": "1744-1764", "region": "New Orleans", "technique": "copperplate engraving", "parent_work": "various Bellin works", "tradition": "French hydrographic charting"}'),

('maps',
 'A New and Accurate Map of North America',
 'Emanuel Bowen, 1747. Large folio map from the Complete System of Geography. Detailed British colonial geography with fine decorative cartouche. Shows pre-war British territorial claims.',
 'reference',
 '{"cartographer": "Emanuel Bowen", "year": "1747", "region": "North America", "technique": "copperplate engraving", "parent_work": "Complete System of Geography", "tradition": "English commercial cartography"}'),

('maps',
 'A Map of the British Empire in America with the French and Spanish Settlements Adjacent Thereto',
 'Henry Popple, 1733. The first large-scale printed map of North America by an Englishman. Published as a monumental 20-sheet wall map. Individual sheets are commonly encountered separately.',
 'reference',
 '{"cartographer": "Henry Popple", "year": "1733", "region": "North America", "technique": "copperplate engraving", "parent_work": "separately issued wall map", "tradition": "English commercial cartography"}'),

('maps',
 'Carte du Mexique et de la Floride',
 'Guillaume De l''Isle, 1703. Important early depiction of the Gulf Coast and borderlands between Spanish and French claims. Shows early French exploration routes.',
 'reference',
 '{"cartographer": "Guillaume De l''Isle", "year": "1703", "region": "Mexico / Florida / Gulf Coast", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "French Enlightenment cartography"}'),

('maps',
 'Carte des Isles de l''Amérique et de Plusieurs Pays de Terre Ferme',
 'Robert de Vaugondy, 1749. Detailed map of the Caribbean islands and surrounding mainland. Shows colonial holdings of France, Spain, and England.',
 'reference',
 '{"cartographer": "Robert de Vaugondy", "year": "1749", "region": "Caribbean / West Indies", "technique": "copperplate engraving", "parent_work": "Atlas Universel", "tradition": "French academic cartography"}'),

('maps',
 'Nouvelle Carte Particulière de l''Amérique',
 'Nicolas Sanson / Alexis-Hubert Jaillot, 1692. Jaillot''s large-format reworking of Sanson''s geography. Demonstrates the transition from Sanson''s academic style to the grand decorative folio format.',
 'reference',
 '{"cartographer": "Nicolas Sanson / Jaillot", "year": "1692", "region": "North America", "technique": "copperplate engraving", "parent_work": "Atlas Nouveau", "tradition": "French classical cartography"}'),

-- ═══════════════════════════════════════════════════════════════
-- TRICKY: Confusable / ambiguous titles
-- ═══════════════════════════════════════════════════════════════

('maps',
 'A New Map of the Spanish West Indies',
 'Edward Wells, 1700 / Herman Moll, 1729 / Emanuel Bowen, 1747 (multiple cartographers used this generic title). Wells'' version is from A New Sett of Maps; Moll''s is from Atlas Minor; Bowen''s is from Complete System.',
 'reference',
 '{"cartographer": "Multiple (Wells / Moll / Bowen)", "year": "1700-1747", "region": "Caribbean / West Indies", "technique": "copperplate engraving", "parent_work": "various", "tradition": "English commercial cartography", "note": "AMBIGUOUS TITLE — distinguish by style, publisher, and date clues"}'),

('maps',
 'Carte de la Floride',
 'Multiple cartographers used this title: De l''Isle (1703), Bellin (1757), Bonne (1780). De l''Isle''s is large format, separately issued. Bellin''s is small quarto from Petit Atlas Maritime. Bonne''s is from Atlas de Toutes les Parties Connues.',
 'reference',
 '{"cartographer": "Multiple (De l''Isle / Bellin / Bonne)", "year": "1703-1780", "region": "Florida", "technique": "copperplate engraving", "parent_work": "various", "tradition": "French cartography", "note": "AMBIGUOUS TITLE — format and style distinguish the versions"}'),

('maps',
 'A Map of Virginia',
 'Multiple: John Smith (1612 — foundational), Joshua Fry and Peter Jefferson (1751 — the definitive 18th-century map), and various derivative versions. Fry-Jefferson is most commonly encountered at market.',
 'reference',
 '{"cartographer": "Multiple (Smith / Fry-Jefferson)", "year": "1612-1751", "region": "Virginia", "technique": "copperplate engraving", "parent_work": "various", "tradition": "English colonial mapping", "note": "AMBIGUOUS TITLE — Fry-Jefferson 1751 is the most common market version"}'),

('maps',
 'Plan of the City of New York',
 'Multiple versions: Bernard Ratzer (1770 — the finest), Montrésor (1766), Lyne (1728). Ratzer''s large-format plan is the most desirable. Lyne''s is extremely rare. Montrésor''s is associated with the British military.',
 'reference',
 '{"cartographer": "Multiple (Ratzer / Montrésor / Lyne)", "year": "1728-1770", "region": "New York City", "technique": "copperplate engraving", "parent_work": "various", "tradition": "British colonial survey", "note": "AMBIGUOUS TITLE — distinguish by format, detail level, and date"}'),

('maps',
 'Carte de l''Isthme de Panama',
 'Multiple: Bellin (1740s), Bonne (1780s), Brué (1820s). Common quarto-format map. Bellin''s is from Hydrographie Françoise or Prévost. Bonne''s is from Raynal. Look for publisher credits.',
 'reference',
 '{"cartographer": "Multiple (Bellin / Bonne / Brué)", "year": "1740-1825", "region": "Panama / Central America", "technique": "copperplate engraving", "parent_work": "various", "tradition": "French cartography", "note": "AMBIGUOUS TITLE — publisher and format distinguish versions"}'),

-- ═══════════════════════════════════════════════════════════════
-- BROADER: Important 17th-18th century maps for context
-- ═══════════════════════════════════════════════════════════════

('maps',
 'Novissima et Accuratissima Totius Americae Descriptio',
 'Nicolaes Visscher, c. 1658. Decorative Dutch Golden Age map of the Americas. Rich cartouche with native figures. Characteristic Visscher style with bold original hand colour.',
 'reference',
 '{"cartographer": "Nicolaes Visscher", "year": "1658", "region": "Americas", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "Dutch Golden Age cartography"}'),

('maps',
 'Americae Nova Tabula',
 'Willem Blaeu, 1635. From the Atlas Maior. One of the most iconic Dutch Golden Age maps of the Americas. Known for the border panels showing town views and native costume figures.',
 'reference',
 '{"cartographer": "Willem Blaeu", "year": "1635", "region": "Americas", "technique": "copperplate engraving", "parent_work": "Atlas Maior", "tradition": "Dutch Golden Age cartography"}'),

('maps',
 'Carte de la Mer du Sud et de la Mer du Nord',
 'Guillaume De l''Isle, 1700. Pioneering map of the Americas showing the full Pacific and Atlantic. Notable for correcting the longitudinal width of the Pacific Ocean.',
 'reference',
 '{"cartographer": "Guillaume De l''Isle", "year": "1700", "region": "Americas / Pacific", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "French Enlightenment cartography"}'),

('maps',
 'Carte de la Nouvelle France',
 'Samuel de Champlain, 1612/1632. Champlain published multiple maps; the 1632 version is the most detailed. Shows the interior of New France based on Champlain''s own explorations. Extremely rare in any edition.',
 'reference',
 '{"cartographer": "Samuel de Champlain", "year": "1612-1632", "region": "New France / Canada", "technique": "copperplate engraving", "parent_work": "Les Voyages", "tradition": "French exploration cartography"}'),

('maps',
 'Virginia and Maryland',
 'Augustine Herrman, 1673. Monumental four-sheet map produced by a Bohemian colonist. First accurate large-scale map of the Chesapeake Bay region. Herrman received a land grant (Bohemia Manor) in exchange for making it.',
 'reference',
 '{"cartographer": "Augustine Herrman", "year": "1673", "region": "Virginia / Maryland / Chesapeake", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "Colonial American cartography"}'),

('maps',
 'Carte Géographique de la Nouvelle France',
 'Jean Baptiste Louis Franquelin, 1688. Manuscript map (printed copies are later facsimiles). Important record of French knowledge of the interior after La Salle''s explorations. Shows the "River Colbert" (Mississippi).',
 'reference',
 '{"cartographer": "Jean Baptiste Louis Franquelin", "year": "1688", "region": "New France / Mississippi", "technique": "manuscript (facsimile if printed)", "parent_work": "unique manuscript", "tradition": "French colonial cartography"}'),

('maps',
 'A New Map of North America with the West India Islands',
 'Thomas Jefferys, 1768. Jefferys'' post-war map showing the new British territorial gains from the Treaty of Paris. Important for the new boundaries of Quebec, East and West Florida.',
 'reference',
 '{"cartographer": "Thomas Jefferys", "year": "1768", "region": "North America / West Indies", "technique": "copperplate engraving", "parent_work": "American Atlas", "tradition": "British post-war cartography"}'),

('maps',
 'Theatrum Orbis Terrarum — Americae Sive Novi Orbis, Nova Descriptio',
 'Abraham Ortelius, 1570. The first modern atlas map of the Americas. Shows the characteristic bulging South American west coast. Multiple editions from 1570 to 1612 with different verso texts.',
 'reference',
 '{"cartographer": "Abraham Ortelius", "year": "1570", "region": "Americas", "technique": "copperplate engraving", "parent_work": "Theatrum Orbis Terrarum", "tradition": "Antwerp school"}'),

('maps',
 'Canada, Louisiane et Terres Angloises',
 'Jean Baptiste Bourguignon d''Anville, 1755. D''Anville''s detailed map of eastern North America published on the eve of war. Shows both French and British positions with characteristic D''Anville restraint.',
 'reference',
 '{"cartographer": "Jean Baptiste Bourguignon d''Anville", "year": "1755", "region": "Canada / Louisiana / British Colonies", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "French critical cartography"}'),

-- ═══════════════════════════════════════════════════════════════
-- COMMON ATLAS PLATES: Frequently scanned, often confusable
-- ═══════════════════════════════════════════════════════════════

('maps',
 'Map of North America',
 'William Faden, 1777. Published during the American Revolution. Shows the new state boundaries. Often encountered as a separately-issued broadside. Faden succeeded Jefferys as Geographer to the King.',
 'reference',
 '{"cartographer": "William Faden", "year": "1777", "region": "North America", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "British military cartography"}'),

('maps',
 'Carte de la Louisiane et de la Floride',
 'Rigobert Bonne, 1780. From Guillaume-Thomas Raynal''s Atlas de Toutes les Parties Connues du Globe Terrestre. Small quarto format. Bonne''s characteristic unadorned, projection-focused style. Common.',
 'reference',
 '{"cartographer": "Rigobert Bonne", "year": "1780", "region": "Louisiana / Florida", "technique": "copperplate engraving", "parent_work": "Raynal atlas", "tradition": "French Enlightenment cartography"}'),

('maps',
 'Louisiana',
 'Multiple: Carey & Lea (1822), SDUK (1833), Johnson (1860s), Colton (1855). Generic title used by many 19th-century American publishers. Distinguish by publisher imprint, lithographic vs engraved technique, and decorative borders.',
 'reference',
 '{"cartographer": "Multiple 19th-century publishers", "year": "1820-1870", "region": "Louisiana", "technique": "various (engraving / lithography)", "parent_work": "various atlases", "tradition": "American commercial atlas", "note": "VERY COMMON — look for publisher imprint to distinguish"}'),

('maps',
 'North America',
 'Multiple: Carey (1814), Mitchell (1846), Colton (1855), Johnson (1862), Black (1854). Extremely common generic title. Distinguish by publisher imprint, border decoration, and engraving style.',
 'reference',
 '{"cartographer": "Multiple 19th-century publishers", "year": "1814-1870", "region": "North America", "technique": "various", "parent_work": "various atlases", "tradition": "American/British commercial atlas", "note": "VERY COMMON — publisher imprint and border style are key"}'),

-- ═══════════════════════════════════════════════════════════════
-- ADDITIONAL: Key maps for collection context
-- ═══════════════════════════════════════════════════════════════

('maps',
 'Carte de la Barbade',
 'Jacques-Nicolas Bellin, 1758. Small quarto chart of Barbados from the Petit Atlas Maritime. Shows anchorages, reefs, and settlements. Typical Bellin marine chart style.',
 'reference',
 '{"cartographer": "Jacques-Nicolas Bellin", "year": "1758", "region": "Barbados / Caribbean", "technique": "copperplate engraving", "parent_work": "Petit Atlas Maritime", "tradition": "French hydrographic charting"}'),

('maps',
 'A Chart of the Gulf of Mexico and Bay of Honduras',
 'Thomas Jefferys, 1775. Detailed navigation chart. Jefferys'' posthumous publication by Robert Sayer and John Bennett. Shows shipping routes and soundings.',
 'reference',
 '{"cartographer": "Thomas Jefferys", "year": "1775", "region": "Gulf of Mexico / Honduras", "technique": "copperplate engraving", "parent_work": "West India Atlas", "tradition": "British commercial charting"}'),

('maps',
 'Partie de la Nouvelle France',
 'Jacques-Nicolas Bellin et al., various dates. Multiple publishers used this generic title for subset maps of New France. Bellin published several variants focusing on different sections. Format and publisher distinguish them.',
 'reference',
 '{"cartographer": "Multiple (primarily Bellin)", "year": "1740-1764", "region": "New France (various sections)", "technique": "copperplate engraving", "parent_work": "various", "tradition": "French hydrographic charting", "note": "AMBIGUOUS TITLE — section and publisher distinguish versions"}'),

('maps',
 'Les Costes aux Environs de la Rivière de Identity',
 'Jacques-Nicolas Bellin, 1744. Detailed coastal chart of the Mississippi River approaches. Small quarto format from the Petit Atlas Maritime or Charlevoix.',
 'reference',
 '{"cartographer": "Jacques-Nicolas Bellin", "year": "1744", "region": "Mississippi River Delta / Gulf Coast", "technique": "copperplate engraving", "parent_work": "Petit Atlas Maritime / Charlevoix", "tradition": "French hydrographic charting"}'),

('maps',
 'A New and Correct Map of the Province of Quebec',
 'Thomas Jefferys / William Faden, 1776. Post-Quebec Act map showing the expanded province. Important for the northern boundary of the American colonies.',
 'reference',
 '{"cartographer": "Thomas Jefferys / William Faden", "year": "1776", "region": "Quebec / Canada", "technique": "copperplate engraving", "parent_work": "American Atlas", "tradition": "British colonial mapping"}'),

('maps',
 'L''Amérique Septentrionale',
 'Nicolas de Fer, 1713. Large decorative map of North America. De Fer''s style is more ornamental than De l''Isle or D''Anville. Published after the Treaty of Utrecht. Shows California as an island (late persistence of the myth).',
 'reference',
 '{"cartographer": "Nicolas de Fer", "year": "1713", "region": "North America", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "French decorative cartography"}'),

('maps',
 'Carte de l''Acadie, Isle Royale et Pays Voisins',
 'Jacques-Nicolas Bellin, 1757. Map of Acadia/Nova Scotia, Cape Breton Island, and surrounding territories. The contested Anglo-French borderlands. From the Hydrographie Françoise.',
 'reference',
 '{"cartographer": "Jacques-Nicolas Bellin", "year": "1757", "region": "Acadia / Nova Scotia / Cape Breton", "technique": "copperplate engraving", "parent_work": "Hydrographie Françoise", "tradition": "French hydrographic charting"}'),

('maps',
 'A Map of Louisiana and of the River Mississipi',
 'John Senex, 1721. English adaptation of De l''Isle''s 1718 map. Published in London. Demonstrates the rapid dissemination of French geographic intelligence to English publishers.',
 'reference',
 '{"cartographer": "John Senex", "year": "1721", "region": "Louisiana / Mississippi", "technique": "copperplate engraving", "parent_work": "separately issued", "tradition": "English commercial cartography"}'),

('maps',
 'Carte du Golphe du Mexique et des Isles de l''Amérique',
 'Robert de Vaugondy, 1749. Gulf of Mexico and Caribbean map from the Atlas Universel. Shows shipping lanes and colonial holdings. Vaugondy''s characteristic clean linework.',
 'reference',
 '{"cartographer": "Robert de Vaugondy", "year": "1749", "region": "Gulf of Mexico / Caribbean", "technique": "copperplate engraving", "parent_work": "Atlas Universel", "tradition": "French academic cartography"}'),

('maps',
 'A Draught of the Creek Nation',
 'Anonymous / British colonial, c.1757. Rare manuscript-style map (sometimes printed as a facsimile) of Creek territory. Important ethnohistoric document showing indigenous settlement patterns and trading paths.',
 'reference',
 '{"cartographer": "Anonymous / British colonial", "year": "1757", "region": "Creek Nation / Southeast", "technique": "manuscript", "parent_work": "colonial records", "tradition": "British colonial intelligence mapping"}'),

-- ═══════════════════════════════════════════════════════════════
-- 16TH-CENTURY ITALIAN ATLAS PLATES: Frequently encountered at market
-- Ruscelli/Gastaldi Ptolemy, Münster Cosmographia, Ramusio
-- ═══════════════════════════════════════════════════════════════

('maps',
 'Tierra Nueva',
 'Girolamo Ruscelli (after Giacomo Gastaldi), 1561. Early and influential map of eastern North America from upper Florida to Labrador. From the first Ruscelli edition of Ptolemy''s La Geografia di Claudio Tolomeo. Copperplate engraving by Giulio Sanuto. Shows Tierra de Nurumberg (Norumbega), Larcadia, and the puzzling upstream conjunction of the Hudson and St. Lawrence rivers. First state has platemark running off top edge (maps engraved two-to-a-plate). Later editions (1574, 1598, 1599) have divided plates. The 1599 issue adds a ship. Multiple editions in Italian and Latin.',
 'reference',
 '{"cartographer": "Girolamo Ruscelli", "year": "1561", "region": "Eastern North America / New England / Canada", "technique": "copperplate engraving", "parent_work": "La Geografia di Claudio Tolomeo Alessandrino", "tradition": "Italian Ptolemaic cartography", "engraver": "Giulio Sanuto", "publisher": "Vincenzo Valgrisi, Venice"}'),

('maps',
 'Universale della Parte del Mondo Nuovamente Ritrovata',
 'Girolamo Ruscelli (after Giacomo Gastaldi), 1561. Double-hemisphere map of the Western Hemisphere — the first double-hemisphere world map to appear in a Ptolemy edition. From La Geografia di Claudio Tolomeo. Copperplate engraving. Shows the Americas with California as a peninsula. Multiple editions from 1561 to 1599.',
 'reference',
 '{"cartographer": "Girolamo Ruscelli", "year": "1561", "region": "Western Hemisphere / Americas", "technique": "copperplate engraving", "parent_work": "La Geografia di Claudio Tolomeo Alessandrino", "tradition": "Italian Ptolemaic cartography"}'),

('maps',
 'Septentrionalium Partium Nova Tabula',
 'Girolamo Ruscelli (after Nicolo Zeno), 1561. The first widely circulated copy of Zeno''s controversial 1558 map of the North Atlantic. Introduced the phantom islands of Frisland, Icaria, Drogeo, and Estotiland. Its inclusion in Ruscelli''s popular Ptolemy led Mercator, Ortelius, and Plancius to adopt the Zeno geography.',
 'reference',
 '{"cartographer": "Girolamo Ruscelli / Nicolo Zeno", "year": "1561", "region": "North Atlantic / Arctic / Phantom Islands", "technique": "copperplate engraving", "parent_work": "La Geografia di Claudio Tolomeo Alessandrino", "tradition": "Italian Ptolemaic cartography"}'),

('maps',
 'Tabula Novarum Insularum',
 'Sebastian Münster, 1540 (first edition), with editions through 1628. One of the most commonly encountered early maps of the Americas. From Münster''s Geographia and later Cosmographia. Woodcut. Shows the Americas with an oversized South America, ships, and sea monsters. The Cosmographia was the best-selling book of its era. Hundreds of editions.',
 'reference',
 '{"cartographer": "Sebastian Münster", "year": "1540-1628", "region": "Americas / Western Hemisphere", "technique": "woodcut", "parent_work": "Geographia / Cosmographia", "tradition": "German humanist cartography", "publisher": "Heinrich Petri, Basel"}'),

('maps',
 'Novae Insulae XXVI Nova Tabula',
 'Sebastian Münster, 1540. The earliest commonly acquirable map to show the entire Western Hemisphere. Woodcut from the Geographia/Cosmographia. Shows Japan (Zipangri) near the American coast, reflecting Columbian-era geography. Various editions with different verso text (Latin, German, French, Italian).',
 'reference',
 '{"cartographer": "Sebastian Münster", "year": "1540", "region": "Americas / Western Hemisphere", "technique": "woodcut", "parent_work": "Geographia / Cosmographia", "tradition": "German humanist cartography"}'),

('maps',
 'La Nuova Francia',
 'Giovanni Battista Ramusio (map attributed to Giacomo Gastaldi), 1556. Important map of eastern North America from Ramusio''s Delle Navigationi et Viaggi. Woodcut. Shows the first upstream conjunction of the Hudson and St. Lawrence rivers. The source map for Ruscelli''s later Tierra Nueva. Published in Venice.',
 'reference',
 '{"cartographer": "Giacomo Gastaldi / Giovanni Battista Ramusio", "year": "1556", "region": "Eastern North America / New France", "technique": "woodcut", "parent_work": "Delle Navigationi et Viaggi", "tradition": "Italian humanist cartography", "publisher": "Venice"}')

ON CONFLICT DO NOTHING;
