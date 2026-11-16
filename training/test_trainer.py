import json
from pathlib import Path
import tempfile
import torch
from train import Tiny, load_bin, export_bin, answer, read_pairs, loss

torch.set_num_threads(2)
torch.manual_seed(42)
root = Path(__file__).resolve().parents[1]
model = load_bin(root/'dist/TINY.BIN')
questions = (root/'tests/questions.txt').read_text().splitlines()
expected = json.loads((root/'tests/reference.json').read_text())
for i in [0, 1, 8, 14, 59]:
    actual = answer(model, questions[i])
    assert actual == expected[i], (questions[i], actual, expected[i])
print('PyTorch inference matches 5 representative C reference answers', flush=True)
with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp)/'TINY.BIN'
    export_bin(model, out)
    again = load_bin(out)
    assert out.stat().st_size == 381808
    assert answer(again, questions[0]) == expected[0]
    # The exported model also runs in the independent JavaScript engine.
    import subprocess
    script = "import {readFileSync} from 'node:fs';import {Tiny} from './dist/engine.js';const b=readFileSync(process.argv[1]);const m=new Tiny(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));const q=readFileSync('./tests/questions.txt','utf8').trim().split('\\n');const ref=JSON.parse(readFileSync('./tests/reference.json','utf8'));for(let i=0;i<q.length;i++){let a='';for(const e of m.generate(q[i],0))a+=e.letter||'';if(a!==ref[i])throw Error(q[i]+': '+a);}console.log('Re-exported model: JavaScript matches all 60 C answers');"
    subprocess.run(['node', '--input-type=module', '-e', script, str(out)], cwd=root, check=True)
    bad = Path(tmp)/'bad.bin'
    for data in [b'bad', out.read_bytes()[:-1], out.read_bytes()+b'x']:
        bad.write_bytes(data)
        try:
            load_bin(bad)
            raise AssertionError('Bad model accepted')
        except ValueError:
            pass
    data = Path(tmp)/'pairs.jsonl'
    data.write_text('{"question":"hi","answer":"Hello."}\n')
    pairs = read_pairs(data)
    small = Tiny(16, 1, 2, 32)
    opt = torch.optim.AdamW(small.parameters(), lr=.01)
    initial = loss(small, pairs, 'cpu').item()
    for _ in range(180):
        opt.zero_grad()
        value = loss(small, pairs, 'cpu')
        value.backward()
        opt.step()
    final = loss(small, pairs, 'cpu').item()
    assert final < initial*.1, (initial, final)
    export_bin(small, out)
    assert answer(load_bin(out), 'hi') == 'Hello.'
    subprocess.run(['node','--input-type=module','-e',"import {readFileSync} from 'node:fs';import {Tiny} from './dist/engine.js';let b=readFileSync(process.argv[1]);let m=new Tiny(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));let a='';for(let e of m.generate('hi',0))a+=e.letter||'';if(a!=='Hello.')throw Error(a);console.log('Newly trained model works in JavaScript: hi → '+a);",str(out)],cwd=root,check=True)
    print(f'Training loss {initial:.4f} → {final:.4f}; binary validation passed', flush=True)
