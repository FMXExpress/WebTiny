// Letter rules from Tiny 2.1 say_letter() and speak(); this is robot chatter,
// not speech synthesis. Durations are milliseconds, pitches are integer Hz.
const vowels = {a:[730,1090,64], e:[530,1840,56], i:[300,2290,52],
  y:[300,2290,52], o:[570,840,64], u:[320,870,56]};

export function score(text, random=Math.random) {
  const tones=[], words=[];
  let ms=0;
  function tone(hz, duration) {
    tones.push({ms, hz, duration});
    ms+=duration;
  }
  function buzz(low, high, duration, shift) {
    // The original loop rounds a 70 ms digit buzz up to 72 ms.
    for (let t=0;t<duration;t+=4) {
      tone(Math.floor(low*shift/100),2);
      tone(Math.floor(high*shift/100),2);
    }
  }
  for (let start=0, next;start<text.length;start=next) {
    let end=start;
    while (end<text.length && text[end]!==' ') end++;
    next=end;
    while (next<text.length && text[next]===' ') next++;
    const shift=115-Math.floor(30*start/(text.length+1));
    words.push({start,end,ms});
    for (let i=start;i<next;i++) {
      let c=text[i];
      if (c>='A' && c<='Z') c=c.toLowerCase();
      if (vowels[c]) buzz(...vowels[c],shift);
      else if ('szcxfhvj'.includes(c)) {
        const length='szcx'.includes(c)?46:30;
        for (let t=0;t<length;t++) tone(2500+Math.floor(random()*4500),1);
      } else if ('ptkq'.includes(c)) { tone(3200,2); ms+=18; }
      else if ('bdg'.includes(c)) { buzz(180,260,12,shift); ms+=10; }
      else if ('mn'.includes(c)) buzz(210,300,40,shift);
      else if ('lrw'.includes(c)) buzz(400,1100,36,shift);
      else if (c>='0' && c<='9') buzz(420+Number(c)*60,900+Number(c)*90,70,shift);
      else if (c===' ') ms+=45;
      else if (',-'.includes(c)) ms+=110;
      else ms+='.?!:'.includes(c)?200:20;
    }
  }
  return {tones, words, ms};
}

export function createRobotVoice({onState=()=>{}}={}) {
  let context, resumePromise, source, frame, cleanup, element=null, revision=0;
  const audioConstructor=()=>globalThis.AudioContext || globalThis.webkitAudioContext;

  function stop() {
    revision++;
    if (frame!==undefined) cancelAnimationFrame(frame);
    frame=undefined;
    const previous=source;
    source=null;
    if (previous) {
      previous.onended=null;
      try { previous.stop(); } catch { /* A failed start may leave it unstarted. */ }
      previous.disconnect();
    }
    cleanup?.();
    cleanup=null;
    const wasPlaying=element!==null;
    element=null;
    if (wasPlaying) onState(false);
  }

  async function unlock() {
    const Audio=audioConstructor();
    if (!Audio) throw new Error('This browser does not support robot voice. Text chat still works.');
    if (!context || context.state==='closed') {
      context=new Audio();
      resumePromise=null;
    }
    if (context.state!=='running') {
      if (!resumePromise) {
        resumePromise=Promise.resolve(context.resume()).finally(()=>{ resumePromise=null; });
      }
      await resumePromise;
    }
    if (context.state!=='running') throw new Error('Audio is paused. Try Play voice to enable it.');
    return true;
  }

  async function play(target, text) {
    stop();
    if (!target || !text) return false;
    const ticket=revision;
    element=target;
    onState(true);
    try {
      // Resume starts inside the caller's user gesture when possible. An answer
      // that finishes before resume does must wait, rather than disappear.
      await unlock();
      if (ticket!==revision) return false;
      if (!target.isConnected) { stop(); return false; }
      const speech=score(text);
      // Tiny's ask() plays this completion tone immediately before speak().
      const prefixMs=8;
      const tones=[{ms:0,hz:1200,duration:prefixMs},
        ...speech.tones.map(t=>({...t,ms:t.ms+prefixMs}))];
      const rate=context.sampleRate;
      const buffer=context.createBuffer(1,Math.ceil(rate*(speech.ms+prefixMs)/1000),rate);
      const samples=buffer.getChannelData(0);
      let phase=0, last=0;
      for (const {ms:start,hz,duration} of tones) {
        const begin=Math.round(start*rate/1000), end=Math.round((start+duration)*rate/1000);
        if (begin!==last) phase=0;
        for (let i=begin;i<end;i++) {
          samples[i]=phase<0.5?0.07:-0.07;
          phase=(phase+hz/rate)%1;
        }
        last=end;
      }
      source=context.createBufferSource();
      source.buffer=buffer;
      source.connect(context.destination);
      const nodes=[], fragment=document.createDocumentFragment();
      for (const [i,word] of speech.words.entries()) {
        const span=document.createElement('span');
        span.textContent=text.slice(word.start,word.end);
        fragment.append(span,text.slice(word.end,speech.words[i+1]?.start??text.length));
        nodes.push(span);
      }
      cleanup=()=>{ target.textContent=text; };
      target.replaceChildren(fragment);
      source.onended=()=>{ if (ticket===revision) stop(); };
      const began=context.currentTime;
      source.start(began);
      let index=-1;
      function highlight() {
        if (ticket!==revision) return;
        const elapsed=(context.currentTime-began)*1000-prefixMs;
        while (index+1<speech.words.length && speech.words[index+1].ms<=elapsed) {
          nodes[index]?.classList.remove('speaking-word');
          nodes[++index].classList.add('speaking-word');
        }
        frame=requestAnimationFrame(highlight);
      }
      highlight();
      return true;
    } catch (error) {
      if (ticket!==revision) return false;
      stop();
      throw error;
    }
  }

  return {unlock,stop,play,
    get supported() { return !!audioConstructor(); },
    get playing() { return element!==null; },
    get element() { return element; }
  };
}
