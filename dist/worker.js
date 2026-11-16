import {Tiny} from './engine.js';
let model,modelBuffer,engine='javascript',cancelled=false,busy=false;
self.onmessage=async({data})=>{try{
 if(data.type==='cancel'){cancelled=true;return;}
 if(data.type==='load'||data.type==='engine'){
  if(busy)throw Error('Stop generation before changing the model or engine.');
  const nextEngine=data.engine??engine;
  if(!['javascript','pascal'].includes(nextEngine))throw Error('Unknown inference engine.');
  const buffer=data.type==='load'?data.buffer:modelBuffer;
  if(!buffer)throw Error('Load a model first.');
  const Constructor=nextEngine==='pascal'?(await import('./engine-pascal.js')).TinyPascal:Tiny;
  const next=new Constructor(buffer);model=next;modelBuffer=buffer;engine=nextEngine;
  postMessage({type:'ready',D:model.D,L:model.L,H:model.H,HID:model.HID,engine});return;
 }
 if(data.type==='ask'){
  if(!model)throw Error('Load a model first.');if(busy)throw Error('Generation is already running.');busy=true;cancelled=false;
  let count=0;const start=performance.now();try{for(const event of model.generate(data.text,data.creativity)){if(cancelled)break;count++;postMessage({type:'token',...event,speed:count/((performance.now()-start)/1000)});await new Promise(r=>setTimeout(r,0));}}finally{busy=false;}
  postMessage({type:'done',seconds:(performance.now()-start)/1000,cancelled,engine});
 }
}catch(e){postMessage({type:'error',message:e.message||String(e),engine,hasModel:!!model});}};
