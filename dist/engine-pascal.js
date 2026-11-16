import {PascalTiny} from './pascal-engine.generated.js';
import {clean} from './engine.js';
// Only lifecycle and streaming adaptation live here. All inference is Pascal.
export class TinyPascal {
 constructor(buffer){this.net=PascalTiny.$create('FromBuffer',[buffer]);for(const k of ['D','L','H','HID'])this[k]=this.net[k];}
 get score(){return this.net.Score;}
 get activity(){return this.net.Activity;}
 get confidence(){return this.net.Confidence;}
 step(tok,p){this.net.Step(tok,p);}
 pick(creativity){return this.net.Pick(creativity);}
 *generate(text,creativity=0){const q=clean(text);if(!q)throw Error('Enter a question using printable English characters.');let p=0;for(;p<q.length;p++){this.step(q.charCodeAt(p)-30,p);yield {phase:'reading',progress:(p+1)/(q.length+1)};}this.step(1,p++);for(;p<128;p++){const tok=this.pick(creativity);if(tok<=1)return;yield {phase:'writing',letter:String.fromCharCode(tok+30),confidence:this.confidence,activity:Array.from(this.activity)};this.step(tok,p);}}
}
