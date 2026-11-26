// Run: node tests/phase4.test.cjs. Node 18+, no external packages.
const fs=require('node:fs'),path=require('node:path');
const {harness,assert,seedAngles,plannedReply}=require('./phase1.test.cjs');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const values=(n,extra={})=>({title:'منشور '+n,ideaTitle:'زاوية اختبار',copy:'نص منشور '+n,material:'غير محدد',publishedAt:'2000-01-'+String(n).padStart(2,'0'),channel:'Facebook',url:'',publishedImages:[],...extra});
async function setup(){const h=harness();await h.boot();h.memory=h.scope.ContentMemory;h.ws=h.app.getCurrentWorkspace();return h;}
function addPost(h,extra={}){const post={id:'post-test-'+(h.ws.calendar.length+1),title:'عنوان',copy:'نص فعلي',ideaTitle:'زاوية اختبار',ideaId:'idea-test',segment:'B2C',status:'مسودة',...extra};h.ws.calendar.push(post);if(!h.ws.ideas.some(idea=>idea.id==='idea-test'))h.ws.ideas.push({id:'idea-test',title:'زاوية اختبار',status:'pending',saturation:0});h.memory.ensure(h.ws);return post;}
function google(h,replies){seedAngles(h);h.configure();h.calls=[];let index=0;h.scope.fetch=async(url,options)=>{const payload=JSON.parse(options.body);h.calls.push(payload);const result=typeof replies==='function'?replies(payload,index++):replies[Math.min(index++,replies.length-1)];return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(plannedReply(payload,result))}]}}]})};};const ai=h.evaluate(source('js/ai-engine.js'),'AIEngine');Object.assign(h.api,ai);return ai;}
const tests=[];const test=(name,run)=>tests.push({name,run});

test('Approval preserves saturation; publication increments exactly once and editing does not',async()=>{
 const h=await setup(),post=addPost(h),idea=h.ws.ideas.find(item=>item.id==='idea-test');
 await h.studio.setPostStatus(0,'معتمد');assert(idea.saturation===0&&post.status==='معتمد');
 const record=h.memory.registerPublication(h.ws,values(1),post.id);assert(idea.saturation===25&&post.status==='اترفع');
 h.memory.registerPublication(h.ws,values(1,{copy:'نص معدل'}),'',record.id);assert(idea.saturation===25&&h.ws.publicationHistory.length===1);
 h.memory.ensure(h.ws);h.memory.ensure(h.ws);assert(idea.saturation===25);
});

test('Approval of a new angle creates zero saturation instead of an approval increment',async()=>{
 const h=await setup();h.ws.calendar=[{title:'بوست',ideaTitle:'زاوية جديدة',status:'مسودة'}];
 await h.studio.setPostStatus(0,'معتمد');if(h.ws.calendar[0].status!=='معتمد')await h.scope.PostWorkshop.approveWithNotes();const idea=h.ws.ideas.find(item=>item.title==='زاوية جديدة');assert(idea&&idea.saturation===0&&idea.status==='approved');
 await h.studio.setPostStatus(0,'معتمد');assert(idea.saturation===0);
});

test('Published status opens an editor and cancellation leaves state and saturation untouched',async()=>{
 const h=await setup(),post=addPost(h);await h.studio.setPostStatus(0,'اترفع');assert(post.status==='مسودة'&&h.ws.publicationHistory.length===0);
 h.memory.closePublish();assert(h.ws.ideas.find(item=>item.id==='idea-test').saturation===0);
});

test('Publish editor saves actual date, channel, copy and source association',async()=>{
 const h=await setup(),post=addPost(h);h.memory.openPublish(0);
 for(const [field,value]of Object.entries({title:'العنوان المنشور',angle:'زاوية اختبار',copy:'النص بعد تعديل المدير',date:'2000-02-01',channel:'Instagram',url:'https://example.com/post/1'}))h.element('publication-edit-'+field).value=value;
 await h.memory.savePublication();const record=h.ws.publicationHistory[0];assert(record.sourcePostId===post.id&&record.publishedAt==='2000-02-01'&&record.channel==='Instagram'&&record.copy==='النص بعد تعديل المدير');
 assert(post.copy==='نص فعلي'&&post.status==='اترفع');
});

