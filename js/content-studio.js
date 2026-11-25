const ContentStudio = (() => {
  const EXCLUSION_OPTIONS = { 'مرفوض': 'rejected', 'متشبع': 'saturated' };
  const POST_STATUSES = ['مسودة', 'معتمد', 'اتعمل', 'اترفع', ...Object.keys(EXCLUSION_OPTIONS)];
  let selectedPostIndex = 0;
  let generating = false;
  function isGenerating() { return generating; }

  function getStatusBadgeClass(status) {
    if (status === 'معتمد') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'اتعمل') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (EXCLUSION_OPTIONS[status]) return 'bg-rose-50 text-rose-800 border-rose-200';
    if (status === 'اترفع') return 'bg-ink text-white border-ink';
    return 'bg-stoneBg text-muted border-borderSubtle';
  }

  function getSaturationColor(sat) {
    if (sat >= 75) return 'bg-rose-600';
    if (sat >= 50) return 'bg-amber-500';
    return 'bg-emerald-600';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderCalendarView(ws) {
    const goalInput = document.getElementById('goal-objective-input');
    if (goalInput) goalInput.value = ws.goal?.objective || '';

    const satStrip = document.getElementById('saturation-pills');
    if (satStrip) {
      const approvedIdeas = (ws.ideas || []).filter(i => i.status === 'approved');
      satStrip.innerHTML = approvedIdeas.length === 0
        ? `<span class="text-xs text-muted">لا توجد أفكار معتمدة بعد.</span>`
        : approvedIdeas.slice(0, 5).map(idea => {
            const cls = idea.saturation >= 75 ? 'bg-rose-50 text-rose-800 border-rose-200' : (idea.saturation >= 50 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200');
            const lbl = idea.saturation >= 75 ? 'مشبع' : (idea.saturation >= 50 ? 'متوسط' : 'متاح');
            return `<span class="px-2.5 py-1 rounded-md text-xs font-medium border ${cls}">${lbl}: ${escapeHtml(idea.title.slice(0, 22))} (${idea.saturation}%)</span>`;
          }).join('');
    }

    const tbody = document.getElementById('posts-table-body');
    const posts = ws.calendar || [];
    if (!posts.length) AssetLibrary.renderPostReferences(null, ws);
    if (!tbody) return;

    if (posts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-muted text-xs">الكاليندر فارغة حالياً. اضغط على <strong>"توليد كاليندر (8 بوستات)"</strong> للبدء.</td></tr>`;
      const panel = document.getElementById('brief-inspector-content');
      if (panel) panel.classList.add('opacity-40', 'pointer-events-none');
      return;
    }

    if (selectedPostIndex >= posts.length) selectedPostIndex = 0;

    tbody.innerHTML = posts.map((p, idx) => `
      <tr onclick="ContentStudio.selectPost(${idx})" class="cursor-pointer transition ${idx === selectedPostIndex ? 'bg-bronzeSoft/60' : 'hover:bg-stoneBg/70'}">
        <td class="py-3 px-3 font-bold text-muted">${String(idx + 1).padStart(2, '0')}</td>
        <td class="py-3 px-3 font-bold text-ink">${escapeHtml(p.title)}</td>
        <td class="py-3 px-3 text-muted">${escapeHtml(p.ideaTitle || '-')}</td>
        <td class="py-3 px-3 font-medium text-ink">${escapeHtml(p.material || '-')}</td>
        <td class="py-3 px-3">
          <select aria-label="حالة البوست" onclick="event.stopPropagation()" onchange="ContentStudio.setPostStatus(${idx}, this.value)" class="px-2.5 py-1 rounded-md text-[11px] font-bold border ${getStatusBadgeClass(p.status)}">
            ${POST_STATUSES.map(status => `<option value="${status}" ${status === (p.status || 'مسودة') ? 'selected' : ''}>${status}</option>`).join('')}
          </select>
        </td>
      </tr>
    `).join('');

    const post = posts[selectedPostIndex];
    AssetLibrary.renderPostReferences(post, ws);
    const panel = document.getElementById('brief-inspector-content');
    if (panel && post) {
      panel.classList.remove('opacity-40', 'pointer-events-none');
      document.getElementById('brief-badge').textContent = `بوست #${String(selectedPostIndex + 1).padStart(2, '0')} • ${post.segment || 'B2C'}`;
      document.getElementById('brief-title').textContent = post.title || '';
      document.getElementById('brief-copy').value = post.copy || '';
      document.getElementById('brief-material').textContent = post.material || '-';
      document.getElementById('brief-colors').textContent = post.colorPalette || '-';
      document.getElementById('brief-mood').textContent = post.mood || '-';
      document.getElementById('brief-visual').textContent = post.visualDirection || '';
      document.getElementById('brief-designer').textContent = post.designerBrief || '-';
      const refBox = document.getElementById('brief-ref-image-box');
      const refImg = document.getElementById('brief-ref-image');
      if (post.referenceImage) { refImg.src = post.referenceImage; refBox.classList.remove('hidden'); }
      else { refBox.classList.add('hidden'); refImg.src = ''; }
    }
  }

  function selectPost(idx) { selectedPostIndex = idx; App.refreshUI(); }

  async function setPostStatus(idx, next) {
    const ws = App.getCurrentWorkspace();
    const post = ws.calendar[idx];
    if (!post || !POST_STATUSES.includes(next)) return;

    const match = ws.ideas.find(idea => AIEngine.matchesIdea(idea, post));
    const excludedStatus = EXCLUSION_OPTIONS[next];
    if (excludedStatus) {
      if (match) {
        match.status = excludedStatus;
      } else {
        ws.ideas.unshift({
          id: post.ideaId && post.ideaId !== 'new' ? post.ideaId : 'idea-' + Date.now(),
          title: post.ideaTitle || post.title,
          insight: post.copy || post.title,
          segment: post.segment || 'B2C',
          saturation: 0,
          status: excludedStatus
        });
      }
    } else if (next === 'معتمد' && !post.saturationCounted) {
      post.saturationCounted = true;
      if (match && !AIEngine.exclusionLabel(match)) {
        match.saturation = Math.min(100, (match.saturation || 0) + 25);
        match.status = 'approved';
      } else if (!match && post.ideaTitle) {
        ws.ideas.unshift({ id: 'idea-' + Date.now(), title: post.ideaTitle, insight: post.title, segment: post.segment || 'B2C', saturation: 25, status: 'approved' });
      }
    }
    post.status = next;
    await saveStatusChange(excludedStatus ? 'تم استبعاد الزاوية من التوليد' : 'تم تغيير الحالة إلى ' + next);
  }

  async function saveStatusChange(message) {
    try {
      await App.persistWorkspace();
      App.showToast(message);
    } catch (e) {
      App.showError(e);
    }
    App.refreshUI();
  }

  async function excludeIdea(i, status) {
    const idea = App.getCurrentWorkspace().ideas[i];
    if (!idea || !Object.values(EXCLUSION_OPTIONS).includes(status)) return;

    idea.status = status;
    await saveStatusChange('تم استبعاد الزاوية من التوليد');
  }

  async function saveEditedCopy() {
    const ws = App.getCurrentWorkspace();
    const post = ws.calendar[selectedPostIndex];
    if (!post) return;
    post.copy = document.getElementById('brief-copy').value;
    await App.persistWorkspace();
    App.showToast('تم حفظ تعديل النص');
  }

  async function handleGenerateCalendar() {
    if (generating || AssetLibrary.isBusy() || App.isWorkspaceBusy()) return;
    const btn = document.getElementById('btn-gen-calendar');
    const orig = btn.innerHTML;
    const mode = document.getElementById('calendar-generation-mode').value;
    const workspace = App.getCurrentWorkspace();
    if (mode === 'replace' && workspace.calendar.length && !confirm('استبدال الكاليندر الحالية بعد نجاح التوليد؟ هتتحفظ نسخة للاسترجاع.')) return;
    try {
      generating = true;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner ml-1.5"></span> جاري التوليد...`;
      const ws = App.getCurrentWorkspace();
      const references = await AssetLibrary.prepareReferences(ws);
      const posts = await AIEngine.generateCalendar8(ws, references);
      if (!Array.isArray(posts) || posts.length !== 8 || posts.some(p => !p || typeof p.title !== 'string')) throw new Error('رد التوليد غير مكتمل. الكاليندر الحالية لم تتغير.');
      const generated = posts.map(p => ({ ...p, status: 'مسودة', saturationCounted: false, referenceImage: '' }));
      await App.checkpoint(ws);
      selectedPostIndex = mode === 'replace' ? 0 : ws.calendar.length;
      ws.calendar = mode === 'replace' ? generated : [...ws.calendar, ...generated];
      await App.persistWorkspace(ws);
      App.refreshUI();
      App.showToast('تم توليد 8 بوستات بنجاح');
    } catch (e) { App.showError(e); }
    finally { generating = false; btn.disabled = false; btn.innerHTML = orig; }
  }

  async function handleGenerateSinglePost() {
    if (generating || AssetLibrary.isBusy() || App.isWorkspaceBusy()) return;
    const btn = document.getElementById('btn-gen-single');
    const orig = btn.innerHTML;
    const noteEl = document.getElementById('single-post-note');
    const note = noteEl ? noteEl.value.trim() : '';
    try {
      generating = true;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner spinner-dark ml-1.5"></span> جاري التوليد...`;
      const ws = App.getCurrentWorkspace();
      const references = await AssetLibrary.prepareReferences(ws);
      const post = await AIEngine.generateSinglePost(ws, note, references);
      ws.calendar.unshift({ ...post, status: 'مسودة', saturationCounted: false, referenceImage: '' });
      if (noteEl) noteEl.value = '';
      selectedPostIndex = 0;
      await App.persistWorkspace();
      App.refreshUI();
      App.showToast('تم توليد البوست الفردي');
    } catch (e) { App.showError(e); }
    finally { generating = false; btn.disabled = false; btn.innerHTML = orig; }
  }

  async function handleGenerateRefImage() {
    if (generating || AssetLibrary.isBusy() || App.isWorkspaceBusy()) return;
    const ws = App.getCurrentWorkspace();
    const post = ws.calendar[selectedPostIndex];
    if (!post) return;
    const btn = document.getElementById('btn-gen-ref-img');
    const orig = btn.innerHTML;
    try {
      generating = true;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner ml-1.5"></span> جاري توليد الصورة...`;
      post.referenceImage = await AIEngine.generateReferenceImage(post);
      await App.persistWorkspace();
      App.refreshUI();
      App.showToast('تم توليد صورة الريفرنس');
    } catch (e) { App.showError(e); }
    finally { generating = false; btn.disabled = false; btn.innerHTML = orig; }
  }

  function exportTeamCalendarFile() {
    const ws = App.getCurrentWorkspace();
    const company = App.getCurrentCompany();
    const posts = ws.calendar || [];
    if (posts.length === 0) { App.showToast('الكاليندر فارغة', true); return; }
    const dateStr = new Date().toISOString().slice(0, 10);
    let html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كاليندر ${escapeHtml(company.name)}</title><style>body{font-family:Tahoma,sans-serif;background:#F8F7F4;padding:24px}.card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:18px;margin-bottom:16px}.copy{background:#F8F7F4;padding:12px;border-right:4px solid #9A7B4F;white-space:pre-wrap;margin:10px 0}</style></head><body><h1>كاليندر وبريف التيم — ${escapeHtml(company.name)} (${dateStr})</h1>`;
    posts.forEach((p, i) => {
      html += `<div class="card"><h3>#${i + 1} - ${escapeHtml(p.title)} (${escapeHtml(p.material || '')})</h3><div class="copy">${escapeHtml(p.copy || '')}</div><p><strong>تصور الصورة:</strong> ${escapeHtml(p.visualDirection || '')}</p><p><strong>الألوان والجو العام:</strong> ${escapeHtml(p.colorPalette || '')} | ${escapeHtml(p.mood || '')}</p><p><strong>بريف الديزاينر:</strong> ${escapeHtml(p.designerBrief || '')}</p></div>`;
    });
    html += `</body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    a.download = `${company.id}-calendar-${dateStr}.html`;
    a.click();
    App.showToast('تم تنزيل ملف الكاليندر للتيم');
  }

  function renderMemoryAndIdeasView(ws) {
    document.getElementById('core-identity').value = ws.brandCore?.identity || '';
    document.getElementById('core-tone').value = ws.brandCore?.tone || '';
    document.getElementById('core-segments').value = ws.brandCore?.segments || '';
    document.getElementById('core-materials').value = (ws.brandCore?.materials || []).join(', ');
    const rules = ws.brandCore?.rules || [];
    document.getElementById('rules-count-badge').textContent = `${rules.length} / 15 قاعدة`;
    document.getElementById('rules-list').innerHTML = rules.map((r, i) => `<li class="p-2 rounded-lg bg-stoneBg border border-borderSubtle flex justify-between gap-2 text-xs"><span>${escapeHtml(r)}</span><button onclick="ContentStudio.removeRule(${i})" class="text-rose-600 font-bold">✕</button></li>`).join('');
    const offers = ws.brandCore?.offers || [];
    document.getElementById('offers-list').innerHTML = offers.length === 0 ? `<p class="text-xs text-muted">لا توجد عروض.</p>` : offers.map((o, i) => `<div class="p-2.5 rounded-lg bg-stoneBg border border-borderSubtle text-xs flex justify-between"><div><strong class="text-ink">${escapeHtml(o.title)} (${escapeHtml(o.segment)})</strong><p class="text-muted">${escapeHtml(o.details)}</p></div><button onclick="ContentStudio.removeOffer(${i})" class="text-rose-600 font-bold">✕</button></div>`).join('');
    const ideas = ws.ideas || [];
    document.getElementById('ideas-library-grid').innerHTML = ideas.length === 0 ? `<p class="text-xs text-muted col-span-2">مكتبة الأفكار فارغة.</p>` : ideas.map((idea, i) => {
      const pend = idea.status === 'pending';
      const excluded = AIEngine.exclusionLabel(idea);
      return `<div class="p-3.5 rounded-xl border ${pend ? 'border-bronze bg-bronzeSoft/30' : 'border-borderSubtle bg-white'} space-y-2 text-xs">
        <div class="flex justify-between">
          <span class="px-2 py-0.5 rounded bg-stoneBg font-bold">${escapeHtml(idea.segment || 'B2C')}</span>
          ${excluded ? `<span class="px-2 py-0.5 rounded bg-rose-50 text-rose-800 font-bold">${excluded}</span>`
            : `<button onclick="ContentStudio.deleteIdea(${i})" aria-label="حذف الفكرة" class="text-muted hover:text-rose-600">✕</button>`}
        </div>
        <h4 class="font-bold text-ink">${escapeHtml(idea.title)}</h4>
        <p class="text-[11px] text-muted">${escapeHtml(idea.insight || '')}</p>
        ${excluded ? '' : `
          ${pend ? `<button onclick="ContentStudio.approveIdea(${i})" class="w-full py-1.5 rounded-lg font-bold bg-ink text-white">اعتماد ✓</button>`
            : `<div class="sat-bar"><div class="sat-fill ${getSaturationColor(idea.saturation)}" style="width:${idea.saturation}%"></div></div>`}
          <div class="flex flex-wrap gap-2">
            ${Object.entries(EXCLUSION_OPTIONS).map(([label, status]) =>
              `<button onclick="ContentStudio.excludeIdea(${i}, '${status}')" class="px-2 py-1 rounded border border-borderSubtle text-rose-800 hover:bg-rose-50">${label}</button>`).join('')}
          </div>`}
      </div>`;
    }).join('');
  }

  async function handleGenerateIdeas() {
    if (generating || AssetLibrary.isBusy() || App.isWorkspaceBusy()) return;
    const btn = document.getElementById('btn-gen-ideas');
    const orig = btn.innerHTML;
    try {
      generating = true;
      btn.disabled = true; btn.innerHTML = `<span class="spinner ml-1"></span> جاري الاستنباط...`;
      const ws = App.getCurrentWorkspace();
      const references = await AssetLibrary.prepareReferences(ws);
      const list = await AIEngine.generateIdeas(ws, 4, references);
      if (!Array.isArray(list) || !list.length || list.some(it => !it || typeof it.title !== 'string')) throw new Error('لم يتم استلام أفكار صالحة. حاول مرة تانية.');
      list.forEach(it => ws.ideas.unshift({ id: 'idea-' + Date.now() + Math.random(), title: it.title, insight: it.insight, referenceImages: it.referenceImages || [], segment: it.segment || 'B2C', saturation: 0, status: 'pending' }));
      await App.persistWorkspace(); App.refreshUI(); App.showToast('تم توليد 4 أفكار جديدة');
    } catch (e) { App.showError(e); }
    finally { generating = false; btn.disabled = false; btn.innerHTML = orig; }
  }

  async function approveIdea(i) { const ws = App.getCurrentWorkspace(); if (ws.ideas[i]?.status !== 'pending') return; ws.ideas[i].status = 'approved'; ws.ideas[i].saturation = 0; await App.persistWorkspace(); App.refreshUI(); }
  async function deleteIdea(i) { const ws = App.getCurrentWorkspace(); if (!ws.ideas[i] || AIEngine.exclusionLabel(ws.ideas[i])) return; if (!confirm('حذف الفكرة من المكتبة؟')) return; await App.checkpoint(ws); ws.ideas.splice(i, 1); await App.persistWorkspace(); App.refreshUI(); }
  async function addRule() { const inp = document.getElementById('new-rule-input'); if (!inp.value.trim()) return; const ws = App.getCurrentWorkspace(); if (ws.brandCore.rules.length >= 15) { App.showToast('الحد الأقصى 15 قاعدة', true); return; } ws.brandCore.rules.push(inp.value.trim()); inp.value = ''; await App.persistWorkspace(); App.refreshUI(); }
  async function removeRule(i) { const ws = App.getCurrentWorkspace(); if (!ws.brandCore.rules[i] || !confirm('حذف قاعدة الكتابة؟')) return; await App.checkpoint(ws); ws.brandCore.rules.splice(i, 1); await App.persistWorkspace(); App.refreshUI(); }
  async function addOffer() { const t = document.getElementById('new-offer-title').value.trim(), s = document.getElementById('new-offer-segment').value, d = document.getElementById('new-offer-details').value.trim(); if (!t || !d) return; const ws = App.getCurrentWorkspace(); ws.brandCore.offers.push({ id: 'off-' + Date.now(), title: t, segment: s, details: d }); document.getElementById('new-offer-title').value = ''; document.getElementById('new-offer-details').value = ''; await App.persistWorkspace(); App.refreshUI(); }
  async function removeOffer(i) { const ws = App.getCurrentWorkspace(); if (!ws.brandCore.offers[i] || !confirm('حذف العرض؟')) return; await App.checkpoint(ws); ws.brandCore.offers.splice(i, 1); await App.persistWorkspace(); App.refreshUI(); }
  async function saveBrandCore() { const ws = App.getCurrentWorkspace(); ws.brandCore.identity = document.getElementById('core-identity').value.trim(); ws.brandCore.tone = document.getElementById('core-tone').value.trim(); ws.brandCore.segments = document.getElementById('core-segments').value.trim(); ws.brandCore.materials = document.getElementById('core-materials').value.split(',').map(s => s.trim()).filter(Boolean); await App.persistWorkspace(); App.showToast('تم حفظ الهوية'); }
  async function saveGoal() { const ws = App.getCurrentWorkspace(); ws.goal.objective = document.getElementById('goal-objective-input').value.trim(); await App.persistWorkspace(); App.showToast('تم حفظ الهدف'); }

  return { isGenerating, renderCalendarView, renderMemoryAndIdeasView, selectPost, setPostStatus, excludeIdea, saveEditedCopy, handleGenerateCalendar, handleGenerateSinglePost, handleGenerateRefImage, exportTeamCalendarFile, handleGenerateIdeas, approveIdea, deleteIdea, addRule, removeRule, addOffer, removeOffer, saveBrandCore, saveGoal };
})();

