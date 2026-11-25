const PostWorkshop = (() => {
  const PARTS = { hook: { field:'copy', label:'الهوك — أول سطر', limit:300 }, copy:{field:'copy',label:'نص البوست كامل',limit:50000}, visual:{field:'visualDirection',label:'تصور الصورة',limit:12000}, brief:{field:'designerBrief',label:'بريف الديزاينر',limit:12000} };
  const ACTIONS={'manual-copy':'تعديل النص','regenerate-hook':'تغيير الهوك','regenerate-copy':'تغيير النص','regenerate-visual':'تغيير تصور الصورة','regenerate-brief':'تغيير البريف','restore':'استرجاع نسخة'};
  const CATEGORIES={structure:'اكتمال المحتوى',dialect:'اللهجة',rules:'قواعد البراند',material:'بيانات الخامة',claims:'الادعاءات',similarity:'التشابه',review:'حدود المراجعة'};
  let busy=false, editor=null, reviewTarget=null, approvalTarget=null, renderedPost=null, renderedCopy='';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isBusy=()=>busy;
  const selected=()=>ContentStudio.getSelectedPost();
  function hasUnsavedCopy(){const post=selected(),input=document.getElementById('brief-copy');return Boolean(post&&post===renderedPost&&input&&input.value!==renderedCopy&&input.value!==String(post.copy||''));}
  function requireSavedCopy(){if(hasUnsavedCopy())throw new Error('في تعديل نص مش محفوظ. احفظه الأول عشان مايضيعش.');}
  function canLeave(){if(!hasUnsavedCopy())return true;if(!confirm('في تعديل نص مش محفوظ. سيب التعديل وانتقل؟'))return false;const input=document.getElementById('brief-copy');renderedCopy=String(renderedPost.copy||'');input.value=renderedCopy;return true;}
  function renderCopy(post){const input=document.getElementById('brief-copy');if(!input)return;
    if(!post){input.value='';renderedPost=null;renderedCopy='';return;}
    const saved=String(post.copy||'');
    if(renderedPost!==post||input.value===renderedCopy||input.value===saved){input.value=saved;renderedCopy=saved;renderedPost=post;}
  }
  function idle(){if(busy||ContentStudio.isGenerating()||ContentMemory.isBusy()||AssetLibrary.isBusy()||MaterialCatalog.isBusy()||App.isWorkspaceBusy())throw new Error('استنى لحد ما العملية الحالية تخلص.');}
  function editable(post){return {copy:String(post.copy||''),visualDirection:String(post.visualDirection||''),designerBrief:String(post.designerBrief||'')};}
  function normalize(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[\u0640\u064B-\u065F\u0670]/g,'').replace(/[أإآٱ]/g,'ا').replace(/[^\p{L}\p{N}]/gu,'');}
  function facts(material){return {id:material.id,name:material.name,brand:material.brand,model:material.model,origin:material.origin,uses:[...(material.uses||[])].sort(),approvedFacts:[...(material.approvedFacts||[])].sort()};}
  function reviewInput(workspace,post){
    ContentMemory.ensure(workspace);MaterialCatalog.ensure(workspace);
    const ids=post.materialIds||[],catalog=workspace.brandCore.materialCatalog.filter(item=>ids.includes(item.id)).map(item=>({...facts(item),status:item.status,source:item.source}));
    const related=workspace.ideas.find(idea=>AIEngine.matchesIdea(idea,post));
    const history={...workspace,publicationHistory:(workspace.publicationHistory||[]).filter(entry=>entry.sourcePostId!==post.id)};
    return {post:{title:post.title||'',...editable(post),material:post.material||'',materialIds:ids,materialSnapshots:(post.materialSnapshots||[]).map(facts),referenceImages:clone(post.referenceImages||[])},
      brand:{identity:workspace.brandCore.identity,tone:workspace.brandCore.tone,rules:(workspace.brandCore.rules||[]).slice(0,15)},catalog,
      excluded:workspace.ideas.filter(idea=>AIEngine.exclusionLabel(idea)).map(idea=>({id:idea.id,title:idea.title,status:idea.status,reason:idea.exclusionReason||''})),
      angle:{title:related?.title||post.ideaTitle||post.title||'',excluded:related?AIEngine.exclusionLabel(related):'',saturation:related?.saturation||0,reason:related?.exclusionReason||''},
      publishedMemory:ContentMemory.historyContext(history),semanticConfigured:Boolean(StorageEngine.getConfig().geminiKey)};
  }
  function currentStamp(workspace,post){const input=reviewInput(workspace,post);const fullHistory=(workspace.publicationHistory||[]).filter(entry=>!entry.voided&&entry.sourcePostId!==post.id).map(entry=>[entry.id,entry.title,entry.copy,entry.ideaTitle,entry.publishedAt,entry.channel]);const text=JSON.stringify([input,fullHistory]);let a=2166136261,b=2246822519;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489917);}return 'review-v1-'+text.length+'-'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16);}
  function localIssues(workspace,post){const result=[];
    const add=(category,severity,message,evidence='',suggestion='')=>result.push({category,severity,message:message.slice(0,1500),evidence:evidence.slice(0,500),suggestion:suggestion.slice(0,1500),source:'local'});
    if(!String(post.copy||'').trim())add('structure','warning','نص البوست فاضي. راجع إن ده مقصود للمحتوى المرئي.');
    const ids=post.materialIds||[],catalog=MaterialCatalog.ensure(workspace);
    if(!ids.length&&post.material&&!['غير محدد','عام','-'].includes(post.material))add('material','warning','اسم خامة من غير ربط ببطاقة معتمدة. راجع بياناته قبل الاعتماد.',post.material);
    for(const id of ids){const material=catalog.find(item=>item.id===id),snapshot=(post.materialSnapshots||[]).find(item=>item.id===id);
      if(!material||material.status!=='approved'){add('material','error','خامة مرتبطة بالبوست مش معتمدة في الكتالوج الحالي.',id);continue;}
      const gaps=MaterialCatalog.missing(material);if(gaps.length)add('material','warning','في بيانات ناقصة في بطاقة «'+material.name+'». ممنوع اعتبار الناقص مواصفات مؤكدة.');
      if(!snapshot||JSON.stringify(facts(snapshot))!==JSON.stringify(facts(material)))add('material','warning','بيانات بطاقة «'+material.name+'» اتغيرت أو نسخة البوست ناقصة. راجع النص على البيانات الحالية.');
    }
    const duplicate=(workspace.publicationHistory||[]).find(entry=>!entry.voided&&entry.sourcePostId!==post.id&&((normalize(post.title)&&normalize(post.title)===normalize(entry.title))||(normalize(post.copy)&&normalize(post.copy)===normalize(entry.copy))));
    if(duplicate)add('similarity','error','في عنوان أو نص مطابق لمنشور مسجّل: '+duplicate.title,normalize(post.copy)===normalize(duplicate.copy)?post.copy:post.title,'استخدم معالجة وعنوان مختلفين.');
    const angle=workspace.ideas.find(idea=>AIEngine.matchesIdea(idea,post));
    if(angle&&AIEngine.exclusionLabel(angle))add('rules','error','الزاوية مستبعدة يدويًا: '+(angle.exclusionReason||'السبب غير مسجّل'),angle.title);
    else if(angle?.saturation>=75)add('similarity','warning','تشبع الزاوية وصل '+angle.saturation+'%. راجع المسافة الإبداعية.',angle.title);
    const formal=String(post.copy||'').match(/(?:^|[\s،.؟!])(يرجى|يمكنكم|سوف|لماذا|اكتشفوا)(?=$|[\s،.؟!])/);
    if(formal)add('dialect','warning','في تعبير محتاج مراجعة لو النص مطلوب بالمصري.',formal[1]);
    return result;
  }
  function modelIssues(raw,post){if(!raw||typeof raw.summary!=='string'||raw.summary.length>2000||!Array.isArray(raw.issues)||raw.issues.length>30)throw new Error('تنسيق المراجعة الدلالية غير صالح.');
    const text=[post.title,...Object.values(editable(post))].join('\n');
    return raw.issues.map(issue=>{
      if(!issue||!['structure','dialect','rules','material','claims','similarity'].includes(issue.category)||!['error','warning','info'].includes(issue.severity)||typeof issue.message!=='string'||!issue.message.trim()||issue.message.length>1500||typeof issue.evidence!=='string'||issue.evidence.length>500||typeof issue.suggestion!=='string'||issue.suggestion.length>1500)throw new Error('ملاحظات المراجعة الدلالية غير صالحة.');
      return {category:issue.category,severity:issue.severity,message:issue.message,evidence:issue.evidence&&text.includes(issue.evidence)?issue.evidence:'',suggestion:issue.suggestion,source:'model'};
    });
  }
  async function review(workspace,post,force=false){const stamp=currentStamp(workspace,post);
    if(!force&&post.reviewResult?.version===1&&post.reviewResult.semanticStatus==='complete'&&post.reviewResult.stamp===stamp)return clone(post.reviewResult);
    const input=reviewInput(workspace,post),issues=localIssues(workspace,post);let semanticStatus='complete',summary='';
    try{const raw=await AIEngine.reviewPost(input);issues.push(...modelIssues(raw,post));summary=raw.summary;}
    catch(error){semanticStatus='unavailable';summary='المراجعة الدلالية مش متاحة. النتائج الظاهرة فحص محلي فقط.';issues.push({category:'review',severity:'warning',message:('اللهجة والقواعد والادعاءات والتشابه في المعنى محتاجين مراجعة يدوية. '+StorageEngine.describeError(error)).slice(0,1500),evidence:'',suggestion:'راجع المحتوى بنفسك أو أعد المراجعة بعد حل مشكلة الاتصال أو المفتاح.',source:'local'});}
    if(currentStamp(workspace,post)!==stamp)throw new Error('البوست أو بيانات مراجعته اتغيرت أثناء المراجعة. أعد المراجعة على النسخة الحالية.');
    const result={version:1,stamp,reviewedAt:new Date().toISOString(),semanticStatus,summary,issues};StorageEngine.validatePostReview(result);return result;
  }
  function validatePatch(changes){const limits={copy:50000,visualDirection:12000,designerBrief:12000};const keys=Object.keys(changes);
    if(!keys.length||keys.some(key=>!Object.hasOwn(limits,key)||typeof changes[key]!=='string'||changes[key].length>limits[key]))throw new Error('التعديل خارج الجزء المسموح أو النص طويل زيادة.');
  }
  function applyChange(workspace,post,changes,action){validatePatch(changes);if(!workspace.calendar.includes(post))throw new Error('البوست مش موجود في مساحة العمل.');
    if(!['manual-copy','regenerate-hook','regenerate-copy','regenerate-visual','regenerate-brief','restore'].includes(action))throw new Error('نوع تعديل البوست غير صالح.');
    if(Object.keys(changes).every(key=>String(post[key]||'')===changes[key]))return false;
    const revision={id:'rev-'+crypto.randomUUID(),createdAt:new Date().toISOString(),action,originalStatus:post.status||'مسودة',fields:editable(post)};StorageEngine.validatePostRevision(revision);
    if(!post.revisions)post.revisions=[];post.revisions.push(revision);Object.assign(post,changes);delete post.reviewResult;
    if(['معتمد','اتعمل'].includes(post.status))post.status='مسودة';
    return true;
  }
  function hookRange(copy){const lines=String(copy||'').split(/\r?\n/);let offset=0;for(const line of lines){if(line.trim())return{start:offset,end:offset+line.length};offset+=line.length+(String(copy).slice(offset+line.length,offset+line.length+2)==='\r\n'?2:1);}return{start:0,end:String(copy||'').length};}
  function partText(post,part){if(!PARTS[part])throw new Error('جزء البوست غير صالح.');const value=String(post[PARTS[part].field]||'');if(part!=='hook')return value;const range=hookRange(value);return value.slice(range.start,range.end);}
  function partPatch(post,part,text){if(!PARTS[part]||typeof text!=='string'||!text.trim()||text.length>PARTS[part].limit||(part==='hook'&&/[\r\n]/.test(text)))throw new Error('البديل غير صالح. الهوك سطر واحد، وحدود النص ظاهرة حسب الجزء.');
    if(part==='hook'){const copy=String(post.copy||''),range=hookRange(copy);return{copy:copy.slice(0,range.start)+text+copy.slice(range.end)};}
    return{[PARTS[part].field]:text};
  }
  async function regenerationInputs(workspace,post){const ids=post.materialIds||[];let materials=[];
    if(ids.length){const scoped={...workspace,brandCore:{...workspace.brandCore,materialScope:'selected',selectedMaterialIds:[...ids]}};materials=MaterialCatalog.prepareGeneration(scoped).materials;
      for(const material of materials){const old=(post.materialSnapshots||[]).find(item=>item.id===material.id);if(!old||JSON.stringify(facts(old))!==JSON.stringify(facts(material)))throw new Error('بيانات خامة البوست اتغيرت. راجع البوست والكتالوج قبل إعادة توليد جزء منه.');}}
    const owner=App.getWorkspaceCompanyId(workspace),references=await Promise.all((post.referenceImages||[]).map(async ref=>({...clone(ref),image:await StorageEngine.loadReferenceImage(owner,ref.id)})));
    return {materials,references,context:reviewInput(workspace,post)};
  }
  function show(id){const modal=document.getElementById(id);modal.classList.remove('hidden');modal.classList.add('flex');}
  function hide(id){const modal=document.getElementById(id);modal.classList.add('hidden');modal.classList.remove('flex');}
  function openEditor(){try{idle();requireSavedCopy();const post=selected();if(!post)throw new Error('اختار بوست الأول.');const workspace=App.getCurrentWorkspace();editor={workspace,post,owner:App.getWorkspaceCompanyId(workspace),proposal:null};document.getElementById('workshop-note').value='';document.getElementById('workshop-part').value='copy';updatePart();show('post-workshop-editor');}catch(error){App.showError(error);}}
  function setEditorBusy(value){document.getElementById('workshop-part').disabled=value;document.getElementById('workshop-note').disabled=value;document.getElementById('workshop-proposed').readOnly=value;}
  function closeEditor(){if(busy)return;editor=null;hide('post-workshop-editor');}
  function updatePart(){if(!editor||busy)return;const part=document.getElementById('workshop-part').value;if(!PARTS[part])return;editor.proposal=null;document.getElementById('workshop-current').value=partText(editor.post,part);document.getElementById('workshop-proposed').value='';document.getElementById('workshop-proposed').maxLength=PARTS[part].limit;document.getElementById('workshop-status').textContent='التعديل على «'+PARTS[part].label+'» فقط. باقي الأجزاء محفوظة.';document.getElementById('btn-apply-workshop').disabled=true;}
  async function generateAlternative(){let acquired=false;try{idle();requireSavedCopy();if(!editor)return;const current=editor,part=document.getElementById('workshop-part').value,note=document.getElementById('workshop-note').value.trim();if(!PARTS[part]||note.length>2000)throw new Error('اختار جزء صالح وملاحظة لحد 2000 حرف.');
    const stamp=currentStamp(current.workspace,current.post);busy=true;acquired=true;setEditorBusy(true);document.getElementById('workshop-status').textContent='جاري توليد بديل للجزء المختار...';const inputs=await regenerationInputs(current.workspace,current.post);
    const text=await AIEngine.regeneratePostPart(current.post,part,note,inputs);partPatch(current.post,part,text);
    if(editor!==current||currentStamp(current.workspace,current.post)!==stamp)throw new Error('البوست أو بياناته اتغيرت. الاقتراح لم يتطبق.');
    current.proposal={part,text,stamp};document.getElementById('workshop-proposed').value=text;document.getElementById('btn-apply-workshop').disabled=false;document.getElementById('workshop-status').textContent='البديل جاهز للمراجعة. التطبيق بيحفظ نسخة من الحالة الحالية.';
  }catch(error){document.getElementById('workshop-status').textContent=StorageEngine.describeError(error);App.showError(error);}finally{if(acquired){busy=false;setEditorBusy(false);}}}
  async function applyAlternative(){let acquired=false;try{idle();requireSavedCopy();if(!editor?.proposal)throw new Error('ولّد بديل الأول.');const current=editor,proposal=current.proposal;
    if(currentStamp(current.workspace,current.post)!==proposal.stamp)throw new Error('البوست أو بياناته اتغيرت. ولّد بديل على النسخة الحالية.');
    const changes=partPatch(current.post,proposal.part,document.getElementById('workshop-proposed').value);busy=true;acquired=true;setEditorBusy(true);await App.checkpoint(current.workspace);
    const changed=applyChange(current.workspace,current.post,changes,'regenerate-'+proposal.part);if(changed)await App.persistWorkspace(current.workspace);busy=false;closeEditor();App.refreshUI();App.showToast(changed?'تم تطبيق الجزء وحفظ النسخة السابقة':'البديل مطابق للنص الحالي');
  }catch(error){App.showError(error);}finally{if(acquired){busy=false;setEditorBusy(false);}}}
  async function saveManualCopy(workspace,post,text){let acquired=false;try{idle();validatePatch({copy:text});busy=true;acquired=true;if(String(post.copy||'')===text){App.showToast('النص محفوظ بالفعل');return;}
    await App.checkpoint(workspace);applyChange(workspace,post,{copy:text},'manual-copy');await App.persistWorkspace(workspace);App.refreshUI();App.showToast('تم حفظ النص ونسخته السابقة');
  }catch(error){App.showError(error);}finally{if(acquired)busy=false;}}
  async function restoreVersion(){let acquired=false;try{idle();requireSavedCopy();const workspace=App.getCurrentWorkspace(),post=selected(),id=document.getElementById('post-revision-selector').value;const revision=post?.revisions?.find(item=>item.id===id);if(!revision)throw new Error('اختار نسخة محفوظة.');
    if(!confirm('استرجاع النص والبريف وتصور الصورة من النسخة؟ الحالة الحالية بتتحفظ كمان.'))return;const changes=clone(revision.fields);validatePatch(changes);busy=true;acquired=true;await App.checkpoint(workspace);const changed=applyChange(workspace,post,changes,'restore');if(changed)await App.persistWorkspace(workspace);App.refreshUI();App.showToast(changed?'تم استرجاع النسخة وحفظ الحالة السابقة':'النسخة مطابقة للحالية');
  }catch(error){App.showError(error);}finally{if(acquired)busy=false;}}
  function showReview(workspace,post,result,forApproval){reviewTarget={workspace,post,owner:App.getWorkspaceCompanyId(workspace),stamp:result.stamp};approvalTarget=forApproval?reviewTarget:null;
    document.getElementById('review-heading').textContent='مراجعة: '+post.title;document.getElementById('review-summary').textContent=result.summary;
    document.getElementById('review-semantic-status').textContent=result.semanticStatus==='complete'?'المراجعة الدلالية اتنفذت؛ النتيجة مساعدة لمراجعتك.':'المراجعة الدلالية غير متاحة؛ النتائج فحص محلي فقط.';
    document.getElementById('review-issues').innerHTML=result.issues.length?result.issues.map(issue=>`<li class="p-3 border border-borderSubtle rounded-lg space-y-1"><p class="font-bold text-xs">${CATEGORIES[issue.category]} · ${issue.severity==='error'?'مشكلة':issue.severity==='warning'?'ملاحظة':'معلومة'} · ${issue.source==='local'?'فحص محلي':'تقييم الذكاء الاصطناعي'}</p><p class="text-xs">${escape(issue.message)}</p>${issue.evidence?`<blockquote class="text-xs text-muted">${escape(issue.evidence)}</blockquote>`:''}${issue.suggestion?`<p class="text-xs text-bronze">${escape(issue.suggestion)}</p>`:''}</li>`).join(''):'<li class="text-xs">المراجعة الحالية ما سجّلتش ملاحظات. راجع النص قبل استخدامه.</li>';
    document.getElementById('btn-approve-review').classList.toggle('hidden',!forApproval);show('post-review-dialog');}
  function closeReview(){if(busy)return;reviewTarget=null;approvalTarget=null;hide('post-review-dialog');}
  async function runAndStore(workspace,post,force){const result=await review(workspace,post,force);if(App.getCurrentWorkspace()!==workspace||!workspace.calendar.includes(post))throw new Error('البوست أو مساحة العمل اتغيروا أثناء المراجعة.');post.reviewResult=result;await App.persistWorkspace(workspace);App.refreshUI();return result;}
  async function openReview(force=false){let acquired=false;try{idle();requireSavedCopy();const post=reviewTarget?.post||selected(),workspace=reviewTarget?.workspace||App.getCurrentWorkspace();if(!post)throw new Error('اختار بوست الأول.');busy=true;acquired=true;document.getElementById('post-review-state').textContent='جاري المراجعة...';const result=await runAndStore(workspace,post,force);showReview(workspace,post,result,Boolean(approvalTarget));}catch(error){App.showError(error);}finally{if(acquired)busy=false;}}
  async function requestApproval(workspace,post){let acquired=false;try{idle();requireSavedCopy();busy=true;acquired=true;document.getElementById('post-review-state').textContent='جاري مراجعة الاعتماد...';const result=await runAndStore(workspace,post,false);requireSavedCopy();
    if(result.semanticStatus==='complete'&&!result.issues.some(issue=>['error','warning'].includes(issue.severity)))return true;
    showReview(workspace,post,result,true);return false;
  }catch(error){App.showError(error);return false;}finally{if(acquired)busy=false;}}
  async function approveWithNotes(){try{idle();requireSavedCopy();const target=approvalTarget;if(!target||App.getCurrentWorkspace()!==target.workspace||!target.workspace.calendar.includes(target.post)||currentStamp(target.workspace,target.post)!==target.stamp||target.post.reviewResult?.stamp!==target.stamp)throw new Error('المراجعة تخص نسخة قديمة. أعد مراجعة النسخة الحالية.');
    const index=target.workspace.calendar.indexOf(target.post),stamp=target.stamp;closeReview();await ContentStudio.setPostStatus(index,'معتمد',{confirmedStamp:stamp});
  }catch(error){App.showError(error);}}
  function approvalConfirmed(workspace,post,stamp){return Boolean(stamp&&post.reviewResult?.version===1&&post.reviewResult.stamp===stamp&&currentStamp(workspace,post)===stamp);}
  function render(workspace,post){if(editor&&editor.owner!==App.getWorkspaceCompanyId(workspace))closeEditor();if(reviewTarget&&reviewTarget.owner!==App.getWorkspaceCompanyId(workspace))closeReview();
    const select=document.getElementById('post-revision-selector');if(select){const previous=select.value;const revisions=post?.revisions||[];select.innerHTML='<option value="">نسخ سابقة: '+revisions.length+'</option>'+[...revisions].reverse().map(revision=>`<option value="${revision.id}">${escape(new Date(revision.createdAt).toLocaleString('ar-EG',{timeZone:'Africa/Cairo'}))} · ${ACTIONS[revision.action]}</option>`).join('');if(revisions.some(revision=>revision.id===previous))select.value=previous;}
    const state=document.getElementById('post-review-state');if(!state)return;if(!post){state.textContent='';return;}
    if(hasUnsavedCopy()){state.textContent='تعديل نص غير محفوظ — نتيجة المراجعة تخص النص المحفوظ.';return;}
    const result=post.reviewResult;if(!result){state.textContent='البوست بدون مراجعة محفوظة.';return;}
    if(result.stamp!==currentStamp(workspace,post)){state.textContent='نتيجة المراجعة قديمة بعد تغيير المحتوى أو بياناته.';return;}
    state.textContent=(result.semanticStatus==='complete'?'مراجعة دلالية محفوظة':'فحص محلي فقط')+' · '+result.issues.filter(issue=>issue.severity!=='info').length+' ملاحظة';
  }
  function markDirty(){const post=selected();if(post)render(App.getCurrentWorkspace(),post);}
  return {PARTS,isBusy,hasUnsavedCopy,requireSavedCopy,canLeave,renderCopy,currentStamp,reviewInput,localIssues,review,applyChange,partText,partPatch,regenerationInputs,openEditor,closeEditor,updatePart,generateAlternative,applyAlternative,saveManualCopy,restoreVersion,openReview,closeReview,requestApproval,approveWithNotes,approvalConfirmed,render,markDirty};
})();
