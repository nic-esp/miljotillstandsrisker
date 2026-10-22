import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {addSiteAccess} from '../../../scripts/site-access.mjs';
import {ACCESS_KEY,validAccess,passwordMatches,initAccessGate} from '../../../site/assets/site-access.js';

const syntheticPassword='synthetic test phrase with åäö';
const digest=createHash('sha256').update(syntheticPassword).digest('hex');
const config={schemaVersion:1,passwordSha256:digest,sessionHours:2};
const source='<!doctype html><html lang="sv"><head><title>Test</title></head><body><main id="main">Content</main></body></html>';

function fixture(initialSession=null) {
  const element=()=>({attributes:new Map(),listeners:{},value:'',textContent:'',children:[],focused:false,
    addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(k,v){this.attributes.set(k,v);},
    removeAttribute(k){this.attributes.delete(k);},focus(){this.focused=true;},append(x){this.children.push(x);}});
  const ids=Object.fromEntries(['site-access-gate','site-access-form','site-access-password','site-access-error','main'].map(id=>[id,element()]));
  const submit=element(),brand=element(),root=element();root.setAttribute('data-access-locked','true');
  ids['site-access-form'].querySelector=selector=>selector==='button'?submit:null;
  const store=new Map(initialSession==null?[]:[[ACCESS_KEY,typeof initialSession==='string'?initialSession:JSON.stringify(initialSession)]]);
  const timers=new Map();let nextTimer=0;
  const win={listeners:{},localStorage:{getItem:key=>store.get(key)??null,setItem:(k,v)=>store.set(k,v),removeItem:key=>store.delete(key)},
    addEventListener(type,fn){this.listeners[type]=fn;},setTimeout(fn,ms){timers.set(++nextTimer,{fn,ms});return nextTimer;},clearTimeout(id){timers.delete(id);}};
  const doc={documentElement:root,hidden:false,listeners:{},getElementById:id=>ids[id]||null,createElement:element,
    querySelector:selector=>selector==='meta[name="site-access-digest"]'?{content:digest}:selector==='meta[name="site-access-hours"]'?{content:'2'}:selector==='.site-brand'?brand:selector==='main'?ids.main:null,
    addEventListener(type,fn){this.listeners[type]=fn;}};
  return {doc,win,ids,submit,brand,root,store,timers,locked:()=>root.attributes.has('data-access-locked'),submitPassword:async value=>{
    ids['site-access-password'].value=value;let prevented=false;
    await ids['site-access-form'].listeners.submit({preventDefault(){prevented=true;}});
    assert.equal(prevented,true);
  }};
}

test('password verification hashes synthetic UTF-8 input without exposing the password in HTML',async()=>{
  assert.equal(await passwordMatches(syntheticPassword,digest,webcrypto),true);
  assert.equal(await passwordMatches(syntheticPassword+' ',digest,webcrypto),false);
  assert.equal(await passwordMatches('',digest,webcrypto),false);
  await assert.rejects(passwordMatches(syntheticPassword,digest,{subtle:{digest:async()=>{throw Error('unavailable');}}}),/unavailable/);
  assert.doesNotMatch(addSiteAccess(source,config),new RegExp(syntheticPassword));
});

test('access session rejects expired, changed-password, malformed and non-numeric expiry values',()=>{
  const now=1000;
  assert.equal(validAccess({digest,expiresAt:1001},digest,now),true);
  for(const expiresAt of [0,-1,999,1000,null,undefined,false,true,'1001',NaN,Infinity])
    assert.equal(validAccess({digest,expiresAt},digest,now),false,String(expiresAt));
  assert.equal(validAccess(null,digest,now),false);
  assert.equal(validAccess({digest:'f'.repeat(64),expiresAt:2000},digest,now),false);
  assert.equal(validAccess({digest,expiresAt:2000},'e'.repeat(64),now),false);
});