test('Legacy migration preserves old saturation, unknown publication date and original flags',async()=>{
 const h=harness(),legacy=h.storage.createEmptyWorkspace('Legacy');legacy.ideas=[{id:'i-old',title:'قديم',status:'approved',saturation:65}];legacy.calendar=[{title:'منشور قديم',ideaId:'i-old',ideaTitle:'قديم',copy:'نص قديم',status:'اترفع',saturationCounted:true}];
 await h.storage.saveWorkspace('nassar-stone',legacy);await h.boot();const memory=h.scope.ContentMemory,ws=h.app.getCurrentWorkspace();memory.ensure(ws);
 assert(ws.ideas[0].saturation===65&&ws.publicationHistory.length===1);const entry=ws.publicationHistory[0];assert(entry.publishedAt===''&&!entry.countsTowardSaturation&&entry.legacy&&ws.calendar[0].saturationCounted===true);
 memory.registerPublication(ws,values(1,{ideaTitle:'قديم'}),'',entry.id);assert(ws.ideas[0].saturation===65);memory.ensure(ws);assert(ws.publicationHistory.length===1);
});

test('Saturation caps at 100; manual adjustment and undo follow active publication counts',async()=>{
 const h=await setup();for(let n=1;n<=5;n++)h.memory.registerPublication(h.ws,values(n));const idea=h.ws.ideas.find(item=>item.title==='زاوية اختبار');assert(idea.saturation===100);
 const entries=[...h.ws.publicationHistory];h.memory.voidPublication(h.ws,entries[0].id);assert(idea.saturation===100);
 h.memory.setSaturation(h.ws,idea.id,40,'تقييم المدير');assert(idea.saturation===40);
 const next=h.memory.registerPublication(h.ws,values(6));assert(idea.saturation===65);h.memory.voidPublication(h.ws,next.id);assert(idea.saturation===40);
 h.memory.voidPublication(h.ws,entries[1].id);assert(idea.saturation===15&&idea.saturationAdjustments.at(-1).reason==='تقييم المدير');
 for(const bad of [-1,101,2.5,NaN]){let failed=false;try{h.memory.setSaturation(h.ws,idea.id,bad);}catch{failed=true;}assert(failed);}
});

test('Void and restore publication reverse/reapply contribution without duplicate counting',async()=>{
 const h=await setup(),post=addPost(h),entry=h.memory.registerPublication(h.ws,values(1),post.id),idea=h.ws.ideas.find(item=>item.id==='idea-test');assert(idea.saturation===25);
 h.memory.voidPublication(h.ws,entry.id);h.memory.voidPublication(h.ws,entry.id);assert(idea.saturation===0&&post.status==='مسودة');
 h.memory.registerPublication(h.ws,values(1),'',entry.id);assert(idea.saturation===25&&!entry.voided&&post.status==='اترفع');
 await h.studio.setPostStatus(0,'معتمد');assert(post.status==='اترفع'&&idea.saturation===25);
});

test('Changing an archived angle moves its contribution without changing historical snapshots',async()=>{
 const h=await setup(),entry=h.memory.registerPublication(h.ws,values(1));const oldId=entry.ideaId;
 h.memory.registerPublication(h.ws,values(1,{ideaTitle:'زاوية ثانية'}),'',entry.id);
 assert(h.ws.ideas.find(idea=>idea.id===oldId).saturation===0&&h.ws.ideas.find(idea=>idea.id===entry.ideaId).saturation===25);
});

test('Blank reasons are rejected; rejection modal cancel preserves state; reasons are auditable',async()=>{
 const h=await setup(),post=addPost(h);await h.studio.setPostStatus(0,'مرفوض');assert(post.status==='مسودة');h.memory.closeExclusion();
 let failed=false;try{h.memory.applyExclusion(h.ws,{kind:'post',index:0,status:'rejected'},'  ');}catch{failed=true;}assert(failed&&post.status==='مسودة');
 h.memory.applyExclusion(h.ws,{kind:'post',index:0,status:'rejected'},'معلومة غير دقيقة');const idea=h.ws.ideas.find(item=>item.id==='idea-test');assert(post.status==='مرفوض'&&idea.status==='rejected'&&idea.exclusionReason==='معلومة غير دقيقة');
 const index=h.ws.ideas.indexOf(idea);h.memory.applyExclusion(h.ws,{kind:'idea',index,status:'saturated'},'الزاوية اتكررت');assert(idea.exclusionHistory.length===2);
 h.memory.setSaturation(h.ws,idea.id,0);assert(idea.status==='saturated');h.memory.allowIdea(h.ws,index);assert(idea.status==='approved'&&idea.exclusionHistory.length===2&&!idea.exclusionReason);
});

