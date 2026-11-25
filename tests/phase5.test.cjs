// Run: node tests/phase5.test.cjs. Node 18+, no dependencies.
const fs=require('node:fs'),path=require('node:path');
const {harness,assert}=require('./phase1.test.cjs');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
async function setup(){const h=harness();await h.boot();h.workshop=h.scope.PostWorkshop;h.ws=h.app.getCurrentWorkspace();return h;}
function addPost(h,extra={}){const post={id:'post-phase5-'+(h.ws.calendar.length+1),title:'عنوان مختلف',copy:'الهوك القديم\nتفاصيل محفوظة.',visualDirection:'صورة مطبخ حقيقي',designerBrief:'بريف محفوظ',colorPalette:'أبيض',mood:'هادئ',material:'غير محدد',materialIds:[],materialSnapshots:[],referenceImages:[],status:'مسودة',ideaTitle:'زاوية مختلفة',...extra};h.ws.calendar.push(post);h.scope.ContentMemory.ensure(h.ws);h.app.refreshUI();return post;}
function enableAI(h,reply){h.configure();h.calls=[];h.scope.fetch=async(url,options)=>{const input=JSON.parse(options.body);h.calls.push(input);const result=await reply(input,h.calls.length-1);return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]})};};const ai=h.evaluate(source('js/ai-engine.js'),'AIEngine');Object.assign(h.api,ai);return ai;}
function info(extra={}){return{category:'claims',severity:'warning',message:'ادعاء محتاج سند',evidence:'تفاصيل محفوظة.',suggestion:'احذف الادعاء غير المسجّل.',...extra};}
const mat=()=>({id:'mat-00000000-0000-4000-8000-000000000001',name:'خامة مسجلة',brand:'Brand',model:'Model',origin:'Origin',uses:['استخدام'],approvedFacts:['معلومة'],source:'مصدر المستخدم',notes:'PRIVATE-NOTE',status:'approved',referenceImages:[]});
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZfoAAAAASUVORK5CYII=';
const ref=n=>({id:'ref-00000000-0000-4000-8000-'+String(n).padStart(12,'0'),title:'صورة '+n,kind:'project',material:'',description:''});
const tests=[];const test=(name,run)=>tests.push({name,run});

test('Manual edit snapshots text fields, resets approval, preserves other fields and saves',async()=>{
 const h=await setup(),post=addPost(h,{status:'معتمد'}),before=clone(post);h.element('brief-copy').value='نص متعدل';await h.studio.saveEditedCopy();
 assert(post.copy==='نص متعدل'&&post.status==='مسودة'&&post.revisions.length===1&&post.revisions[0].fields.copy===before.copy);
 for(const key of ['title','visualDirection','designerBrief','colorPalette','mood','material'])assert(post[key]===before[key]);
 const saved=await h.storage.loadWorkspace('nassar-stone');assert(saved.calendar[0].revisions.length===1);
});

test('Saving identical text creates no extra revision and arbitrary patch fields are rejected',async()=>{
 const h=await setup(),post=addPost(h);await h.workshop.saveManualCopy(h.ws,post,post.copy);assert(!post.revisions);
 for(const patch of [{title:'changed'},{copy:123},{copy:'a'.repeat(50001)}]){let failed=false;try{h.workshop.applyChange(h.ws,post,patch,'manual-copy');}catch{failed=true;}assert(failed);}
 assert(post.title==='عنوان مختلف'&&!post.revisions);
});

test('Hook replacement preserves leading whitespace, newline style and body exactly',async()=>{
 const h=await setup(),post=addPost(h,{copy:'\r\nالهوك القديم\r\nسطر تاني\r\nسطر تالت'});const patch=h.workshop.partPatch(post,'hook','هوك جديد');
 assert(patch.copy==='\r\nهوك جديد\r\nسطر تاني\r\nسطر تالت');
 assert(h.workshop.partText(post,'hook')==='الهوك القديم');
 for(const text of ['سطر\nتاني',' ', 'أ'.repeat(301)]){let failed=false;try{h.workshop.partPatch(post,'hook',text);}catch{failed=true;}assert(failed);}
 assert(h.workshop.partPatch({...post,copy:''},'hook','بداية').copy==='بداية');
});

