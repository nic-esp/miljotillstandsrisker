// This is a convenience gate. Public files and repository data remain public.
export const ACCESS_KEY='miljotillstandsrisker-visitor-access-v1';
export function validAccess(session,digest,now=Date.now()) {
  return Boolean(session&&session.digest===digest&&Number.isFinite(session.expiresAt)&&session.expiresAt>now);
}
export async function passwordMatches(password,digest,cryptoImpl=globalThis.crypto) {
  const bytes=await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(password));
  return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('')===digest;
}
export function initAccessGate(doc=document,win=window) {
  const gate=doc.getElementById('site-access-gate');
  if(!gate)return;
  const digest=doc.querySelector('meta[name="site-access-digest"]').content;
  const duration=Number(doc.querySelector('meta[name="site-access-hours"]').content)*3600000;
  const form=doc.getElementById('site-access-form'),input=doc.getElementById('site-access-password'),error=doc.getElementById('site-access-error'),submit=form.querySelector('button');
  let memorySession=null,timer;
  const stored=()=>{try{return JSON.parse(win.localStorage.getItem(ACCESS_KEY));}catch{return memorySession;}};
  const lock=(message='',focus=false)=>{
    win.clearTimeout(timer);memorySession=null;
    doc.documentElement.setAttribute('data-access-locked','true');
    error.textContent=message;input.value='';
    if(focus)input.focus({preventScroll:true});
  };
  const unlock=session=>{
    doc.documentElement.removeAttribute('data-access-locked');
    win.clearTimeout(timer);
    timer=win.setTimeout(()=>lock('Inloggningen har gått ut. Ange lösenordet igen.'),Math.max(1,session.expiresAt-Date.now()));
  };
  const check=()=>{const session=stored();if(validAccess(session,digest))unlock(session);else lock();};
  const logout=()=>{
    try{win.localStorage.removeItem(ACCESS_KEY);}catch{}
    lock('Du har loggat ut.',true);
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();submit.disabled=true;error.textContent='';input.removeAttribute('aria-invalid');
    try {
      if(await passwordMatches(input.value,digest)) {
        memorySession={digest,expiresAt:Date.now()+duration};
        try{win.localStorage.setItem(ACCESS_KEY,JSON.stringify(memorySession));}catch{}
        unlock(memorySession);input.value='';
        (doc.getElementById('main')||doc.querySelector('main'))?.focus({preventScroll:true});
      } else {
        error.textContent='Fel lösenord. Försök igen.';input.setAttribute('aria-invalid','true');input.value='';input.focus();
      }
    } catch {error.textContent='Lösenordet kunde inte kontrolleras. Ladda om sidan och försök igen.';}
    finally {submit.disabled=false;}
  });
  const brand=doc.querySelector('.site-brand');
  if(brand) {
    const button=doc.createElement('button');button.type='button';button.className='site-access-logout';button.textContent='Logga ut';button.addEventListener('click',logout);brand.append(button);
  }
  win.addEventListener('pageshow',check);
  win.addEventListener('storage',event=>{if(event.key===ACCESS_KEY||event.key===null)check();});
  doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)check();});
  check();
}
if(typeof document!=='undefined')initAccessGate();
