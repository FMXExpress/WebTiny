// JavaScript port of the TINY 2.1 transformer by WollyMonjac.
const F=Math.fround, V=97, CTX=128;
export function clean(text){let q=text.replace(/[^\x20-\x7e]/g,'').slice(0,72).trimEnd();return /[A-Z]/.test(q)&&!/[a-z]/.test(q)?q.toLowerCase():q;}
export class Tiny {
 constructor(buffer){
  const v=new DataView(buffer);let o=0;
  const need=n=>{if(o+n>v.byteLength)throw Error('TINY.BIN is too short or damaged.');};
  const u16=()=>{need(2);let n=v.getUint16(o,true);o+=2;return n;};
  const float=()=>{need(4);const n=v.getFloat32(o,true);o+=4;if(!Number.isFinite(n))throw Error('Invalid model weight.');return n;};
  need(12);if(String.fromCharCode(...new Uint8Array(buffer,0,4))!=='TNY2')throw Error('Not a TINY version 2 model.');o=4;
  this.D=u16();this.L=u16();this.H=u16();this.HID=u16();const {D,L,H,HID}=this;
  if(D<8||D>128||L<1||L>8||H<1||D%H||HID<8||HID>512)throw Error('Unsupported model dimensions.');
  this.HD=D/H;this.div=F(Math.sqrt(this.HD));
  const gains=()=>Float32Array.from({length:D},float);
  const table=(rows,cols)=>{if(rows*cols>65000)throw Error('Model table too large.');let scale=new Float32Array(rows),w=new Int8Array(rows*cols);for(let r=0;r<rows;r++){scale[r]=float();need(cols);w.set(new Int8Array(buffer,o,cols),r*cols);o+=cols;}return {rows,cols,scale,w};};
  this.emb=table(V,D);this.pos=table(CTX,D);this.layers=[];
  for(let l=0;l<L;l++)this.layers.push({g1:gains(),wq:table(D,D),wk:table(D,D),wv:table(D,D),wo:table(D,D),g2:gains(),f1:table(HID,D),f2:table(D,HID),kc:new Int8Array(CTX*D),vc:new Int8Array(CTX*D),ks:new Float32Array(CTX),vs:new Float32Array(CTX)});
  this.gf=gains();if(o!==buffer.byteLength)throw Error('TINY.BIN has the wrong size.');
  for(const k of ['x','h','q','t','a'])this[k]=new Float32Array(D);
  this.m=new Float32Array(HID);this.s=new Float32Array(CTX);this.score=new Float32Array(V);this.activity=new Float32Array(L);
 }
 mat(t,x,y){for(let r=0;r<t.rows;r++){let sum=0;for(let c=0;c<t.cols;c++)sum=F(sum+F(t.w[r*t.cols+c]*x[c]));y[r]=sum*t.scale[r];}}
 norm(x,g,y){let sum=0;for(let i=0;i<this.D;i++)sum=F(sum+F(x[i]*x[i]));const s=F(1/Math.sqrt(F(sum/this.D)+1e-5));for(let i=0;i<this.D;i++)y[i]=F(x[i]*s)*g[i];}
 store(dst,p,src){let big=1e-20;for(let i=0;i<this.D;i++)big=Math.max(big,Math.abs(src[i]));let k=F(127/big);for(let i=0;i<this.D;i++){let z=F(src[i]*k);dst[p*this.D+i]=Math.trunc(z+(z<0?-.5:.5));}return F(big/127);}
 step(tok,p){const {D,HD,H,x,h,q,t,a,m,s}=this;
  for(let i=0;i<D;i++)x[i]=F(this.emb.w[tok*D+i]*this.emb.scale[tok])+F(this.pos.w[p*D+i]*this.pos.scale[p]);
  for(let l=0;l<this.L;l++){let b=this.layers[l];this.norm(x,b.g1,h);this.mat(b.wk,h,t);b.ks[p]=this.store(b.kc,p,t);this.mat(b.wv,h,t);b.vs[p]=this.store(b.vc,p,t);this.mat(b.wq,h,q);
   for(let head=0;head<H;head++){let big=-1e30,off=head*HD;
    for(let j=0;j<=p;j++){let sum=0;for(let i=0;i<HD;i++)sum=F(sum+F(q[off+i]*b.kc[j*D+off+i]));s[j]=F(sum*b.ks[j])/this.div;big=Math.max(big,s[j]);}
    let sum=0;for(let j=0;j<=p;j++){s[j]=Math.exp(F(s[j]-big));sum=F(sum+s[j]);}a.fill(0,off,off+HD);
    for(let j=0;j<=p;j++){let z=F(F(s[j]*b.vs[j])/sum);for(let i=0;i<HD;i++)a[off+i]=F(a[off+i]+F(z*b.vc[j*D+off+i]));}
   }
   this.mat(b.wo,a,t);for(let i=0;i<D;i++)x[i]+=t[i];this.norm(x,b.g2,h);this.mat(b.f1,h,m);let act=0;for(let i=0;i<this.HID;i++){m[i]=Math.max(0,m[i]);act=F(act+m[i]);}this.activity[l]=act/this.HID;this.mat(b.f2,m,t);for(let i=0;i<D;i++)x[i]+=t[i];
  }this.norm(x,this.gf,h);this.mat(this.emb,h,this.score);
 }
 pick(creativity){let best=0;for(let i=1;i<V;i++)if(this.score[i]>this.score[best])best=i;let tok=best;
  if(creativity>0){let sum=0;for(let i=0;i<V;i++){this.s[i]=Math.exp((this.score[i]-this.score[best])/(creativity/5));if(this.s[i]<.15)this.s[i]=0;sum+=this.s[i];}let r=Math.random()*sum;for(let i=0;i<V;i++){r-=this.s[i];if(r<0){tok=i;break;}}}
  let sum=0;for(let i=0;i<V;i++)sum+=Math.exp(this.score[i]-this.score[tok]);this.confidence=1/sum;return tok;
 }
 *generate(text,creativity=0){const q=clean(text);if(!q)throw Error('Enter a question using printable English characters.');let p=0;for(;p<q.length;p++){this.step(q.charCodeAt(p)-30,p);yield {phase:'reading',progress:(p+1)/(q.length+1)};}this.step(1,p++);for(;p<CTX;p++){const tok=this.pick(creativity);if(tok<=1)return;yield {phase:'writing',letter:String.fromCharCode(tok+30),confidence:this.confidence,activity:Array.from(this.activity)};this.step(tok,p);}}
}