test('Alternative stays a preview until apply and only changes the requested field',async()=>{
 const h=await setup(),post=addPost(h,{status:'اتعمل'});h.api.regeneratePostPart=async()=> 'بريف بديل';
 h.workshop.openEditor();h.element('workshop-part').value='brief';h.workshop.updatePart();await h.workshop.generateAlternative();assert(post.designerBrief==='بريف محفوظ'&&!post.revisions);
 await h.workshop.applyAlternative();assert(post.designerBrief==='بريف بديل'&&post.copy==='الهوك القديم\nتفاصيل محفوظة.'&&post.visualDirection==='صورة مطبخ حقيقي'&&post.status==='مسودة');
 assert(post.revisions[0].action==='regenerate-brief');
});

test('Canceled or failed generation leaves post and versions unchanged',async()=>{
 const h=await setup(),post=addPost(h),original=JSON.stringify(post);h.api.regeneratePostPart=async()=> 'نص بديل';h.workshop.openEditor();await h.workshop.generateAlternative();h.workshop.closeEditor();assert(JSON.stringify(post)===original);
 h.api.regeneratePostPart=async()=>{throw new TypeError('offline');};h.workshop.openEditor();await h.workshop.generateAlternative();assert(JSON.stringify(post)===original&&!h.workshop.isBusy());
});

test('Context change makes an alternative stale and blocks application',async()=>{
 const h=await setup(),post=addPost(h);h.api.regeneratePostPart=async()=> 'بديل';h.workshop.openEditor();await h.workshop.generateAlternative();h.ws.brandCore.rules.push('قاعدة جديدة');await h.workshop.applyAlternative();assert(post.copy==='الهوك القديم\nتفاصيل محفوظة.'&&!post.revisions);
});

test('Regeneration uses original post images instead of global selected images',async()=>{
 const h=await setup(),post=addPost(h,{referenceImages:[ref(1)]});h.ws.assets.references=[ref(1),ref(2)];h.ws.assets.selectedReferenceIds=[ref(2).id];
 for(let n=1;n<=2;n++)await h.storage.saveReferenceImage('nassar-stone',{id:ref(n).id,mimeType:'image/png',data:png,width:1,height:1});
 enableAI(h,()=>({text:'تصور بديل'}));h.workshop.openEditor();h.element('workshop-part').value='visual';h.workshop.updatePart();await h.workshop.generateAlternative();
 const parts=h.calls[0].contents[0].parts;assert(parts.filter(part=>part.inlineData).length===1&&parts.some(part=>part.text?.includes(ref(1).id)));
 assert(!parts.some(part=>part.text?.includes(ref(2).id)));await h.workshop.applyAlternative();assert(post.referenceImages[0].id===ref(1).id&&post.visualDirection==='تصور بديل');
});

test('Revoked or changed material facts block partial generation',async()=>{
 const h=await setup(),material=mat();h.ws.brandCore.materialCatalog=[material];const snapshot=h.scope.MaterialCatalog.prepareGeneration(h.ws).materials[0];const post=addPost(h,{materialIds:[material.id],materialSnapshots:[snapshot],material:material.name});
 material.status='draft';let failed=false;try{await h.workshop.regenerationInputs(h.ws,post);}catch{failed=true;}assert(failed);
 material.status='approved';material.origin='New origin';failed=false;try{await h.workshop.regenerationInputs(h.ws,post);}catch{failed=true;}assert(failed);
 material.origin='Origin';const inputs=await h.workshop.regenerationInputs(h.ws,post);assert(inputs.materials[0].origin==='Origin'&&!JSON.stringify(inputs).includes('PRIVATE-NOTE'));
});

