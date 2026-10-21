const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function storage(){const s={};Object.defineProperties(s,{getItem:{value:k=>s[k]??null},setItem:{value:(k,v)=>{s[k]=String(v)}},removeItem:{value:k=>{delete s[k]}}});return s;}
const disk=storage();
function app(){
 const element=()=>({style:{},setAttribute(){},replaceChildren(){},appendChild(){}});
 const context={API_BASE:'https://api',currentAppRole:'TEAM',currentTeamStudentId:'alice',localStorage:disk,
 navigator:{onLine:false,locks:{request:async(_,opts,fn)=>fn({})}},crypto:require('node:crypto').webcrypto,TextEncoder,Response,AbortController,
 document:{getElementById:element,createElement:element,body:{appendChild(){}}},setTimeout(){return 1},clearTimeout(){},
 notifySuccess(){},notifyWarning(){},notifyInfo(){},CustomEvent:class{},Blob,URL,console,loadQualifierPage(){},currentTournamentId:null};
 context.window=context;context.addEventListener=()=>{};context.dispatchEvent=()=>{};
 context.fetch=async()=>new Response(JSON.stringify({valid:true}),{status:200});
 vm.createContext(context);vm.runInContext(fs.readFileSync('frontend/static/js/core/offline-submissions.js','utf8')+'\nglobalThis.outbox=arenaOutbox;',context);return context;
}
(async()=>{
 let a=app();await a.outbox.submit('/api/qualifiers/q/submissions',{code:'return 1',language:'PYTHON'});
 assert.equal(a.outbox.rows().length,1);await a.outbox.flush();assert.equal(a.outbox.rows().length,1);
 a=app();assert.equal(a.outbox.rows().length,1,'survives reload');
 a.currentTeamStudentId='bob';assert.equal(a.outbox.rows().length,0,'account isolation');await a.outbox.flush();
 a.currentTeamStudentId='alice';
 let scheduled=0;a.setTimeout=()=>{scheduled++;return 1};
 a.navigator.locks.request=async(_,opts,fn)=>fn(null);
 await a.outbox.flush();assert.ok(scheduled>0,'busy tab lock must schedule retry');
 a.navigator.locks.request=async(_,opts,fn)=>fn({});
 a.currentTeamStudentId='alice';a.navigator.onLine=true;
 a.fetch=async()=>new Response('{}',{status:503});await a.outbox.flush();assert.equal(a.outbox.rows().length,1,'busy preserves submission');
 a.fetch=async()=>new Response('{}',{status:401});await a.outbox.flush();
 assert.equal(a.outbox.rows().length,1,'expired login preserves submission');
 assert.equal(a.outbox.rows()[0].awaitingAuth,true);
 assert.ok(!a.outbox.rows()[0].error,'login expiry must not permanently reject queued code');
 a.fetch=async()=>new Response('{}',{status:200});await a.outbox.flush();assert.equal(a.outbox.rows().length,1,'HTTP 200 without receipt must not lose code');
 a.fetch=async()=>new Response(JSON.stringify({detail:'deadline passed'}),{status:400});await a.outbox.flush();assert.equal(a.outbox.rows()[0].error,'deadline passed','no false success on rejection');
 // A successful acknowledgement alone removes the queued payload.
 const key=Object.keys(disk).find(k=>k.startsWith('arena-outbox'));const row=JSON.parse(disk[key]);row.error='';disk[key]=JSON.stringify(row);
 const originalID=row.id;
 a.fetch=async(url,init)=>{assert.equal(init.headers['X-Submission-Id'],originalID);return new Response('{"valid":true}',{status:200});};
 await a.outbox.flush();assert.equal(a.outbox.rows().length,0);
 await a.outbox.submit('/api/qualifiers/q/submissions',{code:'queued'});
 a.fetch=async()=>new Response('{"status":"QUEUED","id":"durable-id","at":123,"valid":false}',{status:202});
 let warned=false;a.notifyWarning=()=>{warned=true};
 await a.outbox.flush();
 assert.equal(a.outbox.rows().length,0,'durable 202 acknowledges receipt');
 assert.equal(warned,false,'pending verdict must not be shown as invalid');
 console.log('PASS offline: reload, account isolation, backpressure, missing receipt, deadline rejection, stable ID, acknowledgement');
})().catch(err=>{console.error(err);process.exitCode=1;});
