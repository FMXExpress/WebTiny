import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tiny} from '../dist/engine.js';
import {TinyPascal} from '../dist/engine-pascal.js';
const bytes=readFileSync(new URL('../dist/TINY.BIN',import.meta.url)),buffer=()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const js=new Tiny(buffer()),pas=new TinyPascal(buffer());
// Exact logits and monitor values, not just the same chosen answers.
for(const [p,tok] of [89,74,67,86,2,75,85,2,86,74,71,2,69,67,82,75,86,67,78,2,81,72,2,82,71,84,87,1].entries()){
 js.step(tok,p);pas.step(tok,p);assert.deepEqual(pas.score,js.score);assert.deepEqual(pas.activity,js.activity);
}
const questions=readFileSync(new URL('./questions.txt',import.meta.url),'utf8').trim().split('\n'),ref=JSON.parse(readFileSync(new URL('./reference.json',import.meta.url),'utf8'));
for(let i=0;i<questions.length;i++){let a='';for(const e of pas.generate(questions[i],0))a+=e.letter||'';assert.equal(a,ref[i],questions[i]);}
for(const Constructor of [Tiny,TinyPascal]){
 for(const b of [buffer().slice(0,200),new Uint8Array(bytes.length+1).buffer])assert.throws(()=>new Constructor(b));
 let b=buffer();new Uint8Array(b)[0]=0;assert.throws(()=>new Constructor(b));
 b=buffer();new DataView(b).setUint16(8,0,true);assert.throws(()=>new Constructor(b));
 b=buffer();new DataView(b).setFloat32(12,NaN,true);assert.throws(()=>new Constructor(b));
 const model=new Constructor(buffer());assert.throws(()=>[...model.generate('')]);
 for(const creativity of [5,9]){let out='';for(const e of model.generate('SPELL ELEPHANT',creativity))out+=e.letter||'';assert(out.length<=128-14-1);}
}
// Same PRNG sequence must sample the same letters as well.
const random=Math.random;try{for(const creativity of [5,9]){let outs=[];for(const model of [js,pas]){let seed=42;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);let out='';for(const e of model.generate('what is 7 times 8',creativity))out+=e.letter||'';outs.push(out);}assert.equal(outs[0],outs[1]);}}finally{Math.random=random;}
console.log('pas2js: 60/60 reference answers, exact logits/activity, seeded sampling, and corrupt-model checks passed.');
