// Dependency-free regression tests. Run: node tests/phase1.test.cjs
const fs = require('node:fs');
const path = require('node:path');
const sources = Object.fromEntries(['index.html','js/storage.js','js/content-studio.js','js/ads-intel.js'].map(p => [p, fs.readFileSync(path.join(__dirname, '..', p), 'utf8')]));

const assert = (condition, message = 'Assertion failed') => { if (!condition) throw new Error(message); };
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tick = () => Promise.resolve();
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const encode = text => {
  let result = '', bits = 0, value = 0;
  for (let i = 0; i < text.length; i++) {
    value = (value << 8) | text.charCodeAt(i); bits += 8;
    while (bits >= 6) { bits -= 6; result += alphabet[(value >> bits) & 63]; }
  }
  if (bits) result += alphabet[(value << (6 - bits)) & 63];
  while (result.length % 4) result += '=';
  return result;
};
const decode = text => {
  let result = '', bits = 0, value = 0;
  for (const char of text.replace(/=+$/, '')) {
    value = (value << 6) | alphabet.indexOf(char); bits += 6;
    if (bits >= 8) { bits -= 8; result += String.fromCharCode((value >> bits) & 255); }
  }
  return result;
};
const utf8Encode = text => new Uint8Array(Array.from(unescape(encodeURIComponent(text)), c => c.charCodeAt(0)));
const utf8Decode = bytes => decodeURIComponent(escape(Array.from(bytes, b => String.fromCharCode(b)).join('')));

function harness() {
  const records = new Map(), config = new Map(), elements = new Map(), remote = new Map(), requests = [], dialogs = [], downloads = [];
  let failWrite = false, networkDown = false, rejectWrites = false, remoteCounter = 0, confirmResult = true;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { id, value: '', innerHTML: '', textContent: '', disabled: false,
      classList: { add() {}, remove() {}, toggle() {} }, click() {}, removeAttribute(name){delete this[name];} });
    return elements.get(id);
  };
  const db = { objectStoreNames: { contains: () => true }, close() {}, transaction(store, mode) {
    const tx = {}, writes = []; let pending = 0;
    const schedule = run => {
      const req = {}; pending++;
      Promise.resolve().then(() => {
        run(req); req.onsuccess?.();
        if (--pending === 0) Promise.resolve().then(() => {
          if (mode === 'readwrite' && failWrite) { failWrite = false; tx.onabort?.(); }
          else { writes.forEach(([k,v]) => records.set(k, clone(v))); tx.oncomplete?.(); }
        });
      });
      return req;
    };
    tx.objectStore = () => ({
      get: key => schedule(req => req.result = clone(records.get(key))),
      put: (value,key) => schedule(() => writes.push([key,clone(value)]))
    });
    return tx;
  }};
  const response = (status, body) => ({ ok:status>=200&&status<300,status,json:async()=>body,text:async()=>JSON.stringify(body) });
  let intercept;
  const fetchMock = async (url, options = {}) => {
    requests.push({url,options});
    if (networkDown) throw new TypeError('network failed');
    if (intercept) await intercept(url, options);
    if (url.includes('/branches/')) return response(200,{});
    const key = url.split('/contents/')[1].split('?')[0];
    if (options.method === 'PUT') {
      if (rejectWrites) return response(403,{});
      const body = JSON.parse(options.body), previous = remote.get(key);
      if (previous && previous.sha !== body.sha) return response(409,{});
      const entry = { data:JSON.parse(utf8Decode(Array.from(decode(body.content), c=>c.charCodeAt(0)))), sha:'sha-'+ ++remoteCounter };
      remote.set(key,entry);
      return response(200,{content:{sha:entry.sha}});
    }
    if (!remote.has(key)) return response(404,{});
    const entry = remote.get(key);
    return response(200,{sha:entry.sha,content:encode(Array.from(utf8Encode(JSON.stringify(entry.data)),b=>String.fromCharCode(b)).join(''))});
  };
  const doc = { getElementById:element, querySelector:element, createElement:()=>({ click(){downloads.push(this.download);} }) };
  const scope = {
    indexedDB:{open(){const req={};Promise.resolve().then(()=>{req.result=db;req.onsuccess();});return req;}},
    localStorage:{getItem:k=>config.get(k)||null,setItem:(k,v)=>config.set(k,v)},
    document:doc,window:{addEventListener(){}}, navigator:{clipboard:{}},fetch:fetchMock,
    TextEncoder:class{encode(text){return utf8Encode(text);}},
    TextDecoder:class{decode(bytes){return utf8Decode(bytes);}},
    btoa:encode,atob:decode,AbortController:class{constructor(){this.signal={};}abort(){}},
    setTimeout:()=>1,clearTimeout(){}, Blob:class{constructor(parts){this.parts=parts;}},
    URL:{createObjectURL(value){downloads.push(value);return 'blob:test';},revokeObjectURL(){}},
    confirm:message=>{dialogs.push(message);return confirmResult;}
  };
  const evaluate = (code, result) => { const keys=Object.keys(scope).filter(key => key !== result); return new Function(...keys,code+'\nreturn '+result+';')(...keys.map(key=>scope[key])); };
  const storage=evaluate(sources['js/storage.js'],'StorageEngine');
  const api = { exclusionLabel:idea=>({rejected:'مرفوض',saturated:'متشبع'}[idea.status]||''),
    matchesIdea:(idea,post)=>idea.id===post.ideaId || idea.title===(post.ideaTitle||post.title) };
  let app,studio,ads;
  const boot = async () => {
    const appProxy={};
    Object.assign(scope,{StorageEngine:storage,App:appProxy,AIEngine:api,AssetLibrary:{isBusy:()=>false,render(){},renderPostReferences(){},prepareReferences:async()=>[]}});
    studio=evaluate(sources['js/content-studio.js'],'ContentStudio');
    ads=evaluate(sources['js/ads-intel.js'],'AdsIntel');
    Object.assign(scope,{ContentStudio:studio,AdsIntel:ads});
    const inline=[...sources['index.html'].matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('const App ='))[1];
    app=evaluate(inline,'App');Object.assign(appProxy,app);await app.init();return app;
  };
  return {storage,boot,api,records,remote,requests,dialogs,downloads,element,scope,evaluate,
    get app(){return app;},get studio(){return studio;},get ads(){return ads;},
    configure(){storage.saveConfig({ghOwner:'test',ghRepo:'test',ghBranch:'main',ghToken:'fake-secret',geminiKey:'fake-google-secret'});},
    failNextWrite(){failWrite=true;},network(value){networkDown=value;},rejectWrites(value){rejectWrites=value;},
    confirm(value){confirmResult=value;},intercept(fn){intercept=fn;}
  };
}

