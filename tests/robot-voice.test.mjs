import test from 'node:test';
import assert from 'node:assert/strict';
import {score} from '../dist/robot-voice.js';

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
