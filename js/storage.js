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
    try {
      if (json.encoding === 'none' || (json.size > 1024 * 1024 && !json.content)) {
        const raw = await request(url, { headers: { ...headers, Accept: 'application/vnd.github.raw+json' } });
        if (!raw.ok) throw githubError(raw.status);
        return { exists: true, data: await raw.json(), sha: json.sha };
      }
      return { exists: true, data: JSON.parse(fromBase64Unicode(json.content)), sha: json.sha };
    }
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
  function validateMaterialRecord(material) {
    const text = (value, limit) => typeof value === 'string' && value.length <= limit;
    const lines = (value, count, length) => Array.isArray(value) && value.length <= count && value.every(line => text(line, length) && line.trim());
    if (!material || typeof material !== 'object' || !/^mat-[a-z0-9-]{4,80}$/.test(material.id)
      || !text(material.name, 160) || !material.name.trim()
      || !['brand', 'model', 'origin'].every(key => text(material[key], 160))
      || !lines(material.uses, 12, 200) || !lines(material.approvedFacts, 15, 500)
      || !text(material.source, 500) || !text(material.notes, 2000)
      || !['draft', 'approved'].includes(material.status)
      || !Array.isArray(material.referenceImages) || material.referenceImages.length > 4) {
      throw new Error('بطاقة الخامة ناقصة أو غير صالحة. راجع الحقول وحدودها.');
    }
    const ids = material.referenceImages.map(ref => validateReferenceMetadata(ref).id);
    if (new Set(ids).size !== ids.length) throw new Error('صور الخامة فيها تكرار.');
    return material;
  }

  function validatePublication(entry) {
    const text = (value, max) => typeof value === 'string' && value.length <= max;
    if (!entry || typeof entry !== 'object' || !/^pub-[a-z0-9-]{4,80}$/.test(entry.id)
      || !text(entry.sourcePostId, 160) || !text(entry.ideaId, 160) || !entry.ideaId
      || !text(entry.title, 500) || !entry.title.trim() || !text(entry.ideaTitle, 500) || !entry.ideaTitle.trim()
      || !text(entry.copy, 50000) || !text(entry.material, 2000) || !text(entry.segment, 80)
      || !text(entry.channel, 80) || !entry.channel.trim() || !text(entry.url, 2000)
      || (entry.url && !/^https?:\/\/[^\s]+$/i.test(entry.url))
      || !text(entry.publishedAt, 10) || (entry.publishedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(entry.publishedAt) || !Number.isFinite(Date.parse(entry.publishedAt + 'T00:00:00Z')) || new Date(entry.publishedAt + 'T00:00:00Z').toISOString().slice(0, 10) !== entry.publishedAt))
      || (!entry.publishedAt && entry.legacy !== true)
      || typeof entry.voided !== 'boolean' || typeof entry.legacy !== 'boolean' || typeof entry.countsTowardSaturation !== 'boolean'
      || !text(entry.recordedAt, 40) || !text(entry.updatedAt, 40) || !text(entry.previousStatus, 40)
      || !Array.isArray(entry.publishedImages) || entry.publishedImages.length > 10
      || !Array.isArray(entry.referenceImages) || !Array.isArray(entry.materialSnapshots)) throw new Error('بيانات سجل النشر ناقصة أو غير صالحة.');
    for (const image of [...entry.publishedImages, ...entry.referenceImages]) validateReferenceMetadata(image);
    if (new Set(entry.publishedImages.map(image => image.id)).size !== entry.publishedImages.length) throw new Error('صور المنشور فيها تكرار.');
    for (const material of entry.materialSnapshots) validateMaterialRecord(material);
    return entry;
  }

  const REVIEW_CATEGORIES = ['structure', 'dialect', 'rules', 'material', 'claims', 'similarity', 'review'];
  function validatePostReview(review) {
    if (!review || review.version !== 1 || typeof review.stamp !== 'string' || review.stamp.length > 100
      || typeof review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(review.reviewedAt))
      || !['complete', 'unavailable'].includes(review.semanticStatus) || typeof review.summary !== 'string' || review.summary.length > 2000
      || !Array.isArray(review.issues) || review.issues.length > 80) throw new Error('بيانات مراجعة البوست غير صالحة.');
    for (const issue of review.issues) {
      if (!issue || !REVIEW_CATEGORIES.includes(issue.category) || !['error', 'warning', 'info'].includes(issue.severity)
        || !['local', 'model'].includes(issue.source) || typeof issue.message !== 'string' || !issue.message.trim() || issue.message.length > 1500
        || typeof issue.evidence !== 'string' || issue.evidence.length > 500 || typeof issue.suggestion !== 'string' || issue.suggestion.length > 1500) throw new Error('ملاحظة مراجعة البوست غير صالحة.');
    }
    return review;
  }
  function validatePostRevision(revision) {
    if (!revision || !/^rev-[a-z0-9-]{4,80}$/.test(revision.id) || typeof revision.createdAt !== 'string' || !Number.isFinite(Date.parse(revision.createdAt))
      || !['manual-copy', 'regenerate-hook', 'regenerate-copy', 'regenerate-visual', 'regenerate-brief', 'restore'].includes(revision.action)
      || typeof revision.originalStatus !== 'string' || revision.originalStatus.length > 40 || !revision.fields) throw new Error('نسخة البوست غير صالحة.');
    for (const [field, limit] of [['copy', 50000], ['visualDirection', 12000], ['designerBrief', 12000]]) if (typeof revision.fields[field] !== 'string' || revision.fields[field].length > limit) throw new Error('نص نسخة البوست غير صالح أو طويل زيادة.');
    return revision;
  }

  const PERFORMANCE_METRICS = ['spend', 'impressions', 'clicks', 'inquiries', 'qualified', 'measurements', 'contracts', 'revenue'];
  function validMetric(value, money) { return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000000 && (money ? Math.abs(value * 100 - Math.round(value * 100)) < 0.00001 : Number.isInteger(value))); }
  function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value; }
  function performanceText(value, max, required = false) { return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0); }
  function validatePerformanceDimensions(dimension) {
    if (!dimension || !['contentKey', 'postTitle', 'angleKey', 'angleName', 'campaignKey', 'campaignName', 'platform', 'adId', 'audienceKey', 'audienceName', 'materialKey', 'materialName'].every(key => performanceText(dimension[key], key === 'angleKey' ? 700 : key === 'postTitle' || key === 'angleName' || key === 'contentKey' ? 500 : 400, !['adId'].includes(key)))) throw new Error('أبعاد تقرير المحتوى ناقصة أو غير صالحة.');
    return dimension;
  }
  function validateContentLink(link) {
    if (!link || !/^link-[a-z0-9-]{4,80}$/.test(link.id) || typeof link.active !== 'boolean' || !performanceText(link.createdAt, 40) || !performanceText(link.updatedAt, 40)
      || !performanceText(link.campaignName, 200, true) || !performanceText(link.campaignId, 100) || !performanceText(link.campaignKey, 400, true)
      || !['Meta', 'Google', 'Other'].includes(link.platform) || !performanceText(link.adId, 100) || !performanceText(link.audience, 200) || !performanceText(link.notes, 2000)
      || !link.target || !performanceText(link.target.contentKey, 500, true) || !performanceText(link.target.postId, 160) || !performanceText(link.target.publicationId, 160)
      || !performanceText(link.target.title, 500, true) || !performanceText(link.target.angle, 500, true) || !performanceText(link.target.ideaId, 160) || !performanceText(link.target.segment, 80)
      || !['published', 'draft'].includes(link.target.state) || !Array.isArray(link.target.materials)
      || link.target.materials.some(material => !material || !performanceText(material.id, 100, true) || !performanceText(material.name, 200, true))) throw new Error('بيانات ربط الحملة بالمحتوى غير صالحة.');
    return link;
  }
  function validatePerformanceRecord(record) {
    if (!record || !/^result-[a-z0-9-]{4,80}$/.test(record.id) || !/^link-[a-z0-9-]{4,80}$/.test(record.linkId)
      || !validDate(record.from) || !validDate(record.to) || record.from > record.to || !['direct', 'allocated'].includes(record.method)
      || !performanceText(record.allocationKey, 200) || (record.method === 'allocated' && !record.allocationKey.trim())
      || typeof record.cohortAligned !== 'boolean' || typeof record.voided !== 'boolean' || !performanceText(record.notes, 2000)
      || !performanceText(record.createdAt, 40) || !performanceText(record.updatedAt, 40) || !record.metrics
      || PERFORMANCE_METRICS.some(key => !validMetric(record.metrics[key], ['spend', 'revenue'].includes(key)))
      || PERFORMANCE_METRICS.every(key => record.metrics[key] === null)) throw new Error('أرقام نتائج المحتوى ناقصة أو غير صالحة. الفراغ يفضل غير مسجّل، والصفر نتيجة فعلية.');
    validatePerformanceDimensions(record.dimensions);
    if (record.cohortAligned) {
      const stages = ['inquiries', 'qualified', 'measurements', 'contracts'];
      for (let i = 0; i < stages.length; i++) for (let j = i + 1; j < stages.length; j++) if (record.metrics[stages[i]] !== null && record.metrics[stages[j]] !== null && record.metrics[stages[j]] > record.metrics[stages[i]]) throw new Error('أرقام نفس الدفعة لازم تمشي من الاستفسارات للمؤهلة للمعاينات للتعاقدات من غير زيادة في مرحلة تالية.');
    }
    return record;
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
    if (ws.assets.references !== undefined) {
      if (!Array.isArray(ws.assets.references)) throw new Error('مكتبة الصور غير صالحة.');
      const ids = ws.assets.references.map(ref => validateReferenceMetadata(ref).id);
      if (new Set(ids).size !== ids.length) throw new Error('في معرّفات صور مكررة.');
    }
    if (ws.assets.selectedReferenceIds !== undefined && (!Array.isArray(ws.assets.selectedReferenceIds)
      || ws.assets.selectedReferenceIds.length > 4 || new Set(ws.assets.selectedReferenceIds).size !== ws.assets.selectedReferenceIds.length
      || ws.assets.selectedReferenceIds.some(id => !(ws.assets.references || []).some(ref => ref.id === id)))) throw new Error('اختيار الصور غير صالح.');
    for (const item of [...ws.calendar, ...ws.ideas]) if (item.referenceImages !== undefined && !Array.isArray(item.referenceImages)) throw new Error('مراجع البوست أو الفكرة غير صالحة.');
    if (ws.brandCore.materialCatalog !== undefined) {
      if (!Array.isArray(ws.brandCore.materialCatalog)) throw new Error('كتالوج الخامات غير صالح.');
      const ids = ws.brandCore.materialCatalog.map(material => validateMaterialRecord(material).id);
      if (new Set(ids).size !== ids.length) throw new Error('في معرّفات خامات مكررة.');
    }
    if (ws.brandCore.materialScope !== undefined && !['all', 'selected', 'general'].includes(ws.brandCore.materialScope)) throw new Error('نطاق خامات التوليد غير صالح.');
    if (ws.brandCore.selectedMaterialIds !== undefined && (!Array.isArray(ws.brandCore.selectedMaterialIds)
      || ws.brandCore.selectedMaterialIds.length > 8 || new Set(ws.brandCore.selectedMaterialIds).size !== ws.brandCore.selectedMaterialIds.length
      || ws.brandCore.selectedMaterialIds.some(id => !(ws.brandCore.materialCatalog || []).some(material => material.id === id && material.status === 'approved')))) throw new Error('اختيار خامات التوليد غير صالح.');
    for (const item of [...ws.calendar, ...ws.ideas]) if (item.materialSnapshots !== undefined) {
      if (!Array.isArray(item.materialSnapshots)) throw new Error('مرجع خامة البوست غير صالح.');
      for (const snapshot of item.materialSnapshots) validateMaterialRecord(snapshot);
    }
    if (ws.contentMemoryVersion !== undefined && ws.contentMemoryVersion !== 1) throw new Error('إصدار ذاكرة المحتوى غير مدعوم.');
    if (ws.publicationHistory !== undefined) {
      if (!Array.isArray(ws.publicationHistory)) throw new Error('سجل المنشور غير صالح.');
      const ids = ws.publicationHistory.map(entry => validatePublication(entry).id);
      if (new Set(ids).size !== ids.length) throw new Error('في تسجيل نشر مكرر.');
      const activePosts = ws.publicationHistory.filter(entry => !entry.voided && entry.sourcePostId).map(entry => entry.sourcePostId);
      if (new Set(activePosts).size !== activePosts.length) throw new Error('البوست مسجّل منشور أكتر من مرة.');
    }
    for (const idea of ws.ideas) {
      if (idea.saturationBase !== undefined && !Number.isSafeInteger(idea.saturationBase)) throw new Error('أساس التشبع غير صالح.');
      if (idea.saturation !== undefined && (!Number.isInteger(idea.saturation) || idea.saturation < 0 || idea.saturation > 100)) throw new Error('نسبة التشبع غير صالحة.');
      if (idea.exclusionReason !== undefined && (typeof idea.exclusionReason !== 'string' || idea.exclusionReason.length > 2000)) throw new Error('سبب الاستبعاد غير صالح.');
      if (idea.saturationAdjustments !== undefined && (!Array.isArray(idea.saturationAdjustments) || idea.saturationAdjustments.some(item => !item || !Number.isInteger(item.value) || item.value < 0 || item.value > 100 || !Number.isInteger(item.before) || item.before < 0 || item.before > 100 || typeof item.reason !== 'string' || item.reason.length > 500 || typeof item.at !== 'string'))) throw new Error('سجل تعديل التشبع غير صالح.');
      if (idea.exclusionHistory !== undefined && (!Array.isArray(idea.exclusionHistory) || idea.exclusionHistory.some(item => !item || !['rejected', 'saturated'].includes(item.status) || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 2000 || typeof item.at !== 'string'))) throw new Error('سجل أسباب الاستبعاد غير صالح.');
    }
    for (const post of ws.calendar) {
      if (post.reviewResult !== undefined) validatePostReview(post.reviewResult);
      if (post.revisions !== undefined) {
        if (!Array.isArray(post.revisions)) throw new Error('سجل نسخ البوست غير صالح.');
        const ids = post.revisions.map(revision => validatePostRevision(revision).id);
        if (new Set(ids).size !== ids.length) throw new Error('في معرّفات نسخ بوست مكررة.');
      }
    }
    if (ws.ads.contentLinks !== undefined) {
      if (!Array.isArray(ws.ads.contentLinks)) throw new Error('روابط المحتوى بالحملات غير صالحة.');
      const ids = ws.ads.contentLinks.map(link => validateContentLink(link).id);
      if (new Set(ids).size !== ids.length) throw new Error('في معرّفات ربط مكررة.');
    }
    if (ws.ads.performanceRecords !== undefined) {
      if (!Array.isArray(ws.ads.performanceRecords)) throw new Error('سجل نتائج المحتوى غير صالح.');
      const ids = ws.ads.performanceRecords.map(record => validatePerformanceRecord(record).id);
      if (new Set(ids).size !== ids.length || ws.ads.performanceRecords.some(record => !(ws.ads.contentLinks || []).some(link => link.id === record.linkId))) throw new Error('تسجيل نتيجة مكرر أو مربوط بحملة غير موجودة.');
    }
    referenceDescriptors(ws);
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

  const MAX_REFERENCE_BYTES = 600 * 1024;
  function validateReferenceId(id) {
    if (typeof id !== 'string' || !/^ref-[a-z0-9-]{8,64}$/.test(id)) throw new Error('معرّف الصورة غير صالح.');
  }
  function validateReferenceMetadata(ref) {
    if (!ref || typeof ref !== 'object') throw new Error('بيانات مرجع الصورة غير صالحة.');
    validateReferenceId(ref.id);
    for (const [field, limit] of [['title', 160], ['description', 2000], ['material', 200]]) {
      if (typeof ref[field] !== 'string' || ref[field].length > limit) throw new Error('بيانات مرجع الصورة ناقصة أو طويلة زيادة.');
    }
    if (!['project', 'material', 'design', 'logo'].includes(ref.kind)) throw new Error('نوع مرجع الصورة غير صالح.');
    return ref;
  }
  function referenceDescriptors(workspace) {
    const history = workspace.publicationHistory || [];
    const all = [...(workspace.assets?.references || []),
      ...history.flatMap(entry => [...(entry.publishedImages || []), ...(entry.referenceImages || [])]),
      ...history.flatMap(entry => (entry.materialSnapshots || []).flatMap(material => material.referenceImages || [])),
      ...(workspace.brandCore?.materialCatalog || []).flatMap(material => material.referenceImages || []),
      ...[...(workspace.calendar || []), ...(workspace.ideas || [])].flatMap(item => (item.materialSnapshots || []).flatMap(material => material.referenceImages || [])),
      ...(workspace.calendar || []).flatMap(post => post.referenceImages || []),
      ...(workspace.ideas || []).flatMap(idea => idea.referenceImages || [])];
    const unique = new Map();
    for (const ref of all) { validateReferenceMetadata(ref); unique.set(ref.id, ref); }
    return [...unique.values()];
  }
  function validateImageData(image) {
    validateReferenceId(image?.id);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType)
      || typeof image.data !== 'string' || !image.data.length || image.data.length > Math.ceil(MAX_REFERENCE_BYTES / 3) * 4
      || image.data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)
      || !Number.isInteger(image.width) || !Number.isInteger(image.height)
      || image.width < 1 || image.height < 1 || image.width > 1600 || image.height > 1600) {
      throw new Error('ملف الصورة غير صالح أو أكبر من الحجم المسموح.');
    }
    let bytes;
    try { bytes = atob(image.data); } catch { throw new Error('بيانات الصورة غير صالحة.'); }
    const signature = image.mimeType === 'image/jpeg' ? bytes.startsWith('\xff\xd8\xff')
      : image.mimeType === 'image/png' ? bytes.startsWith('\x89PNG\r\n\x1a\n')
      : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    if (!signature || bytes.length > MAX_REFERENCE_BYTES) throw new Error('محتوى الصورة لا يطابق نوع الملف.');
    return image;
  }
  const imageKey = (companyId, id) => 'image_' + companyId + '_' + id;
  const imagePath = (companyId, id) => `data/reference-images/${encodeURIComponent(companyId)}/${id}.json`;

  async function saveReferenceImage(companyId, image) {
    validateImageData(image);
    const key = imageKey(companyId, image.id);
    const existing = await idbGet(key);
    if (existing && (existing.data !== image.data || existing.mimeType !== image.mimeType)) throw new Error('في صورة مختلفة بنفس المعرّف. ارفع الصورة كمرجع جديد.');
    return saveRecord(key, imagePath(companyId, image.id), image);
  }
  async function loadReferenceImage(companyId, id) {
    validateReferenceId(id);
    const key = imageKey(companyId, id);
    const cached = await idbGet(key);
    if (cached) return validateImageData(cached);
    if (!isGitHubConfigured()) throw new Error('الصورة مش موجودة على الجهاز. استورد النسخة الكاملة أو اربط GitHub اللي عليه الصور.');
    const cfg = getConfig();
    const remote = await ghReadFile(imagePath(companyId, id), cfg);
    if (!remote.exists) throw new Error('الصورة مش مرفوعة على GitHub. افتح جهاز الرفع واضغط إعادة محاولة المزامنة.');
    validateImageData(remote.data);
    if (remote.data.id !== id) throw new Error('الصورة المسترجعة لا تطابق المرجع.');
    await idbWrite([[key, remote.data], ['sync_' + key, { dirty: false, knownRemote: true, remoteSha: remote.sha, source: configSource(cfg) }]]);
    return remote.data;
  }
  async function referenceImageState(companyId, id) {
    validateReferenceId(id);
    const meta = await idbGet('sync_' + imageKey(companyId, id));
    return isGitHubConfigured() && meta && !meta.dirty && meta.source === configSource(getConfig()) ? 'synced' : 'local';
  }
  async function syncWorkspaceImages(companyId, workspace) {
    const results = [];
    for (const ref of referenceDescriptors(workspace)) {
      const key = imageKey(companyId, ref.id);
      const cached = await idbGet(key);
      if (!cached) continue; // Remote-only images remain lazy-loaded.
      const meta = await idbGet('sync_' + key);
      if (meta?.dirty || (isGitHubConfigured() && meta?.source !== configSource(getConfig()))) {
        results.push(await saveReferenceImage(companyId, cached));
      }
    }
    return results.find(r => r.error) || { local: true, synced: isGitHubConfigured() };
  }

  async function createPortableBackup(company, workspace) {
    const backup = createBackup(company, workspace);
    backup.version = 2;
    backup.imageFiles = [];
    let total = 0;
    for (const ref of referenceDescriptors(workspace)) {
      const image = await loadReferenceImage(company.id, ref.id);
      total += image.data.length;
      if (total > 40 * 1024 * 1024) throw new Error('صور النسخة أكبر من 40 ميجابايت. قلّل الصور غير المستخدمة قبل التصدير.');
      backup.imageFiles.push(clone(image));
    }
    return backup;
  }
  function validateBackupImages(backup) {
    const refs = referenceDescriptors(backup.workspace);
    if (backup.version === 1) {
      if (refs.length) throw new Error('النسخة تحتوي مراجع صور من غير ملفاتها. استخدم النسخة الاحتياطية الكاملة.');
      return [];
    }
    if (!Array.isArray(backup.imageFiles) || backup.imageFiles.length !== refs.length) throw new Error('النسخة الاحتياطية ناقصة صور. بياناتك لم تتغير.');
    const ids = new Set();
    for (const image of backup.imageFiles) {
      validateImageData(image);
      if (ids.has(image.id) || !refs.some(ref => ref.id === image.id)) throw new Error('صور النسخة الاحتياطية لا تطابق المرجعيات.');
      ids.add(image.id);
    }
    return backup.imageFiles;
  }
  async function importBackupImages(text, companyId) {
    parseBackup(text, companyId);
    const backup = JSON.parse(text);
    const images = validateBackupImages(backup);
    const entries = [];
    for (const image of images) {
      const key = imageKey(companyId, image.id);
      const old = await idbGet(key);
      if (old && (old.data !== image.data || old.mimeType !== image.mimeType)) throw new Error('في صورة مختلفة بنفس معرّف النسخة. البيانات الحالية لم تتغير.');
      if (!old) entries.push([key, image], ['sync_' + key, { dirty: true, revision: 1 }]);
    }
    if (entries.length) await idbWrite(entries);
  }

  async function refreshSyncStatus(id) {
    const metas = await Promise.all(['companies', 'ws_' + id, 'platform_rules'].map(key => idbGet('sync_' + key)));
    const ws = await idbGet('ws_' + id);
    if (ws) for (const ref of referenceDescriptors(ws)) metas.push(await idbGet('sync_' + imageKey(id, ref.id)));
    if (metas.some(meta => meta?.dirty)) updateSyncBadge('local', 'تعديلات على الجهاز في انتظار المزامنة');
    else if (!isGitHubConfigured()) updateSyncBadge('local', 'محفوظ على الجهاز');
  }

  async function retryPendingSync(id) {
    const ws = await idbGet('ws_' + id);
    const results = ws ? [await syncWorkspaceImages(id, ws)] : [];
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
    if (backup?.format !== 'nassar-studio-workspace' || ![1, 2].includes(backup.version) || backup.company?.id !== companyId) throw new Error('النسخة مش مدعومة أو تخص شركة تانية. افتح الشركة الصحيحة الأول.');
    validateWorkspace(backup.workspace);
    validateBackupImages(backup);
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
    MAX_REFERENCE_BYTES,
    PERFORMANCE_METRICS,
    validDate,
    validateContentLink,
    validatePerformanceRecord,
    validatePostReview,
    validatePostRevision,
    validatePublication,
    validateMaterialRecord,
    validateWorkspace,
    validateReferenceMetadata,
    validateImageData,
    referenceDescriptors,
    saveReferenceImage,
    loadReferenceImage,
    referenceImageState,
    syncWorkspaceImages,
    createPortableBackup,
    importBackupImages,
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



