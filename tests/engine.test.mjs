import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tiny,clean} from '../dist/engine.js';
const bytes=readFileSync(new URL('../dist/TINY.BIN',import.meta.url));
const buffer=()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const model=new Tiny(buffer());
const questions=readFileSync(new URL('./questions.txt',import.meta.url),'utf8').trim().split('\n');
const expected=JSON.parse(readFileSync(new URL('./reference.json',import.meta.url),'utf8'));
let matched=0;for(let i=0;i<questions.length;i++){let answer='';for(const e of model.generate(questions[i],0))answer+=e.letter||'';if(answer===expected[i])matched++;else console.log({question:questions[i],actual:answer,expected:expected[i]});}
console.log(`Greedy reference matches: ${matched}/${questions.length}`);assert.equal(matched,questions.length);
assert.equal(clean('HELLO  '),'hello');assert.equal(clean('Hi!\n😀'),'Hi!');
for(const mutate of [b=>b.slice(0,200),b=>{new Uint8Array(b)[0]=0;return b;},b=>{const n=new Uint8Array(b.byteLength+1);n.set(new Uint8Array(b));return n.buffer;},b=>{new DataView(b).setUint16(4,0,true);return b;}])assert.throws(()=>new Tiny(mutate(buffer())));
for(const temp of [5,9]){let out='';for(const e of model.generate('what is 7 times 8',temp))out+=e.letter||'';assert(out.length<=128);}
console.log('Model validation, input cleaning, and sampling checks passed.');
