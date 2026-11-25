const ContentMemory = (() => {
  let busy = false, publicationEditor = null, exclusionEditor = null, saturationEditor = null, version = 0, signature = '';
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = value => Math.min(100, Math.max(0, value));
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\u0640\u064B-\u065F\u0670]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/[^\p{L}\p{N}]/gu, '');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const imageSnapshot = ref => ({ id: ref.id, title: ref.title, kind: ref.kind, material: ref.material, description: ref.description });
  const hash = value => { let code = 2166136261; for (const char of value) code = Math.imul(code ^ char.charCodeAt(0), 16777619); return (code >>> 0).toString(16).padStart(8, '0'); };
  const isBusy = () => busy;
  function today() { const parts = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); return ['year','month','day'].map(type => parts.find(part => part.type === type).value).join('-'); }
  function active(workspace) { return (workspace.publicationHistory || []).filter(entry => !entry.voided); }
  function count(workspace, ideaId) { return active(workspace).filter(entry => entry.ideaId === ideaId && entry.countsTowardSaturation).length; }
  function recalculate(workspace) {
    for (const idea of workspace.ideas) {
      const publications = count(workspace, idea.id);
      if (!Number.isSafeInteger(idea.saturationBase)) idea.saturationBase = clamp(Math.round(Number(idea.saturation) || 0)) - publications * 25;
      idea.saturation = clamp(idea.saturationBase + publications * 25);
    }
  }
  function ensure(workspace) {
    if (!workspace.publicationHistory) workspace.publicationHistory = [];
    for (const [index, idea] of workspace.ideas.entries()) if (!idea.id) idea.id = 'idea-legacy-' + hash(idea.title + '|' + index);
    for (const [index, post] of workspace.calendar.entries()) if (!post.id) post.id = 'post-legacy-' + hash(post.title + '|' + index);
    if (workspace.contentMemoryVersion !== 1) {
      for (const post of workspace.calendar) {
        if (post.status !== 'اترفع' || workspace.publicationHistory.some(entry => !entry.voided && entry.sourcePostId === post.id)) continue;
        let idea = workspace.ideas.find(item => AIEngine.matchesIdea(item, post));
        if (!idea) { idea = { id: 'idea-legacy-' + hash(post.id), title: post.ideaTitle || post.title, insight: '', segment: post.segment || 'B2C', status: 'approved', saturation: 0 }; workspace.ideas.push(idea); }
        const id = 'pub-legacy-' + hash(post.id);
        workspace.publicationHistory.push({ id, sourcePostId: post.id, ideaId: idea.id, title: String(post.title).slice(0,500), ideaTitle: String(post.ideaTitle || idea.title).slice(0,500), copy: String(post.copy || '').slice(0,50000),
          material: String(post.material || '').slice(0,2000), segment: post.segment || 'B2C', materialSnapshots: clone(post.materialSnapshots || []), referenceImages: clone(post.referenceImages || []), publishedImages: clone(post.publishedImages || []),
          publishedAt: '', channel: 'غير مسجّل', url: '', recordedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), previousStatus: 'معتمد', countsTowardSaturation: false, legacy: true, voided: false });
        post.publicationId = id;
      }
      workspace.contentMemoryVersion = 1;
    }
    recalculate(workspace);
    return workspace.publicationHistory;
  }
  function activeForPost(workspace, postId) { return active(workspace).find(entry => entry.sourcePostId === postId); }
  function hasIdeaHistory(workspace, ideaId) { return active(workspace).some(entry => entry.ideaId === ideaId); }
  function resolveIdea(workspace, title, preferredId = '') {
    let idea = workspace.ideas.find(item => preferredId && item.id === preferredId) || workspace.ideas.find(item => normalize(item.title) === normalize(title));
    if (!idea) { idea = { id: 'idea-' + crypto.randomUUID(), title, insight: '', segment: 'B2C', status: 'approved', saturation: 0, saturationBase: 0 }; workspace.ideas.unshift(idea); }
    if (!AIEngine.exclusionLabel(idea)) idea.status = 'approved';
    return idea;
  }
  function registerPublication(workspace, values, sourcePostId = '', existingId = '') {
    ensure(workspace);
    const original = existingId ? workspace.publicationHistory.find(entry => entry.id === existingId) : null;
    if (existingId && !original) throw new Error('تسجيل النشر مش موجود.');
    if (original && !sourcePostId) sourcePostId = original.sourcePostId;
    const sourcePost = sourcePostId ? workspace.calendar.find(post => post.id === sourcePostId) : null;
    if (sourcePostId && !sourcePost && !original) throw new Error('البوست الأصلي مش موجود في الكاليندر.');
    if (sourcePostId && active(workspace).some(entry => entry.sourcePostId === sourcePostId && entry.id !== existingId)) throw new Error('البوست متسجّل منشور بالفعل.');
    const base = original || sourcePost || {};
    const entry = { id: original?.id || 'pub-' + crypto.randomUUID(), sourcePostId, ideaId: 'pending-validation', title: values.title.trim(), ideaTitle: values.ideaTitle.trim(), copy: values.copy,
      material: values.material, segment: values.segment || base.segment || 'B2C', materialSnapshots: clone(base.materialSnapshots || []), referenceImages: clone(base.referenceImages || []), publishedImages: clone(values.publishedImages || []),
      publishedAt: values.publishedAt, channel: values.channel.trim(), url: values.url.trim(), recordedAt: original?.recordedAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
      previousStatus: original?.previousStatus || (sourcePost?.status === 'اترفع' ? 'معتمد' : sourcePost?.status || 'مسودة'), countsTowardSaturation: original?.countsTowardSaturation ?? true, legacy: original?.legacy || false, voided: false };
    StorageEngine.validatePublication(entry);
    if (!entry.publishedAt || entry.publishedAt > today()) throw new Error('اختار تاريخ نشر صحيح، لحد تاريخ النهارده.');
    if (entry.url && active(workspace).some(item => item.id !== existingId && item.url === entry.url)) throw new Error('رابط المنشور متسجّل بالفعل.');
    if (active(workspace).some(item => item.id !== existingId && item.publishedAt === entry.publishedAt && normalize(item.channel) === normalize(entry.channel) && normalize(item.title) === normalize(entry.title) && normalize(item.copy) === normalize(entry.copy))) throw new Error('نفس المنشور متسجّل في اليوم والمنصة دول.');
    const preferred = original?.ideaTitle === entry.ideaTitle ? original.ideaId : sourcePost?.ideaTitle === entry.ideaTitle ? sourcePost.ideaId : '';
    entry.ideaId = resolveIdea(workspace, entry.ideaTitle, preferred).id;
    if (original) Object.assign(original, entry); else workspace.publicationHistory.unshift(entry);
    if (sourcePost) { sourcePost.status = 'اترفع'; sourcePost.publicationId = entry.id; sourcePost.publishedAt = entry.publishedAt; sourcePost.publishedImages = clone(entry.publishedImages); }
    recalculate(workspace);
    return original || entry;
  }
  function voidPublication(workspace, id) {
    ensure(workspace); const entry = workspace.publicationHistory.find(item => item.id === id); if (!entry || entry.voided) return;
    entry.voided = true; entry.updatedAt = new Date().toISOString();
    const post = workspace.calendar.find(item => item.id === entry.sourcePostId);
    if (post?.publicationId === id) { post.status = entry.previousStatus || 'معتمد'; delete post.publicationId; delete post.publishedAt; post.publishedImages = []; }
    recalculate(workspace);
  }
  function setSaturation(workspace, ideaId, value, reason = '') {
    ensure(workspace);
    if (!Number.isInteger(value) || value < 0 || value > 100 || typeof reason !== 'string' || reason.length > 500) throw new Error('التشبع رقم صحيح من 0 لحد 100، والسبب لحد 500 حرف.');
    const idea = workspace.ideas.find(item => item.id === ideaId); if (!idea) throw new Error('الفكرة مش موجودة.');
    if (!idea.saturationAdjustments) idea.saturationAdjustments = [];
    idea.saturationAdjustments.push({ before: idea.saturation, value, reason, at: new Date().toISOString() });
    idea.saturationBase = value - count(workspace, ideaId) * 25; recalculate(workspace);
  }
  function applyExclusion(workspace, target, reason) {
    ensure(workspace);
    if (!['post','idea'].includes(target.kind) || !['rejected','saturated'].includes(target.status) || typeof reason !== 'string' || !reason.trim() || reason.length > 2000) throw new Error('اكتب سبب واضح للاستبعاد، لحد 2000 حرف.');
    let idea;
    if (target.kind === 'post') {
      const post = workspace.calendar[target.index]; if (!post) throw new Error('البوست مش موجود.');
      if (activeForPost(workspace, post.id)) throw new Error('البوست مسجّل منشور. استخدم سجل المنشور لإلغاء تسجيل النشر الأول.');
      idea = resolveIdea(workspace, post.ideaTitle || post.title, post.ideaId);
      post.ideaId = idea.id; post.status = target.status === 'rejected' ? 'مرفوض' : 'متشبع'; post.exclusionReason = reason.trim();
    } else { idea = workspace.ideas[target.index]; if (!idea) throw new Error('الفكرة مش موجودة.'); }
    idea.status = target.status; idea.exclusionReason = reason.trim();
    if (!idea.exclusionHistory) idea.exclusionHistory = [];
    idea.exclusionHistory.push({ status: target.status, reason: reason.trim(), at: new Date().toISOString(), source: target.kind });
    return idea;
  }
  function allowIdea(workspace, index) { ensure(workspace); const idea = workspace.ideas[index]; if (!idea) return; idea.status = 'approved'; idea.exclusionReason = ''; recalculate(workspace); }
  function historyContext(workspace) {
    const list = active(workspace).sort((a,b) => b.publishedAt.localeCompare(a.publishedAt));
    const recent = list.slice(0,30).map(entry => ({ title: entry.title, angle: entry.ideaTitle, date: entry.publishedAt || 'غير مسجّل', channel: entry.channel, copy: entry.copy.slice(0,220) }));
    const frequency = new Map();
    for (const entry of list.slice(30)) frequency.set(entry.ideaTitle, (frequency.get(entry.ideaTitle) || 0) + 1);
    const olderAngles = [...frequency].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([angle,publications])=>({angle,publications}));
    return '[PUBLISHED MEMORY - ANTI-REPETITION ONLY, NOT PRODUCT FACTS]\n' + JSON.stringify({ recent, olderAngles }) + '\nممنوع نسخ منشور سابق أو عنوانه. الزاوية السابقة تحتاج معالجة مختلفة بوضوح وتظل خاضعة للتشبع والاستبعاد. سجل النشر مش مصدر مواصفات خامات.';
  }
  function isDuplicate(workspace, items) {
    return items.some(item => active(workspace).some(entry => (normalize(item.title) && normalize(item.title) === normalize(entry.title)) || (normalize(item.copy) && normalize(item.copy) === normalize(entry.copy))));
  }
  function idle() { if (busy || AssetLibrary.isBusy() || MaterialCatalog.isBusy() || ContentStudio.isGenerating() || App.isWorkspaceBusy()) throw new Error('استنى لحد ما العملية الحالية تخلص.'); }
  function refresh() { signature = ''; App.refreshUI(); }
  const show = id => { const modal = document.getElementById(id); modal.classList.remove('hidden'); modal.classList.add('flex'); };
  const hide = id => { const modal = document.getElementById(id); modal.classList.add('hidden'); modal.classList.remove('flex'); };
  function openPublish(index = null, publicationId = '') {
    try {
      idle(); const workspace = App.getCurrentWorkspace(); ensure(workspace);
      const post = index === null ? null : workspace.calendar[index];
      if (index !== null && !post) throw new Error('البوست مش موجود.');
      const original = publicationId ? workspace.publicationHistory.find(item => item.id === publicationId) : post ? activeForPost(workspace, post.id) : null;
      if (publicationId && !original) throw new Error('تسجيل النشر مش موجود.');
      const base = original || post || {};
      const pool = [...new Map([...(base.publishedImages || []), ...(workspace.assets.references || [])].map(ref=>[ref.id,imageSnapshot(ref)])).values()];
      publicationEditor = { workspace, owner: App.getWorkspaceCompanyId(workspace), sourcePostId: original?.sourcePostId || post?.id || '', existingId: original?.id || '', selected: (base.publishedImages || []).map(ref=>ref.id), pool };
      for (const field of ['title','copy','material']) document.getElementById('publication-edit-'+field).value = base[field] || '';
      document.getElementById('publication-edit-angle').value = base.ideaTitle || base.title || '';
      document.getElementById('publication-edit-date').value = original ? original.publishedAt : today();
      document.getElementById('publication-edit-date').max = today();
      document.getElementById('publication-edit-channel').value = original?.channel || 'Facebook';
      document.getElementById('publication-edit-url').value = original?.url || '';
      document.getElementById('publication-editor-status').textContent = original?.legacy ? 'تسجيل قديم: تعديل التاريخ والبيانات من غير زيادة إضافية للتشبع.' : 'تسجيل النشر داخل التطبيق فقط. كل تسجيل جديد بيضيف 25 نقطة لتشبع الزاوية، لحد 100%.';
      document.getElementById('publication-edit-images').innerHTML = pool.length ? pool.map(ref=>`<label class="text-xs flex items-center gap-2"><input type="checkbox" ${publicationEditor.selected.includes(ref.id)?'checked':''} onchange="ContentMemory.togglePublishedImage('${ref.id}',this.checked,this)" />${escape(ref.title)}</label>`).join('') : '<p class="text-xs text-muted">ارفع صور المنشور الفعلية في مكتبة المرجعيات، وبعدين اختارها هنا.</p>';
      show('publication-editor');
    } catch (error) { App.showError(error); }
  }
  function closePublish() { if (busy) return; publicationEditor = null; hide('publication-editor'); }
  function togglePublishedImage(id, checked, checkbox) {
    if (!publicationEditor || busy) return;
    const ids = publicationEditor.selected.filter(value=>value!==id);
    if (!publicationEditor.pool.some(ref=>ref.id===id) || (checked && ids.length>=10)) { if (checkbox) checkbox.checked=publicationEditor.selected.includes(id); App.showError(new Error('الحد الأقصى 10 صور للمنشور.')); return; }
    publicationEditor.selected=checked?[...ids,id]:ids;
  }
  async function savePublication() {
    let acquired = false;
    try {
      idle(); if (!publicationEditor) return; const current=publicationEditor;
      const values={ title:document.getElementById('publication-edit-title').value, ideaTitle:document.getElementById('publication-edit-angle').value, copy:document.getElementById('publication-edit-copy').value, material:document.getElementById('publication-edit-material').value,
        publishedAt:document.getElementById('publication-edit-date').value, channel:document.getElementById('publication-edit-channel').value, url:document.getElementById('publication-edit-url').value, publishedImages:current.selected.map(id=>imageSnapshot(current.pool.find(ref=>ref.id===id))) };
      // Validate against a copy before checkpointing or changing live state.
      const checked=clone(current.workspace);registerPublication(checked,values,current.sourcePostId,current.existingId);
      busy=true;acquired=true;await App.checkpoint(current.workspace);registerPublication(current.workspace,values,current.sourcePostId,current.existingId);
      await App.persistWorkspace(current.workspace);busy=false;closePublish();refresh();App.showToast('تم حفظ تسجيل النشر');
    } catch(error){App.showError(error);} finally{if(acquired)busy=false;}
  }
  async function cancelPublication(id) {
    let acquired=false;
    try { idle();const ws=App.getCurrentWorkspace();const entry=ensure(ws).find(item=>item.id===id);if(!entry||entry.voided||!confirm('إلغاء تسجيل النشر؟ مساهمته في التشبع بتتلغي، والبيانات بتفضل محفوظة في السجل.'))return;
      busy=true;acquired=true;await App.checkpoint(ws);voidPublication(ws,id);await App.persistWorkspace(ws);refresh();App.showToast('تم إلغاء تسجيل النشر');
    }catch(error){App.showError(error);}finally{if(acquired)busy=false;}
  }
  function openExclusion(kind,index,status) {
    try{idle();const workspace=App.getCurrentWorkspace();ensure(workspace);const item=kind==='post'?workspace.calendar[index]:workspace.ideas[index];if(!item||!['rejected','saturated'].includes(status))return;
      if(kind==='post'&&activeForPost(workspace,item.id))throw new Error('البوست مسجّل منشور. استخدم سجل المنشور لإلغاء تسجيل النشر الأول.');
      exclusionEditor={workspace,owner:App.getWorkspaceCompanyId(workspace),kind,index,status};document.getElementById('exclusion-reason').value=item.exclusionReason||'';
      document.getElementById('exclusion-heading').textContent=(status==='rejected'?'سبب رفض: ':'سبب تشبع: ')+item.title;show('exclusion-editor');
    }catch(error){App.showError(error);}
  }
  function closeExclusion(){if(busy)return;exclusionEditor=null;hide('exclusion-editor');}
  async function saveExclusion(){let acquired=false;try{idle();if(!exclusionEditor)return;const current=exclusionEditor,reason=document.getElementById('exclusion-reason').value;
    applyExclusion(clone(current.workspace),current,reason);busy=true;acquired=true;await App.checkpoint(current.workspace);applyExclusion(current.workspace,current,reason);await App.persistWorkspace(current.workspace);
    busy=false;closeExclusion();refresh();App.showToast('تم حفظ سبب الاستبعاد');}catch(error){App.showError(error);}finally{if(acquired)busy=false;}}
  function openSaturation(index){try{idle();const workspace=App.getCurrentWorkspace();ensure(workspace);const idea=workspace.ideas[index];if(!idea)return;saturationEditor={workspace,owner:App.getWorkspaceCompanyId(workspace),ideaId:idea.id};
    document.getElementById('saturation-heading').textContent='تشبع: '+idea.title;document.getElementById('saturation-value').value=idea.saturation;document.getElementById('saturation-reason').value='';show('saturation-editor');}catch(error){App.showError(error);}}
  function closeSaturation(){if(busy)return;saturationEditor=null;hide('saturation-editor');}
  async function saveSaturation(){let acquired=false;try{idle();if(!saturationEditor)return;const current=saturationEditor,raw=String(document.getElementById('saturation-value').value).trim();if(!raw)throw new Error('اكتب نسبة التشبع.');const value=Number(raw),reason=document.getElementById('saturation-reason').value.trim();
    setSaturation(clone(current.workspace),current.ideaId,value,reason);busy=true;acquired=true;await App.checkpoint(current.workspace);setSaturation(current.workspace,current.ideaId,value,reason);await App.persistWorkspace(current.workspace);
    busy=false;closeSaturation();refresh();App.showToast('تم تعديل التشبع');}catch(error){App.showError(error);}finally{if(acquired)busy=false;}}
  async function reopenIdea(index){let acquired=false;try{idle();const ws=App.getCurrentWorkspace();if(!ws.ideas[index]||!confirm('إعادة إتاحة الفكرة للتوليد؟ التشبع الحالي وأسباب الاستبعاد القديمة محفوظين.'))return;busy=true;acquired=true;await App.checkpoint(ws);allowIdea(ws,index);await App.persistWorkspace(ws);refresh();}catch(error){App.showError(error);}finally{if(acquired)busy=false;}}
  function render(workspace){ensure(workspace);const grid=document.getElementById('publication-history-grid');if(!grid)return;
    const owner=App.getWorkspaceCompanyId(workspace);if(publicationEditor&&publicationEditor.owner!==owner)closePublish();if(exclusionEditor&&exclusionEditor.owner!==owner)closeExclusion();if(saturationEditor&&saturationEditor.owner!==owner)closeSaturation();
    const all=workspace.publicationHistory,query=document.getElementById('publication-search').value.trim().toLowerCase(),filter=document.getElementById('publication-filter').value||'active';
    document.getElementById('publication-history-count').textContent=active(workspace).length+' منشور مسجّل';
    if(document.getElementById('view-calendar')?.classList.contains?.('hidden')){signature='';++version;return;}
    const next=JSON.stringify([owner,all,query,filter]);if(next===signature)return;signature=next;const current=++version;
    const list=all.filter(entry=>(filter==='all'||(filter==='voided'?entry.voided:!entry.voided))&&(!query||[entry.title,entry.ideaTitle,entry.copy,entry.channel,entry.material,entry.publishedAt].join(' ').toLowerCase().includes(query))).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
    grid.innerHTML=list.length?list.map(entry=>`<article class="publication-card"><div class="flex flex-wrap justify-between gap-2"><h4 class="font-bold text-sm">${escape(entry.title)}</h4><span class="text-xs">${entry.voided?'تسجيل ملغي':escape(entry.publishedAt||'تاريخ غير مسجّل')}</span></div><p class="text-xs text-muted">الزاوية: ${escape(entry.ideaTitle)} · ${escape(entry.channel)}</p><p class="text-xs whitespace-pre-wrap">${escape(entry.copy)}</p><p class="text-[11px] text-muted">${entry.countsTowardSaturation?'احتساب التشبع عند النشر':'تسجيل قديم بدون زيادة إضافية'}</p>
      <div class="reference-post-grid">${entry.publishedImages.map(ref=>`<img id="published-image-${entry.id}-${ref.id}" alt="${escape(ref.title)}" loading="lazy" />`).join('')}</div>${entry.url?`<a href="${escape(entry.url)}" target="_blank" rel="noopener noreferrer" class="text-xs text-bronze">فتح رابط المنشور</a>`:''}
      <div class="flex gap-3 text-xs"><button onclick="ContentMemory.openPublish(null,'${entry.id}')" class="font-bold">${entry.voided?'استرجاع تسجيل النشر':'تعديل التسجيل'}</button>${!entry.voided?`<button onclick="ContentMemory.cancelPublication('${entry.id}')" class="text-rose-700">إلغاء تسجيل النشر</button>`:''}</div></article>`).join(''):'<p class="text-xs text-muted">مفيش منشورات مطابقة. سجّل النشر من الكاليندر أو أضف منشور قديم يدويًا.</p>';
    for(const entry of list)for(const ref of entry.publishedImages)StorageEngine.loadReferenceImage(owner,ref.id).then(image=>{if(current===version)document.getElementById('published-image-'+entry.id+'-'+ref.id).src='data:'+image.mimeType+';base64,'+image.data;}).catch(()=>{if(current===version)document.getElementById('published-image-'+entry.id+'-'+ref.id).alt=ref.title+' — الصورة مش متاحة على الجهاز';});
  }
  return {isBusy,today,ensure,recalculate,activeForPost,hasIdeaHistory,registerPublication,voidPublication,setSaturation,applyExclusion,allowIdea,historyContext,isDuplicate,openPublish,closePublish,togglePublishedImage,savePublication,cancelPublication,openExclusion,closeExclusion,saveExclusion,openSaturation,closeSaturation,saveSaturation,reopenIdea,render,refresh};
})();
