// Run: node tests/phase2.test.cjs (Node 18+, no dependencies).
const fs = require('node:fs');
const path = require('node:path');
const { harness, assert, seedAngles, plannedReply } = require('./phase1.test.cjs');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZfoAAAAASUVORK5CYII=';
const id = n => 'ref-00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const image = n => ({id:id(n),mimeType:'image/png',data:PNG,width:1,height:1});
const ref = n => ({id:id(n),title:'مطبخ '+n,kind:'project',material:'KalingaStone / Calacatta Gold',description:'شغل منفّذ، ضوء طبيعي'});
const clone = value => JSON.parse(JSON.stringify(value));
const event = files => ({target:{files,value:'selected'}});
async function setup() {
  const h=harness(); await h.boot();
  let counter=0;
  h.scope.crypto={randomUUID:()=>id(++counter).slice(4)};
  h.scope.createImageBitmap=async()=>({width:3200,height:2400,close(){}});
  const originalCreate=h.scope.document.createElement;
  h.canvases=[];
  h.scope.document.createElement=tag=>{
    if(tag!=='canvas')return originalCreate(tag);
    const canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/png;base64,'+PNG};
    h.canvases.push(canvas);return canvas;
  };
  const library=h.evaluate(source('js/asset-library.js'),'AssetLibrary');
  Object.assign(h.scope.AssetLibrary,library);h.library=h.scope.AssetLibrary;
  return h;
}
async function add(h,n) {
  const ws=h.app.getCurrentWorkspace();
  await h.storage.saveReferenceImage(h.app.getWorkspaceCompanyId(ws),image(n));
  if(!ws.assets.references)ws.assets.references=[];
  ws.assets.references.push(ref(n));return ws;
}
function enableAI(h) {
  seedAngles(h);
  h.googleCalls=[];
  h.scope.fetch=async(url,options)=>{
    const payload=JSON.parse(options.body);h.googleCalls.push(payload);
    const text=payload.contents[0].parts.filter(p=>p.text).map(p=>p.text).join('\n');
    let result;
    if(text.includes('راجع الزوايا'))result={allowed:true};
    else if(text.includes('اكتب وصفًا بصريًا'))result={description:'سطح فاتح في مطبخ حرف L جنب شباك.'};
    else if(text.includes('توليد كاليندر فيسبوك'))result={posts:Array.from({length:8},(_,i)=>({title:'بوست '+i}))};
    else if(text.includes('توليد بوست فيسبوك واحد'))result={post:{title:'بوست بالصور'}};
    else result={ideas:[{title:'زاوية بالصورة',insight:'تفاصيل ظاهرة',segment:'B2C'}]};
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(plannedReply(payload,result))}]}}]})};
  };
  const ai=h.evaluate(source('js/ai-engine.js'),'AIEngine');Object.assign(h.api,ai);
  return ai;
}
const tests=[];
const test=(name,run)=>tests.push({name,run});

test('Image storage round trip, company isolation and file validation',async()=>{
  const h=await setup();await h.storage.saveReferenceImage('nassar-stone',image(1));
  assert((await h.storage.loadReferenceImage('nassar-stone',id(1))).data===PNG);
  let rejected=false;try{await h.storage.loadReferenceImage('other',id(1));}catch{rejected=true;}assert(rejected);
  for(const bad of [{...image(1),mimeType:'image/svg+xml'},{...image(1),data:'a'.repeat(900000)}, {...image(1),data:'YWJjZA=='},{...image(1),width:1700}, {...image(1),id:'../../secret'}]){
    let failed=false;try{await h.storage.saveReferenceImage('nassar-stone',bad);}catch{failed=true;}assert(failed);
  }
  assert(h.storage.referenceDescriptors(h.app.getCurrentWorkspace()).length===0);
});

test('Image identity is immutable',async()=>{
  const h=await setup();await h.storage.saveReferenceImage('nassar-stone',image(1));
  const different={...image(1),data:Buffer.from('\x89PNG\r\n\x1a\ndifferent','binary').toString('base64')};
  let failed=false;try{await h.storage.saveReferenceImage('nassar-stone',different);}catch{failed=true;}assert(failed);
  assert((await h.storage.loadReferenceImage('nassar-stone',id(1))).data===PNG);
});

test('Multi-upload resizes images, keeps partial successes and reports bad files',async()=>{
  const h=await setup();h.element('reference-upload-kind').value='project';
  h.element('reference-upload-material').value='Calacatta Gold';
  await h.library.upload(event([{name:'مطبخ.png',type:'image/png',size:1000},{name:'bad.svg',type:'image/svg+xml',size:1000}]));
  const ws=h.app.getCurrentWorkspace();assert(ws.assets.references.length===1);
  const saved=await h.storage.loadReferenceImage('nassar-stone',ws.assets.references[0].id);
  assert(saved.width===1600&&saved.height===1200&&h.canvases[0].width===1600);
  assert(ws.assets.references[0].title==='مطبخ');assert(h.element('reference-upload-status').textContent.includes('bad.svg'));
  assert(!h.library.isBusy());
});

