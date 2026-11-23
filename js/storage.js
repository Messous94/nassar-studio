/**
 * ============================================================================
 * js/storage.js
 * Cloud-First Storage Engine (GitHub Private Repo as Source of Truth + IndexedDB Cache)
 * Supports Multi-Workspace isolation so each company has independent JSON files.
 * ============================================================================
 */

const StorageEngine = (() => {
  const DB_NAME = 'NassarStudioCacheDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv_store';

  // Default seeded data for Nassar Stone (used on first launch before GitHub sync)
  const DEFAULT_COMPANIES = [
    {
      id: 'nassar-stone',
      name: 'NASSAR STONE',
      code: 'NS',
      subtitle: 'Marketing & Content Intelligence Studio'
    }
  ];

  const DEFAULT_NASSAR_WORKSPACE = {
    brandCore: {
      identity: 'نصار ستون (Nassar Stone) للرخام والجرانيت والكوارتز. ننافس في منطقة الـ Quiet Luxury (الفخامة الهادئة) بمعايير أوروبية (مثل Quartzforms و Mombak) بعيداً عن حرق الأسعار أو العروض الرخيصة.',
      tone: 'لغة عربية راقية، واثقة، هادئة، تخاطب الذوق الرفيع وتشرح القيمة والجودة ودقة التقفيل بدون حشو أو مبالغة إعلانية.',
      segments: 'B2C: أصحاب الفلل والمطابخ المودرن الباحثين عن خامة تعيش ومقاومة للبقع.\nB2B: المهندسين المعماريين ومصممي الديكور والمقاولين.',
      materials: [
        'Calacatta Lazza', 'Bianco Neve', 'Calacatta Gold', 'Statuario Nuvo',
        'Nero Marquina Q', 'Pietra Grey Q', 'Carrara Mist', 'Sahara Noir Q',
        'Arabescato Corchia', 'Empira White', 'Taj Mahal Q', 'Alpine Mist',
        'Oceanic Veins', 'Royal Botticino'
      ],
      offers: [
        {
          id: 'off-1',
          title: 'باقة المطبخ المتكامل (B2C)',
          segment: 'B2C',
          details: 'توريد وتصنيع وتركيب أسطح الكوارتز بأعلى دقة تقفيل مع ضمان ثبات اللون ومقاومة البقع.'
        },
        {
          id: 'off-2',
          title: 'شراكة المكاتب الهندسية (B2B)',
          segment: 'B2B',
          details: 'بوكس عينات متكامل للمكتب الهندسي مع أولوية توريد وأسعار تعاقد للمشاريع.'
        }
      ],
      rules: [
        'ممنوع تماماً استخدام كلمات مثل (أرخص سعر، خصم لفترة محدودة، عرض محروق).',
        'التركيز على دقة التقفيل، نعومة الملمس، وعدم المسامية ومقاومة البقع.',
        'عدم ذكر أي تفاصيل عن أخذ المقاسات في الموقع في البوستات.'
      ]
    },
    goal: {
      monthLabel: 'الشهر الحالي',
      objective: 'زيادة الوعي بأصناف الكوارتز المستوردة للمطابخ المودرن (B2C) وجذب استفسارات جادة لتشطيب الفلل.'
    },
    ideas: [
      {
        id: 'idea-1',
        title: 'مقاومة البقع والحرارة في الاستخدام اليومي للمطبخ',
        insight: 'العميل بيخاف الكوارتز الفاتح يبقع من القهوة أو الليمون، وتوضيح عدم المسامية بيكسر حاجز الخوف.',
        segment: 'B2C',
        saturation: 0,
        status: 'approved'
      },
      {
        id: 'idea-2',
        title: 'ليه المهندسين بيختاروا Bianco Neve في التصميمات المودرن؟',
        insight: 'المصمم بيدور على درجة بياض نقية متعملش تشتيت بصري مع الإضاءة والخشب.',
        segment: 'B2B',
        saturation: 25,
        status: 'approved'
      },
      {
        id: 'idea-3',
        title: 'الفرق الجوهري بين الكوارتز القياسي والتجاري',
        insight: 'العميل بيشوف صور متشابهة أونلاين ومبيفهمش فرق الكثافة ونقاء الريزين.',
        segment: 'B2C',
        saturation: 50,
        status: 'approved'
      },
      {
        id: 'idea-4',
        title: 'تفصيلة تقفيل الحواف والجزيرة (Waterfall Edge)',
        insight: 'الفخامة الهادئة بتبان في التقاء العروق عند زاوية 45 درجة.',
        segment: 'B2C',
        saturation: 0,
        status: 'approved'
      }
    ],
    calendar: [],
    assets: {
      delivered: [
        { id: 'ast-1', client: 'فيلا التجمع الخامس', location: 'القاهرة الجديدة', material: 'Calacatta Gold', notes: 'جزيرة مطبخ + تجليد حائط' },
        { id: 'ast-2', client: 'مطبخ د. كريم', location: 'الشيخ زايد', material: 'Bianco Neve', notes: 'مطبخ مودرن كامل' }
      ],
      designerDeliveries: []
    },
    ads: {
      dailyLogs: [],
      offlineSales: []
    },
    seasons: [
      { id: 'sea-1', name: 'موسم تشطيبات الصيف', notes: 'أعلى طلب على مطابخ الكوارتز الفاتحة (Bianco Neve & Calacatta).' },
      { id: 'sea-2', name: 'موسم الربع الأخير (Q4)', notes: 'زيادة تعاقدات المشاريع والمكاتب الهندسية B2B.' }
    ]
  };

  const DEFAULT_PLATFORM_RULES = {
    lastUpdated: 'النسخة الأساسية المعتمدة',
    rules: [
      'Meta Andromeda & Creative Diversification: تعدد الزوايا البصرية والنصية داخل نفس الـ Ad Set يقلل الـ CPA ويزيد الوصول للجمهور المؤهل بدلاً من تكرار نفس التصميم.',
      'Creative Fatigue Rule: عند وصول الـ Frequency إلى 3.5 فأكثر مع هبوط الـ CTR عن يوم أمس، يجب ضخ Creative جديد بزاوية مختلفة دون تصفير مرحلة التعلم.',
      'Learning Phase Protection: تجنب تعديل الميزانية بأكثر من 20% يومياً أو تعديل الاستهداف خلال أول 72 ساعة أو قبل اكتمال 50 نتيجة لتجنب إعادة ضبط التعلم.',
      'Broad & Advantage+ Audience: الخوارزميات الحديثة تعتمد على الكريتيف في استهداف الشريحة السعرية المرتفعة؛ الكوبي الراقي يفلتر الجمهور تلقائياً.',
      'Google Search & PMax Intent: التركيز على الكلمات ذات النية الشرائية العالية (أسعار كوارتز مطابخ، رخام كوارتز مستورد) واستبعاد كلمات البحث عن الرخيص أو المستعمل.'
    ]
  };

  // --- IndexedDB Helpers ---
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IDB Get Error:', e);
      return null;
    }
  }

  async function idbSet(key, val) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(val, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IDB Set Error:', e);
      return false;
    }
  }

  // --- Settings (API Keys & GitHub Config) ---
  function getConfig() {
    try {
      const raw = localStorage.getItem('ns_studio_config');
      return raw ? JSON.parse(raw) : {
        geminiKey: '',
        ghToken: '',
        ghOwner: '',
        ghRepo: '',
        ghBranch: 'main'
      };
    } catch {
      return { geminiKey: '', ghToken: '', ghOwner: '', ghRepo: '', ghBranch: 'main' };
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem('ns_studio_config', JSON.stringify(cfg));
  }

  function isGitHubConfigured() {
    const c = getConfig();
    return Boolean(c.ghToken && c.ghOwner && c.ghRepo);
  }

  // --- GitHub API Helpers (UTF-8 Safe Base64) ---
  function toBase64Unicode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }

  function fromBase64Unicode(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  async function ghReadFile(path) {
    const cfg = getConfig();
    if (!isGitHubConfigured()) return null;

    const url = `https://api.github.com/repos/${cfg.ghOwner}/${cfg.ghRepo}/contents/${path}?ref=${cfg.ghBranch || 'main'}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${cfg.ghToken}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    if (res.status === 404) return { exists: false, data: null, sha: null };
    if (!res.ok) throw new Error(`GitHub Read Error (${res.status})`);

    const json = await res.json();
    const content = fromBase64Unicode(json.content);
    return {
      exists: true,
      data: JSON.parse(content),
      sha: json.sha
    };
  }

  async function ghWriteFile(path, dataObj, commitMsg = 'Update studio data') {
    const cfg = getConfig();
    if (!isGitHubConfigured()) return false;

    // Fetch latest SHA first to prevent conflict
    let sha = null;
    try {
      const existing = await ghReadFile(path);
      if (existing && existing.exists) sha = existing.sha;
    } catch (e) {
      console.warn('SHA check warning:', e);
    }

    const url = `https://api.github.com/repos/${cfg.ghOwner}/${cfg.ghRepo}/contents/${path}`;
    const body = {
      message: commitMsg,
      content: toBase64Unicode(JSON.stringify(dataObj, null, 2)),
      branch: cfg.ghBranch || 'main'
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cfg.ghToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub Write Error (${res.status}): ${errText}`);
    }
    return true;
  }

  // --- High-Level Workspace Operations ---
  function updateSyncBadge(state, text) {
    const dot = document.getElementById('sync-dot');
    const label = document.getElementById('sync-label');
    if (!dot || !label) return;

    dot.className = 'w-2 h-2 rounded-full';
    if (state === 'syncing') {
      dot.classList.add('bg-amber-500', 'animate-pulse');
    } else if (state === 'synced') {
      dot.classList.add('bg-emerald-500');
    } else if (state === 'local') {
      dot.classList.add('bg-sky-500');
    } else {
      dot.classList.add('bg-rose-500');
    }
    label.textContent = text;
  }

  async function loadCompaniesList() {
    // Try GitHub first if configured
    if (isGitHubConfigured()) {
      try {
        updateSyncBadge('syncing', 'جاري الجلب من GitHub...');
        const remote = await ghReadFile('data/companies.json');
        if (remote && remote.exists && Array.isArray(remote.data)) {
          await idbSet('companies', remote.data);
          updateSyncBadge('synced', 'متزامن مع GitHub');
          return remote.data;
        } else {
          // Initialize on GitHub
          await ghWriteFile('data/companies.json', DEFAULT_COMPANIES, 'Init companies list');
          await idbSet('companies', DEFAULT_COMPANIES);
          updateSyncBadge('synced', 'متزامن مع GitHub');
          return DEFAULT_COMPANIES;
        }
      } catch (e) {
        console.error(e);
        updateSyncBadge('error', 'خطأ في GitHub (يعمل من الكاش)');
      }
    }

    const cached = await idbGet('companies');
    if (cached && Array.isArray(cached) && cached.length > 0) {
      updateSyncBadge('local', 'كاش محلي (اربط GitHub للحفظ السحابي)');
      return cached;
    }

    await idbSet('companies', DEFAULT_COMPANIES);
    updateSyncBadge('local', 'كاش محلي');
    return DEFAULT_COMPANIES;
  }

  async function saveCompaniesList(list) {
    await idbSet('companies', list);
    if (isGitHubConfigured()) {
      try {
        updateSyncBadge('syncing', 'جاري الحفظ على GitHub...');
        await ghWriteFile('data/companies.json', list, 'Update companies');
        updateSyncBadge('synced', 'متزامن مع GitHub');
      } catch (e) {
        console.error(e);
        updateSyncBadge('error', 'تعذر المزامنة مع GitHub');
      }
    }
  }

  async function loadWorkspace(companyId) {
    const path = `data/workspaces/${companyId}.json`;
    if (isGitHubConfigured()) {
      try {
        updateSyncBadge('syncing', 'تحميل بيانات الشركة...');
        const remote = await ghReadFile(path);
        if (remote && remote.exists && remote.data) {
          await idbSet(`ws_${companyId}`, remote.data);
          updateSyncBadge('synced', 'متزامن مع GitHub');
          return remote.data;
        } else {
          const seed = companyId === 'nassar-stone'
            ? JSON.parse(JSON.stringify(DEFAULT_NASSAR_WORKSPACE))
            : createEmptyWorkspace(companyId);
          await ghWriteFile(path, seed, `Init workspace ${companyId}`);
          await idbSet(`ws_${companyId}`, seed);
          updateSyncBadge('synced', 'متزامن مع GitHub');
          return seed;
        }
      } catch (e) {
        console.error(e);
        updateSyncBadge('error', 'خطأ اتصال GitHub (نسخة الكاش)');
      }
    }

    const cached = await idbGet(`ws_${companyId}`);
    if (cached) {
      updateSyncBadge('local', 'كاش محلي');
      return cached;
    }

    const fallback = companyId === 'nassar-stone'
      ? JSON.parse(JSON.stringify(DEFAULT_NASSAR_WORKSPACE))
      : createEmptyWorkspace(companyId);
    await idbSet(`ws_${companyId}`, fallback);
    return fallback;
  }

  async function saveWorkspace(companyId, wsData) {
    await idbSet(`ws_${companyId}`, wsData);
    if (isGitHubConfigured()) {
      try {
        updateSyncBadge('syncing', 'حفظ تلقائي على GitHub...');
        await ghWriteFile(`data/workspaces/${companyId}.json`, wsData, `Sync ${companyId}`);
        updateSyncBadge('synced', 'متزامن مع GitHub');
      } catch (e) {
        console.error(e);
        updateSyncBadge('error', 'فشل الحفظ السحابي');
      }
    } else {
      updateSyncBadge('local', 'محفوظ محلياً');
    }
  }

  async function loadPlatformRules() {
    const path = 'data/platform_rules.json';
    if (isGitHubConfigured()) {
      try {
        const remote = await ghReadFile(path);
        if (remote && remote.exists && remote.data) {
          await idbSet('platform_rules', remote.data);
          return remote.data;
        } else {
          await ghWriteFile(path, DEFAULT_PLATFORM_RULES, 'Init platform rules');
          await idbSet('platform_rules', DEFAULT_PLATFORM_RULES);
          return DEFAULT_PLATFORM_RULES;
        }
      } catch (e) {
        console.warn('Platform rules remote read failed:', e);
      }
    }
    const cached = await idbGet('platform_rules');
    if (cached) return cached;
    await idbSet('platform_rules', DEFAULT_PLATFORM_RULES);
    return DEFAULT_PLATFORM_RULES;
  }

  async function savePlatformRules(rulesObj) {
    await idbSet('platform_rules', rulesObj);
    if (isGitHubConfigured()) {
      try {
        updateSyncBadge('syncing', 'حفظ قواعد المنصات...');
        await ghWriteFile('data/platform_rules.json', rulesObj, 'Update Meta & Google rules');
        updateSyncBadge('synced', 'متزامن مع GitHub');
      } catch (e) {
        console.error(e);
        updateSyncBadge('error', 'فشل حفظ القواعد سحابياً');
      }
    }
  }

  function createEmptyWorkspace(name) {
    return {
      brandCore: {
        identity: `شركة ${name} — هوية راقية وتركيز على الجودة والقيمة المضافة.`,
        tone: 'لغة عربية واضحة، احترافية، ومقنعة بدون حشو.',
        segments: 'B2C: العملاء الأفراد\nB2B: الشركات والمشاريع',
        materials: ['المنتج الرئيسي 1', 'المنتج الرئيسي 2'],
        offers: [],
        rules: ['تجنب العبارات المبتذلة أو المبالغات غير الواقعية.']
      },
      goal: {
        monthLabel: 'الشهر الحالي',
        objective: 'زيادة الوعي بالعلامة التجارية وجذب عملاء مؤهلين.'
      },
      ideas: [],
      calendar: [],
      assets: { delivered: [], designerDeliveries: [] },
      ads: { dailyLogs: [], offlineSales: [] },
      seasons: []
    };
  }

  // Pull fresh from GitHub ignoring local cache
  async function forcePullFromGitHub(companyId) {
    if (!isGitHubConfigured()) {
      throw new Error('يرجى إدخال بيانات مستودع GitHub والتوكن في الإعدادات أولاً.');
    }
    const companies = await loadCompaniesList();
    const ws = await loadWorkspace(companyId);
    const rules = await loadPlatformRules();
    return { companies, ws, rules };
  }

  return {
    getConfig,
    saveConfig,
    isGitHubConfigured,
    loadCompaniesList,
    saveCompaniesList,
    loadWorkspace,
    saveWorkspace,
    loadPlatformRules,
    savePlatformRules,
    createEmptyWorkspace,
    forcePullFromGitHub
  };
})();