async function runTests() {
  const tests = [];
  const test = (name, run) => tests.push({name,run});
  test('All JavaScript and inline scripts parse', async()=>{
    for (const path of ['js/storage.js','js/content-studio.js','js/ads-intel.js']) new Function(sources[path]);
    for (const m of sources['index.html'].matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new Function(m[1]);
  });
  test('Arabic backup round trip; unsupported version, wrong company and secrets',async()=>{
    const h=harness();const ws=await h.storage.loadWorkspace('nassar-stone');h.configure();
    const backup=h.storage.createBackup({id:'nassar-stone',name:'نصار'},ws);
    assert(JSON.stringify(h.storage.parseBackup(JSON.stringify(backup),'nassar-stone'))===JSON.stringify(ws));
    assert(!JSON.stringify(backup).includes('fake-secret')&&!JSON.stringify(backup).includes('fake-google-secret'));
    for(const value of ['bad',JSON.stringify({...backup,version:2}),JSON.stringify({...backup,company:{id:'other'}}),JSON.stringify({...backup,workspace:{}})]) {
      let rejected=false;try{h.storage.parseBackup(value,'nassar-stone');}catch{rejected=true;}assert(rejected);
    }
  });
  test('Aborted local transaction rejects and preserves previous data',async()=>{
    const h=harness(),ws=await h.storage.loadWorkspace('test');ws.goal.objective='lost';h.failNextWrite();
    let rejected=false;try{await h.storage.saveWorkspace('test',ws);}catch{rejected=true;}assert(rejected);
    assert((await h.storage.loadWorkspace('test')).goal.objective!=='lost');
  });
  test('Offline edit survives reload and retry uploads it',async()=>{
    const h=harness();h.configure();const ws=await h.storage.loadWorkspace('test');h.network(true);ws.goal.objective='جديد';
    const result=await h.storage.saveWorkspace('test',ws);assert(result.local&&result.error);
    assert((await h.storage.loadWorkspace('test')).goal.objective==='جديد');h.network(false);
    assert((await h.storage.retryPendingSync('test')).synced);assert(h.remote.get('data/workspaces/test.json').data.goal.objective==='جديد');
  });
  test('Save captures a snapshot and concurrent saves stay ordered',async()=>{
    const h=harness();h.configure();const ws=await h.storage.loadWorkspace('test');ws.goal.objective='first';const a=h.storage.saveWorkspace('test',ws);
    ws.goal.objective='second';const b=h.storage.saveWorkspace('test',ws);ws.goal.objective='unsaved';await Promise.all([a,b]);
    assert(h.remote.get('data/workspaces/test.json').data.goal.objective==='second');
  });
  test('Adding cloud storage preserves existing local work',async()=>{
    const h=harness(),ws=await h.storage.loadWorkspace('test');ws.goal.objective='local';await h.storage.saveWorkspace('test',ws);h.configure();
    assert((await h.storage.loadWorkspace('test')).goal.objective==='local');await h.storage.retryPendingSync('test');
    assert(h.remote.get('data/workspaces/test.json').data.goal.objective==='local');
  });
  test('Cloud conflict preserves both versions; explicit pull checkpoints local copy',async()=>{
    const h=harness();h.configure();const ws=await h.storage.loadWorkspace('test'),cloud=h.remote.get('data/workspaces/test.json');
    cloud.sha='changed';cloud.data.goal.objective='cloud';ws.goal.objective='local';
    assert((await h.storage.saveWorkspace('test',ws)).error);assert(cloud.data.goal.objective==='cloud');
    assert((await h.storage.loadWorkspace('test')).goal.objective==='local');
    assert((await h.storage.forcePullFromGitHub('test')).ws.goal.objective==='cloud');
    assert((await h.storage.loadRecovery('test')).goal.objective==='local');
  });
  test('Pending company list and platform rules survive reload',async()=>{
    const h=harness();h.configure();await h.storage.loadCompaniesList();await h.storage.loadPlatformRules();h.rejectWrites(true);
    await h.storage.saveCompaniesList([{id:'x',name:'شركة'}]);await h.storage.savePlatformRules({rules:['محلية']});
    assert((await h.storage.loadCompaniesList())[0].id==='x');assert((await h.storage.loadPlatformRules()).rules[0]==='محلية');
  });
  test('Calendar append, replacement, cancellation and invalid result',async()=>{
    const h=harness(),app=await h.boot(),ws=app.getCurrentWorkspace();ws.calendar=[{title:'قديم'}];await app.persistWorkspace();
    h.api.generateCalendar8=async()=>Array.from({length:8},(_,i)=>({title:'جديد '+i}));
    h.element('calendar-generation-mode').value='append';await h.studio.handleGenerateCalendar();assert(ws.calendar.length===9&&ws.calendar[0].title==='قديم');
    h.element('calendar-generation-mode').value='replace';h.confirm(false);await h.studio.handleGenerateCalendar();assert(ws.calendar.length===9);
    h.confirm(true);await h.studio.handleGenerateCalendar();assert(ws.calendar.length===8&&(await h.storage.loadRecovery('nassar-stone')).calendar.length===9);
    h.api.generateCalendar8=async()=>[];await h.studio.handleGenerateCalendar();assert(ws.calendar.length===8&&!h.element('btn-gen-calendar').disabled);
    h.api.generateCalendar8=async()=>{throw new TypeError('offline');};await h.studio.handleGenerateCalendar();assert(ws.calendar.length===8&&!h.studio.isGenerating());
  });
  test('All destructive actions can be canceled and deletion is recoverable',async()=>{
    const h=harness(),app=await h.boot(),ws=app.getCurrentWorkspace();ws.ideas=[{title:'فكرة',status:'pending'}];ws.brandCore.offers=[{title:'عرض'}];
    h.confirm(false);await h.studio.deleteIdea(0);await h.studio.removeRule(0);await h.studio.removeOffer(0);await app.removeDeliveredAsset(0);await h.ads.removeSeason(0);
    assert(ws.ideas.length===1&&ws.brandCore.rules.length>0&&ws.brandCore.offers.length===1&&ws.assets.delivered.length===2&&ws.seasons.length===2);
    h.confirm(true);await h.studio.deleteIdea(0);assert(ws.ideas.length===0);await app.restoreRecovery();assert(app.getCurrentWorkspace().ideas.length===1);
  });
  test('Import validates before mutation, allows cancellation and survives reinitialization',async()=>{
    const h=harness(),app=await h.boot(),ws=app.getCurrentWorkspace();ws.goal.objective='old';await app.persistWorkspace();
    const event=text=>({target:{files:[{size:100,text:async()=>text}],value:'selected'}});
    await app.importBackup(event('broken'));assert(app.getCurrentWorkspace().goal.objective==='old');
    const restored=clone(ws);restored.goal.objective='restored';const text=JSON.stringify(h.storage.createBackup({id:'nassar-stone',name:'NS'},restored));
    h.confirm(false);await app.importBackup(event(text));assert(app.getCurrentWorkspace().goal.objective==='old');
    h.confirm(true);await app.importBackup(event(text));assert(app.getCurrentWorkspace().goal.objective==='restored');
    assert((await h.storage.loadRecovery('nassar-stone')).goal.objective==='old');await app.init();assert(app.getCurrentWorkspace().goal.objective==='restored');
    const malformed=clone(restored);malformed.ads.dailyLogs=[{rows:'broken'}];
    const bad=JSON.stringify({format:'nassar-studio-workspace',version:1,company:{id:'nassar-stone'},workspace:malformed});await app.importBackup(event(bad));
    assert(app.getCurrentWorkspace().goal.objective==='restored');
  });
  test('Readable network errors do not expose provider payload',async()=>{
    const h=harness();assert(h.storage.describeError(new TypeError('network')).includes('الإنترنت'));
    const msg=h.storage.describeError(new Error('Gemini API Error (429): SECRET'));assert(msg.includes('حصة')&&!msg.includes('SECRET'));
  });
  test('Local edits commit while an earlier upload is pending',async()=>{
    const h=harness();h.configure();const ws=await h.storage.loadWorkspace('test');let release,entered;const started=new Promise(resolve=>entered=resolve);
    h.intercept(async(url,options)=>{if(options.method==='PUT'&&!release)await new Promise(resolve=>{release=resolve;entered();});});
    ws.goal.objective='first';const first=h.storage.saveWorkspace('test',ws);await started;ws.goal.objective='second';const second=h.storage.saveWorkspace('test',ws);
    for(let i=0;i<100&&h.records.get('ws_test').goal.objective!=='second';i++)await tick();
    assert(h.records.get('ws_test').goal.objective==='second'&&h.records.get('sync_ws_test').dirty);
    release();await Promise.all([first,second]);assert(!h.records.get('sync_ws_test').dirty&&h.remote.get('data/workspaces/test.json').data.goal.objective==='second');
  });
  test('Active generation blocks switch/restore and ignores duplicate clicks',async()=>{
    const h=harness(),app=await h.boot();let finish,calls=0;h.element('calendar-generation-mode').value='append';
    h.api.generateCalendar8=()=>{calls++;return new Promise(resolve=>finish=resolve);};
    const pending=h.studio.handleGenerateCalendar();await h.studio.handleGenerateCalendar();await app.switchWorkspace('other');assert(app.getCurrentCompany().id==='nassar-stone');
    await app.restoreRecovery();assert(h.element('toast').textContent.includes('العملية الحالية'));
    finish(Array.from({length:8},(_,i)=>({title:String(i)})));await pending;assert(calls===1);
  });
  test('Switching workspaces keeps company data isolated',async()=>{
    const h=harness(),app=await h.boot();await h.storage.saveCompaniesList([{id:'nassar-stone',name:'NS'},{id:'other',name:'Other'}]);
    await h.storage.saveWorkspace('other',h.storage.createEmptyWorkspace('Other'));await app.init();app.getCurrentWorkspace().goal.objective='NS';
    await app.switchWorkspace('other');app.getCurrentWorkspace().goal.objective='Other';await app.persistWorkspace();await app.switchWorkspace('nassar-stone');
    assert(app.getCurrentWorkspace().goal.objective==='NS'&&(await h.storage.loadWorkspace('other')).goal.objective==='Other');
    assert(!h.element('workspace-selector').disabled);
  });
  const results=[];
  for(const {name,run} of tests){await run();results.push(name);}
  return results;
}

if (require.main === module) runTests().then(results => console.log(results.length + ' tests passed\n' + results.join('\n'))).catch(error => { console.error(error); process.exitCode = 1; });


module.exports = { harness, runTests, sources, assert };
