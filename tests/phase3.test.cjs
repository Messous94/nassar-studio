// Run: node tests/phase3.test.cjs. No external dependencies.
const fs = require('node:fs');
const path = require('node:path');
const { harness, assert, seedAngles, plannedReply } = require('./phase1.test.cjs');
const source = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const mid = n => 'mat-00000000-0000-4000-8000-' + String(n).padStart(12,'0');
const rid = 'ref-00000000-0000-4000-8000-000000000001';
const reference = () => ({id:rid,title:'صورة خامة',kind:'material',material:'اسم مسجّل',description:'وصف مسجّل'});
const pixel = () => ({id:rid,mimeType:'image/png',width:1,height:1,data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZfoAAAAASUVORK5CYII='});
const material = (n,changes={}) => ({id:mid(n),name:'خامة '+n,brand:'Brand '+n,model:'Model '+n,origin:'بلد مسجّل',uses:['استخدام مسجّل'],approvedFacts:['معلومة مسجّلة'],source:'مرجع المستخدم',notes:'PRIVATE-NOTE',status:'approved',referenceImages:[],...changes});
async function setup() { const h=harness();await h.boot();h.catalog=h.scope.MaterialCatalog;h.ws=h.app.getCurrentWorkspace();return h; }
function setMaterials(h,items) { h.ws.brandCore.materialCatalog=items;h.ws.brandCore.materialScope='all';h.ws.brandCore.selectedMaterialIds=[]; }
function fill(h,values) {for(const [key,value]of Object.entries(values))h.element('material-edit-'+key).value=value;}
function google(h,replies) {
  seedAngles(h);
  h.configure();h.calls=[];let index=0;
  h.scope.fetch=async(url,options)=>{const payload=JSON.parse(options.body);h.calls.push(payload);const reply=typeof replies==='function'?replies(payload,index++):replies[Math.min(index++,replies.length-1)];return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(plannedReply(payload,reply))}]}}]})};};
  const ai=h.evaluate(source('js/ai-engine.js'),'AIEngine');Object.assign(h.api,ai);return ai;
}
const tests=[];const test=(name,run)=>tests.push({name,run});

test('Legacy names migrate deterministically to drafts without inferred facts',async()=>{
  const h=await setup();const drafts=h.catalog.ensure(h.ws);assert(drafts.length>0&&drafts.every(item=>item.status==='draft'&&!item.brand&&!item.model&&!item.origin));
  const other=h.storage.createEmptyWorkspace('Other');other.brandCore.materials=[...h.ws.brandCore.materials];
  assert(JSON.stringify(h.catalog.ensure(other))===JSON.stringify(drafts));
  const count=drafts.length;await h.catalog.importLegacy();assert(h.ws.brandCore.materialCatalog.length===count);
  h.ws.brandCore.materials.push('New legacy name');await h.catalog.importLegacy();assert(h.ws.brandCore.materialCatalog.length===count+1);
  assert(h.ws.brandCore.materialCatalog.at(-1).status==='draft');
});

test('Only approved facts enter context; drafts, legacy names and private notes stay out',async()=>{
  const h=await setup();h.ws.brandCore.materials=['LEGACY-SECRET'];setMaterials(h,[material(1),material(2,{name:'DRAFT-SECRET',status:'draft',origin:'DRAFT-ORIGIN'})]);
  const context=h.catalog.prepareGeneration(h.ws),text=h.catalog.contextText(context);
  assert(context.materials.length===1&&text.includes('Brand 1')&&text.includes('معلومة مسجّلة'));
  assert(!text.includes('DRAFT-SECRET')&&!text.includes('DRAFT-ORIGIN')&&!text.includes('PRIVATE-NOTE')&&!text.includes('LEGACY-SECRET'));
  assert(context.materials[0].notes==='');
});

test('Incomplete approved cards retain nulls and produce missing-field warnings',async()=>{
  const h=await setup();setMaterials(h,[material(1,{origin:'',uses:[],approvedFacts:[]})]);
  const context=h.catalog.prepareGeneration(h.ws);assert(h.catalog.contextText(context).includes('"origin":null'));
  const [post]=h.catalog.groundItems([{title:'بوست',materialIds:[mid(1)],materialGaps:['fake']}],context);
  assert(post.materialGaps[0].fields.includes('المنشأ')&&post.materialGaps[0].fields.includes('الاستخدامات'));
  h.catalog.renderPost(post);assert(h.element('post-material-data').innerHTML.includes('بيانات ناقصة'));
});

