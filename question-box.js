/* FormSubmit is a static-site mail relay. Activation is completed by the mailbox owner. */
(() => {
  'use strict';
  const form=document.getElementById('question-form');if(!form)return;
  const recipient='mesonan-2@qq.com';
  const endpoint='https://formsubmit.co/ajax/'+recipient;
  const name=document.getElementById('question-name'),email=document.getElementById('question-email'),message=document.getElementById('question-message'),permission=document.getElementById('question-public'),honey=document.getElementById('question-company');
  const send=document.getElementById('question-send'),label=send.querySelector('.send-label'),status=document.getElementById('question-status'),recovery=document.getElementById('question-recovery'),mailLink=document.getElementById('question-mailto'),count=document.getElementById('question-count');
  let busy=false,cooldownUntil=0,cooldownTimer,controller;
  const fields=[name,email,message,permission];
  function setStatus(text,state='info'){status.textContent=text;status.dataset.state=state;}
  function content(){return '称呼：'+(name.value.trim()||'匿名')+'\n回复邮箱：'+(email.value.trim()||'未提供')+'\n允许回答后公开问题：'+(permission.checked?'允许':'不允许')+'\n\n问题：\n'+message.value.trim();}
  function updateMailLink(){mailLink.href='mailto:'+recipient+'?subject='+encodeURIComponent('【安二 · 提问箱】新问题')+'&body='+encodeURIComponent(content());}
  function recoveryOn(){updateMailLink();recovery.hidden=false;}
  function busyState(value){busy=value;form.setAttribute('aria-busy',String(value));fields.forEach(field=>field.disabled=value);send.disabled=value||Date.now()<cooldownUntil;label.textContent=value?'正在发送…':'发送问题';}
  function startCooldown(){clearInterval(cooldownTimer);send.disabled=true;const tick=()=>{const seconds=Math.ceil((cooldownUntil-Date.now())/1000);if(seconds<=0){clearInterval(cooldownTimer);send.disabled=busy;label.textContent='发送问题';}else label.textContent=seconds+' 秒后可再次发送';};tick();cooldownTimer=setInterval(tick,1000);}
  function updateCount(){count.textContent=message.value.length+' / 5000';message.setCustomValidity('');if(!recovery.hidden)updateMailLink();}
  message.addEventListener('input',updateCount);name.addEventListener('input',()=>{if(!recovery.hidden)updateMailLink();});email.addEventListener('input',()=>{if(!recovery.hidden)updateMailLink();});permission.addEventListener('change',()=>{if(!recovery.hidden)updateMailLink();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||Date.now()<cooldownUntil)return;
    message.setCustomValidity(message.value.trim()?'':'请写下你想问的内容。');
    if(!form.reportValidity())return;
    if(honey.value){setStatus('暂时无法提交，请通过邮箱联系。','error');recoveryOn();return;}
    recovery.hidden=true;
    // Local-file pages have no usable website origin for the provider. Never fake a mail submission.
    if(location.protocol!=='https:'&&location.protocol!=='http:'){
      setStatus('本地预览不能直接提交。可改用邮件发送，在邮件应用中确认发送。','info');recoveryOn();return;
    }
    const payload={name:name.value.trim()||'匿名',message:message.value.trim(),'允许回答后公开问题':permission.checked?'允许':'不允许',_subject:'【安二 · 提问箱】新问题',_template:'table',_honey:'',_url:location.origin+location.pathname+'#questions'};
    if(email.value.trim()){payload.email=email.value.trim();payload._replyto=email.value.trim();}
    busyState(true);setStatus('正在提交，请稍候…');controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),signal:controller.signal,credentials:'omit'});
      let result;try{result=await response.json();}catch(_){throw new Error('unconfirmed');}
      const providerMessage=typeof result.message==='string'?result.message:'';
      if(/activat|confirm.{0,30}email|check.{0,20}(inbox|email)/i.test(providerMessage)){
        setStatus('收件邮箱尚需激活，问题内容已保留，请稍后再试。','info');recoveryOn();return;
      }
      if(!response.ok||!(result.success===true||result.success==='true')){
        setStatus(response.status===429?'提交频繁，请稍后再试。内容已保留。':'邮件服务未确认提交成功，内容已保留。请稍后重试，或改用邮件发送。','error');recoveryOn();return;
      }
      // This is acknowledgement by the relay, not a claim that the message reached the inbox.
      form.reset();updateCount();setStatus('问题已提交，谢谢你的提问。','success');window.dispatchEvent(new CustomEvent('question-submitted'));cooldownUntil=Date.now()+30000;
    }catch(error){
      setStatus(error.name==='AbortError'?'请求超时，暂时无法确认提交结果。内容已保留。':'网络连接失败，未能确认提交结果。内容已保留。','error');recoveryOn();
    }finally{clearTimeout(timer);controller=null;busyState(false);if(cooldownUntil>Date.now())startCooldown();}
  });
  async function copyText(text){
    if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(text);return true;}catch(_){}}
    const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();let ok=false;try{ok=document.execCommand('copy');}finally{area.remove();}return ok;
  }
  function notice(text){const toast=document.getElementById('toast');toast.textContent=text;toast.classList.add('visible');setTimeout(()=>toast.classList.remove('visible'),3000);}
  document.getElementById('question-copy-content').addEventListener('click',async event=>{const button=event.currentTarget;const ok=await copyText(content());button.focus({preventScroll:true});notice(ok?'已复制问题内容':'复制失败，请手动选择问题内容。');});
  document.getElementById('question-copy-link').addEventListener('click',async()=>{
    const local=location.protocol==='file:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname);
    if(local){notice('当前是本地预览，上线后可复制分享链接。');return;}
    const url=new URL(location.href);url.hash='questions';url.search='';notice(await copyText(url.href)?'已复制提问箱链接':'复制失败，请从地址栏复制链接。');
  });
  window.addEventListener('pagehide',()=>{controller?.abort();clearInterval(cooldownTimer);});
  window.addEventListener('pageshow',()=>{if(Date.now()<cooldownUntil)startCooldown();else if(!busy){send.disabled=false;label.textContent='发送问题';}});
  updateCount();
})();
