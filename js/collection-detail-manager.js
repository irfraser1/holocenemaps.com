// Detail sheet and tab rendering for collection.html.
let _detailMapId = null; // currently open detail panel map id
let _detailHistoryActive = false; // true when browser Back should close the detail panel

function _field(label, value, options = {}) {
  if (!_hasDetailValue(value)) return '';
  const full = options.full ? ' full' : '';
  return `<div class="detail-field${full}">
    <div class="detail-field-label">${_escapeDetail(label)}</div>
    <div class="detail-field-value">${_escapeDetail(value)}</div>
  </div>`;
}

function _tagField(label, value) {
  const items = _jsonList(value).map(item => typeof item === 'string' ? item : (item.label || item.title || item.name || JSON.stringify(item))).filter(Boolean);
  if (!items.length) return '';
  return `<div class="detail-field full">
    <div class="detail-field-label">${_escapeDetail(label)}</div>
    <div class="detail-tag-list">${items.map(item => `<span class="detail-tag">${_escapeDetail(item)}</span>`).join('')}</div>
  </div>`;
}

function _referenceField(label, value) {
  const refs = _jsonList(value);
  if (!refs.length) return '';
  const rendered = refs.map(ref => {
    if (typeof ref === 'string') return ref;
    return [ref.source, ref.citation, ref.url].filter(Boolean).join(' — ') || JSON.stringify(ref);
  }).join('\n');
  return _field(label, rendered, { full: true });
}

function _section(title, body, emptyText) {
  return `<div class="detail-section">
    <div class="detail-section-title">${_escapeDetail(title)}</div>
    ${body && body.trim() ? body : `<div class="detail-empty">${_escapeDetail(emptyText)}</div>`}
  </div>`;
}

function _documentRows(documents) {
  if (!documents || documents.length === 0) {
    return '<div class="detail-empty">No private documents have been attached yet. Invoices, COAs, condition reports, and provenance files will live here.</div>';
  }
  return documents.map(doc => `<div class="detail-doc-row">
    <div>
      <div class="detail-doc-title">${_escapeDetail(doc.title || 'Private document')}</div>
      <div class="detail-doc-meta">${_escapeDetail(doc.document_type || 'other')}${doc.mime_type ? ' · ' + _escapeDetail(doc.mime_type) : ''}</div>
    </div>
    <div class="detail-doc-meta">Private</div>
  </div>`).join('') + '<div class="detail-privacy-note">Documents are stored in the private map-documents bucket and are not exposed in public gallery pages.</div>';
}

function _renderDetailPanels(m, detail) {
  const catalog = detail.catalog || {};
  const notes = detail.notes || {};
  const documents = detail.documents || [];
  const title = catalog.display_title || m.title;
  const legacyNotes = !notes.user_notes && m.notes ? m.notes : '';
  const overview = _section('Core Record', `<div class="detail-field-grid">
      ${_field('Title', title, { full: true })}
      ${_field('Cartographer', m.cartographer)}
      ${_field('Year', m.year)}
      ${_field('Region', catalog.region)}
      ${_field('Act', actLabel(m.act))}
      ${_field('Status', statusLabel(m.status))}
      ${_field('Priority', stars(m.priority))}
      ${_field('Summary', catalog.summary, { full: true })}
      ${_tagField('Subject Tags', catalog.subject_tags)}
    </div>`, 'No expanded overview metadata has been added yet.');

  const catalogue = _section('Catalogue Details', `<div class="detail-field-grid">
      ${_field('Full Title Transcription', catalog.full_title_transcription, { full: true })}
      ${_field('Publisher', catalog.publisher)}
      ${_field('Engraver', catalog.engraver)}
      ${_field('Place of Publication', catalog.place_of_publication)}
      ${_field('Publication Source', catalog.publication_source)}
      ${_field('Edition', catalog.edition)}
      ${_field('State', catalog.state)}
      ${_field('Plate Number', catalog.plate_number)}
      ${_field('Map Type', catalog.map_type)}
      ${_field('Language', catalog.language)}
      ${_tagField('Alternate Titles', catalog.alternate_titles)}
      ${_referenceField('References', catalog.reference_entries)}
      ${_field('Bibliography Notes', catalog.bibliography_notes, { full: true })}
    </div>`, 'No catalogue metadata has been added yet.');

  const physical = _section('Physical Record', `<div class="detail-field-grid">
      ${_field('Physical Summary', catalog.physical_summary || catalog.condition_summary, { full: true })}
    </div>`, 'No physical description has been added yet.');

  const aiNotes = _section('Collector Notes', `<div class="detail-field-grid">
      ${_field('User Notes', notes.user_notes, { full: true })}
      ${legacyNotes ? _field('Legacy Notes', legacyNotes, { full: true }) : ''}
    </div>`, 'No collector notes have been separated yet.') +
    _section('AI Notes', `<div class="detail-field-grid">
      ${_field('AI Summary', notes.ai_summary, { full: true })}
      ${_field('Thesis Fit', notes.ai_thesis_fit, { full: true })}
      ${_field('Recommendation', notes.ai_recommendation)}
      ${_field('Confidence', notes.ai_confidence)}
      ${_referenceField('Uncertainties', notes.ai_uncertainties)}
      ${_referenceField('Sources', notes.ai_sources)}
      ${_field('Last Evaluated', notes.last_ai_evaluated_at ? new Date(notes.last_ai_evaluated_at).toLocaleString() : '')}
      ${_field('Model', notes.last_ai_model)}
    </div>`, 'No AI notes have been generated for this separated record yet.');

  const files = _section('Photos', '<div class="photo-strip" id="detail-photo-strip"><div style="font-family:\'Spectral\',serif;font-size:12px;color:var(--text-secondary);font-style:italic;">Loading photos…</div></div>', 'No photos have been added yet.') +
    _section('Private Documents', _documentRows(documents), 'No private documents have been attached yet.');

  const panels = { overview, catalogue, physical, ai: aiNotes, files };
  return Object.entries(panels).map(([key, body]) => `<div class="detail-panel${key === 'overview' ? ' active' : ''}" data-detail-panel="${key}">${body}</div>`).join('');
}