test('Create, approve, unchanged save and edited approval reset work end to end',async()=>{
  const h=await setup();setMaterials(h,[]);h.catalog.openEditor();
  fill(h,{name:'New material',brand:'Brand',model:'Model',origin:'',source:'User source',notes:'Internal',uses:'Use one\nUse two',facts:'Fact one'});
  await h.catalog.saveEditor();let card=h.ws.brandCore.materialCatalog[0];assert(card.status==='draft'&&card.uses.length===2);
  await h.catalog.changeStatus(card.id);assert(card.status==='approved');
  await h.catalog.toggleSelection(card.id,true);h.catalog.openEditor(card.id);await h.catalog.saveEditor();card=h.ws.brandCore.materialCatalog[0];assert(card.status==='approved');
  h.catalog.openEditor(card.id);fill(h,{origin:'Updated origin'});await h.catalog.saveEditor();card=h.ws.brandCore.materialCatalog[0];
  assert(card.status==='draft'&&h.ws.brandCore.selectedMaterialIds.length===0);
  let failed=false;try{h.catalog.prepareGeneration(h.ws);}catch{failed=true;}assert(failed);
});

test('Approval cancellation and draft transitions preserve correct selection state',async()=>{
  const h=await setup();setMaterials(h,[material(1,{status:'draft',origin:''})]);h.confirm(false);await h.catalog.changeStatus(mid(1));assert(h.ws.brandCore.materialCatalog[0].status==='draft');
  h.confirm(true);await h.catalog.changeStatus(mid(1));assert(h.ws.brandCore.materialCatalog[0].status==='approved');
  await h.catalog.toggleSelection(mid(1),true);await h.catalog.changeStatus(mid(1));assert(h.ws.brandCore.materialCatalog[0].status==='draft'&&!h.ws.brandCore.selectedMaterialIds.length);
});

test('All, selected, general scopes and eight-card cap are enforced',async()=>{
  const h=await setup();setMaterials(h,[...Array.from({length:9},(_,i)=>material(i+1)),material(10,{status:'draft'})]);
  let failed=false;try{h.catalog.prepareGeneration(h.ws);}catch{failed=true;}assert(failed);
  for(let n=1;n<=9;n++)await h.catalog.toggleSelection(mid(n),true,{checked:true});assert(h.ws.brandCore.selectedMaterialIds.length===8);
  assert(h.catalog.prepareGeneration(h.ws).materials.length===8);
  await h.catalog.toggleSelection(mid(10),true,{checked:true});assert(!h.ws.brandCore.selectedMaterialIds.includes(mid(10)));
  await h.catalog.setScope('general');assert(h.catalog.prepareGeneration(h.ws).materials.length===0);
  setMaterials(h,[material(1),material(2)]);await h.catalog.toggleSelection(mid(2),true);assert(h.catalog.prepareGeneration(h.ws).materials[0].id===mid(2));
});

test('Unknown, duplicate, malformed and unlinked material outputs are rejected',async()=>{
  const h=await setup();setMaterials(h,[material(1)]);const context=h.catalog.prepareGeneration(h.ws);
  for(const item of [{materialIds:[mid(2)]},{materialIds:[mid(1),mid(1)]},{materialIds:'wrong'},{materialIds:null},{material:123},{material:'Invented material'},null]){
    let failed=false;try{h.catalog.groundItems([item],context);}catch{failed=true;}assert(failed);
  }
  const [post]=h.catalog.groundItems([{materialIds:[mid(1)],material:'Invented label',materialSnapshots:[material(99)]}],context);
  assert(post.material==='خامة 1'&&post.materialSnapshots[0].brand==='Brand 1'&&post.materialSnapshots[0].notes==='');
  const [general]=h.catalog.groundItems([{materialIds:[],material:'غير محدد'}],context);assert(!general.materialSnapshots.length);
});

