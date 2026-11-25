/**
 * ============================================================================
 * js/storage.js
 * Local-first Storage Engine with tracked GitHub synchronization
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
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(new Error('تعذر قراءة البيانات المحلية.')); };
    });
  }

  async function idbWrite(entries) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      for (const [key, value] of entries) tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = tx.onabort = () => { db.close(); reject(new Error('تعذر الحفظ على الجهاز. نزّل نسخة احتياطية قبل إغلاق الصفحة.')); };
    });
  }

  function idbSet(key, value) { return idbWrite([[key, value]]); }

  function describeError(error) {
    if (error?.name === 'AbortError') return 'انتهت مهلة الاتصال. حاول مرة تانية.';
    if (error instanceof TypeError) return 'تعذر الاتصال. راجع الإنترنت وحاول مرة تانية.';
    const message = error?.message || '';
    if (/Gemini|Google API|All Gemini models/.test(message)) {
      if (/429|quota|RESOURCE_EXHAUSTED/i.test(message)) return 'حصة توليد Google خلصت أو الطلبات كتير. راجع الحصة والفوترة، وجرب لاحقًا.';
      if (/401|403|API_KEY_INVALID|API key not valid/i.test(message)) return 'مفتاح Google مش صالح أو مش مسموح له بالطلب. راجع إعدادات المفتاح.';
      if (/404|NOT_FOUND/.test(message)) return 'موديل التوليد غير متاح للمفتاح الحالي.';
      return 'خدمة التوليد لم تكمل الطلب. حاول مرة تانية.';
    }
    return message || 'حصل خطأ غير متوقع. حاول مرة تانية.';
  }

  async function request(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }

  function githubError(status) {
    if ([401, 403].includes(status)) return new Error('تعذر دخول GitHub. راجع التوكن وصلاحية تعديل محتويات الريبو.');
    if ([409, 422].includes(status)) return new Error('بيانات GitHub اتغيّرت. نزّل نسخة احتياطية، وراجع النسخة السحابية قبل الاسترجاع.');
    if (status === 404) return new Error('الريبو أو الفرع مش متاح. راجع إعدادات GitHub.');
    return new Error('تعذر الاتصال بـ GitHub (' + status + '). حاول مرة تانية.');
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

  function configSource(cfg) { return [cfg.ghOwner, cfg.ghRepo, cfg.ghBranch || 'main'].join('/'); }

  async function ghReadFile(path, cfg = getConfig()) {
    const url = `https://api.github.com/repos/${encodeURIComponent(cfg.ghOwner)}/${encodeURIComponent(cfg.ghRepo)}/contents/${path}?ref=${encodeURIComponent(cfg.ghBranch || 'main')}`;
    const headers = { Authorization: `Bearer ${cfg.ghToken}`, Accept: 'application/vnd.github+json' };
    const res = await request(url, { headers });
    if (res.status === 404) {
      const branch = await request(`https://api.github.com/repos/${encodeURIComponent(cfg.ghOwner)}/${encodeURIComponent(cfg.ghRepo)}/branches/${encodeURIComponent(cfg.ghBranch || 'main')}`, { headers });
      if (!branch.ok) throw githubError(branch.status);
      return { exists: false, data: null, sha: null };
    }
    if (!res.ok) throw githubError(res.status);
    const json = await res.json();
    try { return { exists: true, data: JSON.parse(fromBase64Unicode(json.content)), sha: json.sha }; }
    catch { throw new Error('ملف البيانات على GitHub غير صالح. نسختك المحلية محفوظة.'); }
  }

  async function ghWriteFile(path, data, sha, cfg) {
    const body = { message: 'Sync studio data', content: toBase64Unicode(JSON.stringify(data, null, 2)), branch: cfg.ghBranch || 'main' };
    if (sha) body.sha = sha;
    const res = await request(`https://api.github.com/repos/${encodeURIComponent(cfg.ghOwner)}/${encodeURIComponent(cfg.ghRepo)}/contents/${path}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${cfg.ghToken}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!res.ok) throw githubError(res.status);
    return (await res.json()).content.sha;
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

  const queues = new Map();
  const localQueues = new Map();
  function enqueueIn(map, key, operation) {
    const next = (map.get(key) || Promise.resolve()).catch(() => {}).then(operation);
    map.set(key, next);
    return next;
  }
  const enqueue = (key, operation) => enqueueIn(queues, key, operation);
  const enqueueLocal = (key, operation) => enqueueIn(localQueues, key, operation);
  const clone = value => JSON.parse(JSON.stringify(value));

  async function syncRecord(key, path, data, meta) {
    if (!isGitHubConfigured()) {
      updateSyncBadge('local', 'محفوظ على الجهاز');
      return { local: true, synced: false };
    }
    const cfg = getConfig();
    try {
      updateSyncBadge('syncing', 'جاري المزامنة...');
      let sha = meta.remoteSha;
      if (!meta.knownRemote || meta.source !== configSource(cfg)) {
        const remote = await ghReadFile(path, cfg);
        if (remote.exists && JSON.stringify(remote.data) !== meta.baseline && JSON.stringify(remote.data) !== JSON.stringify(data)) throw githubError(409);
        sha = remote.sha;
      }
      // Write against the version actually loaded; never silently adopt a newer SHA.
      const remoteSha = await ghWriteFile(path, data, sha, cfg);
      const dirty = await enqueueLocal(key, async () => {
        const latest = await idbGet('sync_' + key);
        const dirty = latest?.revision !== meta.revision;
        await idbSet('sync_' + key, { ...(latest || {}), dirty, knownRemote: true, remoteSha, source: configSource(cfg) });
        return dirty;
      });
      updateSyncBadge(dirty ? 'local' : 'synced', dirty ? 'تعديلات على الجهاز في انتظار المزامنة' : 'متزامن مع GitHub');
      return { local: true, synced: !dirty };
    } catch (error) {
      updateSyncBadge('error', 'محفوظ على الجهاز — المزامنة متوقفة');
      return { local: true, synced: false, error: describeError(error) };
    }
  }

  function saveRecord(key, path, value) {
    const data = clone(value);
    // Local commits never wait for a slow cloud request.
    return enqueueLocal(key, async () => {
      const previous = await idbGet(key);
      const oldMeta = await idbGet('sync_' + key);
      const meta = { ...(oldMeta || {}), dirty: true, revision: (oldMeta?.revision || 0) + 1 };
      if (!oldMeta?.dirty) meta.baseline = JSON.stringify(previous);
      await idbWrite([[key, data], ['sync_' + key, meta]]);
    }).then(() => retryRecord(key, path));
  }

  async function loadRecord(key, path, fallback, validate) {
    await localQueues.get(key)?.catch(() => {});
    await queues.get(key)?.catch(() => {});
    const cached = await idbGet(key);
    const meta = await idbGet('sync_' + key);
    if (cached && meta?.dirty) {
      updateSyncBadge('local', 'تعديلات على الجهاز في انتظار المزامنة');
      return cached;
    }
    if (isGitHubConfigured()) {
      try {
        updateSyncBadge('syncing', 'تحميل البيانات...');
        const cfg = getConfig();
        const remote = await ghReadFile(path, cfg);
        if (remote.exists) {
          validate(remote.data);
          await idbWrite([[key, remote.data], ['sync_' + key, { dirty: false, knownRemote: true, remoteSha: remote.sha, source: configSource(cfg) }]]);
          updateSyncBadge('synced', 'متزامن مع GitHub');
          return remote.data;
        }
        const data = cached || clone(fallback);
        await idbWrite([[key, data], ['sync_' + key, { dirty: true, knownRemote: true, remoteSha: null, source: configSource(cfg) }]]);
        await retryRecord(key, path);
        return data;
      } catch (error) {
        updateSyncBadge('error', 'تعذر الجلب — باستخدام نسخة الجهاز');
      }
    }
    if (cached) return cached;
    const data = clone(fallback);
    await idbSet(key, data);
    updateSyncBadge('local', 'محفوظ على الجهاز');
    return data;
  }

  function retryRecord(key, path) {
    return enqueue(key, async () => {
      const meta = await idbGet('sync_' + key);
      if (!meta?.dirty) return { local: true, synced: isGitHubConfigured() };
      return syncRecord(key, path, await idbGet(key), meta);
    });
  }

  function validateCompanies(data) {
    if (!Array.isArray(data) || !data.length || data.some(c => !c || typeof c.id !== 'string' || typeof c.name !== 'string')) throw new Error('قائمة الشركات غير صالحة.');
  }
  function validateRules(data) {
    if (!data || !Array.isArray(data.rules) || data.rules.some(r => typeof r !== 'string')) throw new Error('قواعد المنصات غير صالحة.');
  }
  function validateWorkspace(ws) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const objects = value => Array.isArray(value) && value.every(object);
    const strings = value => Array.isArray(value) && value.every(v => typeof v === 'string');
    if (!object(ws) || !object(ws.brandCore) || !object(ws.goal)
      || !['identity', 'tone', 'segments'].every(k => typeof ws.brandCore[k] === 'string')
      || !strings(ws.brandCore.rules) || !strings(ws.brandCore.materials) || !objects(ws.brandCore.offers)
      || !objects(ws.ideas) || ws.ideas.some(i => typeof i.title !== 'string')
      || !objects(ws.calendar) || ws.calendar.some(p => typeof p.title !== 'string')
      || !object(ws.assets) || !objects(ws.assets.delivered) || !objects(ws.assets.designerDeliveries)
      || !object(ws.ads) || !objects(ws.ads.dailyLogs) || !objects(ws.ads.offlineSales) || !objects(ws.seasons)
      || ws.ads.dailyLogs.some(log => (log.rows !== undefined && !objects(log.rows))
        || (log.diagnosis && (!object(log.diagnosis) || (log.diagnosis.campaigns !== undefined && !objects(log.diagnosis.campaigns)))))) {
      throw new Error('بيانات مساحة العمل ناقصة أو غير صالحة. لم يتم تغيير بياناتك.');
    }
    return ws;
  }

  function loadCompaniesList() { return loadRecord('companies', 'data/companies.json', DEFAULT_COMPANIES, validateCompanies); }
  function saveCompaniesList(list) { validateCompanies(list); return saveRecord('companies', 'data/companies.json', list); }
  function loadWorkspace(id) {
    return loadRecord('ws_' + id, `data/workspaces/${id}.json`, id === 'nassar-stone' ? DEFAULT_NASSAR_WORKSPACE : createEmptyWorkspace(id), validateWorkspace);
  }
  function saveWorkspace(id, ws) { validateWorkspace(ws); return saveRecord('ws_' + id, `data/workspaces/${id}.json`, ws); }
  function loadPlatformRules() { return loadRecord('platform_rules', 'data/platform_rules.json', DEFAULT_PLATFORM_RULES, validateRules); }
  function savePlatformRules(rules) { validateRules(rules); return saveRecord('platform_rules', 'data/platform_rules.json', rules); }

  async function refreshSyncStatus(id) {
    const metas = await Promise.all(['companies', 'ws_' + id, 'platform_rules'].map(key => idbGet('sync_' + key)));
    if (metas.some(meta => meta?.dirty)) updateSyncBadge('local', 'تعديلات على الجهاز في انتظار المزامنة');
    else if (!isGitHubConfigured()) updateSyncBadge('local', 'محفوظ على الجهاز');
  }

  async function retryPendingSync(id) {
    const results = [];
    for (const [key, path] of [['companies', 'data/companies.json'], ['ws_' + id, `data/workspaces/${id}.json`], ['platform_rules', 'data/platform_rules.json']]) results.push(await retryRecord(key, path));
    const failed = results.find(r => r.error);
    if (failed) updateSyncBadge('error', 'محفوظ على الجهاز — المزامنة متوقفة');
    return failed || { local: true, synced: isGitHubConfigured() };
  }

  function createBackup(company, workspace) {
    validateWorkspace(workspace);
    return { format: 'nassar-studio-workspace', version: 1, exportedAt: new Date().toISOString(), company: { id: company.id, name: company.name }, workspace: clone(workspace) };
  }
  function parseBackup(text, companyId) {
    let backup;
    try { backup = JSON.parse(text); } catch { throw new Error('الملف مش JSON صالح. اختار نسخة احتياطية من التطبيق.'); }
    if (backup?.format !== 'nassar-studio-workspace' || backup.version !== 1 || backup.company?.id !== companyId) throw new Error('النسخة مش مدعومة أو تخص شركة تانية. افتح الشركة الصحيحة الأول.');
    validateWorkspace(backup.workspace);
    return clone(backup.workspace);
  }
  function saveRecovery(id, workspace) { return idbSet('recovery_' + id, clone(workspace)); }
  function loadRecovery(id) { return idbGet('recovery_' + id); }

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
    await Promise.allSettled([...localQueues.values(), ...queues.values()]);
    const cfg = getConfig();
    const remote = await ghReadFile(`data/workspaces/${companyId}.json`, cfg);
    if (!remote.exists) throw new Error('مفيش نسخة للشركة دي على GitHub. بياناتك المحلية لم تتغير.');
    validateWorkspace(remote.data);
    const previous = await idbGet('ws_' + companyId);
    const entries = [['ws_' + companyId, remote.data], ['sync_ws_' + companyId, { dirty: false, knownRemote: true, remoteSha: remote.sha, source: configSource(cfg) }]];
    if (previous) entries.push(['recovery_' + companyId, previous]);
    await idbWrite(entries);
    updateSyncBadge('synced', 'تم استرجاع نسخة GitHub');
    return { ws: remote.data };
  }

  return {
    describeError,
    createBackup,
    parseBackup,
    saveRecovery,
    loadRecovery,
    retryPendingSync,
    refreshSyncStatus,
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