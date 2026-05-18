(function(global) {
  const EMPTY_SUMMARY = {
    missingReferences: 0,
    missingPhysicalDetails: 0,
    missingPhotos: 0,
    needsAiReview: 0,
    missingThesisFit: 0,
    incompleteCatalogue: 0,
    missingCoreIdentity: 0,
    watchlistNeedsReview: 0,
    lowConfidenceAi: 0
  };

  function createCollectionHealthState(overrides = {}) {
    return {
      loading: false,
      loaded: false,
      error: null,
      summary: { ...EMPTY_SUMMARY },
      issuesByMapId: {},
      ...overrides
    };
  }

  function hasText(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function hasListValue(value) {
    if (Array.isArray(value)) return value.some(item => hasText(item) || (item && typeof item === 'object' && Object.values(item).some(hasText)));
    if (value && typeof value === 'object') return Object.values(value).some(hasText);
    return hasText(value);
  }

  function groupRowsByMapId(rows) {
    const grouped = {};
    (rows || []).forEach(row => {
      if (!row?.map_id) return;
      if (!grouped[row.map_id]) grouped[row.map_id] = [];
      grouped[row.map_id].push(row);
    });
    return grouped;
  }

  function indexRowsByMapId(rows) {
    const indexed = {};
    (rows || []).forEach(row => {
      if (row?.map_id && !indexed[row.map_id]) indexed[row.map_id] = row;
    });
    return indexed;
  }

  function hasStructuredReferences(references) {
    return (references || []).some(ref => hasText(ref.citation));
  }

  function hasLegacyReferences(catalog) {
    return hasListValue(catalog?.reference_entries) || hasText(catalog?.bibliography_notes);
  }

  function hasStructuredPhysical(physical) {
    if (!physical) return false;
    return [
      physical.sheet_width, physical.sheet_height, physical.image_width, physical.image_height,
      physical.plate_width, physical.plate_height, physical.medium, physical.materials,
      physical.coloring, physical.coloring_notes, physical.condition_grade, physical.condition_summary,
      physical.condition_details, physical.margins, physical.backing_lining, physical.restoration_notes,
      physical.framing_status, physical.inspected_at
    ].some(value => value !== null && value !== undefined && String(value).trim() !== '');
  }

  function hasCatalogueDetail(catalog) {
    if (!catalog) return false;
    return [
      catalog.display_title, catalog.full_title_transcription, catalog.region, catalog.map_type,
      catalog.language, catalog.publisher, catalog.engraver, catalog.place_of_publication,
      catalog.publication_source, catalog.edition, catalog.state, catalog.plate_number,
      catalog.summary, catalog.subject_tags, catalog.alternate_titles
    ].some(hasListValue);
  }

  function hasAiReview(notes) {
    if (!notes) return false;
    return [
      notes.ai_summary,
      notes.ai_thesis_fit,
      notes.ai_recommendation,
      notes.last_ai_evaluated_at
    ].some(hasText);
  }

  function isLowConfidence(notes) {
    if (!hasText(notes?.ai_confidence)) return false;
    return ['low', 'uncertain', 'unresolved'].includes(notes.ai_confidence.trim().toLowerCase());
  }

  function buildCollectionHealth(maps, signals = {}) {
    const catalogByMap = indexRowsByMapId(signals.catalogs);
    const physicalByMap = indexRowsByMapId(signals.physical);
    const notesByMap = indexRowsByMapId(signals.notes);
    const referencesByMap = groupRowsByMapId(signals.references);
    const imagesByMap = groupRowsByMapId(signals.images);
    const summary = { ...EMPTY_SUMMARY };
    const issuesByMapId = {};

    (maps || []).forEach(map => {
      if (!map?.id) return;
      const catalog = catalogByMap[map.id];
      const physical = physicalByMap[map.id];
      const notes = notesByMap[map.id];
      const references = referencesByMap[map.id] || [];
      const images = imagesByMap[map.id] || [];

      const issues = {
        missingReferences: !hasStructuredReferences(references) && !hasLegacyReferences(catalog),
        missingPhysicalDetails: !hasStructuredPhysical(physical) && !hasText(catalog?.physical_summary),
        missingPhotos: !hasText(map.image_url) && images.length === 0,
        needsAiReview: !hasAiReview(notes),
        missingThesisFit: !hasText(notes?.ai_thesis_fit),
        incompleteCatalogue: !hasCatalogueDetail(catalog),
        missingCoreIdentity: !hasText(map.cartographer) || !hasText(map.year),
        watchlistNeedsReview: map.status === 'watching',
        lowConfidenceAi: isLowConfidence(notes)
      };

      Object.entries(issues).forEach(([key, active]) => {
        if (active) summary[key] += 1;
      });
      issuesByMapId[map.id] = issues;
    });

    return createCollectionHealthState({
      loaded: true,
      summary,
      issuesByMapId
    });
  }

  async function safeHealthQuery(label, query, fallback = []) {
    try {
      const res = await query;
      if (res.error) {
        console.warn(`${label} health signal unavailable`, res.error);
        return fallback;
      }
      return res.data || fallback;
    } catch (error) {
      console.warn(`${label} health signal unavailable`, error);
      return fallback;
    }
  }

  async function loadCollectionHealth(db, maps) {
    const mapIds = (maps || []).map(map => map.id).filter(Boolean);
    if (!mapIds.length) return buildCollectionHealth([], {});

    try {
      const [catalogs, references, physical, notes, images] = await Promise.all([
        safeHealthQuery('Catalogue', db.from('map_catalog_details')
          .select('map_id,display_title,full_title_transcription,alternate_titles,region,subject_tags,map_type,language,publisher,engraver,place_of_publication,publication_source,edition,state,plate_number,reference_entries,bibliography_notes,summary,physical_summary')
          .in('map_id', mapIds)),
        safeHealthQuery('References', db.from('map_references')
          .select('map_id,citation')
          .in('map_id', mapIds)),
        safeHealthQuery('Physical details', db.from('map_physical_details')
          .select('map_id,sheet_width,sheet_height,image_width,image_height,plate_width,plate_height,medium,materials,coloring,coloring_notes,condition_grade,condition_summary,condition_details,margins,backing_lining,restoration_notes,framing_status,inspected_at')
          .in('map_id', mapIds)),
        safeHealthQuery('AI notes', db.from('map_notes')
          .select('map_id,ai_summary,ai_thesis_fit,ai_recommendation,ai_confidence,last_ai_evaluated_at')
          .in('map_id', mapIds)),
        safeHealthQuery('Photos', db.from('map_images')
          .select('map_id,id')
          .in('map_id', mapIds))
      ]);

      return buildCollectionHealth(maps, { catalogs, references, physical, notes, images });
    } catch (error) {
      console.warn('Collection health unavailable', error);
      return createCollectionHealthState({
        loaded: false,
        error
      });
    }
  }

  function getCollectionHealthSummary(state) {
    return state?.summary || EMPTY_SUMMARY;
  }

  function getMapAttentionItems(state, mapId) {
    return state?.issuesByMapId?.[mapId] || {};
  }

  global.createCollectionHealthState = createCollectionHealthState;
  global.loadCollectionHealth = loadCollectionHealth;
  global.buildCollectionHealth = buildCollectionHealth;
  global.getCollectionHealthSummary = getCollectionHealthSummary;
  global.getMapAttentionItems = getMapAttentionItems;
})(window);
