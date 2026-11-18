import test from 'node:test';
import assert from 'node:assert/strict';
import {score,createRobotVoice} from '../dist/robot-voice.js';

test('two-millisecond vowel pitches fall with word position',()=>{
  const s=score('A a');
  assert.deepEqual(s.words,[{start:0,end:1,ms:0},{start:2,end:3,ms:109}]);
  assert.deepEqual(s.tones.slice(0,2).map(t=>[t.hz,t.duration]),[[839,2],[1253,2]]);
  assert.equal(s.tones[32].hz,730);
  assert.equal(s.ms,173);
});
test('speaker hiss, stops, hums, digits and pauses retain DOS timings',()=>{
  const {tones,ms}=score('sfpkbgmn0,!',()=>0.99999);
  assert.equal(tones.filter(t=>t.hz===6999).length,76);
  assert.equal(tones.filter(t=>t.hz===3200).length,2);
  assert.equal(ms,46+30+40+44+80+72+110+200);
});


test('all vowel and consonant families preserve the C durations',()=>{
  const durations={a:64,e:56,i:52,y:52,o:64,u:56,s:46,z:46,c:46,x:46,
    f:30,h:30,v:30,j:30,p:20,t:20,k:20,q:20,b:22,d:22,g:22,
    m:40,n:40,l:36,r:36,w:36,' ':45,',':110,'-':110,'.':200,
    '!':200,'?':200,':':200,';':20};
  for (const [letter,ms] of Object.entries(durations)) {
    assert.equal(score(letter,()=>0).ms,ms,letter);
    assert.equal(score(letter.toUpperCase(),()=>0).ms,ms,letter.toUpperCase());
  }
  for (const digit of '0123456789') assert.equal(score(digit).ms,72);
  assert.equal(score('s',()=>0).tones[0].hz,2500);
  assert.equal(score('s',()=>0.999999).tones[0].hz,6999);
  assert.equal(score('\t\n').ms,40,'only literal spaces use the C 45 ms pause');
  assert.equal(score('a\na').words.length,1,'C splits words only at literal spaces');
});

