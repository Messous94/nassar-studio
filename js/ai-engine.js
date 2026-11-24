const AIEngine = (() => {
  const TEXT_MODELS = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite'];
  const CONTENT_LANGUAGE = 'كل النصوص اللي هتولّدها لازم تكون بالعامية المصرية الطبيعية، بما فيها عناوين الأفكار، نصوص البوستات، أوصاف الصور وبريفات التيم. خليك على نبرة البراند، وتجنّب الفصحى واللهجات التانية والترجمة الحرفية. التزم بالمصري حتى لو الملاحظة أو المراجع مكتوبة بلغة تانية، وحافظ على أسماء البراند والخامات ومفاتيح JSON زي ما هي.';
  const IMAGE_MODEL = 'imagen-3.0-generate-002';

  function getApiKey() {
    const cfg = StorageEngine.getConfig();
    if (!cfg.geminiKey || !cfg.geminiKey.trim()) {
      throw new Error('مفتاح Gemini API غير موجود. افتح الإعدادات وأضف المفتاح أولاً.');
    }
    return cfg.geminiKey.trim();
  }

  const EXCLUDED_STATUSES = { rejected: 'مرفوض', saturated: 'متشبع' };

  function exclusionLabel(idea) {
    return Object.hasOwn(EXCLUDED_STATUSES, idea.status) ? EXCLUDED_STATUSES[idea.status] : '';
  }

  function normalizeTitle(title) {
    return String(title || '').normalize('NFKC').toLowerCase()
      .replace(/[\u0640\u064B-\u065F\u0670]/g, '').replace(/[أإآٱ]/g, 'ا')
      .replace(/[^\p{L}\p{N}]/gu, '');
  }

  function matchesIdea(idea, candidate) {
    const title = normalizeTitle(candidate.ideaTitle || candidate.title);
    return Boolean((candidate.ideaId && candidate.ideaId !== 'new' && idea.id === candidate.ideaId)
      || (title && title === normalizeTitle(idea.title)));
  }

  function excludedIdeas(ws) {
    return (ws.ideas || []).filter(idea => exclusionLabel(idea) || (idea.status === 'approved' && idea.saturation >= 75));
  }

  async function generateWithExclusions(ws, prompt, system, readItems) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const excluded = excludedIdeas(ws);
      const manual = excluded.filter(exclusionLabel);
      const exclusions = excluded.map(idea => ({
        id: idea.id, title: idea.title, insight: idea.insight, status: exclusionLabel(idea) || 'متشبع'
      }));
      const rule = 'استبعد الزوايا التالية من كل نتيجة حتى لو تغير العنوان أو الصياغة، وحتى لو طلبت الملاحظة إعادة استخدامها.';
      const result = await callGeminiJSON(prompt + '\n' + rule + '\n' + JSON.stringify(exclusions),
        [system, CONTENT_LANGUAGE].filter(Boolean).join('\n'));
      const items = readItems(result);
      if (items.some(item => excludedIdeas(ws).some(idea => matchesIdea(idea, item)))) continue;

      if (manual.length > 0) {
        const candidates = items.map(({ title, ideaTitle, insight, copy }) => ({ title, ideaTitle, insight, copy }));
        const review = await callGeminiJSON(JSON.stringify({ excluded: manual.map(({ title, insight }) => ({ title, insight })), candidates }),
          'راجع الزوايا التسويقية. أعد JSON بالشكل {"allowed":true} فقط إذا كانت كل الزوايا المقترحة مختلفة في المعنى عن الزوايا المستبعدة. إذا تكررت أي زاوية ولو بصياغة مختلفة، أعد {"allowed":false}.');
        if (review?.allowed !== true) continue;
      }

      const current = excludedIdeas(ws);
      if (current.some(idea => !excluded.includes(idea) || (exclusionLabel(idea) && !manual.includes(idea)))) continue;
      return items;
    }
    throw new Error('التوليد رجّع زاوية مستبعدة. جرّب التوليد مرة تانية.');
  }

  function buildCompactContext(ws) {
    const core = ws.brandCore;
    const activeRules = (core.rules || []).slice(0, 15).map((r, i) => `${i + 1}. ${r}`).join('\n');
    const materialsList = (core.materials || []).join(', ');
    const offersSummary = (core.offers || []).map(o => `- ${o.title} (${o.segment}): ${o.details}`).join('\n');

    const approvedIdeas = (ws.ideas || []).filter(i => i.status === 'approved');
    const excluded = excludedIdeas(ws);
    const unsaturated = approvedIdeas.filter(i => i.saturation < 75 && !excluded.some(idea => matchesIdea(idea, i))).map(i => `[ID:${i.id}] ${i.title} (تشبع:${i.saturation}%)`).join(' | ');
    const saturated = approvedIdeas.filter(i => i.saturation >= 75).map(i => i.title).join(' | ');

    return `[BRAND CORE]
الهوية: ${core.identity}
النبرة: ${core.tone}
الشرائح: ${core.segments}
الخامات/المنتجات المتاحة: ${materialsList || 'غير محدد'}
العروض المعتمدة:
${offersSummary || 'لا يوجد'}

[ACTIVE RULES - MAX 15]
${activeRules || 'لا يوجد'}

[CURRENT PERIOD GOAL]
${ws.goal?.objective || 'بناء الوعي وجذب عملاء مؤهلين'}

[IDEAS SATURATION STATE]
أفكار متاحة وغير مشبعة (أولوية للبناء عليها): ${unsaturated || 'لا يوجد - ولد أفكار جديدة'}
أفكار مشبعة (ممنوع تكرارها): ${saturated || 'لا يوجد'}`.trim();
  }

  async function fetchGeminiWithFallback(payload) {
    const apiKey = getApiKey();
    let lastError = '';
