// Photo management for collection.html.
let _modalPendingFiles = []; // files queued for upload on new maps (no map_id yet)
let _modalExistingImages = []; // map_images rows for current edit

function resizeImageToCanvasAndBase64(file, callback) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      let w = img.width; let h = img.height;
      const MAX = 1400;
      if (w > h && w > MAX) { h *= MAX/w; w = MAX; }
      else if (h > MAX) { w *= MAX/h; h = MAX; }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64d = dataUrl.replace(/^data:image\/(png|jpeg);base64,/, '');
      callback(base64d);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function resizeAndUploadFile(file, userId) {
  const bitmap = await createImageBitmap(file);
  let w = bitmap.width, h = bitmap.height;
  const maxDim = 1200;
  if (w > maxDim || h > maxDim) {
    if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
    else       { w = Math.round(w * maxDim / h); h = maxDim; }
  }
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  const storagePath = `${userId}/photos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error: uploadErr } = await db.storage
    .from('map-images')
    .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: false });
  if (uploadErr) throw uploadErr;
  const { data: urlData } = db.storage.from('map-images').getPublicUrl(storagePath);
  return { publicUrl: urlData.publicUrl, storagePath };
}

async function loadMapImages(mapId) {
  const { data } = await db.from('map_images')
    .select('*').eq('map_id', mapId).order('sort_order').order('created_at');
  return data || [];
}

async function ensureLazyMigration(mapId, imageUrl, userId, storagePath = null) {
  if (!imageUrl) return;
  const { data } = await db.from('map_images')
    .select('id').eq('map_id', mapId).limit(1);
  if (data && data.length > 0) return;
  await db.from('map_images').insert({
    map_id: mapId, user_id: userId, image_url: imageUrl,
    storage_path: storagePath, is_primary: true, sort_order: 0
  });
}

async function uploadMapImage(mapId, file, makePrimary) {
  const { data: { user } } = await db.auth.getUser();
  const { publicUrl, storagePath } = await resizeAndUploadFile(file, user.id);
  const { data: row } = await db.from('map_images').insert({
    map_id: mapId, user_id: user.id, image_url: publicUrl,
    storage_path: storagePath, is_primary: !!makePrimary, sort_order: 99
  }).select().single();
  if (makePrimary) {
    await db.from('map_images').update({ is_primary: false })
      .eq('map_id', mapId).neq('id', row.id);
    await db.from('maps').update({ image_url: publicUrl }).eq('id', mapId);
  }
  return row;
}

async function setPrimaryImage(mapId, imageId, imageUrl) {
  await db.from('map_images').update({ is_primary: false }).eq('map_id', mapId);
  await db.from('map_images').update({ is_primary: true }).eq('id', imageId);
  await db.from('maps').update({ image_url: imageUrl }).eq('id', mapId);
  const idx = maps.findIndex(x => x.id === mapId);
  if (idx >= 0) maps[idx].image_url = imageUrl;
  renderList();
}

async function deleteMapImage(imageId, mapId, storagePath) {
  await db.from('map_images').delete().eq('id', imageId);
  if (storagePath) {
    await db.storage.from('map-images').remove([storagePath]);
  }
  const remaining = await loadMapImages(mapId);
  if (remaining.length > 0 && !remaining.some(r => r.is_primary)) {
    await setPrimaryImage(mapId, remaining[0].id, remaining[0].image_url);
  } else if (remaining.length === 0) {
    await db.from('maps').update({ image_url: null }).eq('id', mapId);
    const idx = maps.findIndex(x => x.id === mapId);
    if (idx >= 0) maps[idx].image_url = null;
    renderList();
  }
  return remaining;
}

async function handleDetailPhotoUpload(e) {
  const files = Array.from(e.target.files);
  if (!files.length || !_detailMapId) return;
  e.target.value = '';
  const mapId = _detailMapId;
  const images = await loadMapImages(mapId);
  const isFirst = images.length === 0;
  for (let i = 0; i < files.length; i++) {
    try {
      await uploadMapImage(mapId, files[i], isFirst && i === 0);
    } catch(err) { console.error('Upload failed:', err); }
  }
  await loadMaps();
  toggleCard(mapId);
}

async function handleModalPhotoMulti(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  e.target.value = '';
  if (editingId) {
    const images = await loadMapImages(editingId);
    const isFirst = images.length === 0;
    for (let i = 0; i < files.length; i++) {
      try {
        await uploadMapImage(editingId, files[i], isFirst && i === 0);
      } catch(err) { console.error('Upload failed:', err); }
    }
    _modalExistingImages = await loadMapImages(editingId);
    renderModalPhotoStrip();
    await loadMaps();
  } else {
    files.forEach(f => _modalPendingFiles.push(f));
    renderModalPhotoStrip();
  }
}

function renderModalPhotoStrip() {
  const strip = document.getElementById('modal-photo-strip');
  let html = '';
  _modalExistingImages.forEach(img => {
    html += `<img class="modal-photo-thumb${img.is_primary ? ' primary' : ''}" src="${img.image_url}" alt="">`;
  });
  _modalPendingFiles.forEach((f, i) => {
    const url = URL.createObjectURL(f);
    html += `<img class="modal-photo-thumb${i === 0 && _modalExistingImages.length === 0 ? ' primary' : ''}" src="${url}" alt="">`;
  });
  html += `<button type="button" class="modal-photo-add-btn" onclick="document.getElementById('modal-photo-input').click()">+</button>`;
  strip.innerHTML = html;
}

function addImageToModalStrip(imageUrl) {
  document.getElementById('f-image-url').value = imageUrl;
  _modalExistingImages.push({ image_url: imageUrl, is_primary: _modalExistingImages.length === 0 });
  renderModalPhotoStrip();
}

async function _loadDetailPhotoStrip(mapId, currentImageUrl) {
  const { data: { user } } = await db.auth.getUser();
  if (currentImageUrl) await ensureLazyMigration(mapId, currentImageUrl, user.id);
  const images = await loadMapImages(mapId);
  const strip = document.getElementById('detail-photo-strip');
  if (!strip) return; // panel was closed
  if (images.length === 0 && !currentImageUrl) {
    strip.innerHTML = `<button class="photo-thumb-add" onclick="document.getElementById('detail-photo-input').click()" title="Add photo">+</button>`;
    return;
  }
  let html = '';
  images.forEach((img) => {
    const isPrimary = img.is_primary;
    const isActive = img.image_url === currentImageUrl;
    const imageId = _escapeDetail(img.id);
    const safeMapId = _escapeDetail(mapId);
    const safeUrl = _escapeDetail(img.image_url);
    const safePath = _escapeDetail(img.storage_path || '');
    html += `<div class="photo-thumb-wrap${isPrimary ? ' primary' : ''}" data-img-id="${imageId}" data-map-id="${safeMapId}" data-image-url="${safeUrl}" data-storage-path="${safePath}">
      <img class="photo-thumb${isActive ? ' active' : ''}" src="${safeUrl}" alt="" onclick="_onThumbTap(event)">
      <span class="photo-thumb-badge">★</span>
      <div class="photo-actions" id="pa-${imageId}">
        <button class="photo-action-btn cover${isPrimary ? ' is-primary' : ''}" onclick="event.stopPropagation();_doSetPrimaryFromButton(this)" ${isPrimary ? 'disabled aria-disabled="true"' : ''} title="${isPrimary ? 'Current cover photo' : 'Set as cover photo'}">${isPrimary ? 'Cover' : 'Set Cover'}</button>
        <button class="photo-action-btn danger" onclick="event.stopPropagation();_doDeleteImageFromButton(this)" title="Delete photo">Delete</button>
      </div>
    </div>`;
  });
  html += `<button class="photo-thumb-add" onclick="document.getElementById('detail-photo-input').click()" title="Add photo">+</button>`;
  strip.innerHTML = html;
}

function _selectDetailImage(url, thumbEl) {
  const mainImg = document.getElementById('detail-main-img');
  if (mainImg && mainImg.tagName === 'IMG') {
    mainImg.src = url;
  } else if (mainImg) {
    const wrap = document.createElement('div');
    wrap.className = 'detail-img-wrap';
    wrap.innerHTML = `<img class="detail-image" id="detail-main-img" src="${url}" alt="">
      <button class="detail-rotate-btn" id="detail-rotate-btn" onclick="_rotateCurrentImage()" title="Rotate 90°"><span class="rotate-symbol">↻</span><span class="rotate-label">Rotating</span></button>`;
    mainImg.replaceWith(wrap);
  }
  document.querySelectorAll('#detail-photo-strip .photo-thumb').forEach(t => t.classList.remove('active'));
  if (thumbEl) thumbEl.classList.add('active');
  document.querySelectorAll('.photo-actions.open').forEach(p => p.classList.remove('open'));
}

function _photoDataFromButton(button) {
  const wrap = button.closest('.photo-thumb-wrap');
  return {
    imageId: wrap?.dataset.imgId || '',
    mapId: wrap?.dataset.mapId || '',
    imageUrl: wrap?.dataset.imageUrl || '',
    storagePath: wrap?.dataset.storagePath || ''
  };
}

function _onThumbTap(event) {
  event.stopPropagation();
  const wrap = event.target.closest('.photo-thumb-wrap');
  if (!wrap) return;
  _selectDetailImage(wrap.dataset.imageUrl || event.target.src, event.target);
}

function _doSetPrimaryFromButton(button) {
  const { mapId, imageId, imageUrl } = _photoDataFromButton(button);
  if (mapId && imageId && imageUrl) _doSetPrimary(mapId, imageId, imageUrl);
}

function _doDeleteImageFromButton(button) {
  const { imageId, mapId, storagePath } = _photoDataFromButton(button);
  if (imageId && mapId) _doDeleteImage(imageId, mapId, storagePath);
}

function _setPhotoActionsBusy(imageId, busy) {
  const wrap = document.querySelector(`[data-img-id="${CSS.escape(imageId)}"]`);
  if (!wrap) return;
  wrap.classList.toggle('busy', busy);
  wrap.querySelectorAll('.photo-action-btn').forEach(btn => { btn.disabled = busy || btn.classList.contains('is-primary'); });
}

async function _doSetPrimary(mapId, imageId, imageUrl) {
  _setPhotoActionsBusy(imageId, true);
  try {
    await setPrimaryImage(mapId, imageId, imageUrl);
    _selectDetailImage(imageUrl);
    await _loadDetailPhotoStrip(mapId, imageUrl);
  } finally {
    _setPhotoActionsBusy(imageId, false);
  }
}

async function _doDeleteImage(imageId, mapId, storagePath) {
  const yes = await hmConfirm('This photo will be permanently deleted.', { title: 'Delete Photo', icon: '🗑', iconType: 'danger', confirmLabel: 'Delete', cancelLabel: 'Keep' });
  if (!yes) return;
  _setPhotoActionsBusy(imageId, true);
  try {
    const remaining = await deleteMapImage(imageId, mapId, storagePath);
    await loadMaps();
    const m = maps.find(x => x.id === mapId);
    const newPrimary = remaining.find(r => r.is_primary);
    const mainUrl = newPrimary?.image_url || m?.image_url || null;
    if (mainUrl) {
      _selectDetailImage(mainUrl);
    } else {
      const mainImg = document.getElementById('detail-main-img');
      if (mainImg) mainImg.outerHTML = '<div class="detail-placeholder" id="detail-main-img">No image available</div>';
    }
    await _loadDetailPhotoStrip(mapId, mainUrl);
  } finally {
    _setPhotoActionsBusy(imageId, false);
  }
}

function _stripQueryParams(url) {
  try { return new URL(url).origin + new URL(url).pathname; } catch { return url.split('?')[0]; }
}

function _setRotateBusy(rotateBtn, busy) {
  if (!rotateBtn) return;
  rotateBtn.classList.toggle('spinning', busy);
  rotateBtn.disabled = busy;
  rotateBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
  const wrap = rotateBtn.closest('.detail-img-wrap');
  if (wrap) wrap.classList.toggle('rotating', busy);
}

async function _rotateCurrentImage() {
  const mainImg = document.getElementById('detail-main-img');
  const rotateBtn = document.getElementById('detail-rotate-btn');
  if (!mainImg || mainImg.tagName !== 'IMG' || !_detailMapId) return;

  const mapId = _detailMapId;
  const currentSrc = mainImg.src;
  const currentBase = _stripQueryParams(currentSrc);

  const { data: images } = await db.from('map_images').select('*').eq('map_id', mapId);
  const imgRecord = images?.find(i => _stripQueryParams(i.image_url) === currentBase);

  if (!imgRecord) {
    await _rotateLegacyImage(mapId, currentSrc, mainImg, rotateBtn);
    return;
  }

  _setRotateBusy(rotateBtn, true);

  try {
    await new Promise(requestAnimationFrame);
    const blob = await _rotateImageBlob(currentSrc);

    const { data: { user } } = await db.auth.getUser();
    const storagePath = imgRecord.storage_path || `${user.id}/photos/${mapId}/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await db.storage.from('map-images').upload(storagePath, blob, {
      contentType: 'image/jpeg', upsert: true
    });
    if (upErr) { console.error('Rotate upload failed:', upErr); await hmAlert('Upload failed: ' + upErr.message, { title: 'Rotate Error', iconType: 'danger' }); return; }

    const { data: urlData } = db.storage.from('map-images').getPublicUrl(storagePath);
    const newUrl = urlData.publicUrl + '?t=' + Date.now();

    await db.from('map_images').update({ image_url: newUrl, storage_path: storagePath }).eq('id', imgRecord.id);

    if (imgRecord.is_primary) {
      await db.from('maps').update({ image_url: newUrl }).eq('id', mapId);
      const m = maps.find(x => x.id === mapId);
      if (m) m.image_url = newUrl;
    }

    mainImg.src = newUrl;
    await loadMaps();
    await _loadDetailPhotoStrip(mapId, newUrl);
  } catch (e) {
    console.error('Rotate failed:', e);
    await hmAlert('Could not rotate image: ' + e.message, { title: 'Rotate Error', iconType: 'danger' });
  } finally {
    _setRotateBusy(rotateBtn, false);
  }
}