test('Version restore saves the displaced state and restores all text fields',async()=>{
 const h=await setup(),post=addPost(h);h.workshop.applyChange(h.ws,post,{copy:'تعديل أول',designerBrief:'بريف أول'},'restore');const first=post.revisions[0];
 h.workshop.applyChange(h.ws,post,{copy:'تعديل تاني'},'manual-copy');h.app.refreshUI();h.element('post-revision-selector').value=first.id;await h.workshop.restoreVersion();
 assert(post.copy==='الهوك القديم\nتفاصيل محفوظة.'&&post.designerBrief==='بريف محفوظ'&&post.revisions.length===3);
 assert(post.revisions[2].fields.copy==='تعديل تاني'&&post.revisions[2].action==='restore');
});

test('Editing a published post preserves publication history and saturation',async()=>{
 const h=await setup(),post=addPost(h);const entry=h.scope.ContentMemory.registerPublication(h.ws,{title:post.title,ideaTitle:post.ideaTitle,copy:post.copy,material:'غير محدد',publishedAt:'2000-01-01',channel:'Facebook',url:'',publishedImages:[]},post.id);
 const idea=h.ws.ideas.find(item=>item.id===entry.ideaId),before=clone(entry);h.app.refreshUI();await h.workshop.saveManualCopy(h.ws,post,'مسودة تعديل');
 assert(post.status==='اترفع'&&JSON.stringify(entry)===JSON.stringify(before)&&idea.saturation===25);
 assert(!h.workshop.localIssues(h.ws,post).some(issue=>issue.category==='similarity'&&issue.severity==='error'));
});

test('Semantic review categories are parsed, invented quotes removed and content remains unchanged',async()=>{
 const h=await setup(),post=addPost(h),original=post.copy;
 enableAI(h,()=>({summary:'ملاحظات للمراجعة',issues:[info(),info({category:'dialect',evidence:'اقتباس مش موجود'})]}));
 const result=await h.workshop.review(h.ws,post);assert(result.semanticStatus==='complete'&&result.issues.filter(issue=>issue.source==='model').length===2);
 assert(result.issues[1].evidence===''&&result.issues[0].evidence==='تفاصيل محفوظة.'&&post.copy===original);
 const text=JSON.stringify(h.calls[0]);assert(text.includes('قواعد البراند')&&text.includes('ادعاء'));
});

test('Local review flags unbound materials, manual exclusion and exact publication duplication',async()=>{
 const h=await setup(),post=addPost(h,{material:'اسم غير مربوط'});h.scope.ContentMemory.registerPublication(h.ws,{title:post.title,ideaTitle:'زاوية تانية',copy:post.copy,material:'غير محدد',publishedAt:'2000-01-01',channel:'Facebook',url:'',publishedImages:[]});
 h.scope.ContentMemory.applyExclusion(h.ws,{kind:'post',index:0,status:'rejected'},'سبب مدير المحتوى');const issues=h.workshop.localIssues(h.ws,post);
 assert(issues.some(issue=>issue.category==='material')&&issues.some(issue=>issue.category==='similarity'&&issue.severity==='error')&&issues.some(issue=>issue.category==='rules'));
});

test('Unavailable semantic review is visibly partial and never auto-approves',async()=>{
 const h=await setup(),post=addPost(h);h.api.reviewPost=async()=>{throw new Error('تعذر الاتصال');};await h.studio.setPostStatus(0,'معتمد');
 assert(post.status==='مسودة'&&post.reviewResult.semanticStatus==='unavailable'&&post.reviewResult.issues.some(issue=>issue.category==='review'));
 assert(h.element('review-semantic-status').textContent.includes('غير متاحة'));await h.workshop.approveWithNotes();assert(post.status==='معتمد');
});

