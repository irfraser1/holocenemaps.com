// Detail sheet and tab rendering for collection.html.
let _detailMapId = null; // currently open detail panel map id
let _detailHistoryActive = false; // true when browser Back should close the detail panel
let _detailCurrentMap = null;
let _detailCurrentData = null;
let _detailActiveTab = 'overview';
let _detailEditState = { tab: null, dirty: false, saving: false };

const DETAIL_EDITABLE_TABS = ['overview', 'catalogue', 'physical', 'ai'];
const DETAIL_PHYSICAL_DEBUG_MAP_ID = '998384c6-9210-4540-a1f0-abf909b77705';
const DETAIL_REFERENCE_TYPES = [
  { value: '', label: 'Unspecified' },
  { value: 'bibliography', label: 'Bibliography' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'institutional_catalog', label: 'Institutional Catalog' },
  { value: 'auction_record', label: 'Auction Record' },
  { value: 'collection_catalog', label: 'Collection Catalog' },
  { value: 'article', label: 'Article' },
  { value: 'book', label: 'Book' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' }
];
const DETAIL_PROVENANCE_TYPES = [
  { value: '', label: 'Unspecified' },
  { value: 'acquired', label: 'Acquired by Collector' },
  { value: 'ownership', label: 'Ownership' },
  { value: 'dealer_listing', label: 'Dealer Listing' },
  { value: 'auction', label: 'Auction' },
  { value: 'restoration', label: 'Restoration / Conservation' },
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'appraisal', label: 'Appraisal' },
  { value: 'other', label: 'Other' }
];
const DETAIL_CONFIDENCE_OPTIONS = [
  { value: '', label: 'Unspecified' },
  { value: 'documented', label: 'Documented' },
  { value: 'probable', label: 'Probable' },
  { value: 'possible', label: 'Possible' },
  { value: 'unknown', label: 'Unknown' }
];

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

function _referenceTypeLabel(value) {
  const labels = {
    bibliography: 'Bibliography',
    dealer: 'Dealer',
    institutional_catalog: 'Institutional Catalog',
    auction_record: 'Auction Record',
    collection_catalog: 'Collection Catalog',
    article: 'Article',
    book: 'Book',
    website: 'Website',
    other: 'Other'
  };
  return labels[value] || value;
}

function _provenanceTypeLabel(value) {
  const option = DETAIL_PROVENANCE_TYPES.find(item => item.value === value);
  return option?.label || value;
}

function _confidenceLabel(value) {
  const option = DETAIL_CONFIDENCE_OPTIONS.find(item => item.value === value);
  return option?.label || value;
}