async function _rotateLegacyImage(mapId, currentSrc, mainImg, rotateBtn) {
  _setRotateBusy(rotateBtn, true);
  try {
    await new Promise(requestAnimationFrame);
    const blob = await _rotateImageBlob(currentSrc);
    const { data: { user } } = await db.auth.getUser();
    const storagePath = `${user.id}/photos/${mapId}/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await db.storage.from('map-images').upload(storagePath, blob, {
      contentType: 'image/jpeg', upsert: true
    });
    if (upErr) { console.error('Rotate upload failed:', upErr); await hmAlert('Upload failed: ' + upErr.message, { title: 'Rotate Error', iconType: 'danger' }); return; }
    const { data: urlData } = db.storage.from('map-images').getPublicUrl(storagePath);
    const newUrl = urlData.publicUrl + '?t=' + Date.now();
    await db.from('maps').update({ image_url: newUrl }).eq('id', mapId);
    await ensureLazyMigration(mapId, newUrl, user.id, storagePath);
    const m = maps.find(x => x.id === mapId);
    if (m) m.image_url = newUrl;
    mainImg.src = newUrl;
    await loadMaps();
    await _loadDetailPhotoStrip(mapId, newUrl);
  } catch (e) {
    console.error('Legacy rotate failed:', e);
    await hmAlert('Could not rotate image: ' + e.message, { title: 'Rotate Error', iconType: 'danger' });
  } finally {
    _setRotateBusy(rotateBtn, false);
  }
}

async function _rotateImageBlob(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error('Failed to fetch image (' + response.status + ')');
  const srcBlob = await response.blob();
  const bitmapSrc = await createImageBitmap(srcBlob);

  const width = bitmapSrc.height;
  const height = bitmapSrc.width;
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  ctx.translate(width / 2, height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmapSrc, -bitmapSrc.width / 2, -bitmapSrc.height / 2);
  bitmapSrc.close();

  if (canvas.convertToBlob) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas encoding failed'));
    }, 'image/jpeg', 0.86);
  });
}
