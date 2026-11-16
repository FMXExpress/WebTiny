import assert from 'node:assert/strict';
import {parse,analyze,split,jsonl,csv,zip,bundle} from '../dist/dataset-core.js';
const row=(q,a='A.',fact_id='')=>({question:q,answer:a,fact_id,category:'test',source:'owner'});
const records=[row('question one','A.','fact'),row('wording two','A.','fact'),row('third question','B.')];
assert.deepEqual(parse(csv(records),'csv'),records);
assert.deepEqual(parse(JSON.stringify({records}),'json'),records);
assert.equal(parse(jsonl(records),'jsonl').length,3);
assert.equal(parse('question,answer\r\n"a,b","say ""hello"""','csv')[0].answer,'say "hello"');
assert.throws(()=>parse('question,answer\n"bad','csv'));
assert.throws(()=>parse('{"question":4,"answer":"a"}','jsonl'));
assert.throws(()=>parse('question,answer\na,b,c','csv'));
assert.equal(analyze([row('a'.repeat(72),'b'.repeat(55))]).invalid,0);
for(const r of [row('a'.repeat(73)),row('q','x'.repeat(127)),row('q','café'),row('q\n'),row('','a')])assert.equal(analyze([r]).invalid,1);
assert.equal(analyze([row('HI'),row('hi')]).invalid,2);
assert.match(analyze([row('HI'),row('hi','Other.')]).issues[0][0],/Conflicting/);
const many=Array.from({length:100},(_,i)=>row('question '+i));
const s=split(many);assert.equal(Object.values(s).flat().length,100);assert(s.train.length&&s.validation.length&&s.test.length);assert.deepEqual(s,split(many));
for(let seed=0;seed<20;seed++){const sets=split(records,{validation:25,test:25,seed:String(seed)});assert(Object.values(sets).some(rows=>rows.some(r=>r.question==='question one')&&rows.some(r=>r.question==='wording two')));}
assert.throws(()=>split(records,{validation:50,test:50}));assert.throws(()=>bundle([],{}));
const files=bundle(many,{validation:10,test:10,seed:'test'});assert.equal(Object.keys(files).length,6);assert.equal(JSON.parse(files['project.json']).records.length,100);
// Verify the ZIP with an independent reader, including CRCs and Unicode metadata.
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';const dir=mkdtempSync(join(tmpdir(),'tiny-dataset-'));try{writeFileSync(join(dir,'data.zip'),zip({...files,'unicode.txt':'Source: café'}));execFileSync('python',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.read("unicode.txt").decode()=="Source: café"',join(dir,'data.zip')]);}finally{rmSync(dir,{recursive:true});}
console.log('Dataset parsing, limits, duplicate/conflict detection, grouped splits, and ZIP export passed.');