test('Exclusion editor saves post and idea reason through the normal persistence path',async()=>{
 const h=await setup();addPost(h);h.memory.openExclusion('post',0,'rejected');h.element('exclusion-reason').value='الصياغة ضعيفة';await h.memory.saveExclusion();
 const saved=await h.storage.loadWorkspace('nassar-stone');assert(saved.calendar[0].exclusionReason==='الصياغة ضعيفة'&&saved.ideas.find(idea=>idea.id==='idea-test').exclusionReason==='الصياغة ضعيفة');
});

test('Manual exclusions reach generation without an extra paid review',async()=>{
 const h=await setup();addPost(h);h.memory.applyExclusion(h.ws,{kind:'post',index:0,status:'rejected'},'REASON-TO-AVOID');
 const ai=google(h,[{post:{title:'عنوان جديد',materialIds:[],copy:'نص جديد'}},{allowed:true}]);await ai.generateSinglePost(h.ws);
 assert(h.calls.length===1&&JSON.stringify(h.calls[0]).includes('REASON-TO-AVOID'));
});

test('Published memory enters generation and exact repeats stop without retry',async()=>{
 const h=await setup();h.memory.registerPublication(h.ws,values(1,{title:'العنوان السابق',copy:'النص السابق'}));
 google(h,[{post:{title:'العنوان السابق',copy:'جديد',materialIds:[]}}]);
 await h.studio.handleGenerateSinglePost();assert(h.calls.length===1&&h.ws.calendar.length===0&&JSON.stringify(h.calls[0]).includes('PUBLISHED MEMORY'));
});

test('Exact repetition checks cover older history beyond the compact prompt window',async()=>{
 const h=await setup();for(let n=1;n<=35;n++)h.memory.registerPublication(h.ws,values(1,{title:'عنوان '+n,copy:'نص '+n,publishedAt:'2000-01-01',ideaTitle:'زاوية '+n}));
 assert(h.memory.isDuplicate(h.ws,[{title:'عنوان 1'}]));const context=h.memory.historyContext(h.ws);const data=JSON.parse(context.split('\n')[1]);assert(data.recent.length===30&&data.olderAngles.length===5);
});

test('Calendar replacement preserves publication ledger and duplicate avoidance',async()=>{
 const h=await setup(),post=addPost(h);seedAngles(h);h.memory.registerPublication(h.ws,values(1),post.id);h.api.generateCalendar8=async()=>Array.from({length:8},(_,i)=>({title:'جديد '+i}));
 h.element('calendar-generation-mode').value='replace';await h.studio.handleGenerateCalendar();assert(h.ws.calendar.length===8&&h.ws.publicationHistory.length===1&&h.memory.isDuplicate(h.ws,[{title:'منشور 1'}]));
});

test('Publication validation blocks future/invalid dates, duplicate URLs and duplicate source posts',async()=>{
 const h=await setup(),post=addPost(h);h.memory.registerPublication(h.ws,values(1,{url:'https://example.com/1'}),post.id);
 for(const [data,sourceId]of [[values(2),post.id],[values(2,{url:'https://example.com/1'}),''],[values(2,{publishedAt:'2999-01-01'}),''],[values(2,{publishedAt:'2000-02-30'}),''],[values(2,{url:'javascript:alert(1)'}),'']]){
  let failed=false;try{h.memory.registerPublication(h.ws,data,sourceId);}catch{failed=true;}assert(failed);
 }
 assert(h.ws.publicationHistory.length===1);
});

test('Actual published images are separate from generation inputs and survive full backup',async()=>{
 const h=await setup(),ref=n=>({id:'ref-00000000-0000-4000-8000-'+String(n).padStart(12,'0'),title:'صورة '+n,kind:'project',material:'',description:''});
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZfoAAAAASUVORK5CYII=';
 for(let n=1;n<=2;n++)await h.storage.saveReferenceImage('nassar-stone',{id:ref(n).id,mimeType:'image/png',data:png,width:1,height:1});
 const post=addPost(h,{referenceImages:[ref(1)]});const entry=h.memory.registerPublication(h.ws,values(1,{publishedImages:[ref(2)]}),post.id);
 assert(entry.referenceImages[0].id===ref(1).id&&entry.publishedImages[0].id===ref(2).id);
 h.ws.calendar=[];h.ws.assets.references=[];const backup=await h.storage.createPortableBackup(h.app.getCurrentCompany(),h.ws);assert(backup.imageFiles.length===2);
 const other=await setup(),text=JSON.stringify(backup);await other.app.importBackup({target:{files:[{size:text.length,text:async()=>text}],value:'selected'}});
 assert(other.app.getCurrentWorkspace().publicationHistory[0].publishedImages[0].id===ref(2).id&&(await other.storage.loadReferenceImage('nassar-stone',ref(2).id)).data===png);
});

