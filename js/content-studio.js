const ContentStudio = (() => {
  const STATUS_FLOW = ['مسودة', 'معتمد', 'اتعمل', 'اترفع'];
  let selectedPostIndex = 0;

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'معتمد':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'اتعمل':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'اترفع':
        return 'bg-ink text-white border-ink';
      default:
        return 'bg-stoneBg text-muted border-borderSubtle';
    }
  }

  function getSaturationColor(sat) {
    if (sat >= 75) return 'bg-rose-600';
    if (sat >= 50) return 'bg-amber-500';
    return 'bg-emerald-600';
  }

  function renderCalendarView(ws) {
    const goalInput = document.getElementById('goal-objective-input');
    if (goalInput) goalInput.value = ws.goal?.objective || '';

    const satStrip = document.getElementById('saturation-pills');
    if (satStrip) {
      const approvedIdeas = (ws.ideas || []).filter(i => i.status === 'approved');
      if (approvedIdeas.length === 0) {
        satStrip.innerHTML = `<span class="text-xs text-muted">لا توجد أفكار معتمدة بعد — أضف أو ولّد أفكاراً لتتبع التشبع.</span>`;
      } else {
        satStrip.innerHTML = approvedIdeas.slice(0, 5).map(idea => {
          let badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
          let label = 'متاح';
          if (idea.saturation >= 75) {
            badgeStyle = 'bg-rose-50 text-rose-800 border-rose-200';
            label = 'مشبع';
          } else if (idea.saturation >= 50) {
            badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
            label = 'متوسط';
          }
          return `<span class="px-2.5 py-1 rounded-md text-xs font-medium border ${badgeStyle}" title="${idea.title}">
            ${label}: ${idea.title.slice(0, 24)}${idea.title.length > 24 ? '...' : ''} (${idea.saturation}%)
          </span>`;
        }).join('');
      }
    }

    const tbody = document.getElementById('posts-table-body');
    const posts = ws.calendar || [];
    if (!tbody) return;

    if (posts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-12 text-center text-muted text-xs">
            الكاليندر فارغة حالياً. اضغط على <strong>"توليد كاليندر (8 بوستات)"</strong> لبناء خطة متكاملة بالتفاصيل.
          </td>
        </tr>
      `;
      clearBriefInspector();
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
          <button onclick="event.stopPropagation(); ContentStudio.cyclePostStatus(${idx})" class="px-2.5 py-1 rounded-md text-[11px] font-bold border transition ${getStatusBadgeClass(p.status)}" title="اضغط لتغيير الحالة">
            ${p.status || 'مسودة'}
          </button>
        </td>
      </tr>
    `).join('');

    renderBriefInspector(posts[selectedPostIndex], selectedPostIndex);
  }

  function clearBriefInspector() {
    const panel = document.getElementById('brief-inspector-content');
    if (panel) panel.classList.add('opacity-40', 'pointer-events-none');
  }

  function renderBriefInspector(post, idx) {
    const panel = document.getElementById('brief-inspector-content');
    if (!panel || !post) return;
    panel.classList.remove('opacity-40', 'pointer-events-none');

    document.getElementById('brief-badge').textContent = `بوست #${String(idx + 1).padStart(2, '0')} • ${post.segment || 'B2C'} • ${post.ideaTitle || ''}`;
    document.getElementById('brief-title').textContent = post.title || '';
    document.getElementById('brief-copy').value = post.copy || '';
    document.getElementById('brief-material').textContent = post.material || 'غير محدد';
    document.getElementById('brief-colors').textContent = post.colorPalette || 'ألوان الهوية';
    document.getElementById('brief-mood').textContent = post.mood || 'Quiet Luxury';
    document.getElementById('brief-visual').textContent = post.visualDirection || '';
    document.getElementById('brief-designer').textContent = post.designerBrief || 'تطبيق الهوية القياسية';

    const refBox = document.getElementById('brief-ref-image-box');
    const refImg = document.getElementById('brief-ref-image');
    if (post.referenceImage) {
      refImg.src = post.referenceImage;
      refBox.classList.remove('hidden');
    } else {
      refBox.classList.add('hidden');
      refImg.src = '';
    }
  }

  function selectPost(idx) {
    selectedPostIndex = idx;
    App.refreshUI();
  }

  async function cyclePostStatus(idx) {
    const ws = App.getCurrentWorkspace();
    const post = ws.calendar[idx];
    if (!post) return;

    const currentStatus = post.status || 'مسودة';
    const nextStatus = STATUS_FLOW[(STATUS_FLOW.indexOf(currentStatus) + 1) % STATUS_FLOW.length];
    post.status = nextStatus;

    if (nextStatus === 'معتمد' && !post.saturationCounted) {
      post.saturationCounted = true;
      await applyIdeaSaturation(ws, post);
    }

    await App.persistWorkspace();
    App.refreshUI();
    App.showToast(`تم تغيير حالة البوست #${idx + 1} إلى: ${nextStatus}`);
  }

  async function applyIdeaSaturation(ws, post) {
    if (!ws.ideas) ws.ideas = [];
    let matchedIdea = ws.ideas.find(i => i.id === post.ideaId || i.title.trim() === (post.ideaTitle || '').trim());

    if (matchedIdea) {
      matchedIdea.saturation = Math.min(100, (matchedIdea.saturation || 0) + 25);
      matchedIdea.status = 'approved';
    } else if (post.ideaTitle) {
      ws.ideas.unshift({
        id: 'idea-' + Date.now() + '-' + Math.floor(Math.random() * 100),
        title: post.ideaTitle,
        insight: `تم ابتكارها واعتمادها ضمن الكاليندر (${post.title})`,
        segment: post.segment || 'B2C',
        saturation: 25,
        status: 'approved'
      });
    }
  }

  async function saveEditedCopy() {
    const ws = App.getCurrentWorkspace();
    const post = ws.calendar[selectedPostIndex];
    if (!post) return;
    post.copy = document.getElementById('brief-copy').value;
    await App.persistWorkspace();
    App.showToast('تم حفظ تعديل نص البوست');
  }

  async function handleGenerateCalendar() {
    const btn = document.getElementById('btn-gen-calendar');
    const origHtml = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner ml-1.5"></span> جاري بناء الـ 8 بوستات...`;

      const ws = App.getCurrentWorkspace();
      const generatedPosts = await AIEngine.generateCalendar8(ws);

      ws.calendar = generatedPosts.map(p => ({
        ...p,
        status: 'مسودة',
        saturationCounted: false,
        referenceImage: ''
      }));

      selectedPostIndex = 0;
      await App.persistWorkspace();
      App.refreshUI();
      App.showToast('تم توليد كاليندر من 8 بوستات بالتفاصيل الكاملة للتيم');
    } catch (e) {
      App.showToast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  async function handleGenerateSinglePost() {
    const btn = document.getElementById('btn-gen-single');
    const origHtml = btn.innerHTML;
    const noteInput = document.getElementById('single-post-note');
    const note = noteInput ? noteInput.value.trim() : '';

    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner spinner-dark ml-1.5"></span> جاري التوليد...`;

      const ws = App.getCurrentWorkspace();
      const post = await AIEngine.generateSinglePost(ws, note);

      ws.calendar.unshift({
        ...post,
        status: 'مسودة',
        saturationCounted: false,
        referenceImage: ''
      });

      if (noteInput) noteInput.value = '';
      selectedPostIndex = 0;
      await App.persistWorkspace();
      App.refreshUI();
      App.showToast('تمت إضافة البوست الفردي إلى الجدول');
    } catch (e) {
      App.showToast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  async function handleGenerateRefImage() {
    const ws = App.getCurrentWorkspace();
    const post = ws.calendar[selectedPostIndex];
    if (!post) return;

    const btn = document.getElementById('btn-gen-ref-img');
    const origHtml = btn.innerHTML;

    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner ml-1.5"></span> جاري توليد الريفرنس...`;

      const imgDataUrl = await AIEngine.generateReferenceImage(post);
      post.referenceImage = imgDataUrl;
      await App.persistWorkspace();
      App.refreshUI();
      App.showToast('تم توليد صورة الريفرنس وحفظها للبوست');
    } catch (e) {
      App.showToast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  function exportTeamCalendarFile() {
    const ws = App.getCurrentWorkspace();
    const company = App.getCurrentCompany();
    const posts = ws.calendar || [];

    if (posts.length === 0) {
      App.showToast('لا توجد بوستات في الكاليندر لتصديرها.', true);
      return;
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    let htmlContent = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>كاليندر وبريف التيم — ${escapeHtml(company.name)}</title><style>body{font-family:'Segoe UI',Tahoma,sans-serif;background:#F8F7F4;color:#141413;padding:32px;line-height:1.6}.header{background:#141413;color:#F8F7F4;padding:24px 32px;border-radius:12px;margin-bottom:24px}.post-card{background:#FFF;border:1px solid #E6E4DD;border-radius:12px;padding:24px;margin-bottom:20px}.badge{background:#F5EFE6;color:#9A7B4F;padding:4px 10px;border-radius:6px;font-weight:bold;font-size:12px}.copy-box{background:#F8F7F4;border-right:4px solid #9A7B4F;padding:14px;border-radius:8px;margin:14px 0;white-space:pre-wrap}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.meta{background:#F8F7F4;padding:10px 14px;border-radius:8px;font-size:13px}</style></head><body><div class="header"><h1>كاليندر المحتوى والبريف التنفيذي — ${escapeHtml(company.name)}</h1><p>التاريخ: ${dateStr} | الهدف: ${escapeHtml(ws.goal?.objective || '')}</p></div>`;

    posts.forEach((p, idx) => {
      htmlContent += `<div class="post-card"><span class="badge">بوست #${String(idx + 1).padStart(2, '0')} • ${escapeHtml(p.segment || 'B2C')} • ${escapeHtml(p.status || 'مسودة')}</span><h2>${escapeHtml(p.title)}</h2><div class="copy-box">${escapeHtml(p.copy || '')}</div><div class="grid"><div class="meta"><strong>الخامة:</strong> ${escapeHtml(p.material || '-')}</div><div class="meta"><strong>الألوان:</strong> ${escapeHtml(p.colorPalette || '-')}</div><div class="meta"><strong>الجو العام:</strong> ${escapeHtml(p.mood || '-')}</div><div class="meta"><strong>بريف الديزاينر:</strong> ${escapeHtml(p.designerBrief || '-')}</div></div><div class="meta" style="margin-top:12px"><strong>تصور الصورة:</strong> ${escapeHtml(p.visualDirection || '-')}</div></div>`;
    });

    htmlContent += `</body></html>`;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${company.id}-team-calendar-${dateStr}.html`;
    a.click();
    URL.revokeObjectURL(url);
    App.showToast('تم تنزيل ملف الكاليندر الكامل بالتفاصيل للتيم');
  }

  function renderMemoryAndIdeasView(ws) {
    document.getElementById('core-identity').value = ws.brandCore?.identity || '';
    document.getElementById('core-tone').value = ws.brandCore?.tone || '';
    document.getElementById('core-segments').value = ws.brandCore?.segments || '';
    document.getElementById('core-materials').value = (ws.brandCore?.materials || []).join(', ');

    const rulesList = document.getElementById('rules-list');
    const rules = ws.brandCore?.rules || [];
    document.getElementById('rules-count-badge').textContent = `${rules.length} / 15 قاعدة`;

    rulesList.innerHTML = rules.map((r, idx) => `
      <li class="p-2.5 rounded-lg bg-stoneBg border border-borderSubtle flex items-start justify-between gap-2 text-xs">
        <span class="text-ink leading-relaxed">${escapeHtml(r)}</span>
        <button onclick="ContentStudio.removeRule(${idx})" class="text-rose-600 hover:text-rose-800 font-bold px-1.5 shrink-0">✕</button>
      </li>
    `).join('');

    const offersList = document.getElementById('offers-list');
    const offers = ws.brandCore?.offers || [];
    offersList.innerHTML = offers.length === 0
      ? `<p class="text-xs text-muted">لا توجد عروض مسجلة حالياً.</p>`
      : offers.map((o, idx) => `
        <div class="p-3 rounded-lg bg-stoneBg border border-borderSubtle text-xs flex items-start justify-between gap-2">
          <div>
            <span class="inline-block px-1.5 py-0.5 rounded bg-bronzeSoft text-bronze font-bold text-[10px] mb-1">${escapeHtml(o.segment)}</span>
            <strong class="block text-ink">${escapeHtml(o.title)}</strong>
            <p class="text-muted mt-0.5">${escapeHtml(o.details)}</p>
          </div>
          <button onclick="ContentStudio.removeOffer(${idx})" class="text-rose-600 font-bold px-1">✕</button>
        </div>
      `).join('');

    const ideasGrid = document.getElementById('ideas-library-grid');
    const ideas = ws.ideas || [];
    ideasGrid.innerHTML = ideas.length === 0
      ? `<p class="text-xs text-muted col-span-2">مكتبة الأفكار فارغة. اضغط "توليد أفكار و Insights" للبدء.</p>`
      : ideas.map((idea, idx) => {
        const isPending = idea.status === 'pending';
        return `
          <div class="p-4 rounded-xl border ${isPending ? 'border-bronze bg-bronzeSoft/30' : 'border-borderSubtle bg-white'} space-y-2.5">
            <div class="flex items-start justify-between gap-2">
              <div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-stoneBg border border-borderSubtle text-ink">${escapeHtml(idea.segment || 'B2C')}</span>
                ${isPending ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-bronze text-white mr-1">بانتظار الاعتماد</span>' : ''}
              </div>
              <button onclick="ContentStudio.deleteIdea(${idx})" class="text-xs text-muted hover:text-rose-600">✕</button>
            </div>
            <h4 class="text-xs font-bold text-ink">${escapeHtml(idea.title)}</h4>
            <p class="text-[11px] text-muted leading-relaxed">${escapeHtml(idea.insight || '')}</p>
            ${isPending ? `
              <button onclick="ContentStudio.approveIdea(${idx})" class="w-full py-1.5 rounded-lg text-xs font-bold bg-ink text-white hover:bg-ink/90 transition">
                اعتماد وإضافة لنظام التشبع ✓
              </button>
            ` : `
              <div class="pt-1 space-y-1">
                <div class="flex justify-between text-[11px] font-semibold">
                  <span class="text-muted">نسبة التشبع</span>
                  <span class="text-ink">${idea.saturation}%</span>
                </div>
                <div class="sat-bar">
                  <div class="sat-fill ${getSaturationColor(idea.saturation)}" style="width: ${idea.saturation}%"></div>
                </div>
              </div>
            `}
          </div>
        `;
      }).join('');
  }

  async function handleGenerateIdeas() {
    const btn = document.getElementById('btn-gen-ideas');
    const origHtml = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner ml-1.5"></span> جاري الاستنباط...`;

      const ws = App.getCurrentWorkspace();
      const newIdeas = await AIEngine.generateIdeas(ws, 4);

      newIdeas.forEach(item => {
        ws.ideas.unshift({
          id: 'idea-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          title: item.title,
          insight: item.insight,
          segment: item.segment || 'B2C',
          saturation: 0,
          status: 'pending'
        });
      });

      await App.persistWorkspace();
      App.refreshUI();
      App.showToast('تم توليد 4 أفكار جديدة — اعتمد ما يناسبك لإدخاله نظام التشبع');
    } catch (e) {
      App.showToast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  async function approveIdea(idx) {
    const ws = App.getCurrentWorkspace();
    if (!ws.ideas[idx]) return;
    ws.ideas[idx].status = 'approved';
    ws.ideas[idx].saturation = 0;
    await App.persistWorkspace();
    App.refreshUI();
    App.showToast('تم اعتماد الفكرة وإضافتها لنظام التشبع');
  }

  async function deleteIdea(idx) {
    const ws = App.getCurrentWorkspace();
    ws.ideas.splice(idx, 1);
    await App.persistWorkspace();
    App.refreshUI();
  }

  async function addRule() {
    const input = document.getElementById('new-rule-input');
    const val = input.value.trim();
    if (!val) return;

    const ws = App.getCurrentWorkspace();
    if (ws.brandCore.rules.length >= 15) {
      App.showToast('وصلت للحد الأقصى (15 قاعدة نشطة). احذف قاعدة قديمة أولاً.', true);
      return;
    }

    ws.brandCore.rules.push(val);
    input.value = '';
    await App.persistWorkspace();
    App.refreshUI();
    App.showToast('تمت إضافة القاعدة لذاكرة منع التكرار');
  }

  async function removeRule(idx) {
    const ws = App.getCurrentWorkspace();
    ws.brandCore.rules.splice(idx, 1);
    await App.persistWorkspace();
    App.refreshUI();
  }

  async function addOffer() {
    const title = document.getElementById('new-offer-title').value.trim();
    const segment = document.getElementById('new-offer-segment').value;
    const details = document.getElementById('new-offer-details').value.trim();
    if (!title || !details) return;

    const ws = App.getCurrentWorkspace();
    ws.brandCore.offers.push({ id: 'off-' + Date.now(), title, segment, details });
    document.getElementById('new-offer-title').value = '';
    document.getElementById('new-offer-details').value = '';
    await App.persistWorkspace();
    App.refreshUI();
    App.showToast('تم حفظ العرض في مكتبة العروض');
  }

  async function removeOffer(idx) {
    const ws = App.getCurrentWorkspace();
    ws.brandCore.offers.splice(idx, 1);
    await App.persistWorkspace();
    App.refreshUI();
  }

  async function saveBrandCore() {
    const ws = App.getCurrentWorkspace();
    ws.brandCore.identity = document.getElementById('core-identity').value.trim();
    ws.brandCore.tone = document.getElementById('core-tone').value.trim();
    ws.brandCore.segments = document.getElementById('core-segments').value.trim();
    ws.brandCore.materials = document.getElementById('core-materials').value.split(',').map(s => s.trim()).filter(Boolean);

    await App.persistWorkspace();
    App.showToast('تم حفظ دستور البراند والخامات');
  }

  async function saveGoal() {
    const ws = App.getCurrentWorkspace();
    ws.goal.objective = document.getElementById('goal-objective-input').value.trim();
    await App.persistWorkspace();
    App.showToast('تم تحديث هدف الفترة لتوجيه التوليد والتحليلات');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    renderCalendarView,
    renderMemoryAndIdeasView,
    selectPost,
    cyclePostStatus,
    saveEditedCopy,
    handleGenerateCalendar,
    handleGenerateSinglePost,
    handleGenerateRefImage,
    exportTeamCalendarFile,
    handleGenerateIdeas,
    approveIdea,
    deleteIdea,
    addRule,
    removeRule,
    addOffer,
    removeOffer,
    saveBrandCore,
    saveGoal
