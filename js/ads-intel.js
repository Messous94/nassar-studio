/**
 * ============================================================================
 * js/ads-intel.js
 * Daily Ads Pulse, CSV Parser, Day-over-Day Delta, Official Platform Rules,
 * Offline Sales Blended Attribution, and Executive Reports
 * ============================================================================
 */

const AdsIntel = (() => {
  let parsedTodayRows = [];

  // Parse CSV text cleanly handling quoted commas
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const splitLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = splitLine(lines[0]).map(h => h.toLowerCase());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      if (cols.length < 2) continue;
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = cols[idx] || '';
      });
      rows.push(normalizeAdRow(obj));
    }
    return rows.filter(r => r.campaignName && (r.spend > 0 || r.impressions > 0));
  }

  // Normalize Meta / Google CSV column names
  function normalizeAdRow(raw) {
    const pick = (keys) => {
      for (const k of Object.keys(raw)) {
        if (keys.some(target => k.includes(target))) return raw[k];
      }
      return '';
    };

    const num = (val) => {
      const cleaned = String(val || '0').replace(/[^0-9.\-]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    };

    const campaignName = pick(['campaign name', 'اسم الحملة', 'campaign']) || 'حملة غير مسماة';
    const spend = num(pick(['amount spent', 'المبلغ الذي تم إنفاقه', 'cost', 'spend']));
    const impressions = num(pick(['impressions', 'مرات الظهور']));
    const clicks = num(pick(['link clicks', 'clicks', 'النقرات']));
    const results = num(pick(['results', 'النتائج', 'leads', 'messaging conversations']));
    let ctr = num(pick(['ctr', 'نسبة النقر']));
    let frequency = num(pick(['frequency', 'التردد']));

    if (!ctr && impressions > 0 && clicks > 0) {
      ctr = Number(((clicks / impressions) * 100).toFixed(2));
    }
    const cpl = results > 0 ? Number((spend / results).toFixed(2)) : 0;

    return {
      campaignName,
      spend,
      impressions,
      clicks,
      ctr,
      frequency,
      results,
      cpl
    };
  }

  function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      if (rows.length === 0) {
        App.showToast('تعذر قراءة بيانات صالحة من ملف CSV. تأكد من وجود أعمدة الحملة والصرف والنتائج.', true);
        return;
      }
      parsedTodayRows = rows;
      renderTodayPreview();
      App.showToast(`تمت قراءة ${rows.length} حملات من تقرير اليوم`);
    };
    reader.readAsText(file, 'UTF-8');
  }

  function addManualCampaignRow() {
    const name = document.getElementById('man-camp-name').value.trim();
    const spend = parseFloat(document.getElementById('man-camp-spend').value) || 0;
    const ctr = parseFloat(document.getElementById('man-camp-ctr').value) || 0;
    const freq = parseFloat(document.getElementById('man-camp-freq').value) || 0;
    const results = parseInt(document.getElementById('man-camp-results').value, 10) || 0;

    if (!name || spend <= 0) {
      App.showToast('أدخل اسم الحملة والمصروف الفعلي على الأقل.', true);
      return;
    }

    const cpl = results > 0 ? Number((spend / results).toFixed(2)) : 0;
    parsedTodayRows.push({
      campaignName: name,
      spend,
      impressions: 0,
      clicks: 0,
      ctr,
      frequency: freq,
      results,
      cpl
    });

    document.getElementById('man-camp-name').value = '';
    document.getElementById('man-camp-spend').value = '';
    document.getElementById('man-camp-ctr').value = '';
    document.getElementById('man-camp-freq').value = '';
    document.getElementById('man-camp-results').value = '';

    renderTodayPreview();
    App.showToast('تمت إضافة بيانات الحملة لقائمة اليوم');
  }

  function renderTodayPreview() {
    const tbody = document.getElementById('ads-today-tbody');
    if (!tbody) return;

    if (parsedTodayRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-muted text-xs">ارفع ملف CSV اليومي أو أضف أرقام الحملات الشغالة يدوياً أعلاه.</td></tr>`;
      return;
    }

    const ws = App.getCurrentWorkspace();
    const lastLog = (ws.ads?.dailyLogs || [])[0];

    tbody.innerHTML = parsedTodayRows.map((row, idx) => {
      // Day-over-Day delta calculation
      let deltaHtml = '<span class="text-muted text-[10px]">أول تسجيل</span>';
      if (lastLog && Array.isArray(lastLog.rows)) {
        const prev = lastLog.rows.find(r => r.campaignName === row.campaignName);
        if (prev && prev.cpl > 0 && row.cpl > 0) {
          const diff = (((row.cpl - prev.cpl) / prev.cpl) * 100).toFixed(0);
          if (diff > 0) {
            deltaHtml = `<span class="text-rose-600 font-bold text-[10px]">▲ +${diff}% عن أمس</span>`;
          } else if (diff < 0) {
            deltaHtml = `<span class="text-emerald-600 font-bold text-[10px]">▼ ${diff}% تحسن</span>`;
          } else {
            deltaHtml = `<span class="text-muted text-[10px]">ثابت</span>`;
          }
        }
      }

      return `
        <tr class="border-b border-borderSubtle text-xs">
          <td class="py-2.5 px-3 font-bold text-ink">${escapeHtml(row.campaignName)}</td>
          <td class="py-2.5 px-3 font-semibold">${row.spend.toLocaleString()} ج.م</td>
          <td class="py-2.5 px-3">${row.ctr}%</td>
          <td class="py-2.5 px-3 font-bold ${row.frequency >= 3.5 ? 'text-rose-600' : 'text-ink'}">${row.frequency}</td>
          <td class="py-2.5 px-3 font-bold">${row.results} <span class="text-[11px] font-normal text-muted">(${row.cpl} ج.م)</span></td>
          <td class="py-2.5 px-3">${deltaHtml}</td>
        </tr>
      `;
    }).join('');
  }

  // Run Daily Diagnosis using Real Metrics + Official Meta/Google Rules
  async function runDailyDiagnosis() {
    if (parsedTodayRows.length === 0) {
      App.showToast('أدخل بيانات حملات اليوم أولاً (CSV أو يدوي).', true);
      return;
    }

    const btn = document.getElementById('btn-diagnose-ads');
    const origHtml = btn.innerHTML;

    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner ml-1.5"></span> جاري المطابقة مع قواعد المنصات...`;

      const ws = App.getCurrentWorkspace();
      const platformRules = App.getPlatformRules();
      const yesterdayLog = (ws.ads?.dailyLogs || [])[0] || null;

      const diagnosis = await AIEngine.analyzeAdsWithRules(
        ws,
        parsedTodayRows,
        yesterdayLog ? yesterdayLog.rows : null,
        platformRules
      );

      // Save today's snapshot in dailyLogs
      if (!ws.ads) ws.ads = { dailyLogs: [], offlineSales: [] };
      ws.ads.dailyLogs.unshift({
        date: new Date().toISOString().slice(0, 10),
        rows: parsedTodayRows,
        diagnosis
      });

      await App.persistWorkspace();
      renderDiagnosisOutput(diagnosis);
      renderOfflineAttribution(ws);
      App.showToast('تم تشخيص حملات اليوم وحفظ السجل');
    } catch (e) {
      App.showError(e);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  function renderDiagnosisOutput(diagnosis) {
    const box = document.getElementById('ads-diagnosis-box');
    if (!box || !diagnosis) return;

    const badgeStyle = (type) => {
      if (type === 'scale') return 'bg-emerald-600 text-white';
      if (type === 'action') return 'bg-rose-600 text-white';
      return 'bg-ink text-white';
    };

    box.innerHTML = `
      <div class="p-4 rounded-xl bg-bronzeSoft/70 border border-bronze/30 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-bronze">ملخص القرار اليومي (مبني على أرقامك وقواعد Meta & Google)</span>
          <span class="text-[11px] bg-white px-2 py-0.5 rounded border border-borderSubtle font-semibold">تحديث اليوم</span>
        </div>
        <p class="text-xs text-ink font-semibold leading-relaxed">${escapeHtml(diagnosis.overallSummary || '')}</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          ${(diagnosis.campaigns || []).map(c => `
            <div class="p-3.5 rounded-xl bg-white border border-borderSubtle space-y-2 text-xs">
              <div class="flex items-center justify-between gap-2">
                <strong class="text-ink">${escapeHtml(c.campaignName)}</strong>
                <span class="px-2.5 py-0.5 rounded-md text-[11px] font-bold ${badgeStyle(c.decisionType)}">${escapeHtml(c.decision)}</span>
              </div>
              <p class="text-muted leading-relaxed"><strong>التشخيص:</strong> ${escapeHtml(c.diagnosis)}</p>
              <p class="text-ink leading-relaxed"><strong>القرار:</strong> ${escapeHtml(c.recommendedAction)}</p>
              <p class="text-bronze text-[11px] font-semibold"><strong>توصية الكونتنت:</strong> ${escapeHtml(c.contentFeedback || '')}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Update Official Meta & Google Rules via Google Search Grounding
  async function handleUpdatePlatformRules() {
    const btn = document.getElementById('btn-search-rules');
    const origHtml = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner spinner-dark ml-1.5"></span> جاري البحث في تحديثات ميتا وجوجل...`;

      const updated = await AIEngine.searchAndUpdatePlatformRules();
      await App.updatePlatformRules(updated);
      renderPlatformRules(updated);
      App.showToast('تم تحديث وحفظ أحدث قواعد Meta & Google بنجاح');
    } catch (e) {
      App.showError(e);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  function renderPlatformRules(rulesObj) {
    const badge = document.getElementById('rules-updated-date');
    const list = document.getElementById('platform-rules-list');
    if (badge) badge.textContent = `آخر تحديث: ${rulesObj.lastUpdated || 'الأساسي'}`;
    if (list) {
      list.innerHTML = (rulesObj.rules || []).map(r => `
        <li class="p-2.5 rounded-lg bg-stoneBg border border-borderSubtle text-xs text-ink leading-relaxed">
          • ${escapeHtml(r)}
        </li>
      `).join('');
    }
  }

  // Offline Sales Blended Attribution (Without burdening the Sales Team)
  async function addOfflineSaleRecord() {
    const count = parseInt(document.getElementById('offline-clients-count').value, 10) || 0;
    const revenue = parseFloat(document.getElementById('offline-revenue').value) || 0;
    const material = document.getElementById('offline-material').value.trim() || 'متنوع';
    const date = document.getElementById('offline-date').value || new Date().toISOString().slice(0, 10);

    if (count <= 0) {
      App.showToast('أدخل عدد العملاء الفعليين الذين نفذوا أوفلاين.', true);
      return;
    }

    const ws = App.getCurrentWorkspace();
    if (!ws.ads) ws.ads = { dailyLogs: [], offlineSales: [] };
    ws.ads.offlineSales.unshift({ id: 'sale-' + Date.now(), date, count, revenue, material });

    document.getElementById('offline-clients-count').value = '';
    document.getElementById('offline-revenue').value = '';
    document.getElementById('offline-material').value = '';

    await App.persistWorkspace();
    renderOfflineAttribution(ws);
    App.showToast('تم تسجيل العملاء الأوفلاين وحساب تكلفة العميل الحقيقية');
  }

  function renderOfflineAttribution(ws) {
    const logs = ws.ads?.dailyLogs || [];
    const sales = ws.ads?.offlineSales || [];

    const totalSpend = logs.reduce((acc, log) => {
      const daySpend = (log.rows || []).reduce((s, r) => s + (r.spend || 0), 0);
      return acc + daySpend;
    }, 0);

    const totalOfflineClients = sales.reduce((acc, s) => acc + (s.count || 0), 0);
    const totalRevenue = sales.reduce((acc, s) => acc + (s.revenue || 0), 0);

    const realCAC = totalOfflineClients > 0 ? Math.round(totalSpend / totalOfflineClients) : 0;
    const roas = totalSpend > 0 && totalRevenue > 0 ? (totalRevenue / totalSpend).toFixed(2) + 'x' : '-';

    const cacEl = document.getElementById('metric-real-cac');
    const clientsEl = document.getElementById('metric-offline-clients');
    const spendEl = document.getElementById('metric-total-spend');
    const roasEl = document.getElementById('metric-blended-roas');

    if (cacEl) cacEl.textContent = realCAC > 0 ? `${realCAC.toLocaleString()} ج.م` : 'بانتظار البيانات';
    if (clientsEl) clientsEl.textContent = `${totalOfflineClients} عميل`;
    if (spendEl) spendEl.textContent = `${totalSpend.toLocaleString()} ج.م`;
    if (roasEl) roasEl.textContent = roas;

    const historyEl = document.getElementById('offline-sales-history');
    if (historyEl) {
      historyEl.innerHTML = sales.length === 0
        ? `<p class="text-xs text-muted">لم يتم تسجيل تعاقدات أوفلاين بعد.</p>`
        : sales.slice(0, 6).map(s => `
          <div class="p-2.5 rounded-lg bg-stoneBg border border-borderSubtle flex items-center justify-between text-xs">
            <span><strong>${s.count} عميل</strong> • خامة: ${escapeHtml(s.material)}</span>
            <span class="text-muted">${s.date} ${s.revenue > 0 ? `• ${s.revenue.toLocaleString()} ج.م` : ''}</span>
          </div>
        `).join('');
    }
  }

  function renderAdsView(ws, platformRules) {
    renderTodayPreview();
    renderPlatformRules(platformRules);
    renderOfflineAttribution(ws);
    const lastLog = (ws.ads?.dailyLogs || [])[0];
    if (lastLog && lastLog.diagnosis) {
      renderDiagnosisOutput(lastLog.diagnosis);
    }
  }

  // Render Executive Report & Seasons View
  function renderReportsView(ws) {
    const posts = ws.calendar || [];
    const approvedCount = posts.filter(p => ['معتمد', 'اتعمل', 'اترفع'].includes(p.status)).length;
    const publishedCount = posts.filter(p => p.status === 'اترفع').length;
    const approvedIdeas = (ws.ideas || []).filter(i => i.status === 'approved');
    const topSaturated = [...approvedIdeas].sort((a, b) => b.saturation - a.saturation)[0];

    const summaryEl = document.getElementById('executive-report-body');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <p>• <strong>هدف الفترة:</strong> ${escapeHtml(ws.goal?.objective || 'غير محدد')}</p>
        <p>• <strong>إنجاز الكاليندر:</strong> تم اعتماد <strong>${approvedCount}</strong> بوستات من أصل <strong>${posts.length}</strong>، وتم نشر <strong>${publishedCount}</strong> بالفعل.</p>
        <p>• <strong>أكثر زاوية تم التركيز عليها:</strong> ${topSaturated ? `${escapeHtml(topSaturated.title)} (تشبع ${topSaturated.saturation}%)` : 'لا يوجد بعد'}</p>
        <p>• <strong>الأعمال المتسلمة المسجلة كمرجع:</strong> ${(ws.assets?.delivered || []).length} مشروع.</p>
      `;
    }

    // Seasons list
    const seasonsEl = document.getElementById('seasons-list');
    const seasons = ws.seasons || [];
    if (seasonsEl) {
      seasonsEl.innerHTML = seasons.length === 0
        ? `<p class="text-xs text-muted">لا توجد مواسم مسجلة بعد.</p>`
        : seasons.map((s, idx) => `
          <div class="p-3 rounded-lg bg-stoneBg border border-borderSubtle flex items-start justify-between gap-2 text-xs">
            <div>
              <strong class="text-ink block">${escapeHtml(s.name)}</strong>
              <span class="text-muted">${escapeHtml(s.notes)}</span>
            </div>
            <button onclick="AdsIntel.removeSeason(${idx})" class="text-rose-600 font-bold">✕</button>
          </div>
        `).join('');
    }
  }

  async function addSeason() {
    const name = document.getElementById('new-season-name').value.trim();
    const notes = document.getElementById('new-season-notes').value.trim();
    if (!name || !notes) return;

    const ws = App.getCurrentWorkspace();
    if (!ws.seasons) ws.seasons = [];
    ws.seasons.unshift({ id: 'sea-' + Date.now(), name, notes });
    document.getElementById('new-season-name').value = '';
    document.getElementById('new-season-notes').value = '';
    await App.persistWorkspace();
    App.refreshUI();
    App.showToast('تمت إضافة الموسم للمقارنة');
  }

  async function removeSeason(idx) {
    const ws = App.getCurrentWorkspace();
    if (!ws.seasons[idx] || !confirm('حذف الموسم؟')) return;
    await App.checkpoint(ws);
    ws.seasons.splice(idx, 1);
    await App.persistWorkspace();
    App.refreshUI();
  }

  function copyExecutiveReport() {
    const text = document.getElementById('executive-report-body')?.innerText || '';
    navigator.clipboard.writeText(text);
    App.showToast('تم نسخ التقرير التنفيذي');
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
    handleCSVUpload,
    addManualCampaignRow,
    runDailyDiagnosis,
    handleUpdatePlatformRules,
    addOfflineSaleRecord,
    renderAdsView,
    renderReportsView,
    addSeason,
    removeSeason,
    copyExecutiveReport
  };
})();