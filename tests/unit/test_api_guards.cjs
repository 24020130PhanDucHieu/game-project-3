const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const storage = () => {
  const data = new Map();
  return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
};
(async () => {
  const calls=[];
  let resolve;
  const context={URL,Headers,Request,Response,Map,Date,performance,Event,
    localStorage:storage(),sessionStorage:storage(),
    location:{href:'https://arena.test/',origin:'https://arena.test',hostname:'arena.test',protocol:'https:'},
    dispatchEvent(){},fetch:(url,init)=>{calls.push({url,init});return new Promise(r=>{resolve=r;});}};
  context.window=context;
  context.sessionStorage.setItem('arenaSessionToken','secret');
  context.localStorage.setItem('ARENA_API_URL','https://attacker.invalid');
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('frontend-cu/static/js/core/api.js','utf8'),context);
  assert.equal(context.localStorage.getItem('ARENA_API_URL'),null,'untrusted stored API host must be discarded');
  const opts={method:'POST',headers:{'Content-Type':'application/json'},body:'{"score":3}'};
  const first=context.fetch('/api/test',opts), second=context.fetch('/api/test',opts);
  assert.equal(calls.length,1,'double click must send one request');
  assert.equal(calls[0].init.headers.get('Authorization'),'Bearer secret');
  resolve(new Response('{"ok":true}',{headers:{Date:new Date().toUTCString()}}));
  assert.deepEqual(await (await first).json(),{ok:true});
  assert.deepEqual(await (await second).json(),{ok:true},'each caller can consume its response');
  const external=context.fetch('https://arena.test.attacker.invalid/api/test',opts);
  assert.equal(calls[1].init.headers.Authorization,undefined,'token cannot follow a hostname prefix');
  resolve(new Response('{}'));await external;
  const retry=context.fetch('/api/test',opts);
  assert.equal(calls.length,3,'completed request must not suppress a later intentional request');
  resolve(new Response('{}',{status:401}));await retry;
  assert.equal(context.sessionStorage.getItem('arenaSessionToken'),null);
  console.log('PASS duplicate write guard, independent response bodies, exact API origin and expired session');
})().catch(error=>{console.error(error);process.exitCode=1;});