async function _loadMapDetailData(mapId) {
  const empty = { catalog: null, notes: null, documents: [] };
  try {
    const [catalogRes, notesRes, docsRes] = await Promise.all([
      db.from('map_catalog_details').select('*').eq('map_id', mapId).maybeSingle(),
      db.from('map_notes').select('*').eq('map_id', mapId).maybeSingle(),
      db.from('map_documents').select('id,map_id,user_id,document_type,title,file_url,storage_path,mime_type,file_size,notes,created_at').eq('map_id', mapId).order('created_at', { ascending: false })
    ]);
    return {
      catalog: catalogRes.data || null,
      notes: notesRes.data || null,
      documents: docsRes.data || []
    };
  } catch (e) {
    console.warn('Map detail metadata unavailable:', e);
    return empty;
  }
}

function setDetailTab(tabName) {
  document.querySelectorAll('.detail-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.detailTab === tabName));
  document.querySelectorAll('.detail-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.detailPanel === tabName));
}

async function toggleCard(id, options = {}) {
  const { pushHistory = true } = options;
  const m = maps.find(x => x.id === id);
  if (!m) return;
  _detailMapId = id;
  const detail = await _loadMapDetailData(id);
  const sheet = document.getElementById('detail-sheet');
  sheet.innerHTML = `
    <button class="detail-close" type="button" aria-label="Close map details" onclick="event.stopPropagation();closeDetail()" ontouchend="event.preventDefault();event.stopPropagation();closeDetail()">✕</button>
    ${m.image_url
      ? `<div class="detail-img-wrap">
           <img class="detail-image" id="detail-main-img" src="${_escapeDetail(m.image_url)}" alt="" onerror="this.outerHTML='<div class=\'detail-placeholder\'>No image available</div>'">
           <button class="detail-rotate-btn" id="detail-rotate-btn" onclick="_rotateCurrentImage()" title="Rotate 90°"><span class="rotate-symbol">↻</span><span class="rotate-label">Rotating</span></button>
         </div>`
      : '<div class="detail-placeholder" id="detail-main-img">No image available</div>'
    }
    <div class="detail-act">${_escapeDetail(actLabel(m.act))}${m.year ? ' · ' + _escapeDetail(m.year) : ''} · ${_escapeDetail(stars(m.priority))}</div>
    <div class="detail-title">${_escapeDetail(detail.catalog?.display_title || m.title)}</div>
    <div class="detail-meta">
      ${m.cartographer ? `<span class="detail-meta-item"><strong>${_escapeDetail(m.cartographer)}</strong></span>` : ''}
      ${m.year ? `<span class="detail-meta-item">${_escapeDetail(m.year)}</span>` : ''}
      ${detail.catalog?.region ? `<span class="detail-meta-item">${_escapeDetail(detail.catalog.region)}</span>` : ''}
      <span class="card-status cs-${_escapeDetail(m.status)}">${_escapeDetail(statusLabel(m.status))}</span>
    </div>
    ${(m.listing_url || m.url) ? `<a class="detail-listing-link" href="${_escapeDetail(m.listing_url || m.url)}" target="_blank" rel="noopener">View Listing →</a>` : (isUrl(m.dealer) ? `<a class="detail-listing-link" href="${_escapeDetail(normalizeUrl(m.dealer))}" target="_blank" rel="noopener">View Listing →</a>` : '')}
    <div class="detail-actions">
      ${(userThesis && userThesis.trim() !== '' && userThesis !== 'Antique and vintage maps') ? `<button class="btn-action btn-reeval" id="reeval-btn-${m.id}" onclick="reEvaluateMap('${m.id}')">Re-evaluate ↻</button>` : ''}
      <button class="btn-action" onclick="openChatForMap('${m.id}', '${(m.title||'').replace(/'/g,"\\'")}')">Ask Advisor</button>
      <button class="btn-action" onclick="closeDetail();openEdit('${m.id}')">Edit</button>
      <button class="btn-action btn-danger" onclick="closeDetail();deleteMap('${m.id}')">Remove</button>
    </div>
    <div class="reeval-status" id="reeval-status"></div>
    <div class="detail-tabs" role="tablist" aria-label="Map detail sections">
      <button class="detail-tab active" type="button" data-detail-tab="overview" onclick="setDetailTab('overview')">Overview</button>
      <button class="detail-tab" type="button" data-detail-tab="catalogue" onclick="setDetailTab('catalogue')">Catalogue</button>
      <button class="detail-tab" type="button" data-detail-tab="physical" onclick="setDetailTab('physical')">Physical</button>
      <button class="detail-tab" type="button" data-detail-tab="ai" onclick="setDetailTab('ai')">AI Notes</button>
      <button class="detail-tab" type="button" data-detail-tab="files" onclick="setDetailTab('files')">Photos & Files</button>
    </div>
    ${_renderDetailPanels(m, detail)}
  `;
  if (pushHistory && window.history && !window.history.state?.hmDetailMapId) {
    window.history.pushState({ hmDetailMapId: id }, '', window.location.pathname + window.location.search + '#map-' + id);
    _detailHistoryActive = true;
  } else {
    _detailHistoryActive = !!window.history.state?.hmDetailMapId;
  }
  const overlay = document.getElementById('detail-overlay');
  const alreadyOpen = overlay.classList.contains('open');
  if (!alreadyOpen) {
    window._panelScrollY = window.scrollY;
    document.body.classList.add('panel-open');
    document.body.style.top = `-${window._panelScrollY}px`;
    overlay.classList.add('open');
    _setupPanelTouch();
  }
  _loadDetailPhotoStrip(id, m.image_url);
}

function _onOverlayTouch(e) { e.preventDefault(); }
function _onSheetTouch(e) { e.stopPropagation(); }
function _setupPanelTouch() {
  const overlay = document.getElementById('detail-overlay');
  const sheet = document.getElementById('detail-sheet');
  overlay.addEventListener('touchmove', _onOverlayTouch, { passive: false });
  sheet.addEventListener('touchmove', _onSheetTouch, { passive: true });
}
function _teardownPanelTouch() {
  const overlay = document.getElementById('detail-overlay');
  const sheet = document.getElementById('detail-sheet');
  overlay.removeEventListener('touchmove', _onOverlayTouch);
  sheet.removeEventListener('touchmove', _onSheetTouch);
}

function closeDetail(options = {}) {
  const { skipHistory = false } = options;
  const overlay = document.getElementById('detail-overlay');
  if (!overlay.classList.contains('open')) return;
  _teardownPanelTouch();
  overlay.classList.remove('open');
  document.body.classList.remove('panel-open');
  document.body.style.top = '';
  window.scrollTo(0, window._panelScrollY || 0);
  _detailMapId = null;

  if (_detailHistoryActive && !skipHistory && window.history.state?.hmDetailMapId) {
    _detailHistoryActive = false;
    window.history.back();
    return;
  }

  _detailHistoryActive = false;
}

window.addEventListener('popstate', () => {
  const overlay = document.getElementById('detail-overlay');
  if (overlay?.classList.contains('open')) {
    closeDetail({ skipHistory: true });
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeDetail();
  }
});
