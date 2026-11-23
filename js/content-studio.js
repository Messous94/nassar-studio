/**
 * ============================================================================
 * js/content-studio.js
 * Manages:
 * - Period Goals
 * - Ideas & Insights Library + Automatic Saturation Score (+25% per approved post)
 * - 8-Post Calendar & Single Post Generation
 * - Full Team Brief Inspector & One-Click Complete Team Export
 * ============================================================================
 */

const ContentStudio = (() => {
  const STATUS_FLOW = ['Ù…Ø³ÙˆØ¯Ø©', 'Ù…Ø¹ØªÙ…Ø¯', 'Ø§ØªØ¹Ù…Ù„', 'Ø§ØªØ±ÙØ¹'];
  let selectedPostIndex = 0;

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'Ù…Ø¹ØªÙ…Ø¯':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Ø§ØªØ¹Ù…Ù„':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Ø§ØªØ±ÙØ¹':
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

  // Render Saturation Strip + Goal Banner + Posts Table + Brief Inspector
  function renderCalendarView(ws) {
    // 1. Update Goal Display
    const goalInput = document.getElementById('goal-objective-input');
    if (goalInput) goalInput.value = ws.goal?.objective || '';

    // 2. Render Saturation Pills
    const satStrip = document.getElementById('saturation-pills');
    if (satStrip) {
      const approvedIdeas = (ws.ideas || []).filter(i => i.status === 'approved');
      if (approvedIdeas.length === 0) {
        satStrip.innerHTML = `<span class="text-xs text-muted">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø£ÙÙƒØ§Ø± Ù…Ø¹ØªÙ…Ø¯Ø© Ø¨Ø¹Ø¯ â€” Ø£Ø¶Ù Ø£Ùˆ ÙˆÙ„Ù‘Ø¯ Ø£ÙÙƒØ§Ø±Ø§Ù‹ Ù„ØªØªØ¨Ø¹ Ø§Ù„ØªØ´Ø¨Ø¹.</span>`;
      } else {
        satStrip.innerHTML = approvedIdeas.slice(0, 5).map(idea => {
          let badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
          let label = 'Ù…ØªØ§Ø­';
          if (idea.saturation >= 75) {
            badgeStyle = 'bg-rose-50 text-rose-800 border-rose-200';
            label = 'Ù…Ø´Ø¨Ø¹';
          } else if (idea.saturation >= 50) {
            badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
            label = 'Ù…ØªÙˆØ³Ø·';
          }
          return `<span class="px-2.5 py-1 rounded-md text-xs font-medium border ${badgeStyle}" title="${idea.title}">
            ${label}: ${idea.title.slice(0, 24)}${idea.title.length > 24 ? '...' : ''} (${idea.saturation}%)
          </span>`;
        }).join('');
      }
    }

    // 3. Render Posts Table
    const tbody = document.getElementById('posts-table-body');
    const posts = ws.calendar || [];
    if (!tbody) return;

    if (posts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-12 text-center text-muted text-xs">
            Ø§Ù„ÙƒØ§Ù„ÙŠÙ†Ø¯Ø± ÙØ§Ø±ØºØ© Ø­Ø§Ù„ÙŠØ§Ù‹. Ø§Ø¶ØºØ· Ø¹Ù„Ù‰ <strong>"ØªÙˆÙ„ÙŠØ¯ ÙƒØ§Ù„ÙŠÙ†Ø¯Ø± (8 Ø¨ÙˆØ³ØªØ§Øª)"</strong> Ù„Ø¨Ù†Ø§Ø¡ Ø®Ø·Ø© Ù…ØªÙƒØ§Ù…Ù„Ø© Ø¨Ø§Ù„ØªÙØ§ØµÙŠÙ„.
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
          <button onclick="event.stopPropagation(); ContentStudio.cyclePostStatus(${idx})" class="px-2.5 py-1 rounded-md text-[11px] font-bold border transition ${getStatusBadgeClass(p.status)}" title="Ø§Ø¶ØºØ· Ù„ØªØºÙŠÙŠØ± Ø§Ù„Ø­Ø§Ù„Ø©">
            ${p.status || 'Ù…Ø³ÙˆØ¯Ø©'}
          </button>
        </td>
      </tr>
    `).join('');

    renderBriefInspector(posts[selectedPostIndex], selectedPostIndex);
  }

  function clearBriefInspector() {
    const panel = document.getElementById('brief-inspector-content');
    if (panel) {
      panel.classList.add('opacity-40', 'pointer-events-none');
    }
  }

  function renderBriefInspector(post, idx) {
    const panel = document.getElementById('brief-inspector-content');
    if (!panel || !post) return;
    panel.classList.remove('opacity-40', 'pointer-events-none');

    document.getElementById('brief-badge').textContent = `Ø¨ÙˆØ³Øª #${String(idx + 1).padStart(2, '0')} â€¢ ${post.segment || 'B2C'} â€¢ ${post.ideaTitle || ''}`;
    document.getElementById('brief-title').textContent = post.title || '';
    document.getElementById('brief-copy').value = post.copy || '';
    document.getElementById('brief-material').textContent = post.material || 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯';
    document.getElementById('brief-colors').textContent = post.colorPalette || 'Ø£Ù„ÙˆØ§Ù† Ø§Ù„Ù‡ÙˆÙŠØ©';
    document.getElementById('brief-mood').textContent = post.mood || 'Quiet Luxury';
    document.getElementById('brief-visual').textContent = post.visualDirection || '';
    document.getElementById('brief-designer').textContent = post.designerBrief || 'ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„Ù‡ÙˆÙŠØ© Ø§Ù„Ù‚ÙŠØ§Ø³ÙŠØ©';

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

  // Cycle Post Status & Automatically Update Idea Saturation when Approved
  async function cyclePostStatus(idx) {
    const ws = App.getCurrentWorkspace();
    const post = ws.calendar[idx];
    if (!post) return;

    const currentStatus = post.status || 'Ù…Ø³ÙˆØ¯Ø©';
    const nextStatus = STATUS_FLOW[(STATUS_FLOW.indexOf(currentStatus) + 1) % STATUS_FLOW.length];
    post.status = nextStatus;

    // Trigger Saturation & Idea Library automation when transitioning to 'Ù…Ø¹ØªÙ…Ø¯'
    if (nextStatus === 'Ù…Ø¹ØªÙ…Ø¯' && !post.saturationCounted) {
      post.saturationCounted = true;
      await applyIdeaSaturation(ws, post);
    }

    await App.persistWorkspace();
    App.refreshUI();
    App.showToast(`ØªÙ… ØªØºÙŠÙŠØ± Ø­Ø§Ù„Ø© Ø§Ù„Ø¨ÙˆØ³Øª #${idx + 1} Ø¥Ù„Ù‰: ${nextStatus}`);
  }

  async function applyIdeaSaturation(ws, post) {
    if (!ws.ideas) ws.ideas = [];

    // Check if post matches an existing idea by ID or title
    let matchedIdea = ws.ideas.find(i => i.id === post.ideaId || i.title.trim() === (post.ideaTitle || '').trim());

    if (matchedIdea) {
      matchedIdea.saturation = Math.min(100, (matchedIdea.saturation || 0) + 25);
      matchedIdea.status = 'approved';
    } else if (post.ideaTitle) {
      // Automatically add newly generated idea to Idea Bank with 25% initial saturation
      ws.ideas.unshift({
        id: 'idea-' + Date.now() + '-' + Math.floor(Math.random() * 100),
        title: post.ideaTitle,
        insight: `ØªÙ… Ø§Ø¨ØªÙƒØ§Ø±Ù‡Ø§ ÙˆØ§Ø¹ØªÙ…Ø§Ø¯Ù‡Ø§ Ø¶Ù…Ù† Ø§Ù„ÙƒØ§Ù„ÙŠÙ†Ø¯Ø± (${post.title})`,
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
    App.showToast('ØªÙ… Ø­ÙØ¸ ØªØ¹Ø¯ÙŠÙ„ Ù†Øµ Ø§Ù„Ø¨ÙˆØ³Øª');
  }

  // Generate 8-Post Calendar
  async function handleGenerateCalendar() {
    const btn = document.getElementById('btn-gen-calendar');
    const origHtml = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner ml-1.5"></span> Ø¬Ø§Ø±ÙŠ Ø¨Ù†Ø§Ø¡ Ø§Ù„Ù€ 8 Ø¨ÙˆØ³ØªØ§Øª...`;

      const ws = App.getCurrentWorkspace();
      const generatedPosts = await AIEngine.generateCalendar8(ws);

      ws.calendar = generatedPosts.map(p => ({
        ...p,
        status: 'Ù…Ø³ÙˆØ¯Ø©',
        saturationCounted: false,
        referenceImage: ''
      }));

      selectedPostIndex = 0;
      await App.persistWorkspace();
      App.refreshUI();
      App.showToast('ØªÙ… ØªÙˆÙ„ÙŠØ¯ ÙƒØ§Ù„ÙŠÙ†Ø¯Ø± Ù…Ù† 8 Ø¨ÙˆØ³ØªØ§Øª Ø¨Ø§Ù„ØªÙØ§ØµÙŠÙ„ Ø§Ù„ÙƒØ§Ù…Ù„Ø© Ù„Ù„ØªÙŠÙ…');
    } catch (e) {
      App.showToast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  // Generate Single Post
  async function handleGenerateSinglePost() {
    const btn = document.getElementById('btn-gen-single');
    const origHtml = btn.innerHTML;
    const noteInput = document.getElementById('single-post-note');
    const note = noteInput ? noteInput.value.trim() : '';

    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner spinner-dark ml-1.5"></span> Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªÙˆÙ„ÙŠØ¯...`;

      const ws = App.getCurrentWorkspace();
      const post = await AIEngine.generateSinglePost(ws, note);

      ws.calendar.unshift({
        ...post,
        status: 'Ù…Ø³ÙˆØ¯Ø©',
        saturationCounted: false,
        referenceImage: ''
      });

      if (noteInput) noteInput.value = '';
      selectedPostIndex = 0;
      await App.persistWorkspace();
      App.refreshUI();
      App.showToast('ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ø¨ÙˆØ³Øª Ø§Ù„ÙØ±Ø¯ÙŠ Ø¥Ù„Ù‰ Ø§Ù„Ø¬Ø¯ÙˆÙ„');
    } catch (e) {
      App.showToast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  // Generate Reference Image for Selected Post
  async function handleGenerateRefImage() {
    const ws = App.getCurrentWorkspace();
    const post = ws.calendar[selectedPostIndex];
    if (!post) return;

    const btn = document.getElementById('btn-gen-ref-img');
    const origHtml = btn.innerHTML;

    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner ml-1.5"></span> Ø¬Ø§Ø±ÙŠ ØªÙˆÙ„ÙŠØ¯ Ø§Ù„Ø±ÙŠÙØ±Ù†Ø³...`;

      const imgDataUrl = await AIEngine.generateReferenceImage(post);
      post.referenceImage = imgDataUrl;
      await App.persistWorkspace();
      App.refreshUI();
      App.showToast('ØªÙ… ØªÙˆÙ„ÙŠØ¯ ØµÙˆØ±Ø© Ø§Ù„Ø±ÙŠÙØ±Ù†Ø³ ÙˆØ­ÙØ¸Ù‡Ø§ Ù„Ù„Ø¨ÙˆØ³Øª');
    } catch (e) {
      App.showToast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  // Export Complete Calendar & Visual Briefs for the Team
  function exportTeamCalendarFile() {
    const ws = App.getCurrentWorkspace();
    const company = App.getCurrentCompany();
    const posts = ws.calendar || [];

    if (posts.length === 0) {
      App.showToast('Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙˆØ³ØªØ§Øª ÙÙŠ Ø§Ù„ÙƒØ§Ù„ÙŠÙ†Ø¯Ø± Ù„ØªØµØ¯ÙŠØ±Ù‡Ø§.', true);
      return;
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    let htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>ÙƒØ§Ù„ÙŠÙ†Ø¯Ø± ÙˆØ¨Ø±ÙŠÙ Ø§Ù„ØªÙŠÙ… â€” ${escapeHtml(company.name)} (${dateStr})</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #F8F7F4; color: #141413; padding: 32px; line-height: 1.6; }
  .header { background: #141413; color: #F8F7F4; padding: 24px 32px; border-radius: 12px; margin-bottom: 24px; }
  .header h1 { margin: 0 0 6px 0; font-size: 24px; }
  .header p { margin: 0; color: #B89662; font-size: 14px; }
  .post-card { background: #FFFFFF; border: 1px solid #E6E4DD; border-radius: 12px; padding: 24px; margin-bottom: 20px; page-break-inside: avoid; }
  .badge { display: inline-block; background: #F5EFE6; color: #9A7B4F; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; }
  .status { display: inline-block; background: #141413; color: #FFF; padding: 4px 10px; border-radius: 6px; font-size: 12px; margin-right: 8px; }
  .copy-box { background: #F8F7F4; border-right: 4px solid #9A7B4F; padding: 14px; border-radius: 8px; margin: 14px 0; white-space: pre-wrap; font-size: 15px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
  .meta { background: #F8F7F4; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
  .meta strong { display: block; color: #6E6D68; font-size: 11px; margin-bottom: 3px; }
</style>
</head>
<body>
  <div class="header">
    <h1>ÙƒØ§Ù„ÙŠÙ†Ø¯Ø± Ø§Ù„Ù…Ø­ØªÙˆÙ‰ ÙˆØ§Ù„Ø¨Ø±ÙŠÙ Ø§Ù„ØªÙ†ÙÙŠØ°ÙŠ Ù„Ù„ØªÙŠÙ… â€” ${escapeHtml(company.name)}</h1>
    <p>ØªØ§Ø±ÙŠØ® Ø§Ù„ØªØµØ¯ÙŠØ±: ${dateStr} | Ù‡Ø¯Ù Ø§Ù„ÙØªØ±Ø©: ${escapeHtml(ws.goal?.objective || '')}</p>
  </div>
`;

    posts.forEach((p, idx) => {
      htmlContent += `
  <div class="post-card">
    <div>
      <span class="badge">Ø¨ÙˆØ³Øª #${String(idx + 1).padStart(2, '0')} â€¢ ${escapeHtml(p.segment || 'B2C')}</span>
      <span class="status">Ø§Ù„Ø­Ø§Ù„Ø©: ${escapeHtml(p.status || 'Ù…Ø³ÙˆØ¯Ø©')}</span>
    </div>
    <h2 style="margin: 10px 0 4px 0; font-size: 18px;">${escapeHtml(p.title)}</h2>
    <div style="font-size: 12px; color: #6E6D68;">Ø§Ù„ÙÙƒØ±Ø© / Ø§Ù„Ø²Ø§ÙˆÙŠØ©: ${escapeHtml(p.ideaTitle || '-')}</div>

    <div class="copy-box">${escapeHtml(p.copy || '')}</div>

    <div class="grid">
      <div class="meta"><strong>Ø§Ù„Ø®Ø§Ù…Ø© / Ø§Ù„Ù…Ù†ØªØ¬</strong>${escapeHtml(p.material || '-')}</div>
      <div class="meta"><strong>Ø¯Ø±Ø¬Ø© Ø§Ù„Ø£Ù„ÙˆØ§Ù† Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©</strong>${escapeHtml(p.colorPalette || '-')}</div>
      <div class="meta"><strong>Ø§Ù„Ø¬Ùˆ Ø§Ù„Ø¹Ø§Ù… (Mood)</strong>${escapeHtml(p.mood || '-')}</div>
      <div class="meta"><strong>Ø¨Ø±ÙŠÙ Ø§Ù„ØªØ¹Ø¯ÙŠÙ„ ÙˆØ§Ù„ØªÙ…Ø¨Ù„ÙŠØª Ù„Ù„Ø¯ÙŠØ²Ø§ÙŠÙ†Ø±</strong>${escapeHtml(p.designerBrief || '-')}</div>
    </div>
    <div class="meta" style="margin-top: 12px;">
      <strong>ØªØµÙˆØ± ÙˆØ´ÙƒÙ„ Ø§Ù„ØµÙˆØ±Ø© Ù„Ù„ØªÙ†ÙÙŠØ° / Ø§Ù„ØªØµÙˆÙŠØ± (Visual Direction)</strong>
      ${escapeHtml(p.visualDirection || '-')}
    </div>
  </div>`;
    });

    htmlContent += `</body></html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${company.id}-team-calendar-${dateStr}.html`;
    a.click();
    URL.revokeObjectURL(url);
    App.showToast('ØªÙ… ØªÙ†Ø²ÙŠÙ„ Ù…Ù„Ù Ø§Ù„ÙƒØ§Ù„ÙŠÙ†Ø¯Ø± Ø§Ù„ÙƒØ§Ù…Ù„ Ø¨Ø§Ù„ØªÙØ§ØµÙŠÙ„ Ù„Ù„ØªÙŠÙ…');
  }

  // --- Ideas & Memory View Rendering ---
  function renderMemoryAndIdeasView(ws) {
    // 1. Brand Core Fields
    document.getElementById('core-identity').value = ws.brandCore?.identity || '';
    document.getElementById('core-tone').value = ws.brandCore?.tone || '';
    document.getElementById('core-segments').value = ws.brandCore?.segments || '';
    document.getElementById('core-materials').value = (ws.brandCore?.materials || []).join(', ');

    // 2. Active Rules (Max 15)
    const rulesList = document.getElementById('rules-list');
    const rules = ws.brandCore?.rules || [];
    document.getElementById('rules-count-badge').textContent = `${rules.length} / 15 Ù‚Ø§Ø¹Ø¯Ø©`;

    rulesList.innerHTML = rules.map((r, idx) => `
      <li class="p-2.5 rounded-lg bg-stoneBg border border-borderSubtle flex items-start justify-between gap-2 text-xs">
        <span class="text-ink leading-relaxed">${escapeHtml(r)}</span>
        <button onclick="ContentStudio.removeRule(${idx})" class="text-rose-600 hover:text-rose-800 font-bold px-1.5 shrink-0" title="Ø­Ø°Ù Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©">âœ•</button>
      </li>
    `).join('');

    // 3. Offers Library
    const offersList = document.getElementById('offers-list');
    const offers = ws.brandCore?.offers || [];
    offersList.innerHTML = offers.length === 0
      ? `<p class="text-xs text-muted">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ø±ÙˆØ¶ Ù…Ø³Ø¬Ù„Ø© Ø­Ø§Ù„ÙŠØ§Ù‹.</p>`
      : offers.map((o, idx) => `
        <div class="p-3 rounded-lg bg-stoneBg border border-borderSubtle text-xs flex items-start justify-between gap-2">
          <div>
            <span class="inline-block px-1.5 py-0.5 rounded bg-bronzeSoft text-bronze font-bold text-[10px] mb-1">${escapeHtml(o.segment)}</span>
            <strong class="block text-ink">${escapeHtml(o.title)}</strong>
            <p class="text-muted mt-0.5">${escapeHtml(o.details)}</p>
          </div>
          <button onclick="ContentStudio.removeOffer(${idx})" class="text-rose-600 font-bold px-1">âœ•</button>
        </div>
      `).join('');

    // 4. Ideas & Saturation Library
    const ideasGrid = document.getElementById('ideas-library-grid');
    const ideas = ws.ideas || [];
    ideasGrid.innerHTML = ideas.length === 0
      ? `<p class="text-xs text-muted col-span-2">Ù…ÙƒØªØ¨Ø© Ø§Ù„Ø£ÙÙƒØ§Ø± ÙØ§Ø±ØºØ©. Ø§Ø¶ØºØ· "ØªÙˆÙ„ÙŠØ¯ Ø£ÙÙƒØ§Ø± Ùˆ Insights" Ù„Ù„Ø¨Ø¯Ø¡.</p>`
      : ideas.map((idea, idx) => {
        const isPending = idea.status === 'pending';
        return `
          <div class="p-4 rounded-xl border ${isPending ? 'border-bronze bg-bronzeSoft/30' : 'border-borderSubtle bg-white'} space-y-2.5">
            <div class="flex items-start justify-between gap-2">
              <div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-stoneBg border border-borderSubtle text-ink">${escapeHtml(idea.segment || 'B2C')}</span>
                ${isPending ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-bronze text-white mr-1">Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯</span>' : ''}
              </div>
              <button onclick="ContentStudio.deleteIdea(${idx})" class="text-xs text-muted hover:text-rose-600">âœ•</button>
            </div>
            <h4 class="text-xs font-bold text-ink">${escapeHtml(idea.title)}</h4>
            <p class="text-[11px] text-muted leading-relaxed">${escapeHtml(idea.insight || '')}</p>
            ${isPending ? `
              <button onclick="ContentStudio.approveIdea(${idx})" class="w-full py-1.5 rounded-lg text-xs font-bold bg-ink text-white hover:bg-ink/90 transition">
                Ø§Ø¹ØªÙ…Ø§Ø¯ ÙˆØ¥Ø¶Ø§ÙØ© Ù„Ù†Ø¸Ø§Ù… Ø§Ù„ØªØ´Ø¨Ø¹ âœ“
              </button>
            ` : `
              <div class="pt-1 space-y-1">
                <div class="flex justify-between text-[11px] font-semibold">
                  <span class="text-muted">Ù†Ø³Ø¨Ø© Ø§Ù„ØªØ´Ø¨Ø¹</span>
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
      btn.innerHTML = `<span class="spinner ml-1.5"></span> Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø§Ø³ØªÙ†Ø¨Ø§Ø·...`;

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
      App.showToast('ØªÙ… ØªÙˆÙ„ÙŠØ¯ 4 Ø£ÙÙƒØ§Ø± Ø¬Ø¯ÙŠØ¯Ø© â€” Ø§Ø¹ØªÙ…Ø¯ Ù…Ø§ ÙŠÙ†Ø§Ø³Ø¨Ùƒ Ù„Ø¥Ø¯Ø®Ø§Ù„Ù‡ Ù†Ø¸Ø§Ù… Ø§Ù„ØªØ´Ø¨Ø¹');
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
    App.showToast('ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„ÙÙƒØ±Ø© ÙˆØ¥Ø¶Ø§ÙØªÙ‡Ø§ Ù„Ù†Ø¸Ø§Ù… Ø§Ù„ØªØ´Ø¨Ø¹');
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
      App.showToast('ÙˆØµÙ„Øª Ù„Ù„Ø­Ø¯ Ø§Ù„Ø£Ù‚ØµÙ‰ (15 Ù‚Ø§Ø¹Ø¯Ø© Ù†Ø´Ø·Ø©) Ù„Ù„Ø­ÙØ§Ø¸ Ø¹Ù„Ù‰ ÙƒÙØ§Ø¡Ø© Ø§Ù„ØªÙˆÙƒÙ†Ø². Ø§Ø­Ø°Ù Ù‚Ø§Ø¹Ø¯Ø© Ù‚Ø¯ÙŠÙ…Ø© Ø£ÙˆÙ„Ø§Ù‹.', true);
      return;
    }

    ws.brandCore.rules.push(val);
    input.value = '';
    await App.persistWorkspace();
    App.refreshUI();
    App.showToast('ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© Ù„Ø°Ø§ÙƒØ±Ø© Ù…Ù†Ø¹ Ø§Ù„ØªÙƒØ±Ø§Ø±');
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
    App.showToast('ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø¹Ø±Ø¶ ÙÙŠ Ù…ÙƒØªØ¨Ø© Ø§Ù„Ø¹Ø±ÙˆØ¶');
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
    ws.brandCore.materials = document.getElementById('core-materials').value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    await App.persistWorkspace();
    App.showToast('ØªÙ… Ø­ÙØ¸ Ø¯Ø³ØªÙˆØ± Ø§Ù„Ø¨Ø±Ø§Ù†Ø¯ ÙˆØ§Ù„Ø®Ø§Ù…Ø§Øª');
  }

  async function saveGoal() {
    const ws = App.getCurrentWorkspace();
    ws.goal.objective = document.getElementById('goal-objective-input').value.trim();
    await App.persistWorkspace();
    App.showToast('ØªÙ… ØªØ­Ø¯ÙŠØ« Ù‡Ø¯Ù Ø§Ù„ÙØªØ±Ø© Ù„ØªÙˆØ¬ÙŠÙ‡ Ø§Ù„ØªÙˆÙ„ÙŠØ¯ ÙˆØ§Ù„ØªØ­Ù„ÙŠÙ„Ø§Øª');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
  };
})();