test('Generation payload uses approved catalog and stamps trusted snapshots and gaps',async()=>{
  const h=await setup();h.ws.brandCore.materials=['LEGACY-SECRET'];setMaterials(h,[material(1,{origin:''}),material(2,{status:'draft',name:'DRAFT-SECRET'})]);
  const ai=google(h,[{post:{title:'بوست',materialIds:[mid(1)],material:'Untrusted label',materialSnapshots:[material(99)]}}]);
  const post=await ai.generateSinglePost(h.ws);const text=JSON.stringify(h.calls[0]);
  assert(text.includes('APPROVED MATERIAL CATALOG')&&text.includes('Brand 1'));
  assert(!text.includes('PRIVATE-NOTE')&&!text.includes('DRAFT-SECRET')&&!text.includes('LEGACY-SECRET'));
  assert(post.materialSnapshots[0].id===mid(1)&&post.materialGaps[0].fields.includes('المنشأ'));
  h.ws.brandCore.materialCatalog[0].brand='CHANGED';assert(post.materialSnapshots[0].brand==='Brand 1');
});

test('Invalid generated material stops after one request and saves nothing',async()=>{
  const h=await setup();setMaterials(h,[material(1)]);
  google(h,[{post:{title:'invalid',materialIds:[mid(99)]}}]);await h.studio.handleGenerateSinglePost();
  assert(h.calls.length===1&&h.ws.calendar.length===0&&h.element('toast').textContent.includes('كتالوج'));
});

test('Calendar, post and idea handlers persist material snapshots',async()=>{
  const h=await setup();setMaterials(h,[material(1)]);
  google(h,payload=>{const text=payload.contents[0].parts.filter(p=>p.text).map(p=>p.text).join('\n');
    if(text.includes('توليد كاليندر فيسبوك'))return {posts:Array.from({length:8},(_,i)=>({title:'بوست '+i,materialIds:[mid(1)]}))};
    if(text.includes('توليد بوست فيسبوك واحد'))return {post:{title:'فردي',materialIds:[mid(1)]}};
    return {ideas:[{title:'فكرة خامة',insight:'Insight',materialIds:[mid(1)]}]};});
  h.element('calendar-generation-mode').value='append';await h.studio.handleGenerateCalendar();await h.studio.handleGenerateSinglePost();await h.studio.handleGenerateIdeas();
  assert(h.ws.calendar.length===9&&h.ws.calendar.every(post=>post.materialSnapshots[0].id===mid(1)));
  assert(h.ws.ideas.find(idea=>idea.title==='فكرة خامة').materialSnapshots[0].id===mid(1));
  const cached=await h.storage.loadWorkspace('nassar-stone');assert(cached.calendar[0].materialSnapshots[0].brand==='Brand 1');
});

test('Catalog-only image links survive portable backup and library removal',async()=>{
  const h=await setup();setMaterials(h,[material(1,{referenceImages:[reference()]})]);await h.storage.saveReferenceImage('nassar-stone',pixel());
  h.ws.assets.references=[];h.ws.assets.selectedReferenceIds=[];
  const backup=await h.storage.createPortableBackup(h.app.getCurrentCompany(),h.ws);assert(backup.imageFiles.length===1);
  await h.catalog.useImages(mid(1));assert(h.ws.assets.references.length===1&&h.ws.assets.selectedReferenceIds[0]===rid);
  const next=await setup(),text=JSON.stringify(backup);await next.app.importBackup({target:{files:[{size:text.length,text:async()=>text}],value:'selected'}});
  assert(next.ws!==next.app.getCurrentWorkspace());assert((await next.storage.loadReferenceImage('nassar-stone',rid)).data===pixel().data);
  assert(next.app.getCurrentWorkspace().brandCore.materialCatalog[0].referenceImages[0].id===rid);
});

test('Material image linking does not send pixels without explicit image selection',async()=>{
  const h=await setup();setMaterials(h,[material(1,{referenceImages:[reference()]})]);await h.storage.saveReferenceImage('nassar-stone',pixel());
  const ai=google(h,[{post:{title:'بوست',materialIds:[mid(1)]}}]);await ai.generateSinglePost(h.ws,'',[]);
  assert(!h.calls[0].contents[0].parts.some(part=>part.inlineData));
  assert(h.catalog.prepareGeneration(h.ws).materials[0].referenceImages[0].id===rid);
});