test('Malformed semantic response falls back to local checks instead of passing review',async()=>{
 const h=await setup(),post=addPost(h);h.api.reviewPost=async()=>({summary:'bad',issues:[{category:'invented'}]});const result=await h.workshop.review(h.ws,post);
 assert(result.semanticStatus==='unavailable'&&result.issues.some(issue=>issue.category==='review'));
});

test('Clean complete review approves and a matching cached result avoids another model call',async()=>{
 const h=await setup(),post=addPost(h);let calls=0;h.api.reviewPost=async()=>{calls++;return{summary:'لا توجد ملاحظات',issues:[]};};
 await h.studio.setPostStatus(0,'معتمد');assert(post.status==='معتمد'&&calls===1);await h.studio.setPostStatus(0,'معتمد');assert(calls===1);
 h.ws.brandCore.rules.push('قاعدة جديدة');await h.studio.setPostStatus(0,'معتمد');assert(calls===2);
});

test('Review findings require explicit approval; stale confirmation is rejected',async()=>{
 const h=await setup(),post=addPost(h);h.api.reviewPost=async()=>({summary:'ملاحظة',issues:[info()]});await h.studio.setPostStatus(0,'معتمد');assert(post.status==='مسودة');
 post.copy='اتغير بعد المراجعة';await h.workshop.approveWithNotes();assert(post.status==='مسودة');
 h.app.refreshUI();await h.studio.setPostStatus(0,'معتمد');await h.workshop.approveWithNotes();assert(post.status==='معتمد');
});

test('Changes during asynchronous review prevent approval and stale result persistence',async()=>{
 const h=await setup(),post=addPost(h);let finish;h.api.reviewPost=()=>new Promise(resolve=>finish=resolve);
 const pending=h.studio.setPostStatus(0,'معتمد');await Promise.resolve();post.copy='تعديل متزامن';finish({summary:'clean',issues:[]});await pending;
 assert(post.status==='مسودة'&&!post.reviewResult&&!h.workshop.isBusy());
});

test('Review context invalidates after material, exclusion or publication changes',async()=>{
 const h=await setup(),material=mat();h.ws.brandCore.materialCatalog=[material];const snapshot=h.scope.MaterialCatalog.prepareGeneration(h.ws).materials[0];const post=addPost(h,{materialIds:[material.id],materialSnapshots:[snapshot]});let stamp=h.workshop.currentStamp(h.ws,post);
 material.origin='Different';assert(h.workshop.currentStamp(h.ws,post)!==stamp);stamp=h.workshop.currentStamp(h.ws,post);
 h.scope.ContentMemory.registerPublication(h.ws,{title:'منشور آخر',ideaTitle:'زاوية أخرى',copy:'نص آخر',material:'غير محدد',publishedAt:'2000-01-01',channel:'Facebook',url:'',publishedImages:[]});assert(h.workshop.currentStamp(h.ws,post)!==stamp);
});

test('Unsaved text survives refresh and blocks destructive writer actions until saved',async()=>{
 const h=await setup(),post=addPost(h);h.element('brief-copy').value='نص لسه مش محفوظ';h.app.refreshUI();assert(h.element('brief-copy').value==='نص لسه مش محفوظ'&&h.workshop.hasUnsavedCopy());
 h.workshop.openEditor();assert(h.element('toast').textContent.includes('مش محفوظ'));
 h.confirm(false);addPost(h,{id:'post-second',copy:'نص تاني'});h.studio.selectPost(1);assert(h.studio.getSelectedPost()===post);
 h.confirm(true);h.studio.selectPost(1);assert(h.studio.getSelectedPost().id==='post-second'&&post.copy==='الهوك القديم\nتفاصيل محفوظة.');
});

test('Review UI escapes model output and long exclusion reasons stay valid',async()=>{
 const h=await setup(),post=addPost(h);h.scope.ContentMemory.applyExclusion(h.ws,{kind:'post',index:0,status:'rejected'},'ر'.repeat(2000));
 h.api.reviewPost=async()=>({summary:'<script>summary</script>',issues:[info({message:'<img onerror=alert(1)>',suggestion:'<script>bad</script>'})]});await h.workshop.openReview();
 assert(h.element('review-issues').innerHTML.includes('&lt;img')&&!h.element('review-issues').innerHTML.includes('<script>bad'));
 assert(post.reviewResult.issues.every(issue=>issue.message.length<=1500));
});

