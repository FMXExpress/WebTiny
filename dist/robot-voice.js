// PC-speaker letter timings from Tiny 2.1's say_letter() and speak().
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
    for (let t=0;t<duration;t+=4) {
      tone(Math.floor(low*shift/100),2);
      tone(Math.floor(high*shift/100),2);
    }
  }
  for (const match of text.matchAll(/\S+\s*|\s+/g)) {
    const start=match.index, word=match[0].trimEnd();
    const shift=115-Math.floor(30*start/(text.length+1));
    words.push({start,end:start+word.length,ms});
    for (const c of match[0].toLowerCase()) {
      if (vowels[c]) buzz(...vowels[c],shift);
      else if ('szcxfhvj'.includes(c)) {
        const length='szcx'.includes(c)?46:30;
        for (let t=0;t<length;t++) tone(2500+Math.floor(random()*4500),1);
      } else if ('ptkq'.includes(c)) { tone(3200,2); ms+=18; }
      else if ('bdg'.includes(c)) { buzz(180,260,12,shift); ms+=10; }
      else if ('mn'.includes(c)) buzz(210,300,40,shift);
      else if ('lrw'.includes(c)) buzz(400,1100,36,shift);
      else if (/[0-9]/.test(c)) buzz(420+Number(c)*60,900+Number(c)*90,70,shift);
      else if (/\s/.test(c)) ms+=45;
      else if (',-'.includes(c)) ms+=110;
      else ms+='.?!:'.includes(c)?200:20;
    }
  }
  return {tones, words, ms};
}

export function createRobotVoice() {
  let context, source, frame, cleanup;
  function stop() {
    cancelAnimationFrame(frame);
    if (source) {
      source.onended=null;
      source.stop();
      source.disconnect();
      source=null;
    }
    cleanup?.();
    cleanup=null;
  }
  return {
    // Browsers require a user gesture to unlock the output device.
    unlock() {
      try {
        const Audio=window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context ||= new Audio();
        if (context.state!=='running') context.resume().catch(()=>{});
      } catch { /* Text chat remains available if audio is unavailable. */ }
    },
    stop,
    play(element, text) {
      stop();
      if (context?.state!=='running' || !text) return;
      const {tones,words,ms}=score(text);
      const rate=context.sampleRate;
      const buffer=context.createBuffer(1,Math.ceil(rate*ms/1000),rate);
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
      const nodes=[];
      const fragment=document.createDocumentFragment();
      for (const [i,word] of words.entries()) {
        const span=document.createElement('span');
        span.textContent=text.slice(word.start,word.end);
        fragment.append(span,text.slice(word.end,words[i+1]?.start??text.length));
        nodes.push(span);
      }
      element.replaceChildren(fragment);
      cleanup=()=>{ element.textContent=text; };
      source=context.createBufferSource();
      source.buffer=buffer;
      source.connect(context.destination);
      source.onended=stop;
      const began=context.currentTime;
      source.start(began);
      let index=-1;
      function highlight() {
        const elapsed=(context.currentTime-began)*1000;
        while (index+1<words.length && words[index+1].ms<=elapsed) {
          nodes[index]?.classList.remove('speaking-word');
          nodes[++index].classList.add('speaking-word');
        }
        frame=requestAnimationFrame(highlight);
      }
      highlight();
    }
  };
}
