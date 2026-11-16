import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const worker=new Worker(new URL('./worker-harness.mjs',import.meta.url));
let queued=[],waiting=[];worker.on('message',d=>{const i=waiting.findIndex(w=>w.type===d.type);if(i>=0)waiting.splice(i,1)[0].resolve(d);else queued.push(d);});
function next(type){const i=queued.findIndex(x=>x.type===type);if(i>=0)return Promise.resolve(queued.splice(i,1)[0]);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Timed out waiting for '+type)),15000);waiting.push({type,resolve:d=>{clearTimeout(timer);resolve(d);}});});}
try{await next('booted');const b=readFileSync(new URL('../dist/TINY.BIN',import.meta.url));const buffer=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);worker.postMessage({type:'load',buffer},[buffer]);assert.equal((await next('ready')).engine,'javascript');
for(const engine of ['pascal','javascript']){queued=[];worker.postMessage({type:'engine',engine});assert.equal((await next('ready')).engine,engine);worker.postMessage({type:'ask',text:'what is the capital of peru',creativity:0});await next('done');assert.equal(queued.filter(d=>d.type==='token').map(d=>d.letter||'').join(''),'Lima.');}
worker.postMessage({type:'load',buffer:new ArrayBuffer(12)});assert.equal((await next('error')).hasModel,true);worker.postMessage({type:'engine',engine:'pascal'});await next('ready');queued=[];worker.postMessage({type:'ask',text:'name the continents',creativity:0});await next('token');worker.postMessage({type:'cancel'});assert.equal((await next('done')).cancelled,true);
console.log('Worker: JavaScript ↔ pas2js switching, model rollback, streaming and cancellation passed.');}finally{await worker.terminate();}