test('Invalid uploads never create library entries',async()=>{
  const h=await setup();h.element('reference-upload-kind').value='material';
  await h.library.upload(event([{name:'huge.jpg',type:'image/jpeg',size:11*1024*1024}]));
  assert(!(h.app.getCurrentWorkspace().assets.references||[]).length);
  await h.library.upload(event(Array.from({length:11},()=>({name:'a.jpg',type:'image/jpeg',size:100}))));
  assert(!(h.app.getCurrentWorkspace().assets.references||[]).length);
  h.scope.createImageBitmap=async()=>{throw Object.assign(new Error('bad image'),{name:'InvalidStateError'});};
  // New library instance captures the failing decoder.
  Object.assign(h.library,h.evaluate(source('js/asset-library.js'),'AssetLibrary'));
  await h.library.upload(event([{name:'broken.png',type:'image/png',size:100}]));
  assert(!(h.app.getCurrentWorkspace().assets.references||[]).length);
});

test('Selection caps at four and sends only selected images',async()=>{
  const h=await setup();for(let n=1;n<=5;n++)await add(h,n);
  for(let n=1;n<=5;n++)await h.library.toggleSelection(id(n),true,{checked:true});
  const ws=h.app.getCurrentWorkspace();assert(ws.assets.selectedReferenceIds.length===4&&!ws.assets.selectedReferenceIds.includes(id(5)));
  const prepared=await h.library.prepareReferences(ws);assert(prepared.length===4&&prepared[0].image.data===PNG);
  prepared[0].title='changed';assert(ws.assets.references[0].title!=='changed');
  await h.library.clearSelection();assert((await h.library.prepareReferences(ws)).length===0);
});

test('Unavailable selected image stops generation before Gemini request',async()=>{
  const h=await setup(),ws=h.app.getCurrentWorkspace();ws.assets.references=[ref(1)];ws.assets.selectedReferenceIds=[id(1)];
  enableAI(h);h.configure(); // Missing remote and local image.
  await h.studio.handleGenerateSinglePost();assert(h.googleCalls.length===0&&ws.calendar.length===0);
  assert(!h.studio.isGenerating());
});

test('Gemini requests contain image bytes and metadata; generated records contain snapshots only',async()=>{
  const h=await setup(),ws=await add(h,1);await h.library.toggleSelection(id(1),true);enableAI(h);h.configure();
  const references=await h.library.prepareReferences(ws);
  for(const result of [await h.api.generateSinglePost(ws,'اختبار',references),...(await h.api.generateCalendar8(ws,references)),...(await h.api.generateIdeas(ws,4,references))]) {
    assert(result.referenceImages.length===1&&result.referenceImages[0].id===id(1));
    assert(!JSON.stringify(result).includes(PNG));
  }
  assert(h.googleCalls.length===3);
  for(const payload of h.googleCalls){const parts=payload.contents[0].parts;
    assert(parts.filter(p=>p.inlineData).length===1&&parts.find(p=>p.inlineData).inlineData.data===PNG);
    assert(parts.some(p=>p.text?.includes('Calacatta Gold')));
    assert(payload.systemInstruction.parts[0].text.includes('ممنوع تأكيد براند'));
  }
});

test('Calendar, single post and ideas handlers preserve reference provenance',async()=>{
  const h=await setup(),ws=await add(h,1);ws.assets.selectedReferenceIds=[id(1)];enableAI(h);h.configure();
  h.element('calendar-generation-mode').value='append';
  await h.studio.handleGenerateCalendar();await h.studio.handleGenerateSinglePost();await h.studio.handleGenerateIdeas();
  assert(ws.calendar.length===9&&ws.calendar.every(post=>post.referenceImages[0].id===id(1)));
  assert(ws.ideas.some(idea=>idea.title==='زاوية بالصورة'&&idea.referenceImages[0].id===id(1)));
  assert(h.googleCalls.length===3);
});

test('Visual description uses actual pixels and remains a draft until saved',async()=>{
  const h=await setup(),ws=await add(h,1);enableAI(h);h.configure();
  const original=ws.assets.references[0].description;
  await h.library.openEditor(id(1));await h.library.describeImage();
  assert(h.googleCalls[0].contents[0].parts.some(p=>p.inlineData?.data===PNG));
  assert(h.element('reference-edit-description').value.includes('حرف L'));
  assert(ws.assets.references[0].description===original);
  await h.library.saveEditor();assert(ws.assets.references[0].description.includes('حرف L'));
});

test('Remove and undo retain image pixels and historical post references',async()=>{
  const h=await setup(),ws=await add(h,1);ws.assets.selectedReferenceIds=[id(1)];ws.calendar=[{title:'بوست',referenceImages:[ref(1)]}];await h.app.persistWorkspace();
  h.confirm(false);await h.library.removeReference(id(1));assert(ws.assets.references.length===1);
  h.confirm(true);await h.library.removeReference(id(1));assert(ws.assets.references.length===0&&ws.assets.selectedReferenceIds.length===0);
  assert((await h.storage.loadReferenceImage('nassar-stone',id(1))).data===PNG);
  const backup=await h.storage.createPortableBackup(h.app.getCurrentCompany(),ws);assert(backup.imageFiles.length===1);
  await h.app.restoreRecovery();assert(h.app.getCurrentWorkspace().assets.references.length===1);
});

