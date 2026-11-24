const AIEngine = (() => {
  const TEXT_MODELS = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite'];
  const IMAGE_MODEL = 'imagen-3.0-generate-002';

  function getApiKey() {
    const cfg = StorageEngine.getConfig();
    if (!cfg.geminiKey || !cfg.geminiKey.trim()) {
      throw new Error('مفتاح Gemini API غير موجود. افتح الإعدادات وأضف المفتاح أولاً.');
    }
    return cfg.geminiKey.trim();
  }

  function buildCompactContext(ws) {
    const core = ws.brandCore;
    const activeRules = (core.rules || []).slice(0, 15).map((r, i) => `${i + 1}. ${r}`).join('\n');
    const materialsList = (core.materials || []).join(', ');
    const offersSummary = (core.offers || []).map(o => `- ${o.title} (${o.segment}): ${o.details}`).join('\n');

    const approvedIdeas = (ws.ideas || []).filter(i => i.status === 'approved');
    const unsaturated = approvedIdeas.filter(i => i.saturation < 75).map(i => `[ID:${i.id}] ${i.title} (تشبع:${i.saturation}%)`).join(' | ');
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

    for (const model of TEXT_MODELS) {
      const url = `[https://generativelanguage.googleapis.com/v1beta/models/$](https://generativelanguage.googleapis.com/v1beta/models/$){model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) return await res.json();

        const errText = await res.text();
        lastError = `(${res.status}): ${errText}`;
        if (res.status === 404) continue;
        throw new Error(`Gemini API Error ${lastError}`);
      } catch (e) {
        if (e.message && e.message.includes('404')) continue;
        throw e;
      }
    }
    throw new Error(`تعذر الاتصال بنماذج Gemini المتاحة. آخر خطأ: ${lastError}`);
  }

  async function callGeminiJSON(promptText, systemInstruction = '') {
    const payload = {
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json'
      }
    };

    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const data = await fetchGeminiWithFallback(payload);
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('لم يتم استلام رد صالح من Gemini API.');

    try {
      return JSON.parse(rawText);
    } catch (e) {
      const cleaned = rawText.replace(/^
```json\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(cleaned);
    }
  }

  async function generateCalendar8(ws) {
    const context = buildCompactContext(ws);
    const sys = 'أنت مدير تسويق واستراتيجي محتوى محترف. تلتزم حرفياً بهوية البراند وقواعده النشطة، وتحقق هدف الفترة، وتتجنب الأفكار المشبعة تماماً. تخرج النتيجة كـ JSON فقط.';

    const prompt = `${context}

المطلوب:
توليد كاليندر فيسبوك متكاملة مكونة من 8 بوستات متنوعة ومتوازنة تخدم هدف الفترة وتلتزم بالقواعد.
- استخدم الأفكار المتاحة غير المشبعة قدر الإمكان، وإذا احتجت أفكاراً إضافية لتكملة الـ 8 بوستات ابتكر أفكاراً جديدة غير مكررة.
- لكل بوست، اكتب التفاصيل الكاملة للتيم (النص النهائي، الفكرة، الخامة، تصور الصورة بدقة، درجة الألوان، الجو العام، وبريف واضح للتعديل للديزاينر إن وجد).

أخرج النتيجة بصيغة JSON مطابقة تماماً لهذا الهيكل:
{
  "posts": [
    {
      "title": "عنوان مختصر للفكرة",
      "ideaId": "ID الفكرة من القائمة إن وجد أو new",
      "ideaTitle": "اسم الفكرة أو الزاوية",
      "isNewIdea": true,
      "segment": "B2C أو B2B",
      "material": "اسم الخامة أو المنتج من القائمة",
      "copy": "نص البوست الكامل الجاهز للنشر على فيسبوك بأسلوب البراند",
      "visualDirection": "وصف دقيق لتصور الصورة وزاوية التصوير والعناصر",
      "colorPalette": "درجة الألوان المطلوبة",
      "mood": "الجو العام للصورة",
      "designerBrief": "ملاحظات التنفيذ أو التعديل للديزاينر والتمبليت"
    }
  ]
}`;
    const result = await callGeminiJSON(prompt, sys);
    if (!result || !Array.isArray(result.posts)) {
      throw new Error('تنسيق الكاليندر العائد من الذكاء الاصطناعي غير مكتمل.');
    }
    return result.posts;
  }

  async function generateSinglePost(ws, customNote = '') {
    const context = buildCompactContext(ws);
    const sys = 'أنت مدير تسويق محترف. تلتزم بهوية البراند والقواعد وتخرج بوست واحد متكامل التفاصيل بصيغة JSON فقط.';

    const prompt = `${context}
ملاحظة إضافية من المدير: ${customNote || 'اختر أفضل زاوية غير مشبعة تخدم هدف الفترة'}

المطلوب: توليد بوست فيسبوك واحد متكامل بالتفاصيل الكاملة للتيم.
أخرج JSON مطابقاً لهذا الشكل:
{
  "post": {
    "title": "عنوان مختصر للفكرة",
    "ideaId": "ID الفكرة من القائمة إن وجد أو new",
    "ideaTitle": "اسم الفكرة أو الزاوية",
    "isNewIdea": true,
    "segment": "B2C أو B2B",
    "material": "اسم الخامة أو المنتج",
    "copy": "نص البوست الكامل الجاهز للنشر",
    "visualDirection": "وصف دقيق لتصور الصورة وزاوية التصوير",
    "colorPalette": "درجة الألوان المطلوبة",
    "mood": "الجو العام للصورة",
    "designerBrief": "بريف التنفيذ للديزاينر"
  }
}`;
    const result = await callGeminiJSON(prompt, sys);
    if (!result || !result.post) throw new Error('تعذر توليد البوست الفردي.');
    return result.post;
  }

  async function generateIdeas(ws, count = 4) {
    const context = buildCompactContext(ws);
    const existingTitles = (ws.ideas || []).map(i => i.title).join(' | ');

    const prompt = `${context}
الأفكار الموجودة مسبقاً (ممنوع تكرارها): ${existingTitles || 'لا يوجد'}

المطلوب: توليد ${count} أفكار و Insights تسويقية جديدة ومبتكرة تخدم هدف الفترة وتناسب شرائح البراند.
أخرج JSON فقط بهذا الشكل:
{
  "ideas": [
    {
      "title": "عنوان الفكرة التسويقية",
      "insight": "الـ Insight النفسي أو العملي وراء الفكرة ولماذا ستقنع العميل",
      "segment": "B2C أو B2B"
    }
  ]
}`;
    const result = await callGeminiJSON(prompt);
    return result?.ideas || [];
  }

  async function generateReferenceImage(post) {
    const apiKey = getApiKey();
    const prompt = `Architectural luxury interior photography, ${post.material || 'natural quartz stone surface'}, ${post.visualDirection}. Color palette: ${post.colorPalette}. Mood: ${post.mood}. Quiet luxury aesthetic, soft natural directional lighting, ultra clean composition, 8k photorealistic, no text, no watermarks.`;

    const url = `[https://generativelanguage.googleapis.com/v1beta/models/$](https://generativelanguage.googleapis.com/v1beta/models/$){IMAGE_MODEL}:predict?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '4:3' }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`تعذر توليد صورة الريفرنس (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error('لم يتم إرجاع بيانات الصورة من Google API.');
    return `data:image/png;base64,${b64}`;
  }

  async function searchAndUpdatePlatformRules() {
    const prompt = 'ابحث في التحديثات الرسمية الحديثة لمنصات Meta Ads (مثل تحديثات Andromeda, Advantage+, Creative Diversification, Learning Phase) و Google Ads (Performance Max, Search Bidding) وممارسات الميديا بايرز الموثوقة. لخص أهم 6 قواعد عملية ومباشرة باللغة العربية تُستخدم لتشخيص الحملات الإعلانية اليومية واتخاذ قرارات (إيقاف / تعديل / زيادة ميزانية). اكتب القواعد كقائمة مرقمة واضحة ومختصرة بدون مقدمات أو خاتمة.';

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.3 }
    };

    const data = await fetchGeminiWithFallback(payload);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const lines = text
      .split('\n')
      .map(l => l.replace(/^[\d\-\*\.\)]+\s*/, '').trim())
      .filter(l => l.length > 15);

    if (lines.length === 0) throw new Error('لم يتم العثور على قواعد واضحة من البحث.');

    return {
      lastUpdated: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }),
      rules: lines.slice(0, 8)
    };
  }

  async function analyzeAdsWithRules(ws, todaySummary, yesterdaySummary, platformRulesObj) {
    const rulesText = (platformRulesObj.rules || []).map((r, i) => `${i + 1}. ${r}`).join('\n');
    const goalText = ws.goal?.objective || 'غير محدد';

    const prompt = `أنت محلل أداء إعلانات (Media Buyer Analyst) صارم.
قاعدة صارمة: ممنوع اختراع أو افتراض أي أرقام غير موجودة في البيانات أدناه. اعتمد فقط على الأرقام الفعلية المرفقة وقواعد ميتا/جوجل الرسمية المرفقة.

[هدف الفترة الحالي]
${goalText}

[قواعد وتحديثات Meta & Google المعتمدة]
${rulesText}

[أرقام الحملات الفعلية — اليوم]
${JSON.stringify(todaySummary, null, 2)}

[أرقام الحملات الفعلية — الأمس (للمقارنة Day-over-Day)]
${yesterdaySummary ? JSON.stringify(yesterdaySummary, null, 2) : 'لا توجد بيانات سابقة للمقارنة'}

المطلوب:
حلل كل حملة بناءً على أرقامها الفعلية ومقارنتها بالأمس وقواعد المنصات، وأخرج النتيجة بصيغة JSON فقط:
{
  "overallSummary": "ملخص تنفيذي قصير لأداء اليوم مقارنة بالهدف",
  "campaigns": [
    {
      "campaignName": "اسم الحملة",
      "decision": "سيبها شغالة (Hold) أو عدّل / أوقف (Action) أو زوّد ميزانية (Scale)",
      "decisionType": "hold أو action أو scale",
      "diagnosis": "تشخيص الخلل أو الاستقرار بالأرقام الفعلية والقاعدة المطبقة من ميتا/جوجل",
      "recommendedAction": "الخطوة العملية المطلوبة اليوم",
      "contentFeedback": "توصية لربط النتيجة بالكونتنت (مثال: زاوية ناجحة نكررها أو زاوية تحتاج تغيير)"
    }
  ]
}`;
    return await callGeminiJSON(prompt);
  }

  return {
    generateCalendar8,
    generateSinglePost,
    generateIdeas,
    generateReferenceImage,
    searchAndUpdatePlatformRules,
    analyzeAdsWithRules
  };
})();