function fakeBrowser(t,{suspended=false,failAt}={}) {
  const frames=new Map(),contexts=[];
  let frameId=0;
  function node(text='') {
    const classes=new Set();
    return {
      isConnected:true,children:[],value:text,
      classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)},
      get textContent(){return this.children.length?this.children.map(x=>typeof x==='string'?x:x.textContent).join(''):this.value;},
      set textContent(value){this.value=value;this.children=[];},
      replaceChildren(fragment){this.value='';this.children=fragment.children;}
    };
  }
  class AudioContext {
    constructor() {
      if(failAt==='constructor')throw new Error('audio constructor failed');
      this.state=suspended?'suspended':'running';
      this.sampleRate=48000;this.currentTime=0;this.destination={};this.sources=[];this.resumeCalls=0;
      contexts.push(this);
    }
    resume() {
      this.resumeCalls++;
      return new Promise((resolve,reject)=>{
        this.finishResume=()=>{this.state='running';resolve();};
        this.rejectResume=()=>reject(new Error('audio resume failed'));
      });
    }
    createBuffer(channels,length,rate) {
      if(failAt==='buffer')throw new Error('audio buffer failed');
      const data=new Float32Array(length);
      return {length,sampleRate:rate,getChannelData:()=>data};
    }
    createBufferSource() {
      if(failAt==='source')throw new Error('audio source failed');
      const source={started:false,stopped:false,disconnected:false,onended:null,
        connect(){},disconnect(){this.disconnected=true;},
        start(){if(failAt==='start')throw new Error('audio start failed');this.started=true;},
        stop(){this.stopped=true;}
      };
      this.sources.push(source);
      return source;
    }
  }
  const globals={AudioContext,webkitAudioContext:undefined,
    document:{createElement:()=>node(),createDocumentFragment:()=>({children:[],append(...items){this.children.push(...items);}})},
    requestAnimationFrame:callback=>{const id=++frameId;frames.set(id,callback);return id;},
    cancelAnimationFrame:id=>frames.delete(id)};
  const original=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  t.after(()=>{for(const [key,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  return {contexts,frames,node,tick(seconds){
    contexts.at(-1).currentTime=seconds;
    const callbacks=[...frames.values()];frames.clear();
    callbacks.forEach(callback=>callback());
  }};
}

test('audio waits for a shared pending resume instead of losing a fast answer',async t=>{
  const env=fakeBrowser(t,{suspended:true}),states=[];
  const voice=createRobotVoice({onState:value=>states.push(value)}),target=env.node('A a');
  const unlocking=voice.unlock(),playing=voice.play(target,'A a'),context=env.contexts[0];
  assert.equal(context.resumeCalls,1);
  assert.equal(context.sources.length,0);
  assert.equal(voice.playing,true);
  context.finishResume();
  await unlocking;
  assert.equal(await playing,true);
  assert.equal(context.sources[0].started,true);
  assert.deepEqual(states,[true]);
  voice.stop();
});

test('stop cancels a pending resume and cannot start stale audio',async t=>{
  const env=fakeBrowser(t,{suspended:true}),states=[];
  const voice=createRobotVoice({onState:value=>states.push(value)}),target=env.node('A');
  const playing=voice.play(target,'A');
  voice.stop();env.contexts[0].finishResume();
  assert.equal(await playing,false);
  assert.equal(env.contexts[0].sources.length,0);
  assert.equal(target.textContent,'A');
  assert.deepEqual(states,[true,false]);
  assert.equal(env.frames.size,0);
});

test('a newer request supersedes an earlier pending playback',async t=>{
  const env=fakeBrowser(t,{suspended:true}),voice=createRobotVoice();
  const first=env.node('First'),second=env.node('Second');
  const a=voice.play(first,'First'),b=voice.play(second,'Second');
  env.contexts[0].finishResume();
  assert.equal(await a,false);assert.equal(await b,true);
  assert.equal(env.contexts[0].sources.length,1);
  assert.equal(voice.element,second);assert.equal(first.children.length,0);
  voice.stop();
});

test('completion beep, audio-clock word highlighting, and natural cleanup',async t=>{
  const env=fakeBrowser(t),states=[];
  const voice=createRobotVoice({onState:value=>states.push(value)}),target=env.node('A a');
  assert.equal(await voice.play(target,'A a'),true);
  const source=env.contexts[0].sources[0],samples=source.buffer.getChannelData(0);
  assert.equal(source.buffer.length,Math.ceil((173+8)*48));
  assert.ok(samples[0]>0 && samples[25]<0 && samples[41]>0,'1200 Hz square-wave prefix');
  const spans=target.children.filter(x=>typeof x!=='string');
  assert.equal(spans.some(x=>x.classList.contains('speaking-word')),false);
  env.tick(0.009);assert.equal(spans[0].classList.contains('speaking-word'),true);
  env.tick(0.118);assert.equal(spans[0].classList.contains('speaking-word'),false);
  assert.equal(spans[1].classList.contains('speaking-word'),true);
  source.onended();
  assert.equal(voice.playing,false);assert.equal(voice.element,null);
  assert.equal(source.disconnected,true);assert.equal(target.textContent,'A a');
  assert.equal(target.children.length,0);assert.equal(env.frames.size,0);
  assert.deepEqual(states,[true,false]);
});

for(const failAt of ['constructor','buffer','source','start'])test(`audio ${failAt} failure restores text and inactive state`,async t=>{
  const env=fakeBrowser(t,{failAt}),voice=createRobotVoice(),target=env.node('A a');
  await assert.rejects(voice.play(target,'A a'),/audio .* failed/);
  assert.equal(voice.playing,false);assert.equal(target.textContent,'A a');
  assert.equal(target.children.length,0);assert.equal(env.frames.size,0);
  for(const source of env.contexts[0]?.sources??[])assert.equal(source.disconnected,true);
});

test('a rejected resume is recoverable and does not corrupt text',async t=>{
  const env=fakeBrowser(t,{suspended:true}),voice=createRobotVoice(),target=env.node('A');
  const result=voice.play(target,'A');
  const rejection=assert.rejects(result,/audio resume failed/);
  env.contexts[0].rejectResume();await rejection;
  assert.equal(voice.playing,false);assert.equal(target.textContent,'A');
  const retry=voice.play(target,'A');env.contexts[0].finishResume();
  assert.equal(await retry,true);voice.stop();
});

test('unsupported audio and detached content fail without stranded playback',async t=>{
  const env=fakeBrowser(t),voice=createRobotVoice(),target=env.node('A');
  target.isConnected=false;
  assert.equal(await voice.play(target,'A'),false);
  assert.equal(env.contexts[0].sources.length,0);
  globalThis.AudioContext=undefined;
  assert.equal(voice.supported,false);
  await assert.rejects(voice.play(env.node('A'),'A'),/does not support robot voice/);
  assert.equal(voice.playing,false);
});