test('Versions and review results survive backup and workspace reload; malformed records fail',async()=>{
 const h=await setup(),post=addPost(h);await h.workshop.saveManualCopy(h.ws,post,'نص معدل');await h.workshop.openReview();
 const backup=await h.storage.createPortableBackup(h.app.getCurrentCompany(),h.ws),text=JSON.stringify(backup),other=await setup();
 await other.app.importBackup({target:{files:[{size:text.length,text:async()=>text}],value:'selected'}});await other.app.init();const restored=other.app.getCurrentWorkspace().calendar[0];assert(restored.revisions.length===1&&restored.reviewResult.version===1);
 for(const bad of [{...restored.revisions[0],action:'delete'},{...restored.revisions[0],fields:{copy:42}}]){let failed=false;try{h.storage.validatePostRevision(bad);}catch{failed=true;}assert(failed);}
 let failed=false;try{h.storage.validatePostReview({...restored.reviewResult,semanticStatus:'guaranteed'});}catch{failed=true;}assert(failed);
});

test('Workshop operation lock blocks switching, duplicate requests and competing mutations',async()=>{
 const h=await setup();addPost(h);let finish,calls=0;h.api.regeneratePostPart=()=>{calls++;return new Promise(resolve=>finish=resolve);};h.workshop.openEditor();const first=h.workshop.generateAlternative();
 for(let i=0;i<50&&!finish;i++)await Promise.resolve();assert(h.workshop.isBusy()&&h.element('workshop-part').disabled&&h.element('workshop-proposed').readOnly);await h.workshop.generateAlternative();assert(h.workshop.isBusy()&&calls===1);
 await h.app.switchWorkspace('other');assert(h.app.getCurrentCompany().id==='nassar-stone');finish('بديل');await first;assert(!h.workshop.isBusy());
});

test('Cached review invalidates when older publication text changes outside compact context',async()=>{
 const h=await setup(),post=addPost(h);for(let n=1;n<=35;n++)h.scope.ContentMemory.registerPublication(h.ws,{title:'عنوان محفوظ '+n,ideaTitle:'زاوية محفوظة '+n,copy:'نص قديم '+n,material:'غير محدد',publishedAt:'2000-01-01',channel:'Facebook',url:'',publishedImages:[]});
 let calls=0;h.api.reviewPost=async()=>{calls++;return{summary:'complete',issues:[]};};await h.studio.setPostStatus(0,'معتمد');assert(calls===1);
 const previous=h.ws.publicationHistory.at(-1);previous.copy=post.copy;post.status='مسودة';await h.studio.setPostStatus(0,'معتمد');assert(calls===2&&post.status==='مسودة'&&post.reviewResult.issues.some(issue=>issue.category==='similarity'));
});

test('Typing during review preserves unsaved input and prevents automatic approval',async()=>{
 const h=await setup(),post=addPost(h);let finish;h.api.reviewPost=()=>new Promise(resolve=>finish=resolve);const pending=h.studio.setPostStatus(0,'معتمد');await Promise.resolve();h.element('brief-copy').value='تعديل أثناء المراجعة';finish({summary:'clean',issues:[]});await pending;
 assert(post.status==='مسودة'&&post.copy==='الهوك القديم\nتفاصيل محفوظة.'&&h.element('brief-copy').value==='تعديل أثناء المراجعة'&&h.workshop.hasUnsavedCopy());
});

(async()=>{for(const{name,run}of tests){await run();console.log('PASS '+name);}console.log(tests.length+' phase 5 tests passed');})().catch(error=>{console.error(error);process.exitCode=1;});
