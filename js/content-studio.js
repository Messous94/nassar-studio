const ContentStudio = (() => {
  const EXCLUSION_OPTIONS = { 'مرفوض': 'rejected', 'متشبع': 'saturated' };
  const POST_STATUSES = ['مسودة', 'معتمد', 'اتعمل', 'اترفع', ...Object.keys(EXCLUSION_OPTIONS)];
  let selectedPostIndex = 0;

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
