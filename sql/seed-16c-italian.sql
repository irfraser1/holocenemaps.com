INSERT INTO market_listings (category, title, description, source, metadata) VALUES

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
