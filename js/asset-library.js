const AssetLibrary = (() => {
  const KINDS = { project: 'شغل منفّذ', material: 'خامة', design: 'مرجع تصميم', logo: 'لوجو وهوية' };
  const MAX_SELECTED = 4;
  let busy = false, editor = null, renderVersion = 0, postVersion = 0;
  let lastSignature = '';
  const imageCache = new Map();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const refs = ws => ws.assets?.references || [];
  const selected = ws => ws.assets?.selectedReferenceIds || [];
  const snapshot = ref => ({ id: ref.id, title: ref.title, kind: ref.kind, material: ref.material, description: ref.description });
  const isBusy = () => busy;
  const companyId = ws => App.getWorkspaceCompanyId(ws);
  function ensureIdle() {
    if (busy || ContentStudio.isGenerating() || App.isWorkspaceBusy()) throw new Error('استنى لحد ما العملية الحالية تخلص.');
  }
  function getImage(owner, id) {
    const key = owner + ':' + id;
    if (!imageCache.has(key)) {
      const promise = StorageEngine.loadReferenceImage(owner, id).catch(error => { imageCache.delete(key); throw error; });
      imageCache.set(key, promise);
    }
    return imageCache.get(key);
  }
  function dataUrl(image) { return 'data:' + image.mimeType + ';base64,' + image.data; }

  function render(workspace) {
    const grid = document.getElementById('reference-library-grid');
    if (!grid) return;
    const owner = companyId(workspace);
    if (editor && editor.owner !== owner) closeEditor();
    const chosen = selected(workspace);
    const summary = document.getElementById('reference-selection-summary');
    if (summary) summary.textContent = chosen.length ? chosen.length + '/4 صور مختارة للتوليد: ' + refs(workspace).filter(r => chosen.includes(r.id)).map(r => r.title).join('، ') : 'التوليد من غير صور مختارة';
    document.getElementById('reference-selection-count').textContent = chosen.length + ' / 4 صور مختارة';
    if (document.getElementById('view-assets')?.classList.contains?.('hidden')) return;
    const query = document.getElementById('reference-search').value.trim().toLowerCase();
    const kind = document.getElementById('reference-kind-filter').value;
    const signature = JSON.stringify([owner, refs(workspace), chosen, query, kind]);
    if (lastSignature === signature) return;
    lastSignature = signature;
    const version = ++renderVersion;
    const list = refs(workspace).filter(ref => (!kind || ref.kind === kind) && (!query || [ref.title, ref.description, ref.material].join(' ').toLowerCase().includes(query)));
    grid.innerHTML = list.length ? list.map(ref => `<article class="reference-card">
      <button type="button" class="reference-preview" onclick="AssetLibrary.openEditor('${ref.id}')" aria-label="معاينة وتعديل ${escape(ref.title)}"><img id="reference-image-${ref.id}" alt="${escape(ref.title)}" loading="lazy" /></button>
      <div class="reference-details">
        <span class="text-[11px] text-muted">${KINDS[ref.kind]}</span><h4 class="font-bold text-sm break-words">${escape(ref.title)}</h4>
        <p class="text-xs text-muted break-words">${escape(ref.material || 'الخامة غير مسجلة')}</p>
        <p class="text-xs break-words">${escape(ref.description)}</p>
        <p id="reference-state-${ref.id}" class="text-[11px] text-muted" role="status">جاري تحميل الصورة...</p>
        <label class="flex items-center gap-2 text-xs font-bold"><input type="checkbox" ${chosen.includes(ref.id) ? 'checked' : ''} onchange="AssetLibrary.toggleSelection('${ref.id}', this.checked, this)" />استخدام في التوليد</label>
        <div class="flex flex-wrap gap-2 pt-2"><button onclick="AssetLibrary.openEditor('${ref.id}')" class="text-xs text-bronze font-bold">معاينة وتعديل</button><button onclick="AssetLibrary.removeReference('${ref.id}')" class="text-xs text-rose-700">إزالة من المكتبة</button></div>
      </div></article>`).join('') : '<p class="text-xs text-muted">مفيش صور مطابقة. ارفع صور شغلك أو خاماتك أو مراجع التصميم.</p>';
    for (const ref of list) {
      getImage(owner, ref.id).then(async image => {
        if (version !== renderVersion) return;
        const img = document.getElementById('reference-image-' + ref.id);
        img.onerror = () => { if (version === renderVersion) document.getElementById('reference-state-' + ref.id).textContent = 'تعذر عرض الصورة. جرّب رفع نسخة سليمة.'; };
        img.src = dataUrl(image);
        const state = await StorageEngine.referenceImageState(owner, ref.id);
        if (version === renderVersion) document.getElementById('reference-state-' + ref.id).textContent = state === 'synced' ? 'الصورة متزامنة' : 'الصورة محفوظة على الجهاز';
      }).catch(error => {
        if (version === renderVersion) document.getElementById('reference-state-' + ref.id).textContent = StorageEngine.describeError(error);
      });
    }
  }
  function refresh() { lastSignature = ''; App.refreshUI(); }

  async function prepareReferences(workspace) {
    const ids = [...selected(workspace)];
    if (ids.length > MAX_SELECTED || new Set(ids).size !== ids.length) throw new Error('اختار لحد 4 صور مختلفة للتوليد.');
    const owner = companyId(workspace);
    return Promise.all(ids.map(async id => {
      const ref = refs(workspace).find(item => item.id === id);
      if (!ref) throw new Error('واحدة من الصور المختارة مش موجودة في المكتبة.');
      return { ...snapshot(ref), image: await getImage(owner, id) };
    }));
  }

  async function toggleSelection(id, checked, checkbox) {
    const workspace = App.getCurrentWorkspace();
    try {
      ensureIdle();
      if (!refs(workspace).some(ref => ref.id === id)) throw new Error('الصورة مش موجودة.');
      const ids = selected(workspace).filter(value => value !== id);
      if (checked && ids.length >= MAX_SELECTED) throw new Error('الحد الأقصى 4 صور لكل توليد.');
      workspace.assets.selectedReferenceIds = checked ? [...ids, id] : ids;
      refresh();
      await App.persistWorkspace(workspace);
    } catch (error) { if (checkbox) checkbox.checked = selected(workspace).includes(id); App.showError(error); }
  }
  async function clearSelection() {
    try { ensureIdle(); const ws = App.getCurrentWorkspace(); ws.assets.selectedReferenceIds = []; refresh(); await App.persistWorkspace(ws); }
    catch (error) { App.showError(error); }
  }

  async function compressImage(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('اختار صورة JPG أو PNG أو WebP.');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('حجم الصورة الأصلي لازم يكون أقل من 10 ميجابايت.');
    let bitmap;
    try {
      if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      else {
        const url = URL.createObjectURL(file);
        try { bitmap = new Image(); bitmap.src = url; await bitmap.decode(); }
        finally { URL.revokeObjectURL(url); }
      }
      const width = bitmap.width || bitmap.naturalWidth, height = bitmap.height || bitmap.naturalHeight;
      if (!width || !height || width * height > 40000000) throw new Error('أبعاد الصورة كبيرة جدًا أو الصورة تالفة.');
      const scale = Math.min(1, 1600 / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      for (let attempt = 0; attempt < 8; attempt++) {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('المتصفح مش قادر يجهّز الصورة.');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const encoded = canvas.toDataURL('image/webp', Math.max(0.45, 0.86 - attempt * 0.08));
        const [header, data] = encoded.split(',');
        const mimeType = header.match(/^data:(image\/(?:webp|png|jpeg));base64$/)?.[1];
        if (mimeType && data && data.length <= Math.floor(StorageEngine.MAX_REFERENCE_BYTES / 3) * 4) return { mimeType, data, width: canvas.width, height: canvas.height };
        canvas.width = Math.max(1, Math.round(canvas.width * 0.8)); canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
      }
      throw new Error('الصورة لسه كبيرة بعد التجهيز. استخدم نسخة أصغر.');
    } catch (error) {
      if (error?.name === 'InvalidStateError' || error?.name === 'EncodingError') throw new Error('الصورة تالفة أو المتصفح مش بيدعمها.');
      throw error;
    } finally { bitmap?.close?.(); }
  }

  async function upload(event) {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    const status = document.getElementById('reference-upload-status');
    const workspace = App.getCurrentWorkspace(), owner = companyId(workspace);
    let added = 0, acquired = false; const errors = [];
    try {
      ensureIdle();
      if (files.length > 10) throw new Error('اختار لحد 10 صور في المرة الواحدة.');
      const kind = document.getElementById('reference-upload-kind').value;
      const material = document.getElementById('reference-upload-material').value.trim().slice(0, 200);
      const description = document.getElementById('reference-upload-description').value.trim().slice(0, 2000);
      busy = true; acquired = true;
      for (const [index, file] of files.entries()) {
        status.textContent = `جاري تجهيز وحفظ الصورة ${index + 1} من ${files.length}`;
        try {
          const image = await compressImage(file);
          const id = 'ref-' + crypto.randomUUID();
          const ref = { id, title: file.name.replace(/\.[^.]+$/, '').slice(0, 160) || 'صورة مرجعية', kind, material, description, createdAt: new Date().toISOString() };
          StorageEngine.validateReferenceMetadata(ref);
          const result = await StorageEngine.saveReferenceImage(owner, { id, ...image });
          if (!workspace.assets.references) workspace.assets.references = [];
          workspace.assets.references.unshift(ref); added++;
          try { await App.persistWorkspace(workspace); }
          catch (error) {
            if (!error.savedLocally) { workspace.assets.references = workspace.assets.references.filter(item => item.id !== id); added--; }
            throw error;
          }
          if (result.error) errors.push(result.error);
        } catch (error) { errors.push(file.name + ': ' + StorageEngine.describeError(error)); }
      }
      status.textContent = `اتحفظت ${added} صورة من ${files.length}.` + (errors.length ? ' ' + errors.join(' | ') : '');
      if (added && !errors.length) App.showToast('تم حفظ الصور في المكتبة');
      if (errors.length) App.showError(new Error(status.textContent));
    } catch (error) { status.textContent = StorageEngine.describeError(error); App.showError(error); }
    finally { if (acquired) busy = false; event.target.value = ''; if (acquired) refresh(); }
  }

  async function openEditor(id) {
    try {
      ensureIdle();
      const workspace = App.getCurrentWorkspace(), ref = refs(workspace).find(item => item.id === id);
      if (!ref) throw new Error('الصورة مش موجودة في المكتبة.');
      editor = { id, workspace, owner: companyId(workspace) };
      document.getElementById('reference-edit-title').value = ref.title;
      document.getElementById('reference-edit-kind').value = ref.kind;
      document.getElementById('reference-edit-material').value = ref.material;
      document.getElementById('reference-edit-description').value = ref.description;
      const modal = document.getElementById('reference-editor');
      modal.classList.remove('hidden'); modal.classList.add('flex');
      const preview = document.getElementById('reference-edit-preview'); preview.removeAttribute('src');
      document.getElementById('reference-editor-status').textContent = 'جاري تحميل الصورة...';
      const current = editor;
      const image = await getImage(current.owner, id);
      if (editor !== current) return;
      preview.src = dataUrl(image); document.getElementById('reference-editor-status').textContent = '';
    } catch (error) { document.getElementById('reference-editor-status').textContent = StorageEngine.describeError(error); App.showError(error); }
  }
  function closeEditor() {
    if (busy) return;
    editor = null;
    const modal = document.getElementById('reference-editor');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  }
  async function saveEditor() {
    let acquired = false;
    try {
      ensureIdle(); if (!editor) return;
      const { id, workspace } = editor;
      const ref = refs(workspace).find(item => item.id === id);
      if (!ref) throw new Error('الصورة مش موجودة.');
      const updated = { ...ref, title: document.getElementById('reference-edit-title').value.trim(),
        kind: document.getElementById('reference-edit-kind').value, material: document.getElementById('reference-edit-material').value.trim(),
        description: document.getElementById('reference-edit-description').value.trim() };
      if (!updated.title) throw new Error('اكتب اسم للصورة.');
      StorageEngine.validateReferenceMetadata(updated);
      busy = true; acquired = true; Object.assign(ref, updated); await App.persistWorkspace(workspace);
      busy = false; closeEditor(); refresh(); App.showToast('تم حفظ بيانات الصورة');
    } catch (error) { App.showError(error); } finally { if (acquired) busy = false; }
  }
  async function describeImage() {
    const button = document.getElementById('btn-describe-reference');
    let acquired = false;
    try {
      ensureIdle(); if (!editor) return;
      const current = editor; busy = true; acquired = true; button.disabled = true;
      const ref = refs(current.workspace).find(item => item.id === current.id);
      const image = await getImage(current.owner, current.id);
      document.getElementById('reference-editor-status').textContent = 'جاري قراءة الصورة...';
      const description = await AIEngine.describeReference({ ...snapshot(ref), image });
      if (editor !== current) return;
      document.getElementById('reference-edit-description').value = description;
      document.getElementById('reference-editor-status').textContent = 'وصف مقترح من الصورة. راجعه واضغط حفظ.';
    } catch (error) { document.getElementById('reference-editor-status').textContent = StorageEngine.describeError(error); App.showError(error); }
    finally { if (acquired) { busy = false; button.disabled = false; } }
  }
  async function removeReference(id) {
    let acquired = false;
    try {
      ensureIdle(); const workspace = App.getCurrentWorkspace();
      if (!refs(workspace).some(ref => ref.id === id) || !confirm('إزالة الصورة من المكتبة؟ البوستات المرتبطة بتحتفظ بمرجعها، ونسخة الاسترجاع متاحة.')) return;
      busy = true; acquired = true; await App.checkpoint(workspace);
      workspace.assets.references = refs(workspace).filter(ref => ref.id !== id);
      workspace.assets.selectedReferenceIds = selected(workspace).filter(value => value !== id);
      await App.persistWorkspace(workspace); refresh();
    } catch (error) { App.showError(error); } finally { if (acquired) busy = false; }
  }

  function renderPostReferences(post, workspace) {
    const box = document.getElementById('post-reference-images');
    if (!box) return;
    const version = ++postVersion;
    const list = post?.referenceImages || [];
    box.innerHTML = list.length ? '<h4 class="text-xs font-bold">صور اتبعتت مع طلب التوليد</h4><div class="reference-post-grid">' + list.map(ref => `<figure><img id="post-reference-${ref.id}" alt="${escape(ref.title)}" /><figcaption class="text-[11px]">${escape(ref.title)}</figcaption><p id="post-reference-error-${ref.id}" class="text-[11px] text-rose-700"></p></figure>`).join('') + '</div>' : '';
    for (const ref of list) getImage(companyId(workspace), ref.id).then(image => {
      if (version === postVersion) document.getElementById('post-reference-' + ref.id).src = dataUrl(image);
    }).catch(error => { if (version === postVersion) document.getElementById('post-reference-error-' + ref.id).textContent = StorageEngine.describeError(error); });
  }
  return { isBusy, render, refresh, prepareReferences, toggleSelection, clearSelection, compressImage, upload, openEditor, closeEditor, saveEditor, describeImage, removeReference, renderPostReferences };
})();