test('Deleting card preserves historical facts, image backup and undo',async()=>{
  const h=await setup();setMaterials(h,[material(1,{referenceImages:[reference()]})]);await h.storage.saveReferenceImage('nassar-stone',pixel());
  const [post]=h.catalog.groundItems([{title:'قديم',materialIds:[mid(1)]}],h.catalog.prepareGeneration(h.ws));h.ws.calendar=[post];await h.app.persistWorkspace();
  h.confirm(false);await h.catalog.remove(mid(1));assert(h.ws.brandCore.materialCatalog.length===1);
  h.confirm(true);await h.catalog.remove(mid(1));assert(h.ws.brandCore.materialCatalog.length===0&&post.materialSnapshots[0].brand==='Brand 1');
  const backup=await h.storage.createPortableBackup(h.app.getCurrentCompany(),h.ws);assert(backup.imageFiles.length===1);
  await h.app.restoreRecovery();assert(h.app.getCurrentWorkspace().brandCore.materialCatalog.length===1);
});

test('Malformed material cards and historical snapshots fail validation',async()=>{
  const h=await setup();
  for(const bad of [material(1,{status:'fake'}),material(1,{origin:null}),material(1,{approvedFacts:'text'}),material(1,{referenceImages:[reference(),reference()]}),material(1,{id:'../bad'})]){
    let failed=false;try{h.storage.validateMaterialRecord(bad);}catch{failed=true;}assert(failed);
  }
  const ws=clone(h.ws);ws.brandCore.materialCatalog=[material(1),material(1)];let failed=false;try{h.storage.validateWorkspace(ws);}catch{failed=true;}assert(failed);
  ws.brandCore.materialCatalog=[];ws.calendar=[{title:'بدون بيانات',materialSnapshots:[{}]}];failed=false;try{h.storage.validateWorkspace(ws);}catch{failed=true;}assert(failed);
});

test('Render escapes catalog fields and filters without changing data',async()=>{
  const h=await setup();setMaterials(h,[material(1,{name:'<img onerror=alert(1)>',source:'<script>bad</script>'}),material(2,{status:'draft'})]);
  h.catalog.render(h.ws);const html=h.element('material-catalog-grid').innerHTML;assert(html.includes('&lt;img')&&html.includes('&lt;script&gt;')&&!html.includes('<script>bad'));
  h.element('material-status-filter').value='draft';h.catalog.render(h.ws);assert(!h.element('material-catalog-grid').innerHTML.includes('Brand 1'));
  h.element('material-search').value='missing';h.catalog.render(h.ws);assert(h.element('material-catalog-grid').innerHTML.includes('مفيش خامات مطابقة'));
  assert(h.ws.brandCore.materialCatalog.length===2);
});

test('Catalog operation lock blocks switching and concurrent generation',async()=>{
  const h=await setup();setMaterials(h,[material(1,{status:'draft'})]);let release,entered;
  const started=new Promise(resolve=>entered=resolve);const checkpoint=h.scope.App.checkpoint;
  h.scope.App.checkpoint=()=>new Promise(resolve=>{release=resolve;entered();});
  const approval=h.catalog.changeStatus(mid(1));await started;assert(h.catalog.isBusy());
  await h.app.switchWorkspace('other');assert(h.app.getCurrentCompany().id==='nassar-stone');
  let calls=0;h.api.generateSinglePost=async()=>{calls++;return {title:'unexpected'};};await h.studio.handleGenerateSinglePost();assert(calls===0);
  await h.catalog.remove(mid(1));assert(h.catalog.isBusy());release();await approval;h.scope.App.checkpoint=checkpoint;assert(!h.catalog.isBusy());
});

test('Image editor links at most four references and changes require approval again',async()=>{
  const h=await setup();setMaterials(h,[material(1)]);
  h.ws.assets.references=Array.from({length:5},(_,i)=>({...reference(),id:'ref-00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),title:'صورة '+i}));
  h.catalog.openEditor(mid(1));
  for(const ref of h.ws.assets.references)h.catalog.toggleEditorImage(ref.id,true,{checked:true});
  await h.catalog.saveEditor();const card=h.ws.brandCore.materialCatalog[0];assert(card.referenceImages.length===4&&card.status==='draft');
  assert(h.catalog.prepareGeneration(h.ws).materials.length===0);
});

test('Unchanged imported card preserves approval regardless of JSON property order',async()=>{
  const h=await setup();const original=material(1);const reordered=Object.fromEntries(Object.entries(original).reverse());setMaterials(h,[reordered]);
  h.catalog.openEditor(mid(1));await h.catalog.saveEditor();assert(h.ws.brandCore.materialCatalog[0].status==='approved');
});

(async()=>{for(const {name,run}of tests){await run();console.log('PASS '+name);}console.log(tests.length+' phase 3 tests passed');})().catch(error=>{console.error(error);process.exitCode=1;});