test('Cancel and recovery preserve archive and saturation across reload',async()=>{
 const h=await setup(),post=addPost(h),entry=h.memory.registerPublication(h.ws,values(1),post.id);await h.app.persistWorkspace();
 h.confirm(false);await h.memory.cancelPublication(entry.id);assert(!entry.voided);
 h.confirm(true);await h.memory.cancelPublication(entry.id);assert(entry.voided&&h.ws.ideas.find(idea=>idea.id==='idea-test').saturation===0);
 await h.app.restoreRecovery();await h.app.init();const ws=h.app.getCurrentWorkspace();assert(!ws.publicationHistory[0].voided&&ws.ideas.find(idea=>idea.id==='idea-test').saturation===25);
});

test('Saturation editor rejects empty input and preserves excluded status',async()=>{
 const h=await setup();addPost(h);const idea=h.ws.ideas.find(idea=>idea.id==='idea-test'),index=h.ws.ideas.indexOf(idea);h.memory.applyExclusion(h.ws,{kind:'idea',index,status:'saturated'},'مستهلكة');
 h.memory.openSaturation(index);h.element('saturation-value').value='';await h.memory.saveSaturation();assert(idea.saturation===0);
 h.element('saturation-value').value='50';h.element('saturation-reason').value='مراجعة';await h.memory.saveSaturation();assert(idea.saturation===50&&idea.status==='saturated');
});

test('Publication schema rejects tampered duplicate records and invalid saturation state',async()=>{
 const h=await setup();h.memory.registerPublication(h.ws,values(1));const ws=clone(h.ws);ws.publicationHistory.push(clone(ws.publicationHistory[0]));let failed=false;try{h.storage.validateWorkspace(ws);}catch{failed=true;}assert(failed);
 for(const change of [{saturation:101},{saturationBase:1.5},{exclusionHistory:[{status:'rejected',reason:'',at:'now'}]}]){const bad=clone(h.ws);Object.assign(bad.ideas[0],change);failed=false;try{h.storage.validateWorkspace(bad);}catch{failed=true;}assert(failed);}
});

test('History render escapes text and links; voided records stay searchable',async()=>{
 const h=await setup(),entry=h.memory.registerPublication(h.ws,values(1,{title:'<img onerror=alert(1)>',copy:'<script>bad</script>',url:'https://example.com/"quote'}));h.memory.render(h.ws);
 const html=h.element('publication-history-grid').innerHTML;assert(html.includes('&lt;img')&&html.includes('&lt;script&gt;')&&html.includes('&quot;quote'));
 h.memory.voidPublication(h.ws,entry.id);h.element('publication-filter').value='voided';h.memory.render(h.ws);assert(h.element('publication-history-grid').innerHTML.includes('تسجيل ملغي'));
 h.element('publication-search').value='missing';h.memory.render(h.ws);assert(h.element('publication-history-grid').innerHTML.includes('مفيش منشورات مطابقة'));
});

test('Linked published angles cannot be deleted accidentally',async()=>{
 const h=await setup(),post=addPost(h);h.memory.registerPublication(h.ws,values(1),post.id);const idea=h.ws.ideas.find(item=>item.id==='idea-test');await h.studio.deleteIdea(h.ws.ideas.indexOf(idea));assert(h.ws.ideas.some(item=>item.id===idea.id));
});

test('Large GitHub workspace files use authenticated raw content instead of empty base64',async()=>{
 const h=await setup();h.configure();const large=h.storage.createEmptyWorkspace('Large');large.goal.objective='large body';let raw=false;
 h.scope.fetch=async(url,options)=>({ok:true,status:200,json:async()=>{if(options.headers.Accept==='application/vnd.github.raw+json'){raw=true;return large;}return {encoding:'none',size:2000000,content:'',sha:'large-sha'};}});
 const storage=h.evaluate(source('js/storage.js'),'StorageEngine');const loaded=await storage.loadWorkspace('large');assert(raw&&loaded.goal.objective==='large body');
});

(async()=>{for(const {name,run}of tests){await run();console.log('PASS '+name);}console.log(tests.length+' phase 4 tests passed');})().catch(error=>{console.error(error);process.exitCode=1;});