test('all nested HTML entry points lock before content and resolve their own gate assets',()=>{
  for(const base of ['','../','../../']) {
    const html=addSiteAccess(source,config,base);
    assert.match(html,/<html data-access-locked="true" lang="sv">/);
    assert.ok(html.indexOf('html[data-access-locked]')<html.indexOf('<body>'));
    assert.ok(html.indexOf('id="site-access-gate"')<html.indexOf('<main'));
    assert.ok(html.includes('href="'+base+'assets/site-access.css?v=cardinal-1"'));
    assert.ok(html.includes('src="'+base+'assets/site-access.js"'));
    assert.ok(html.includes('src="'+base+'assets/cardinal-wordmark.svg"'));
    assert.match(html,/<noscript>JavaScript behöver vara aktiverat/);
    assert.match(html,/<input[^>]*type="password"[^>]*autocomplete="current-password"/);
    assert.doesNotMatch(html,/<input[^>]*name=/);
    assert.equal((html.match(/id="site-access-gate"/g)||[]).length,1);
    assert.throws(()=>addSiteAccess(html,config,base),/redan tillagd/);
  }
  for(const bad of ['',source.replace('<head>',''),source.replace('<body>',''),'<head></head><body></body>'])
    assert.throws(()=>addSiteAccess(bad,config),/dokumentstruktur/);
  for(const bad of [null,{...config,schemaVersion:2},{...config,passwordSha256:'plaintext'},{...config,sessionHours:0},{...config,sessionHours:25},{...config,sessionHours:'2'}])
    assert.throws(()=>addSiteAccess(source,bad),/Ogiltig konfiguration/);
});

test('wrong password stays locked and a correct login opens the existing page without navigating',async()=>{
  const f=fixture();initAccessGate(f.doc,f.win);
  assert.equal(f.locked(),true);
  await f.submitPassword('incorrect synthetic password');
  assert.equal(f.locked(),true);assert.match(f.ids['site-access-error'].textContent,/Fel lösenord/);
  assert.equal(f.ids['site-access-password'].value,'');assert.equal(f.submit.disabled,false);
  const before=Date.now();await f.submitPassword(syntheticPassword);
  assert.equal(f.locked(),false);assert.equal(f.ids.main.focused,true);
  const session=JSON.parse(f.store.get(ACCESS_KEY));
  assert.equal(session.digest,digest);assert.ok(session.expiresAt>=before+2*3600000);
  assert.ok(session.expiresAt<=Date.now()+2*3600000);
  assert.equal(f.ids['site-access-password'].value,'');
  assert.equal(f.store.get(ACCESS_KEY).includes(syntheticPassword),false);
  assert.equal(f.timers.size,1);
});

test('logout, invalidated sessions and back/visibility events restore the locked state',()=>{
  const f=fixture({digest,expiresAt:Date.now()+30000});initAccessGate(f.doc,f.win);
  assert.equal(f.locked(),false);assert.equal(f.brand.children.length,1);
  f.store.set(ACCESS_KEY,JSON.stringify({digest:'e'.repeat(64),expiresAt:Date.now()+30000}));
  f.win.listeners.pageshow();assert.equal(f.locked(),true);
  f.store.set(ACCESS_KEY,JSON.stringify({digest,expiresAt:Date.now()+30000}));
  f.doc.listeners.visibilitychange();assert.equal(f.locked(),false);
  f.brand.children[0].listeners.click();assert.equal(f.locked(),true);
  assert.equal(f.store.has(ACCESS_KEY),false);assert.equal(f.timers.size,0);
  assert.match(f.ids['site-access-error'].textContent,/loggat ut/);
  f.win.listeners.storage({key:ACCESS_KEY});assert.equal(f.locked(),true);
});

test('expiry timer locks an open page and malformed storage never unlocks it',()=>{
  const f=fixture({digest,expiresAt:Date.now()+30000});initAccessGate(f.doc,f.win);
  assert.equal(f.locked(),false);
  [...f.timers.values()][0].fn();assert.equal(f.locked(),true);
  assert.match(f.ids['site-access-error'].textContent,/gått ut/);
  const corrupt=fixture('{not json');initAccessGate(corrupt.doc,corrupt.win);
  assert.equal(corrupt.locked(),true);
  const absent=fixture();delete absent.ids['site-access-gate'];
  assert.doesNotThrow(()=>initAccessGate(absent.doc,absent.win));
  const css=readFileSync(new URL('../../../site/assets/site-access.css',import.meta.url),'utf8');
  assert.match(css,/@media print\{[^]*html\[data-access-locked\] body>:not\(#site-access-gate\)\{display:none!important\}/);
});
