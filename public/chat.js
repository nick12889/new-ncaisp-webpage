(()=>{
 const panel=document.querySelector('#chat-panel'),launch=document.querySelector('.chat-launcher');if(!panel||!launch)return;
 const log=panel.querySelector('.chat-log'),form=panel.querySelector('form'),input=panel.querySelector('textarea'),send=form.querySelector('button[type=submit]')||form.querySelector('button'),status=panel.querySelector('#chat-status'),row=form.querySelector('.chat-input-row');
 let live=false,busy=false,history=[],controller;
 const GREETING="Hi, I'm Aileen from NC AI Strategy Partners. I'm happy to help you explore how AI can support your business. To get started, may I have your name?";
 const guides={start:'Start with one process that takes too long or requires repeated handovers. NCAISP can assess your systems and data, identify opportunities and agree a focused first project. Book an AI Strategy Session using the link below.',agents:'A specialised AI agent can retrieve approved knowledge, use permitted tools and help with a defined role such as research, support or operations. Important actions can require human approval. NCAISP also connects agents into wider workflows.',cost:'Pricing is scoped to the process, integrations, data and support required. We do not publish fixed prices or promise guaranteed results. A strategy session is the next step to discuss an appropriate scope.'};

 // ---- Session + lead saving (summary emails + storage happen server-side) ----
 const newId=()=>(crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2));
 let sessionId=newId(),all=[],saved=false,idleTimer;
 function finalize(beacon){
  clearTimeout(idleTimer);
  if(saved||!all.some(m=>m.role==='user'))return;
  saved=true;
  const body=JSON.stringify({session_id:sessionId,messages:all.slice(-30)});
  if(beacon&&navigator.sendBeacon)navigator.sendBeacon('/api/end-chat',new Blob([body],{type:'application/json'}));
  else fetch('/api/end-chat',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
  // any later messages start a fresh session
  sessionId=newId();all=[];saved=false;
 }
 const touch=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>finalize(false),5*60*1000)};
 window.addEventListener('pagehide',()=>finalize(true));
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')finalize(true)});

 // ---- Voice: speech to text and text to speech both run on Cloudflare Workers AI (/api/stt, /api/tts) ----
 const canRecord=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder);
 let speakReplies=false,audio=null,rec=null,stream=null,recTimer;
 const style=document.createElement('style');
 style.textContent='.chat-voice{border:1px solid currentColor;background:transparent;color:inherit;border-radius:8px;min-width:44px;cursor:pointer;font-size:1rem;opacity:.85}.chat-voice[aria-pressed=true]{background:rgba(127,127,127,.25);opacity:1}.chat-voice.listening{animation:chatPulse 1.2s infinite}@keyframes chatPulse{50%{opacity:.4}}';
 document.head.appendChild(style);
 function voiceBtn(label,text,title){const b=document.createElement('button');b.type='button';b.className='chat-voice';b.setAttribute('aria-label',label);b.setAttribute('aria-pressed','false');b.title=title;b.textContent=text;return b}
 const mic=canRecord?voiceBtn('Speak to Aileen','🎤','Speak to Aileen'):null;
 const speaker=voiceBtn('Aileen speaks replies','🔈','Aileen speaks replies');
 if(row){if(mic)row.insertBefore(mic,send);row.insertBefore(speaker,send)}
 function stopSpeaking(){if(audio){audio.pause();audio=null}}
 async function speak(text){
  if(!speakReplies)return;
  try{const r=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});if(!r.ok)throw Error();const url=URL.createObjectURL(await r.blob());audio=new Audio(url);audio.onended=()=>URL.revokeObjectURL(url);await audio.play()}
  catch{status.textContent='Voice reply unavailable. You can read the answer above.'}
 }
 speaker.addEventListener('click',()=>{speakReplies=!speakReplies;speaker.setAttribute('aria-pressed',String(speakReplies));if(!speakReplies)stopSpeaking()});
 function micOff(){clearTimeout(recTimer);mic&&(mic.classList.remove('listening'),mic.setAttribute('aria-pressed','false'));if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}}
 function stopListening(){if(rec&&rec.state!=='inactive'){try{rec.stop()}catch{}}else micOff()}
 if(mic)mic.addEventListener('click',async()=>{
  if(!live||busy)return;
  if(mic.classList.contains('listening')){stopListening();return}
  stopSpeaking();
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}catch{status.textContent='Microphone blocked. Allow access or type your question.';return}
  const chunks=[];rec=new MediaRecorder(stream);
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  rec.onstop=async()=>{
   const type=rec.mimeType||'audio/webm';micOff();
   if(!chunks.length)return;
   status.textContent='Transcribing…';
   try{const r=await fetch('/api/stt',{method:'POST',headers:{'Content-Type':type},body:new Blob(chunks,{type})});const d=await r.json();if(!r.ok)throw Error();
    if(d.text){input.value=d.text;speakReplies=true;speaker.setAttribute('aria-pressed','true');form.requestSubmit()}else status.textContent='I did not catch that. Please try again.'}
   catch{status.textContent='Voice input unavailable. Please type your question.'}
  };
  rec.start();recTimer=setTimeout(stopListening,30000);
  mic.classList.add('listening');mic.setAttribute('aria-pressed','true');status.textContent='Listening… tap the mic again to send.';
 });

 // ---- Chat UI ----
 function add(text,role){const p=document.createElement('p');p.className='chat-message '+role;p.textContent=text;log.appendChild(p);log.scrollTop=log.scrollHeight;return p}
 function controls(){input.disabled=!live||busy;send.disabled=!live||busy;if(mic)mic.disabled=!live||busy;panel.querySelectorAll('[data-guide]').forEach(b=>b.disabled=busy)}
 function close(){stopSpeaking();stopListening();panel.close();launch.focus()}
 launch.addEventListener('click',async()=>{panel.showModal();panel.querySelector('.chat-close').focus();try{const r=await fetch('/api/chat/status',{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();live=data.ready===true}catch{live=false}
  panel.querySelector('#chat-mode').textContent=live?'Aileen · AI assistant':'Aileen · Website guide';
  panel.querySelector('#chat-disclosure').textContent=live?'Ask me about NCAISP and how AI could help your business.':'Choose a topic to explore our services. Free-text chat will be available once connected.';
  status.textContent=live?'Ask about our capabilities, approach or use cases.':'Choose a topic above, or book a strategy session.';
  if(live&&history.length===0){const first=log.querySelector('.chat-message.assistant');if(first)first.textContent=GREETING;history=[{role:'assistant',content:GREETING}];all=[{role:'assistant',content:GREETING}]}
  controls()});
 panel.querySelector('.chat-close').addEventListener('click',close);panel.addEventListener('click',e=>{if(e.target===panel){const r=panel.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}});
 panel.addEventListener('close',()=>{stopSpeaking();stopListening()});
 panel.querySelector('#chat-book').addEventListener('click',()=>panel.close());
 panel.querySelectorAll('[data-guide]').forEach(b=>b.addEventListener('click',()=>{if(live){input.value=b.textContent;form.requestSubmit()}else{add(b.textContent,'user');add(guides[b.dataset.guide],'assistant')}}));
 panel.querySelector('.chat-clear').addEventListener('click',()=>{controller?.abort();finalize(false);history=[];log.replaceChildren();stopSpeaking();add(live?GREETING:'Conversation cleared. What would you like to explore?','assistant');if(live){history=[{role:'assistant',content:GREETING}];all=[{role:'assistant',content:GREETING}]}});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!busy&&live)form.requestSubmit()}});
 form.addEventListener('submit',async e=>{e.preventDefault();const question=input.value.trim();if(!question||busy||!live)return;busy=true;controls();add(question,'user');input.value='';status.textContent='Thinking…';controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),35000);
  try{const messages=[...all,{role:'user',content:question}].slice(-30);const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages}),signal:controller.signal});const data=await r.json();if(!r.ok||typeof data.reply!=='string')throw Error(data.error||'Chat is unavailable. Please try again or book a session.');
   add(data.reply,'assistant');history=[...messages,{role:'assistant',content:data.reply}];all.push({role:'user',content:question},{role:'assistant',content:data.reply});touch();status.textContent='';speak(data.reply)}
  catch(error){status.textContent=error.name==='AbortError'?'Request cancelled or timed out. You can try again.':error.message;input.value=question}
  finally{clearTimeout(timeout);busy=false;controls();input.focus()}});
})();