test('Portable backup restores full image bytes on a different device',async()=>{
  const h=await setup(),ws=await add(h,1);ws.assets.selectedReferenceIds=[id(1)];
  const backup=await h.storage.createPortableBackup(h.app.getCurrentCompany(),ws);assert(backup.version===2&&backup.imageFiles[0].data===PNG);
  assert(!JSON.stringify(backup).includes('fake-secret'));
  const next=await setup(),text=JSON.stringify(backup);await next.app.importBackup({target:{files:[{size:text.length,text:async()=>text}],value:'selected'}});
  assert(next.app.getCurrentWorkspace().assets.references.length===1);
  assert((await next.storage.loadReferenceImage('nassar-stone',id(1))).data===PNG);
});

test('Incomplete or tampered image backup cannot replace current workspace',async()=>{
  const h=await setup(),ws=await add(h,1);const backup=await h.storage.createPortableBackup(h.app.getCurrentCompany(),ws);
  for(const bad of [{...backup,imageFiles:[]},{...backup,imageFiles:[{...image(1),data:'YWJjZA=='}]},{...backup,version:1}]){
    let failed=false;try{h.storage.parseBackup(JSON.stringify(bad),'nassar-stone');}catch{failed=true;}assert(failed);
  }
  const next=await setup(),original=next.app.getCurrentWorkspace(),text=JSON.stringify({...backup,imageFiles:[]});
  await next.app.importBackup({target:{files:[{size:text.length,text:async()=>text}],value:'selected'}});assert(next.app.getCurrentWorkspace()===original);
});

test('Pending images sync on retry and download on another device',async()=>{
  const h=await setup();h.configure();h.rejectWrites(true);const ws=await add(h,1);await h.app.persistWorkspace().catch(()=>{});
  assert(await h.storage.referenceImageState('nassar-stone',id(1))==='local');
  h.rejectWrites(false);assert((await h.storage.retryPendingSync('nassar-stone')).synced);
  assert(await h.storage.referenceImageState('nassar-stone',id(1))==='synced');
  const next=await setup();next.configure();for(const [key,value]of h.remote)next.remote.set(key,clone(value));
  const remoteImage=await next.storage.loadReferenceImage('nassar-stone',id(1));assert(remoteImage.data===PNG);
  assert(await next.storage.referenceImageState('nassar-stone',id(1))==='synced');
});

test('Library render escapes untrusted metadata and filtering keeps selection',async()=>{
  const h=await setup(),ws=await add(h,1);ws.assets.references[0].title='<img src=x onerror=alert(1)>';
  h.library.render(ws);assert(h.element('reference-library-grid').innerHTML.includes('&lt;img'));
  assert(!h.element('reference-library-grid').innerHTML.includes('aria-label="معاينة وتعديل <img'));
  h.element('reference-search').value='missing';h.library.render(ws);assert(h.element('reference-library-grid').innerHTML.includes('مفيش صور مطابقة'));
  ws.assets.selectedReferenceIds=[id(1)];h.library.render(ws);assert(ws.assets.selectedReferenceIds.length===1);
});

test('Duplicate upload cannot release another operation lock',async()=>{
  const h=await setup();let finish,started;
  const entered=new Promise(resolve=>started=resolve);
  h.scope.createImageBitmap=()=>new Promise(resolve=>{finish=()=>resolve({width:10,height:10,close(){}});started();});
  Object.assign(h.library,h.evaluate(source('js/asset-library.js'),'AssetLibrary'));
  h.element('reference-upload-kind').value='project';
  const files=[{name:'first.png',type:'image/png',size:100}];
  const first=h.library.upload(event(files));await entered;
  await h.library.upload(event(files));assert(h.library.isBusy());
  await h.app.switchWorkspace('other');assert(h.app.getCurrentCompany().id==='nassar-stone');
  finish();await first;assert(!h.library.isBusy()&&h.app.getCurrentWorkspace().assets.references.length===1);
});

test('Text-only generation still works and thought/split JSON parts are parsed',async()=>{
  const h=await setup();h.configure();let sent;
  h.scope.fetch=async(url,options)=>{
    sent=JSON.parse(options.body);
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{thought:true,text:'internal analysis'},{text:'{"ideas":'},{text:'[{"title":"زاوية جديدة"}]}'}]}}]})};
  };
  const ai=h.evaluate(source('js/ai-engine.js'),'AIEngine');
  const ideas=await ai.generateIdeas(h.app.getCurrentWorkspace(),4,[]);
  assert(ideas[0].title==='زاوية جديدة'&&ideas[0].referenceImages.length===0);
  assert(sent.contents[0].parts.every(part=>!part.inlineData));
});

(async()=>{for(const {name,run}of tests){await run();console.log('PASS '+name);}console.log(tests.length+' phase 2 tests passed');})().catch(error=>{console.error(error);process.exitCode=1;});