function _formatDetailMoney(amount, currency = 'USD') {
  if (!_hasDetailValue(amount)) return '';
  const code = currency || 'USD';
  const num = Number(amount);
  if (!Number.isFinite(num)) return `${amount}${code ? ' ' + code : ''}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: num % 1 === 0 ? 0 : 2
    }).format(num);
  } catch (_) {
    return `${num}${code ? ' ' + code : ''}`;
  }
}

function _detailDocumentLabel(id, documents = []) {
  if (!id) return '';
  const doc = documents.find(item => item.id === id);
  return doc ? (doc.title || doc.document_type || 'Private document') : 'Linked private document';
}

function _detailReferenceLabel(id, references = []) {
  if (!id) return '';
  const ref = references.find(item => item.id === id);
  return ref ? ref.citation : 'Linked reference';
}

function _documentOptions(documents = []) {
  return [{ value: '', label: 'No linked document' }].concat((documents || []).map(doc => ({
    value: doc.id,
    label: doc.title || doc.document_type || 'Private document'
  })));
}

function _referenceOptions(references = []) {
  return [{ value: '', label: 'No linked reference' }].concat((references || []).map(ref => ({
    value: ref.id,
    label: ref.citation || ref.title || 'Reference'
  })));
}

function _structuredReferenceRows(references) {
  const refs = Array.isArray(references) ? references : [];
  if (!refs.length) return '';
  return refs.map(ref => {
    const meta = [
      _referenceTypeLabel(ref.reference_type),
      ref.author,
      ref.title,
      ref.publisher,
      ref.year,
      ref.page_or_entry
    ].filter(_hasDetailValue).map(_escapeDetail).join(' · ');
    const citation = ref.url
      ? `<a href="${_escapeDetail(ref.url)}" target="_blank" rel="noopener">${_escapeDetail(ref.citation)}</a>`
      : _escapeDetail(ref.citation);
    return `<div class="detail-doc-row detail-reference-row">
      <div>
        <div class="detail-doc-title">${citation}</div>
        ${meta ? `<div class="detail-doc-meta">${meta}</div>` : ''}
        ${_hasDetailValue(ref.notes) ? `<div class="detail-doc-meta">${_escapeDetail(ref.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function _referenceEditBlock(ref = {}) {
  const idAttr = ref.id ? ` data-reference-id="${_escapeDetail(ref.id)}"` : '';
  return `<div class="detail-reference-edit" data-reference-block${idAttr}>
    <div class="detail-reference-edit-head">
      <div class="detail-edit-group-title">Reference</div>
      <button class="btn-action btn-danger" type="button" onclick="_removeReferenceBlock(this)">Delete</button>
    </div>
    <div class="detail-reference-edit-grid">
      ${_inputField('Citation', 'ref_citation', ref.citation, { full: true })}
      ${_selectField('Type', 'ref_reference_type', ref.reference_type, DETAIL_REFERENCE_TYPES)}
      ${_inputField('Author', 'ref_author', ref.author)}
      ${_inputField('Title', 'ref_title', ref.title)}
      ${_inputField('Publisher', 'ref_publisher', ref.publisher)}
      ${_inputField('Year', 'ref_year', ref.year)}
      ${_inputField('Page / Entry', 'ref_page_or_entry', ref.page_or_entry)}
      ${_inputField('URL', 'ref_url', ref.url, { full: true })}
      ${_inputField('Notes', 'ref_notes', ref.notes, { full: true, type: 'textarea', rows: 3 })}
    </div>
  </div>`;
}

function _renderStructuredReferenceEditor(references) {
  const refs = Array.isArray(references) ? references : [];
  const blocks = refs.map(ref => _referenceEditBlock(ref)).join('');
  return `<div class="detail-reference-editor full">
    <div class="detail-reference-editor-head">
      <div class="detail-section-title">Structured References</div>
      <button class="detail-edit-toggle" type="button" onclick="_addReferenceBlock(this)">Add reference</button>
    </div>
    <div class="detail-reference-blocks" data-reference-blocks>
      ${blocks || '<div class="detail-empty">No structured references added yet.</div>'}
    </div>
  </div>`;
}

function _acquisitionRows(acquisitions, detail) {
  const rows = Array.isArray(acquisitions) ? acquisitions : [];
  if (!rows.length) {
    return `<div class="detail-empty detail-empty-action">
      <div class="detail-empty-message">No acquisition record yet. If this map is owned, record where it came from, when you acquired it, and what you paid.</div>
      <button class="detail-empty-cta" type="button" onclick="_startDetailEdit('physical')">Add acquisition</button>
    </div>`;
  }
  return rows.map(acq => {
    const evidence = [
      acq.document_id ? `Document: ${_detailDocumentLabel(acq.document_id, detail.documents)}` : '',
      acq.listing_url ? 'Listing URL' : ''
    ].filter(Boolean).join(' · ');
    return `<div class="detail-doc-row">
      <div>
        <div class="detail-doc-title">${_escapeDetail(acq.event_date || 'Acquisition')}</div>
        <div class="detail-doc-meta">${[
          acq.seller_name,
          _formatDetailMoney(acq.price_amount, acq.price_currency),
          evidence ? `Source / Evidence: ${evidence}` : ''
        ].filter(_hasDetailValue).map(_escapeDetail).join(' · ')}</div>
        ${acq.listing_url ? `<div class="detail-doc-meta"><a href="${_escapeDetail(acq.listing_url)}" target="_blank" rel="noopener">View listing</a></div>` : ''}
        ${_hasDetailValue(acq.notes) ? `<div class="detail-doc-meta">${_escapeDetail(acq.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function _provenanceRows(provenance, detail) {
  const rows = Array.isArray(provenance) ? provenance : [];
  if (!rows.length) {
    return `<div class="detail-empty detail-empty-action">
      <div class="detail-empty-message">No provenance events recorded yet. It is fine to leave provenance blank until you have evidence.</div>
      <button class="detail-empty-cta" type="button" onclick="_startDetailEdit('physical')">Add provenance event</button>
    </div>`;
  }
  return rows.map(event => {
    const evidence = [
      event.source_reference_id ? `Reference: ${_detailReferenceLabel(event.source_reference_id, detail.references)}` : '',
      event.source_document_id ? `Document: ${_detailDocumentLabel(event.source_document_id, detail.documents)}` : ''
    ].filter(Boolean).join(' · ');
    const title = [
      event.event_date_text,
      _provenanceTypeLabel(event.event_type)
    ].filter(_hasDetailValue).join(' · ') || 'Provenance event';
    return `<div class="detail-doc-row">
      <div>
        <div class="detail-doc-title">${_escapeDetail(title)}</div>
        <div class="detail-doc-meta">${[
          event.party_name,
          event.place,
          event.confidence ? `Confidence: ${_confidenceLabel(event.confidence)}` : '',
          evidence ? `Source / Evidence: ${evidence}` : ''
        ].filter(_hasDetailValue).map(_escapeDetail).join(' · ')}</div>
        ${_hasDetailValue(event.notes) ? `<div class="detail-doc-meta">${_escapeDetail(event.notes)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function _acquisitionEditBlock(acq = {}, detail = {}) {
  const idAttr = acq.id ? ` data-acquisition-id="${_escapeDetail(acq.id)}"` : '';
  return `<div class="detail-reference-edit" data-acquisition-block${idAttr}>
    <div class="detail-reference-edit-head">
      <div class="detail-edit-group-title">Acquisition</div>
      <button class="btn-action btn-danger" type="button" onclick="_removeAcquisitionBlock(this)">Delete</button>
    </div>
    <div class="detail-reference-edit-grid">
      ${_inputField('Acquired Date', 'acq_event_date', acq.event_date, { type: 'date' })}
      ${_inputField('Seller', 'acq_seller_name', acq.seller_name)}
      ${_inputField('Price Amount', 'acq_price_amount', acq.price_amount)}
      ${_inputField('Currency', 'acq_price_currency', acq.price_currency || 'USD')}
      ${_inputField('Listing URL', 'acq_listing_url', acq.listing_url, { full: true })}
      ${_selectField('Source / Evidence Document', 'acq_document_id', acq.document_id, _documentOptions(detail.documents), { full: true })}
      ${_inputField('Notes', 'acq_notes', acq.notes, { full: true, type: 'textarea', rows: 3 })}
    </div>
  </div>`;
}

function _provenanceEditBlock(event = {}, detail = {}, index = 0) {
  const idAttr = event.id ? ` data-provenance-id="${_escapeDetail(event.id)}"` : '';
  return `<div class="detail-reference-edit" data-provenance-block${idAttr}>
    <div class="detail-reference-edit-head">
      <div class="detail-edit-group-title">Provenance Event</div>
      <button class="btn-action btn-danger" type="button" onclick="_removeProvenanceBlock(this)">Delete</button>
    </div>
    <div class="detail-reference-edit-grid">
      ${_selectField('Type', 'prov_event_type', event.event_type, DETAIL_PROVENANCE_TYPES)}
      ${_inputField('Date / Date Range', 'prov_event_date_text', event.event_date_text)}
      ${_inputField('Party', 'prov_party_name', event.party_name)}
      ${_inputField('Place', 'prov_place', event.place)}
      ${_selectField('Confidence', 'prov_confidence', event.confidence, DETAIL_CONFIDENCE_OPTIONS)}
      ${_inputField('Sort Order', 'prov_sort_order', event.sort_order ?? index)}
      ${_selectField('Source / Evidence Reference', 'prov_source_reference_id', event.source_reference_id, _referenceOptions(detail.references), { full: true })}
      ${_selectField('Source / Evidence Document', 'prov_source_document_id', event.source_document_id, _documentOptions(detail.documents), { full: true })}
      ${_inputField('Notes', 'prov_notes', event.notes, { full: true, type: 'textarea', rows: 3 })}
    </div>
  </div>`;
}

function _renderAcquisitionEditor(detail) {
  const rows = Array.isArray(detail.acquisitions) ? detail.acquisitions : [];
  return `<div class="detail-reference-editor full">
    <div class="detail-reference-editor-head">
      <div class="detail-section-title">Acquisition</div>
      <button class="detail-edit-toggle" type="button" onclick="_addAcquisitionBlock(this)">Add acquisition</button>
    </div>
    <div class="detail-reference-blocks" data-acquisition-blocks>
      ${rows.map(row => _acquisitionEditBlock(row, detail)).join('') || '<div class="detail-empty">No acquisition record yet.</div>'}
    </div>
  </div>`;
}

function _renderProvenanceEditor(detail) {
  const rows = Array.isArray(detail.provenance) ? detail.provenance : [];
  return `<div class="detail-reference-editor full">
    <div class="detail-reference-editor-head">
      <div class="detail-section-title">Provenance</div>
      <button class="detail-edit-toggle" type="button" onclick="_addProvenanceBlock(this)">Add provenance event</button>
    </div>
    <div class="detail-reference-blocks" data-provenance-blocks>
      ${rows.map((row, index) => _provenanceEditBlock(row, detail, index)).join('') || '<div class="detail-empty">No provenance events recorded yet.</div>'}
    </div>
  </div>`;
}

function _dimensionField(label, width, height, unit) {
  const hasWidth = _hasDetailValue(width);
  const hasHeight = _hasDetailValue(height);
  if (!hasWidth && !hasHeight) return '';
  const size = hasWidth && hasHeight ? `${width} x ${height}` : (hasWidth ? String(width) : String(height));
  return _field(label, `${size}${unit ? ' ' + unit : ''}`);
}

function _conditionGradeLabel(value) {
  const labels = {
    excellent: 'Excellent',
    very_good: 'Very Good',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor'
  };
  return labels[value] || value;
}

function _physicalHasStructuredData(physical) {
  if (!physical) return false;
  return [
    physical.sheet_width, physical.sheet_height, physical.image_width, physical.image_height,
    physical.plate_width, physical.plate_height, physical.medium, physical.materials,
    physical.coloring, physical.coloring_notes, physical.condition_grade, physical.condition_summary,
    physical.condition_details, physical.margins, physical.backing_lining, physical.restoration_notes,
    physical.framing_status, physical.inspected_at
  ].some(_hasDetailValue);
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

function _cleanDetailNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function _cleanDetailDate(value) {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
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

function _selectField(label, name, value, choices, options = {}) {
  const full = options.full ? ' full' : '';
  const safeLabel = _escapeDetail(label);
  const safeName = _escapeDetail(name);
  const selectedValue = String(value ?? '');
  const optionsHtml = choices.map(choice => {
    const optionValue = typeof choice === 'string' ? choice : choice.value;
    const optionLabel = typeof choice === 'string' ? choice : choice.label;
    return `<option value="${_escapeDetail(optionValue)}"${String(optionValue) === selectedValue ? ' selected' : ''}>${_escapeDetail(optionLabel)}</option>`;
  }).join('');
  return `<label class="detail-edit-field${full}">
    <span>${safeLabel}</span>
    <select name="${safeName}" onchange="_markDetailEditDirty()">${optionsHtml}</select>
  </label>`;
}

function _editGroupTitle(title) {
  return `<div class="detail-edit-group-title">${_escapeDetail(title)}</div>`;
}

function _detailTabHasData(tabName, m, detail) {
  const catalog = detail.catalog || {};
  const physical = detail.physical || {};
  const notes = detail.notes || {};
  if (tabName === 'overview') {
    return [m.title, m.cartographer, m.year, catalog.region, m.act, m.status, m.priority, catalog.summary, catalog.subject_tags].some(_hasDetailValue);
  }
  if (tabName === 'catalogue') {
    return [
      catalog.full_title_transcription, catalog.publisher, catalog.engraver, catalog.place_of_publication,
      catalog.publication_source, catalog.edition, catalog.state, catalog.plate_number, catalog.map_type,
      catalog.language, catalog.alternate_titles, catalog.reference_entries, catalog.bibliography_notes,
      detail.references?.length
    ].some(_hasDetailValue);
  }
  if (tabName === 'physical') {
    return [
      catalog.physical_summary,
      _physicalHasStructuredData(physical),
      detail.acquisitions?.length,
      detail.provenance?.length
    ].some(_hasDetailValue);
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
  const references = detail.references || [];
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
    ${_renderStructuredReferenceEditor(references)}
  `);
}

function _renderPhysicalForm(detail) {
  const catalog = detail.catalog || {};
  const physical = detail.physical || {};
  return _renderEditShell('physical', 'Edit Physical Record', `
    ${_editGroupTitle('Legacy Summary')}
    ${_inputField('Physical Summary', 'physical_summary', catalog.physical_summary, { full: true, type: 'textarea', rows: 4 })}
    ${_editGroupTitle('Dimensions')}
    ${_inputField('Sheet Width', 'sheet_width', physical.sheet_width)}
    ${_inputField('Sheet Height', 'sheet_height', physical.sheet_height)}
    ${_inputField('Image Width', 'image_width', physical.image_width)}
    ${_inputField('Image Height', 'image_height', physical.image_height)}
    ${_inputField('Plate Width', 'plate_width', physical.plate_width)}
    ${_inputField('Plate Height', 'plate_height', physical.plate_height)}
    ${_selectField('Unit', 'dimension_unit', physical.dimension_unit || 'in', [
      { value: '', label: 'Unspecified' },
      { value: 'in', label: 'Inches' },
      { value: 'cm', label: 'Centimeters' },
      { value: 'mm', label: 'Millimeters' }
    ])}
    ${_editGroupTitle('Material / Production')}
    ${_inputField('Medium', 'medium', physical.medium)}
    ${_inputField('Materials', 'materials', physical.materials)}
    ${_inputField('Coloring', 'coloring', physical.coloring)}
    ${_inputField('Coloring Notes', 'coloring_notes', physical.coloring_notes, { full: true, type: 'textarea', rows: 3 })}
    ${_editGroupTitle('Condition')}
    ${_selectField('Condition Grade', 'condition_grade', physical.condition_grade, [
      { value: '', label: 'Unspecified' },
      { value: 'excellent', label: 'Excellent' },
      { value: 'very_good', label: 'Very Good' },
      { value: 'good', label: 'Good' },
      { value: 'fair', label: 'Fair' },
      { value: 'poor', label: 'Poor' }
    ])}
    ${_inputField('Condition Summary', 'condition_summary', physical.condition_summary, { full: true, type: 'textarea', rows: 3 })}
    ${_inputField('Condition Details', 'condition_details', physical.condition_details, { full: true, type: 'textarea', rows: 4 })}
    ${_inputField('Margins', 'margins', physical.margins)}
    ${_inputField('Backing / Lining', 'backing_lining', physical.backing_lining)}
    ${_inputField('Restoration Notes', 'restoration_notes', physical.restoration_notes, { full: true, type: 'textarea', rows: 3 })}
    ${_editGroupTitle('Display / Storage')}
    ${_inputField('Framing Status', 'framing_status', physical.framing_status)}
    ${_inputField('Inspected Date', 'inspected_at', physical.inspected_at, { type: 'date' })}
    ${_renderAcquisitionEditor(detail)}
    ${_renderProvenanceEditor(detail)}
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
  const physicalDetail = detail.physical || {};
  const notes = detail.notes || {};
  const documents = detail.documents || [];
  const references = detail.references || [];
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
  const structuredReferences = _structuredReferenceRows(references);
  const catalogueReadOnly = [
    _renderDetailTabControl('catalogue', m, detail),
    hasCatalogueFields ? _fieldGridSection('Catalogue Details', catalogueFields, 'No catalogue details added yet.') : '',
    structuredReferences ? _section('Structured References', structuredReferences, 'No structured references added yet.') : ''
  ].join('');
  const catalogue = editingTab === 'catalogue' ? _renderCatalogueForm(detail) : hasCatalogueFields
    ? catalogueReadOnly
    : structuredReferences
      ? catalogueReadOnly
    : _actionEmptySection('Catalogue Details', 'No catalogue details added yet.', 'Add catalogue details', 'catalogue');

  const hasStructuredPhysicalData = _physicalHasStructuredData(physicalDetail);
  const physicalFields = [
    _field('Physical Summary', catalog.physical_summary, { full: true }),
    hasStructuredPhysicalData ? _dimensionField('Sheet Size', physicalDetail.sheet_width, physicalDetail.sheet_height, physicalDetail.dimension_unit) : '',
    hasStructuredPhysicalData ? _dimensionField('Image Size', physicalDetail.image_width, physicalDetail.image_height, physicalDetail.dimension_unit) : '',
    hasStructuredPhysicalData ? _dimensionField('Plate Size', physicalDetail.plate_width, physicalDetail.plate_height, physicalDetail.dimension_unit) : '',
    hasStructuredPhysicalData ? _field('Medium', physicalDetail.medium) : '',
    hasStructuredPhysicalData ? _field('Materials', physicalDetail.materials) : '',
    hasStructuredPhysicalData ? _field('Coloring', physicalDetail.coloring) : '',
    hasStructuredPhysicalData ? _field('Coloring Notes', physicalDetail.coloring_notes, { full: true }) : '',
    hasStructuredPhysicalData ? _field('Condition Grade', _conditionGradeLabel(physicalDetail.condition_grade)) : '',
    hasStructuredPhysicalData ? _field('Condition Summary', physicalDetail.condition_summary, { full: true }) : '',
    hasStructuredPhysicalData ? _field('Condition Details', physicalDetail.condition_details, { full: true }) : '',
    hasStructuredPhysicalData ? _field('Margins', physicalDetail.margins) : '',
    hasStructuredPhysicalData ? _field('Backing / Lining', physicalDetail.backing_lining) : '',
    hasStructuredPhysicalData ? _field('Restoration Notes', physicalDetail.restoration_notes, { full: true }) : '',
    hasStructuredPhysicalData ? _field('Framing Status', physicalDetail.framing_status) : '',
    hasStructuredPhysicalData ? _field('Inspected Date', physicalDetail.inspected_at) : ''
  ];
  const hasPhysicalFields = physicalFields.some(field => field && field.trim());
  const physicalRecordSection = hasPhysicalFields
    ? _fieldGridSection('Physical Record', physicalFields, 'No physical details recorded yet.')
    : _actionEmptySection('Physical Record', 'No physical details recorded yet. Suggested next fields: sheet size, condition, and inspection date.', 'Add physical details', 'physical');
  const physical = editingTab === 'physical' ? _renderPhysicalForm(detail) : [
    _renderDetailTabControl('physical', m, detail),
    physicalRecordSection,
    _section('Acquisition', _acquisitionRows(detail.acquisitions, detail), 'No acquisition record yet.'),
    _section('Provenance', _provenanceRows(detail.provenance, detail), 'No provenance events recorded yet.')
  ].join('');

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

function _addReferenceBlock(button) {
  const form = button.closest('.detail-edit-form');
  const container = form?.querySelector('[data-reference-blocks]');
  if (!container) return;
  const empty = container.querySelector('.detail-empty');
  if (empty) empty.remove();
  container.insertAdjacentHTML('beforeend', _referenceEditBlock());
  _markDetailEditDirty();
}

function _removeReferenceBlock(button) {
  const block = button.closest('[data-reference-block]');
  if (!block) return;
  const container = block.parentElement;
  if (block.dataset.referenceId) {
    block.dataset.deleted = 'true';
    block.style.display = 'none';
  } else {
    block.remove();
  }
  if (container && !container.querySelector('[data-reference-block]:not([data-deleted="true"])')) {
    container.insertAdjacentHTML('beforeend', '<div class="detail-empty">No structured references added yet.</div>');
  }
  _markDetailEditDirty();
}

function _addAcquisitionBlock(button) {
  const form = button.closest('.detail-edit-form');
  const container = form?.querySelector('[data-acquisition-blocks]');
  if (!container) return;
  const empty = container.querySelector('.detail-empty');
  if (empty) empty.remove();
  container.insertAdjacentHTML('beforeend', _acquisitionEditBlock({}, _detailCurrentData || {}));
  _markDetailEditDirty();
}

function _removeAcquisitionBlock(button) {
  const block = button.closest('[data-acquisition-block]');
  if (!block) return;
  const container = block.parentElement;
  if (block.dataset.acquisitionId) {
    block.dataset.deleted = 'true';
    block.style.display = 'none';
  } else {
    block.remove();
  }
  if (container && !container.querySelector('[data-acquisition-block]:not([data-deleted="true"])')) {
    container.insertAdjacentHTML('beforeend', '<div class="detail-empty">No acquisition record yet.</div>');
  }
  _markDetailEditDirty();
}

function _addProvenanceBlock(button) {
  const form = button.closest('.detail-edit-form');
  const container = form?.querySelector('[data-provenance-blocks]');
  if (!container) return;
  const empty = container.querySelector('.detail-empty');
  if (empty) empty.remove();
  const index = container.querySelectorAll('[data-provenance-block]').length;
  container.insertAdjacentHTML('beforeend', _provenanceEditBlock({ sort_order: index }, _detailCurrentData || {}, index));
  _markDetailEditDirty();
}

function _removeProvenanceBlock(button) {
  const block = button.closest('[data-provenance-block]');
  if (!block) return;
  const container = block.parentElement;
  if (block.dataset.provenanceId) {
    block.dataset.deleted = 'true';
    block.style.display = 'none';
  } else {
    block.remove();
  }
  if (container && !container.querySelector('[data-provenance-block]:not([data-deleted="true"])')) {
    container.insertAdjacentHTML('beforeend', '<div class="detail-empty">No provenance events recorded yet.</div>');
  }
  _markDetailEditDirty();
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
  const values = {};
  form.querySelectorAll('input[name], textarea[name], select[name]').forEach(field => {
    values[field.name] = field.value;
  });
  return values;
}

function _collectReferenceFormBlocks(form) {
  const active = [];
  const deletedIds = [];
  form.querySelectorAll('[data-reference-block]').forEach((block, index) => {
    const id = block.dataset.referenceId || null;
    if (block.dataset.deleted === 'true') {
      if (id) deletedIds.push(id);
      return;
    }
    const read = field => block.querySelector(`[name="${field}"]`)?.value ?? '';
    const ref = {
      id,
      citation: _cleanDetailText(read('ref_citation')),
      reference_type: _cleanDetailText(read('ref_reference_type')),
      author: _cleanDetailText(read('ref_author')),
      title: _cleanDetailText(read('ref_title')),
      publisher: _cleanDetailText(read('ref_publisher')),
      year: _cleanDetailText(read('ref_year')),
      page_or_entry: _cleanDetailText(read('ref_page_or_entry')),
      url: _cleanDetailText(read('ref_url')),
      notes: _cleanDetailText(read('ref_notes')),
      sort_order: index
    };
    const hasAnyValue = [
      ref.citation, ref.reference_type, ref.author, ref.title, ref.publisher,
      ref.year, ref.page_or_entry, ref.url, ref.notes
    ].some(_hasDetailValue);
    if (!hasAnyValue && !id) return;
    if (!ref.citation) throw new Error('Citation is required for each structured reference.');
    active.push(ref);
  });
  return { active, deletedIds };
}

function _collectAcquisitionFormBlocks(form) {
  const active = [];
  const deletedIds = [];
  form.querySelectorAll('[data-acquisition-block]').forEach(block => {
    const id = block.dataset.acquisitionId || null;
    if (block.dataset.deleted === 'true') {
      if (id) deletedIds.push(id);
      return;
    }
    const read = field => block.querySelector(`[name="${field}"]`)?.value ?? '';
    const acq = {
      id,
      event_date: _cleanDetailDate(read('acq_event_date')),
      seller_name: _cleanDetailText(read('acq_seller_name')),
      price_amount: _cleanDetailNumber(read('acq_price_amount')),
      price_currency: _cleanDetailText(read('acq_price_currency')) || 'USD',
      listing_url: _cleanDetailText(read('acq_listing_url')),
      document_id: _cleanDetailText(read('acq_document_id')),
      notes: _cleanDetailText(read('acq_notes'))
    };
    const hasAnyValue = [
      acq.event_date, acq.seller_name, acq.price_amount, acq.listing_url,
      acq.document_id, acq.notes
    ].some(_hasDetailValue);
    if (!hasAnyValue && !id) return;
    active.push(acq);
  });
  return { active, deletedIds };
}

function _collectProvenanceFormBlocks(form) {
  const active = [];
  const deletedIds = [];
  form.querySelectorAll('[data-provenance-block]').forEach((block, index) => {
    const id = block.dataset.provenanceId || null;
    if (block.dataset.deleted === 'true') {
      if (id) deletedIds.push(id);
      return;
    }
    const read = field => block.querySelector(`[name="${field}"]`)?.value ?? '';
    const sortValue = _cleanDetailNumber(read('prov_sort_order'));
    const event = {
      id,
      event_type: _cleanDetailText(read('prov_event_type')),
      event_date_text: _cleanDetailText(read('prov_event_date_text')),
      party_name: _cleanDetailText(read('prov_party_name')),
      place: _cleanDetailText(read('prov_place')),
      source_reference_id: _cleanDetailText(read('prov_source_reference_id')),
      source_document_id: _cleanDetailText(read('prov_source_document_id')),
      confidence: _cleanDetailText(read('prov_confidence')),
      notes: _cleanDetailText(read('prov_notes')),
      sort_order: sortValue == null ? index : sortValue
    };
    const hasAnyValue = [
      event.event_type, event.event_date_text, event.party_name, event.place,
      event.source_reference_id, event.source_document_id, event.confidence, event.notes
    ].some(_hasDetailValue);
    if (!hasAnyValue && !id) return;
    active.push(event);
  });
  return { active, deletedIds };
}

function _detailPhysicalDebugSnapshot(form, values) {
  if (_detailMapId !== DETAIL_PHYSICAL_DEBUG_MAP_ID) return;
  const controls = Array.from(form.querySelectorAll('input[name], textarea[name], select[name]')).map(field => ({
    tag: field.tagName.toLowerCase(),
    name: field.name,
    type: field.type || '',
    disabled: field.disabled,
    value: field.value
  }));
  const snapshot = {
    map_id: _detailMapId,
    activeTab: _detailActiveTab,
    editingTab: _detailEditState.tab,
    controls,
    values
  };
  window.__nicolasPhysicalFormDebug = snapshot;
  try {
    localStorage.setItem('hm-nicolas-physical-form-debug', JSON.stringify(snapshot));
  } catch (_) {}
  console.info('Nicolas physical form controls', snapshot);
}

function _physicalValuesHaveStructuredInput(values) {
  return [
    values.sheet_width, values.sheet_height, values.image_width, values.image_height,
    values.plate_width, values.plate_height, values.medium, values.materials,
    values.coloring, values.coloring_notes, values.condition_grade, values.condition_summary,
    values.condition_details, values.margins, values.backing_lining, values.restoration_notes,
    values.framing_status, values.inspected_at
  ].some(_hasDetailValue);
}

function _setDetailEditSaving(form, saving) {
  _detailEditState.saving = saving;
  form.querySelectorAll('input, textarea, select, button').forEach(el => {
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

async function _saveCatalogueReferences(referenceChanges, userId) {
  const { active, deletedIds } = referenceChanges;
  const saved = [];

  for (const id of deletedIds) {
    const res = await db.from('map_references').delete().eq('id', id).eq('map_id', _detailMapId);
    if (res.error) throw res.error;
  }

  for (const ref of active) {
    const payload = {
      map_id: _detailMapId,
      user_id: userId,
      citation: ref.citation,
      reference_type: ref.reference_type,
      author: ref.author,
      title: ref.title,
      publisher: ref.publisher,
      year: ref.year,
      page_or_entry: ref.page_or_entry,
      url: ref.url,
      notes: ref.notes,
      sort_order: ref.sort_order,
      updated_at: new Date().toISOString()
    };
    const res = ref.id
      ? await db.from('map_references').update(payload).eq('id', ref.id).eq('map_id', _detailMapId).select('*').single()
      : await db.from('map_references').insert(payload).select('*').single();
    if (res.error) throw res.error;
    saved.push(res.data);
  }

  return saved.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

async function _saveCatalogueDetail(values, userId, form) {
  const referenceChanges = form ? _collectReferenceFormBlocks(form) : { active: [], deletedIds: [] };
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
  const references = form ? await _saveCatalogueReferences(referenceChanges, userId) : (_detailCurrentData.references || []);
  return { catalog: res.data, references };
}

async function _saveAcquisitionEvents(changes, userId) {
  const { active, deletedIds } = changes;
  const saved = [];

  for (const acq of active) {
    const payload = {
      map_id: _detailMapId,
      user_id: userId,
      event_date: acq.event_date,
      seller_name: acq.seller_name,
      price_amount: acq.price_amount,
      price_currency: acq.price_currency,
      listing_url: acq.listing_url,
      document_id: acq.document_id,
      notes: acq.notes,
      updated_at: new Date().toISOString()
    };
    const res = acq.id
      ? await db.from('map_acquisition_events').update(payload).eq('id', acq.id).eq('map_id', _detailMapId).select('*').single()
      : await db.from('map_acquisition_events').insert(payload).select('*').single();
    if (res.error) throw res.error;
    saved.push(res.data);
  }

  for (const id of deletedIds) {
    const res = await db.from('map_acquisition_events').delete().eq('id', id).eq('map_id', _detailMapId);
    if (res.error) throw res.error;
  }

  return saved.sort((a, b) => {
    const aTime = a.event_date || a.created_at || '';
    const bTime = b.event_date || b.created_at || '';
    return String(bTime).localeCompare(String(aTime));
  });
}

async function _saveProvenanceEvents(changes, userId) {
  const { active, deletedIds } = changes;
  const saved = [];

  for (const event of active) {
    const payload = {
      map_id: _detailMapId,
      user_id: userId,
      event_type: event.event_type,
      event_date_text: event.event_date_text,
      party_name: event.party_name,
      place: event.place,
      source_reference_id: event.source_reference_id,
      source_document_id: event.source_document_id,
      confidence: event.confidence,
      notes: event.notes,
      sort_order: event.sort_order,
      updated_at: new Date().toISOString()
    };
    const res = event.id
      ? await db.from('map_provenance_events').update(payload).eq('id', event.id).eq('map_id', _detailMapId).select('*').single()
      : await db.from('map_provenance_events').insert(payload).select('*').single();
    if (res.error) throw res.error;
    saved.push(res.data);
  }

  for (const id of deletedIds) {
    const res = await db.from('map_provenance_events').delete().eq('id', id).eq('map_id', _detailMapId);
    if (res.error) throw res.error;
  }

  return saved.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

async function _savePhysicalDetail(values, userId, form) {
  const acquisitionChanges = form ? _collectAcquisitionFormBlocks(form) : { active: [], deletedIds: [] };
  const provenanceChanges = form ? _collectProvenanceFormBlocks(form) : { active: [], deletedIds: [] };
  const catalogPayload = {
    map_id: _detailMapId,
    user_id: userId,
    physical_summary: _cleanDetailText(values.physical_summary),
    updated_at: new Date().toISOString()
  };
  const physicalPayload = {
    map_id: _detailMapId,
    user_id: userId,
    sheet_width: _cleanDetailNumber(values.sheet_width),
    sheet_height: _cleanDetailNumber(values.sheet_height),
    image_width: _cleanDetailNumber(values.image_width),
    image_height: _cleanDetailNumber(values.image_height),
    plate_width: _cleanDetailNumber(values.plate_width),
    plate_height: _cleanDetailNumber(values.plate_height),
    dimension_unit: _cleanDetailText(values.dimension_unit),
    medium: _cleanDetailText(values.medium),
    materials: _cleanDetailText(values.materials),
    coloring: _cleanDetailText(values.coloring),
    coloring_notes: _cleanDetailText(values.coloring_notes),
    condition_grade: _cleanDetailText(values.condition_grade),
    condition_summary: _cleanDetailText(values.condition_summary),
    condition_details: _cleanDetailText(values.condition_details),
    margins: _cleanDetailText(values.margins),
    backing_lining: _cleanDetailText(values.backing_lining),
    restoration_notes: _cleanDetailText(values.restoration_notes),
    framing_status: _cleanDetailText(values.framing_status),
    inspected_at: _cleanDetailDate(values.inspected_at),
    updated_at: new Date().toISOString()
  };
  const hasStructuredInput = _physicalValuesHaveStructuredInput(values);
  const physicalDebug = {
    map_id: _detailMapId,
    rawValues: values,
    hasStructuredInput,
    catalogPayload,
    physicalPayload
  };
  window.__lastPhysicalSaveDebug = physicalDebug;
  try {
    localStorage.setItem('hm-last-physical-save-debug', JSON.stringify(physicalDebug));
  } catch (_) {}
  console.info('Saving physical details', {
    map_id: _detailMapId,
    rawValues: values,
    hasStructuredInput,
    catalogPayload,
    physicalPayload
  });
  if (!hasStructuredInput) {
    const catalogRes = await db.from('map_catalog_details').upsert(catalogPayload, { onConflict: 'map_id' }).select('*').single();
    if (catalogRes.error) {
      console.error('Physical tab legacy summary save failed', catalogRes.error);
      throw catalogRes.error;
    }
    const [acquisitions, provenance] = await Promise.all([
      _saveAcquisitionEvents(acquisitionChanges, userId),
      _saveProvenanceEvents(provenanceChanges, userId)
    ]);
    return { catalog: catalogRes.data, acquisitions, provenance };
  }
  const [catalogRes, physicalRes] = await Promise.all([
    db.from('map_catalog_details').upsert(catalogPayload, { onConflict: 'map_id' }).select('*').single(),
    db.from('map_physical_details').upsert(physicalPayload, { onConflict: 'map_id' }).select('*').single()
  ]);
  if (catalogRes.error) {
    console.error('Physical tab legacy summary save failed', catalogRes.error);
    throw catalogRes.error;
  }
  if (physicalRes.error) {
    console.error('Structured physical details save failed', physicalRes.error);
    throw physicalRes.error;
  }
  if (!physicalRes.data?.map_id) {
    const error = new Error('Physical details save did not return a saved row.');
    console.error(error.message, physicalRes);
    throw error;
  }
  console.info('Structured physical details saved', physicalRes.data);
  const [acquisitions, provenance] = await Promise.all([
    _saveAcquisitionEvents(acquisitionChanges, userId),
    _saveProvenanceEvents(provenanceChanges, userId)
  ]);
  return { catalog: catalogRes.data, physical: physicalRes.data, acquisitions, provenance };
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
  if (tabName === 'physical') _detailPhysicalDebugSnapshot(form, values);
  _setDetailEditStatus(form, 'Saving...');
  _setDetailEditSaving(form, true);
  try {
    const userId = await _detailUserId();
    let saved = {};
    if (tabName === 'overview') saved = await _saveOverviewDetail(values, userId);
    else if (tabName === 'catalogue') saved = await _saveCatalogueDetail(values, userId, form);
    else if (tabName === 'physical') saved = await _savePhysicalDetail(values, userId, form);
    else if (tabName === 'ai') saved = await _saveAiUserNotes(values, userId);
    else throw new Error('This tab cannot be saved.');

    if (saved.map) {
      const idx = maps.findIndex(map => map.id === _detailMapId);
      if (idx >= 0) maps[idx] = { ...maps[idx], ...saved.map };
      _detailCurrentMap = idx >= 0 ? maps[idx] : { ..._detailCurrentMap, ...saved.map };
      renderList();
    }
    if (saved.catalog) _detailCurrentData.catalog = saved.catalog;
    if (saved.references) _detailCurrentData.references = saved.references;
    if (saved.physical) _detailCurrentData.physical = saved.physical;
    if (saved.acquisitions) _detailCurrentData.acquisitions = saved.acquisitions;
    if (saved.provenance) _detailCurrentData.provenance = saved.provenance;
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
  const empty = { catalog: null, physical: null, notes: null, documents: [], references: [], acquisitions: [], provenance: [] };
  try {
    const safeDetailQuery = async (label, query, fallback) => {
      try {
        const res = await query;
        if (res.error) {
          console.warn(`${label} unavailable`, res.error);
          return { data: fallback, error: res.error };
        }
        return res;
      } catch (error) {
        console.warn(`${label} unavailable`, error);
        return { data: fallback, error };
      }
    };
    const [catalogRes, physicalRes, notesRes, refsRes, docsRes, acquisitionsRes, provenanceRes] = await Promise.all([
      safeDetailQuery('Catalog details', db.from('map_catalog_details').select('*').eq('map_id', mapId).maybeSingle(), null),
      safeDetailQuery('Physical details', db.from('map_physical_details').select('*').eq('map_id', mapId).maybeSingle(), null),
      safeDetailQuery('Map notes', db.from('map_notes').select('*').eq('map_id', mapId).maybeSingle(), null),
      safeDetailQuery('Map references', db.from('map_references').select('*').eq('map_id', mapId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }), []),
      safeDetailQuery('Map documents', db.from('map_documents').select('id,map_id,user_id,document_type,title,file_url,storage_path,mime_type,file_size,notes,created_at').eq('map_id', mapId).order('created_at', { ascending: false }), []),
      safeDetailQuery('Acquisition events', db.from('map_acquisition_events').select('*').eq('map_id', mapId).order('event_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }), []),
      safeDetailQuery('Provenance events', db.from('map_provenance_events').select('*').eq('map_id', mapId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }), [])
    ]);
    console.info('Loaded map detail metadata', {
      mapId,
      hasCatalog: !!catalogRes.data,
      hasPhysical: !!physicalRes.data,
      hasNotes: !!notesRes.data,
      referenceCount: refsRes.data?.length || 0,
      documentCount: docsRes.data?.length || 0,
      acquisitionCount: acquisitionsRes.data?.length || 0,
      provenanceCount: provenanceRes.data?.length || 0
    });
    if (mapId === DETAIL_PHYSICAL_DEBUG_MAP_ID) {
      const snapshot = {
        mapId,
        catalog: catalogRes.data,
        physical: physicalRes.data,
        notes: notesRes.data,
        acquisitions: acquisitionsRes.data,
        provenance: provenanceRes.data
      };
      window.__nicolasPhysicalLoadDebug = snapshot;
      try {
        localStorage.setItem('hm-nicolas-physical-load-debug', JSON.stringify(snapshot));
      } catch (_) {}
      console.info('Nicolas physical load data', snapshot);
    }
    return {
      catalog: catalogRes.data || null,
      physical: physicalRes.data || null,
      notes: notesRes.data || null,
      references: refsRes.data || [],
      documents: docsRes.data || [],
      acquisitions: acquisitionsRes.data || [],
      provenance: provenanceRes.data || []
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
