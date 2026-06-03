// Shared UI helpers for collection.html.
let _hmDialogResolve = null;

function _hmShowDialog({ title, message, icon, iconType, buttons }) {
  const overlay = document.getElementById('hm-dialog-overlay');
  const iconEl = document.getElementById('hm-dialog-icon');
  const titleEl = document.getElementById('hm-dialog-title');
  const msgEl = document.getElementById('hm-dialog-msg');
  const actEl = document.getElementById('hm-dialog-actions');

  iconEl.className = 'hm-dialog-icon ' + (iconType || 'info');
  iconEl.textContent = icon || '🗺️';
  titleEl.textContent = title || '';
  msgEl.textContent = message || '';
  actEl.innerHTML = buttons.map(b =>
    `<button class="hm-dialog-btn ${b.style || 'primary'}" onclick="_hmResolve(${JSON.stringify(b.value)})">${b.label}</button>`
  ).join('');

  overlay.classList.add('open');
  return new Promise(resolve => { _hmDialogResolve = resolve; });
}

function _hmResolve(value) {
  document.getElementById('hm-dialog-overlay').classList.remove('open');
  if (_hmDialogResolve) { _hmDialogResolve(value); _hmDialogResolve = null; }
}

function hmAlert(message, { title, icon, iconType } = {}) {
  return _hmShowDialog({
    title: title || 'Notice',
    message,
    icon: icon || '📜',
    iconType: iconType || 'warn',
    buttons: [{ label: 'Understood', style: 'primary', value: true }]
  });
}

function hmConfirm(message, { title, icon, iconType, confirmLabel, cancelLabel, confirmStyle } = {}) {
  return _hmShowDialog({
    title: title || 'Are you sure?',
    message,
    icon: icon || '⚠',
    iconType: iconType || 'danger',
    buttons: [
      { label: cancelLabel || 'Cancel', style: 'secondary', value: false },
      { label: confirmLabel || 'Confirm', style: confirmStyle || 'danger', value: true },
    ]
  });
}

function isUrl(str) {
  if (!str) return false;
  const s = str.trim().toLowerCase();
  if (s.startsWith('http://') || s.startsWith('https://')) return true;
  return /^(www\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+([\/\?#].*)?$/i.test(s);
}

function normalizeUrl(str) {
  if (!str) return '';
  const s = str.trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return 'https://' + s;
}

function stars(n) { return '★'.repeat(n||0) + '☆'.repeat(5-(n||0)); }

function actLabel(n) { return ['','Act I','Act II','Act III'][n] || ''; }
function actClass(n) { return ['','act1','act2','act3'][n] || ''; }
function statusLabel(s) {
  return {
    owned: 'Owned',
    target: 'Target',
    reference: 'Reference Map',
    narrative: 'Narrative Piece',
    negotiating: 'Negotiating',
    watching: 'Watching',
    passed: 'Passed'
  }[s] || s;
}
function formatPrice(p) {
  if (!p) return '';
  const n = Number(String(p).replace(/[^0-9.]/g, ''));
  return isNaN(n) || n === 0 ? String(p) : '$' + n.toLocaleString();
}

function _escapeDetail(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _hasDetailValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).trim() !== '';
}

function _jsonList(value) {
  if (!_hasDetailValue(value)) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (_) {
      return value.split(',').map(v => v.trim()).filter(Boolean);
    }
  }
  return [value];
}

function _formatChatContent(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}
