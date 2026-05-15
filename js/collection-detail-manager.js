// Detail sheet and tab rendering for collection.html.
let _detailMapId = null; // currently open detail panel map id
let _detailHistoryActive = false; // true when browser Back should close the detail panel
let _detailCurrentMap = null;
let _detailCurrentData = null;
let _detailActiveTab = 'overview';
let _detailEditState = { tab: null, dirty: false, saving: false };

const DETAIL_EDITABLE_TABS = ['overview', 'catalogue', 'physical', 'ai'];

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
    return [ref.source, ref.citation, ref.url].filter(Boolean).join(' - ') || JSON.stringify(ref);
  }).join('\n');
  return _field(label, rendered, { full: true });
}

function _section(title, body, emptyText) {
  return `<div class="detail-section">
    <div class="detail-section-title">${_escapeDetail(title)}</div>
    ${body && body.trim() ? body : `<div class="detail-empty">${_escapeDetail(emptyText)}</div>`}
  </div>`;
}

function _fieldGridSection(title, fields, emptyText) {
  const body = fields.filter(field => field && field.trim()).join('');
  return _section(title, body ? `<div class="detail-field-grid">${body}</div>` : '', emptyText);
}

function _actionEmptySection(title, message, buttonLabel, tabName) {
  return `<div class="detail-section">
    <div class="detail-section-title">${_escapeDetail(title)}</div>
    <div class="detail-empty detail-empty-action">
      <div class="detail-empty-message">${_escapeDetail(message)}</div>
      <button class="detail-empty-cta" type="button" onclick="_startDetailEdit('${tabName}')">${_escapeDetail(buttonLabel)}</button>
    </div>
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

function _editValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function _cleanDetailText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function _parseDetailList(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (_) {
      // Fall through to line/comma parsing.
    }
  }
  return text.split(/\n|,/).map(item => item.trim()).filter(Boolean);
}

function _parseDetailAct(value, fallback) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['1', 'act 1', 'act i', 'i'].includes(text)) return 1;
  if (['2', 'act 2', 'act ii', 'ii'].includes(text)) return 2;
  if (['3', 'act 3', 'act iii', 'iii'].includes(text)) return 3;
  return fallback || 1;
}

function _parseDetailStatus(value, fallback) {
  const text = String(value ?? '').trim().toLowerCase();
  const labels = { owned: 'owned', negotiating: 'negotiating', target: 'target', watching: 'watching', passed: 'passed' };
  const fromLabel = { 'owned': 'owned', 'negotiating': 'negotiating', 'target': 'target', 'watching': 'watching', 'passed': 'passed' };
  return labels[text] || fromLabel[text] || fallback || 'watching';
}

function _parseDetailPriority(value, fallback) {
  const text = String(value ?? '').trim();
  const starCount = (text.match(/★/g) || []).length;
  if (starCount > 0) return Math.max(1, Math.min(5, starCount));
  const num = parseInt(text, 10);
  if (!Number.isNaN(num)) return Math.max(1, Math.min(5, num));
  return fallback || 3;
}

function _inputField(label, name, value, options = {}) {
  const full = options.full ? ' full' : '';
  const rows = options.rows || 3;
  const safeLabel = _escapeDetail(label);
  const safeName = _escapeDetail(name);
  const safeValue = _escapeDetail(_editValue(value));
  if (options.type === 'textarea') {
    return `<label class="detail-edit-field${full}">
      <span>${safeLabel}</span>
      <textarea name="${safeName}" rows="${rows}" oninput="_markDetailEditDirty()">${safeValue}</textarea>
    </label>`;
  }
  return `<label class="detail-edit-field${full}">
    <span>${safeLabel}</span>
    <input type="${_escapeDetail(options.type || 'text')}" name="${safeName}" value="${safeValue}" oninput="_markDetailEditDirty()">
  </label>`;
}

function _detailTabHasData(tabName, m, detail) {
  const catalog = detail.catalog || {};
  const notes = detail.notes || {};
  if (tabName === 'overview') {
    return [m.title, m.cartographer, m.year, catalog.region, m.act, m.status, m.priority, catalog.summary, catalog.subject_tags].some(_hasDetailValue);
  }
  if (tabName === 'catalogue') {
    return [
      catalog.full_title_transcription, catalog.publisher, catalog.engraver, catalog.place_of_publication,
      catalog.publication_source, catalog.edition, catalog.state, catalog.plate_number, catalog.map_type,
      catalog.language, catalog.alternate_titles, catalog.reference_entries, catalog.bibliography_notes
    ].some(_hasDetailValue);
  }
  if (tabName === 'physical') {
    return [catalog.physical_summary, catalog.condition_summary].some(_hasDetailValue);
  }
  if (tabName === 'ai') {
    return [
      notes.user_notes, m.notes, notes.ai_summary, notes.ai_thesis_fit, notes.ai_recommendation,
      notes.ai_confidence, notes.ai_uncertainties, notes.ai_sources, notes.last_ai_evaluated_at, notes.last_ai_model
    ].some(_hasDetailValue);
  }
  return false;
}

function _renderDetailTabControl(tabName, m, detail) {
  if (!DETAIL_EDITABLE_TABS.includes(tabName)) return '';
  const hasData = _detailTabHasData(tabName, m, detail);
  const label = hasData ? 'Edit' : 'Add details';
  return `<div class="detail-tab-control">
    <button class="detail-edit-toggle" type="button" onclick="_startDetailEdit('${tabName}')">${label}</button>
  </div>`;
}

function _renderEditShell(tabName, title, fields) {
  return `<form class="detail-edit-form" data-edit-tab="${_escapeDetail(tabName)}" onsubmit="event.preventDefault();">
    <div class="detail-edit-header">
      <div class="detail-section-title">${_escapeDetail(title)}</div>
      <div class="detail-edit-actions">
        <button class="btn-action" type="button" onclick="_cancelDetailEdit()">Cancel</button>
        <button class="btn-action detail-save-btn" type="button" onclick="_saveDetailEdit()" disabled>Save</button>
      </div>
    </div>
    <div class="detail-edit-grid">${fields}</div>
    <div class="detail-edit-status" aria-live="polite"></div>
  </form>`;
}

function _renderOverviewForm(m, detail) {
  const catalog = detail.catalog || {};
  return _renderEditShell('overview', 'Edit Overview', `
    ${_inputField('Title', 'title', catalog.display_title || m.title, { full: true })}
    ${_inputField('Cartographer', 'cartographer', m.cartographer)}
    ${_inputField('Year', 'year', m.year)}
    ${_inputField('Region', 'region', catalog.region)}
    ${_inputField('Act', 'act', actLabel(m.act))}
    ${_inputField('Status', 'status', statusLabel(m.status))}
    ${_inputField('Priority', 'priority', stars(m.priority))}
    ${_inputField('Summary', 'summary', catalog.summary, { full: true, type: 'textarea', rows: 4 })}
    ${_inputField('Subject Tags', 'subject_tags', catalog.subject_tags, { full: true, type: 'textarea', rows: 3 })}
  `);
}

function _renderCatalogueForm(detail) {
  const catalog = detail.catalog || {};
  return _renderEditShell('catalogue', 'Edit Catalogue Details', `
    ${_inputField('Full Title Transcription', 'full_title_transcription', catalog.full_title_transcription, { full: true, type: 'textarea', rows: 4 })}
    ${_inputField('Publisher', 'publisher', catalog.publisher)}
    ${_inputField('Engraver', 'engraver', catalog.engraver)}
    ${_inputField('Place of Publication', 'place_of_publication', catalog.place_of_publication)}
    ${_inputField('Publication Source', 'publication_source', catalog.publication_source)}
    ${_inputField('Edition', 'edition', catalog.edition)}
    ${_inputField('State', 'state', catalog.state)}
    ${_inputField('Plate Number', 'plate_number', catalog.plate_number)}
    ${_inputField('Map Type', 'map_type', catalog.map_type)}
    ${_inputField('Language', 'language', catalog.language)}
    ${_inputField('Alternate Titles', 'alternate_titles', catalog.alternate_titles, { full: true, type: 'textarea', rows: 3 })}
    ${_inputField('References', 'reference_entries', catalog.reference_entries, { full: true, type: 'textarea', rows: 4 })}
    ${_inputField('Bibliography Notes', 'bibliography_notes', catalog.bibliography_notes, { full: true, type: 'textarea', rows: 4 })}
  `);
}

function _renderPhysicalForm(detail) {
  const catalog = detail.catalog || {};
  return _renderEditShell('physical', 'Edit Physical Record', `
    ${_inputField('Physical Summary', 'physical_summary', catalog.physical_summary || catalog.condition_summary, { full: true, type: 'textarea', rows: 5 })}
  `);
}

function _renderAiForm(m, detail) {
  const notes = detail.notes || {};
  const legacyNotes = !notes.user_notes && m.notes ? m.notes : '';
  return _renderEditShell('ai', 'Edit AI Notes', `
    ${_inputField('User Notes', 'user_notes', notes.user_notes || legacyNotes, { full: true, type: 'textarea', rows: 4 })}
  `) + _fieldGridSection('AI Notes', [
    _field('AI Summary', notes.ai_summary, { full: true }),
    _field('Thesis Fit', notes.ai_thesis_fit, { full: true }),
    _field('Recommendation', notes.ai_recommendation),
    _field('Confidence', notes.ai_confidence),
    _referenceField('Uncertainties', notes.ai_uncertainties),
    _referenceField('Sources', notes.ai_sources),
    _field('Last Evaluated', notes.last_ai_evaluated_at ? new Date(notes.last_ai_evaluated_at).toLocaleString() : ''),
    _field('Model', notes.last_ai_model)
  ], 'No AI notes have been generated for this separated record yet.');
}

function _renderDetailPanels(m, detail, activeTab = 'overview') {
  const catalog = detail.catalog || {};
  const notes = detail.notes || {};
  const documents = detail.documents || [];
  const title = catalog.display_title || m.title;
  const legacyNotes = !notes.user_notes && m.notes ? m.notes : '';
  const editingTab = _detailEditState.tab;
  const overview = editingTab === 'overview' ? _renderOverviewForm(m, detail) : _renderDetailTabControl('overview', m, detail) +
    _fieldGridSection('Core Record', [
      _field('Title', title, { full: true }),
      _field('Cartographer', m.cartographer),
      _field('Year', m.year),
      _field('Region', catalog.region),
      _field('Act', actLabel(m.act)),
      _field('Status', statusLabel(m.status)),
      _field('Priority', stars(m.priority)),
      _field('Summary', catalog.summary, { full: true }),
      _tagField('Subject Tags', catalog.subject_tags)
    ], 'No expanded overview metadata has been added yet.');

  const catalogueFields = [
    _field('Full Title Transcription', catalog.full_title_transcription, { full: true }),
    _field('Publisher', catalog.publisher),
    _field('Engraver', catalog.engraver),
    _field('Place of Publication', catalog.place_of_publication),
    _field('Publication Source', catalog.publication_source),
    _field('Edition', catalog.edition),
    _field('State', catalog.state),
    _field('Plate Number', catalog.plate_number),
    _field('Map Type', catalog.map_type),
    _field('Language', catalog.language),
    _tagField('Alternate Titles', catalog.alternate_titles),
    _referenceField('References', catalog.reference_entries),
    _field('Bibliography Notes', catalog.bibliography_notes, { full: true })
  ];
  const hasCatalogueFields = catalogueFields.some(field => field && field.trim());
  const catalogue = editingTab === 'catalogue' ? _renderCatalogueForm(detail) : hasCatalogueFields
    ? _renderDetailTabControl('catalogue', m, detail) + _fieldGridSection('Catalogue Details', catalogueFields, 'No catalogue details added yet.')
    : _actionEmptySection('Catalogue Details', 'No catalogue details added yet.', 'Add catalogue details', 'catalogue');

  const physicalFields = [
    _field('Physical Summary', catalog.physical_summary || catalog.condition_summary, { full: true })
  ];
  const hasPhysicalFields = physicalFields.some(field => field && field.trim());
  const physical = editingTab === 'physical' ? _renderPhysicalForm(detail) : hasPhysicalFields
    ? _renderDetailTabControl('physical', m, detail) + _fieldGridSection('Physical Record', physicalFields, 'No physical details recorded yet.')
    : _actionEmptySection('Physical Record', 'No physical details recorded yet.', 'Add physical details', 'physical');

  const aiNotes = editingTab === 'ai' ? _renderAiForm(m, detail) : _renderDetailTabControl('ai', m, detail) +
    _fieldGridSection('Collector Notes', [
      _field('User Notes', notes.user_notes, { full: true }),
      legacyNotes ? _field('Legacy Notes', legacyNotes, { full: true }) : ''
    ], 'No collector notes have been separated yet.') +
    _fieldGridSection('AI Notes', [
      _field('AI Summary', notes.ai_summary, { full: true }),
      _field('Thesis Fit', notes.ai_thesis_fit, { full: true }),
      _field('Recommendation', notes.ai_recommendation),
      _field('Confidence', notes.ai_confidence),
      _referenceField('Uncertainties', notes.ai_uncertainties),
      _referenceField('Sources', notes.ai_sources),
      _field('Last Evaluated', notes.last_ai_evaluated_at ? new Date(notes.last_ai_evaluated_at).toLocaleString() : ''),
      _field('Model', notes.last_ai_model)
    ], 'No AI notes have been generated for this separated record yet.');

  const files = _section('Photos', '<div class="photo-strip" id="detail-photo-strip"><div style="font-family:\'Spectral\',serif;font-size:12px;color:var(--text-secondary);font-style:italic;">Loading photos...</div></div>', 'No photos have been added yet.') +
    _section('Private Documents', _documentRows(documents), 'No private documents have been attached yet.');

  const panels = { overview, catalogue, physical, ai: aiNotes, files };
  return Object.entries(panels).map(([key, body]) => `<div class="detail-panel${key === activeTab ? ' active' : ''}" data-detail-panel="${key}">${body}</div>`).join('');
}

function _renderDetailPanelContainer() {
  const container = document.getElementById('detail-panel-container');
  if (!container || !_detailCurrentMap || !_detailCurrentData) return;
  container.innerHTML = _renderDetailPanels(_detailCurrentMap, _detailCurrentData, _detailActiveTab);
  if (_detailMapId && typeof _loadDetailPhotoStrip === 'function') {
    _loadDetailPhotoStrip(_detailMapId, _detailCurrentMap.image_url);
  }
}

async function _confirmDiscardDetailEdit() {
  if (!_detailEditState.tab || !_detailEditState.dirty) return true;
  return hmConfirm('Discard unsaved edits and return to the read-only view?', {
    title: 'Discard changes?',
    icon: '⚠',
    iconType: 'warn',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep Editing',
    confirmStyle: 'danger'
  });
}

async function _discardDetailEditIfAllowed() {
  const ok = await _confirmDiscardDetailEdit();
  if (!ok) return false;
  _detailEditState = { tab: null, dirty: false, saving: false };
  return true;
}

function _markDetailEditDirty() {
  if (!_detailEditState.tab) return;
  _detailEditState.dirty = true;
  const form = document.querySelector(`.detail-edit-form[data-edit-tab="${_detailEditState.tab}"]`);
  const saveBtn = form?.querySelector('.detail-save-btn');
  if (saveBtn) saveBtn.disabled = false;
  const status = form?.querySelector('.detail-edit-status');
  if (status) {
    status.textContent = '';
    status.className = 'detail-edit-status';
  }
}

async function _startDetailEdit(tabName) {
  if (!DETAIL_EDITABLE_TABS.includes(tabName)) return;
  if (_detailEditState.tab && _detailEditState.tab !== tabName) {
    const ok = await _discardDetailEditIfAllowed();
    if (!ok) return;
  }
  _detailActiveTab = tabName;
  _detailEditState = { tab: tabName, dirty: false, saving: false };
  _renderDetailPanelContainer();
  setDetailTab(tabName, { skipDirtyCheck: true });
}

async function _cancelDetailEdit() {
  const ok = await _discardDetailEditIfAllowed();
  if (!ok) return;
  _renderDetailPanelContainer();
}

async function _openMapEditFromDetail(id) {
  const closed = await closeDetail();
  if (closed === false) return;
  openEdit(id);
}

async function _deleteMapFromDetail(id) {
  const closed = await closeDetail();
  if (closed === false) return;
  deleteMap(id);
}

function _detailFormValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function _setDetailEditSaving(form, saving) {
  _detailEditState.saving = saving;
  form.querySelectorAll('input, textarea, button').forEach(el => {
    if (el.classList.contains('detail-save-btn')) {
      el.disabled = saving || !_detailEditState.dirty;
    } else {
      el.disabled = saving;
    }
  });
}

function _setDetailEditStatus(form, message, type = '') {
  const status = form.querySelector('.detail-edit-status');
  if (!status) return;
  status.textContent = message;
  status.className = `detail-edit-status${type ? ' ' + type : ''}`;
}

async function _detailUserId() {
  const { data: { user } } = await db.auth.getUser();
  if (!user?.id) throw new Error('Sign in again to save changes.');
  return user.id;
}

async function _saveOverviewDetail(values, userId) {
  const title = _cleanDetailText(values.title);
  if (!title) throw new Error('Title is required.');
  const mapPayload = {
    title,
    cartographer: _cleanDetailText(values.cartographer),
    year: _cleanDetailText(values.year),
    act: _parseDetailAct(values.act, _detailCurrentMap?.act),
    status: _parseDetailStatus(values.status, _detailCurrentMap?.status),
    priority: _parseDetailPriority(values.priority, _detailCurrentMap?.priority)
  };
  const catalogPayload = {
    map_id: _detailMapId,
    user_id: userId,
    region: _cleanDetailText(values.region),
    summary: _cleanDetailText(values.summary),
    subject_tags: _parseDetailList(values.subject_tags),
    updated_at: new Date().toISOString()
  };
  const mapRes = await db.from('maps').update(mapPayload).eq('id', _detailMapId).select('*').single();
  if (mapRes.error) throw mapRes.error;
  const catalogRes = await db.from('map_catalog_details').upsert(catalogPayload, { onConflict: 'map_id' }).select('*').single();
  if (catalogRes.error) throw catalogRes.error;
  return { map: mapRes.data, catalog: catalogRes.data };
}

async function _saveCatalogueDetail(values, userId) {
  const catalogPayload = {
    map_id: _detailMapId,
    user_id: userId,
    full_title_transcription: _cleanDetailText(values.full_title_transcription),
    publisher: _cleanDetailText(values.publisher),
    engraver: _cleanDetailText(values.engraver),
    place_of_publication: _cleanDetailText(values.place_of_publication),
    publication_source: _cleanDetailText(values.publication_source),
    edition: _cleanDetailText(values.edition),
    state: _cleanDetailText(values.state),
    plate_number: _cleanDetailText(values.plate_number),
    map_type: _cleanDetailText(values.map_type),
    language: _cleanDetailText(values.language),
    alternate_titles: _parseDetailList(values.alternate_titles),
    reference_entries: _parseDetailList(values.reference_entries),
    bibliography_notes: _cleanDetailText(values.bibliography_notes),
    updated_at: new Date().toISOString()
  };
  const res = await db.from('map_catalog_details').upsert(catalogPayload, { onConflict: 'map_id' }).select('*').single();
  if (res.error) throw res.error;
  return { catalog: res.data };
}

async function _savePhysicalDetail(values, userId) {
  const catalogPayload = {
    map_id: _detailMapId,
    user_id: userId,
    physical_summary: _cleanDetailText(values.physical_summary),
    updated_at: new Date().toISOString()
  };
  const res = await db.from('map_catalog_details').upsert(catalogPayload, { onConflict: 'map_id' }).select('*').single();
  if (res.error) throw res.error;
  return { catalog: res.data };
}

async function _saveAiUserNotes(values, userId) {
  const notesPayload = {
    map_id: _detailMapId,
    user_id: userId,
    user_notes: _cleanDetailText(values.user_notes),
    updated_at: new Date().toISOString()
  };
  const res = await db.from('map_notes').upsert(notesPayload, { onConflict: 'map_id' }).select('*').single();
  if (res.error) throw res.error;
  return { notes: res.data };
}

async function _saveDetailEdit() {
  const tabName = _detailEditState.tab;
  const form = document.querySelector(`.detail-edit-form[data-edit-tab="${tabName}"]`);
  if (!tabName || !form || !_detailMapId || _detailEditState.saving || !_detailEditState.dirty) return;
  const values = _detailFormValues(form);
  _setDetailEditStatus(form, 'Saving...');
  _setDetailEditSaving(form, true);
  try {
    const userId = await _detailUserId();
    let saved = {};
    if (tabName === 'overview') saved = await _saveOverviewDetail(values, userId);
    else if (tabName === 'catalogue') saved = await _saveCatalogueDetail(values, userId);
    else if (tabName === 'physical') saved = await _savePhysicalDetail(values, userId);
    else if (tabName === 'ai') saved = await _saveAiUserNotes(values, userId);
    else throw new Error('This tab cannot be saved.');

    if (saved.map) {
      const idx = maps.findIndex(map => map.id === _detailMapId);
      if (idx >= 0) maps[idx] = { ...maps[idx], ...saved.map };
      _detailCurrentMap = idx >= 0 ? maps[idx] : { ..._detailCurrentMap, ...saved.map };
      renderList();
    }
    if (saved.catalog) _detailCurrentData.catalog = saved.catalog;
    if (saved.notes) _detailCurrentData.notes = saved.notes;
    _detailEditState = { tab: null, dirty: false, saving: false };
    _renderDetailPanelContainer();
    setDetailTab(tabName, { skipDirtyCheck: true });
    hmAlert('Changes saved.', { title: 'Saved', icon: '✓', iconType: 'info' });
  } catch (e) {
    console.error('Detail save failed:', e);
    _setDetailEditSaving(form, false);
    _setDetailEditStatus(form, e.message || 'Save failed. Try again.', 'error');
  }
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

async function setDetailTab(tabName, options = {}) {
  if (!options.skipDirtyCheck && tabName !== _detailActiveTab) {
    const ok = await _discardDetailEditIfAllowed();
    if (!ok) return;
    _renderDetailPanelContainer();
  }
  _detailActiveTab = tabName;
  document.querySelectorAll('.detail-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.detailTab === tabName));
  document.querySelectorAll('.detail-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.detailPanel === tabName));
}

async function toggleCard(id, options = {}) {
  const { pushHistory = true } = options;
  const m = maps.find(x => x.id === id);
  if (!m) return;
  _detailMapId = id;
  _detailCurrentMap = m;
  _detailCurrentData = await _loadMapDetailData(id);
  _detailActiveTab = 'overview';
  _detailEditState = { tab: null, dirty: false };
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
    <div class="detail-title">${_escapeDetail(_detailCurrentData.catalog?.display_title || m.title)}</div>
    <div class="detail-meta">
      ${m.cartographer ? `<span class="detail-meta-item"><strong>${_escapeDetail(m.cartographer)}</strong></span>` : ''}
      ${m.year ? `<span class="detail-meta-item">${_escapeDetail(m.year)}</span>` : ''}
      ${_detailCurrentData.catalog?.region ? `<span class="detail-meta-item">${_escapeDetail(_detailCurrentData.catalog.region)}</span>` : ''}
      <span class="card-status cs-${_escapeDetail(m.status)}">${_escapeDetail(statusLabel(m.status))}</span>
    </div>
    ${(m.listing_url || m.url) ? `<a class="detail-listing-link" href="${_escapeDetail(m.listing_url || m.url)}" target="_blank" rel="noopener">View Listing →</a>` : (isUrl(m.dealer) ? `<a class="detail-listing-link" href="${_escapeDetail(normalizeUrl(m.dealer))}" target="_blank" rel="noopener">View Listing →</a>` : '')}
    <div class="detail-actions">
      ${(userThesis && userThesis.trim() !== '' && userThesis !== 'Antique and vintage maps') ? `<button class="btn-action btn-reeval" id="reeval-btn-${m.id}" onclick="reEvaluateMap('${m.id}')">Re-evaluate ↻</button>` : ''}
      <button class="btn-action" onclick="openChatForMap('${m.id}', '${(m.title||'').replace(/'/g,"\\'")}')">Ask Advisor</button>
      <button class="btn-action" onclick="_openMapEditFromDetail('${m.id}')">Edit</button>
      <button class="btn-action btn-danger" onclick="_deleteMapFromDetail('${m.id}')">Remove</button>
    </div>
    <div class="reeval-status" id="reeval-status"></div>
    <div class="detail-tabs" role="tablist" aria-label="Map detail sections">
      <button class="detail-tab active" type="button" data-detail-tab="overview" onclick="setDetailTab('overview')">Overview</button>
      <button class="detail-tab" type="button" data-detail-tab="catalogue" onclick="setDetailTab('catalogue')">Catalogue</button>
      <button class="detail-tab" type="button" data-detail-tab="physical" onclick="setDetailTab('physical')">Physical</button>
      <button class="detail-tab" type="button" data-detail-tab="ai" onclick="setDetailTab('ai')">AI Notes</button>
      <button class="detail-tab" type="button" data-detail-tab="files" onclick="setDetailTab('files')">Photos & Files</button>
    </div>
    <div id="detail-panel-container">
      ${_renderDetailPanels(m, _detailCurrentData, _detailActiveTab)}
    </div>
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

async function closeDetail(options = {}) {
  const { skipHistory = false, force = false } = options;
  const overlay = document.getElementById('detail-overlay');
  if (!overlay.classList.contains('open')) return;
  if (!force) {
    const ok = await _discardDetailEditIfAllowed();
    if (!ok) return false;
  }
  _teardownPanelTouch();
  overlay.classList.remove('open');
  document.body.classList.remove('panel-open');
  document.body.style.top = '';
  window.scrollTo(0, window._panelScrollY || 0);
  _detailMapId = null;
  _detailCurrentMap = null;
  _detailCurrentData = null;
  _detailActiveTab = 'overview';
  _detailEditState = { tab: null, dirty: false, saving: false };

  if (_detailHistoryActive && !skipHistory && window.history.state?.hmDetailMapId) {
    _detailHistoryActive = false;
    window.history.back();
    return true;
  }

  _detailHistoryActive = false;
  return true;
}

window.addEventListener('popstate', () => {
  const overlay = document.getElementById('detail-overlay');
  if (!overlay?.classList.contains('open')) return;
  if (_detailEditState.tab && _detailEditState.dirty) {
    const discard = window.confirm('Discard unsaved edits and close this detail view?');
    if (!discard) {
      if (_detailMapId) window.history.pushState({ hmDetailMapId: _detailMapId }, '', window.location.pathname + window.location.search + '#map-' + _detailMapId);
      _detailHistoryActive = true;
      return;
    }
  }
  closeDetail({ skipHistory: true, force: true });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeDetail();
  }
});
