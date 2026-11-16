#!/usr/bin/env python3
"""Compatible TINY 2.1 trainer; reconstructed from the public inference code."""
import argparse
import json
import math
from pathlib import Path
import random
import struct
import torch
from torch import nn
from torch.nn import functional as F

VOCAB, CTX, MAXQ = 97, 128, 72


def validate(d, layers, heads, hidden):
    if not (8 <= d <= 128 and 1 <= layers <= 8 and heads >= 1 and d % heads == 0 and 8 <= hidden <= 512):
        raise ValueError('Unsupported TINY dimensions')
    if max(97*d, 128*d, d*d, hidden*d) > 65000:
        raise ValueError('Weight table exceeds the original format limit')


def rms(x, gain):
    return x * torch.rsqrt(x.square().mean(-1, keepdim=True) + 1e-5) * gain


def cache_quant(x):
    # Original runtime rounds half away from zero; straight-through gradients.
    scale = x.abs().amax(-1, keepdim=True).clamp_min(1e-20) / 127
    z = x / scale
    rounded = z.sign() * (z.abs() + .5).floor()
    quant = rounded.clamp(-127, 127) * scale
    return x + (quant - x).detach()


class Block(nn.Module):
    def __init__(self, d, heads, hidden):
        super().__init__()
        self.heads = heads
        self.g1 = nn.Parameter(torch.ones(d))
        self.g2 = nn.Parameter(torch.ones(d))
        self.wq = nn.Linear(d, d, bias=False)
        self.wk = nn.Linear(d, d, bias=False)
        self.wv = nn.Linear(d, d, bias=False)
        self.wo = nn.Linear(d, d, bias=False)
        self.f1 = nn.Linear(d, hidden, bias=False)
        self.f2 = nn.Linear(hidden, d, bias=False)

    def forward(self, x):
        b, t, d = x.shape
        h = rms(x, self.g1)
        q = self.wq(h)
        k, v = cache_quant(self.wk(h)), cache_quant(self.wv(h))
        split = lambda a: a.view(b, t, self.heads, d // self.heads).transpose(1, 2)
        q, k, v = map(split, (q, k, v))
        scores = (q @ k.transpose(-1, -2)) / math.sqrt(d // self.heads)
        mask = torch.ones(t, t, dtype=torch.bool, device=x.device).triu(1)
        weights = scores.masked_fill(mask, float('-inf')).softmax(-1)
        a = (weights @ v).transpose(1, 2).contiguous().view(b, t, d)
        x = x + self.wo(a)
        return x + self.f2(F.relu(self.f1(rms(x, self.g2))))


class Tiny(nn.Module):
    def __init__(self, d=96, layers=4, heads=4, hidden=256):
        super().__init__()
        validate(d, layers, heads, hidden)
        self.config = dict(d=d, layers=layers, heads=heads, hidden=hidden)
        self.emb = nn.Embedding(VOCAB, d)
        self.pos = nn.Embedding(CTX, d)
        self.blocks = nn.ModuleList([Block(d, heads, hidden) for _ in range(layers)])
        self.gf = nn.Parameter(torch.ones(d))
        nn.init.normal_(self.emb.weight, std=.02)
        nn.init.normal_(self.pos.weight, std=.02)

    def forward(self, tokens):
        x = self.emb(tokens) + self.pos(torch.arange(tokens.shape[1], device=tokens.device))
        for block in self.blocks:
            x = block(x)
        return F.linear(rms(x, self.gf), self.emb.weight)

    def tables(self):
        yield self.emb.weight
        yield self.pos.weight
        for block in self.blocks:
            yield block.g1
            for name in ('wq', 'wk', 'wv', 'wo'):
                yield getattr(block, name).weight
            yield block.g2
            yield block.f1.weight
            yield block.f2.weight
        yield self.gf


def load_bin(path):
    data = Path(path).read_bytes()
    if len(data) < 12 or data[:4] != b'TNY2':
        raise ValueError('Not a TINY version 2 model')
    model = Tiny(*struct.unpack_from('<4H', data, 4))
    offset = 12
    with torch.no_grad():
        for param in model.tables():
            if param.ndim == 1:
                size = param.numel() * 4
                if offset + size > len(data):
                    raise ValueError('Truncated model')
                param.copy_(torch.tensor(struct.unpack_from(f'<{param.numel()}f', data, offset)))
                offset += size
            else:
                rows, cols = param.shape
                for row in range(rows):
                    if offset + 4 + cols > len(data):
                        raise ValueError('Truncated model table')
                    scale, = struct.unpack_from('<f', data, offset)
                    values = struct.unpack_from(f'<{cols}b', data, offset + 4)
                    param[row].copy_(torch.tensor(values) * scale)
                    offset += 4 + cols
        if offset != len(data):
            raise ValueError('Model has trailing bytes')
        if any(not torch.isfinite(p).all() for p in model.parameters()):
            raise ValueError('Nonfinite model weights')
    return model


def export_bin(model, path):
    c = model.config
    out = bytearray(b'TNY2' + struct.pack('<4H', c['d'], c['layers'], c['heads'], c['hidden']))
    for param in model.tables():
        x = param.detach().cpu()
        if not torch.isfinite(x).all():
            raise ValueError('Cannot export nonfinite weights')
        if x.ndim == 1:
            out.extend(struct.pack(f'<{x.numel()}f', *x.tolist()))
        else:
            for row in x:
                scale = row.abs().max().item() / 127
                q = row / scale if scale else torch.zeros_like(row)
                q = (q.sign() * (q.abs() + .5).floor()).clamp(-127, 127).to(torch.int8)
                out.extend(struct.pack('<f', scale))
                out.extend(struct.pack(f'<{row.numel()}b', *q.tolist()))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(out)


def encode(text, label):
    if not isinstance(text, str) or not text or any(not 32 <= ord(c) <= 126 for c in text):
        raise ValueError(f'{label} must be nonempty printable ASCII text')
    return [ord(c) - 30 for c in text]


def read_pairs(path):
    pairs = []
    for line_no, line in enumerate(Path(path).read_text().splitlines(), 1):
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
            q, a = encode(obj['question'], 'question'), encode(obj['answer'], 'answer')
            if len(q) > MAXQ or len(q) + 1 + len(a) > CTX:
                raise ValueError('Question exceeds 72 characters or question + separator + answer exceeds 128')
            # Predict answer characters and EOS only; never learn padding or prompts.
            seq = q + [1] + a + [0]
            pairs.append((seq, len(q)))
        except (ValueError, KeyError, TypeError) as e:
            raise ValueError(f'{path}:{line_no}: {e}') from e
    if not pairs:
        raise ValueError('Dataset is empty')
    return pairs


def batch(pairs, device):
    n = max(len(seq) - 1 for seq, _ in pairs)
    x = torch.zeros(len(pairs), n, dtype=torch.long, device=device)
    y = torch.full_like(x, -100)
    for i, (seq, qlen) in enumerate(pairs):
        x[i, :len(seq)-1] = torch.tensor(seq[:-1], device=device)
        y[i, qlen:len(seq)-1] = torch.tensor(seq[qlen+1:], device=device)
    return x, y


def loss(model, pairs, device):
    x, y = batch(pairs, device)
    return F.cross_entropy(model(x).flatten(0, 1), y.flatten(), ignore_index=-100)


@torch.no_grad()
def answer(model, question):
    tokens = encode(question, 'question')
    if len(tokens) > MAXQ:
        raise ValueError('Question exceeds 72 characters')
    tokens += [1]
    result = ''
    device = next(model.parameters()).device
    model.eval()
    while len(tokens) < CTX:
        tok = int(model(torch.tensor([tokens], device=device))[0, -1].argmax())
        if tok <= 1:
            break
        result += chr(tok + 30)
        tokens.append(tok)
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data', type=Path, help='JSONL question/answer pairs')
    p.add_argument('--init', type=Path, help='Existing TINY.BIN to fine-tune')
    p.add_argument('--resume', type=Path, help='Resume trainer checkpoint (including optimizer)')
    p.add_argument('--out', type=Path, default=Path('trained/TINY.BIN'))
    p.add_argument('--steps', type=int, default=1000)
    p.add_argument('--batch-size', type=int, default=16)
    p.add_argument('--lr', type=float, default=3e-4)
    p.add_argument('--d', type=int, default=96)
    p.add_argument('--layers', type=int, default=4)
    p.add_argument('--heads', type=int, default=4)
    p.add_argument('--hidden', type=int, default=256)
    p.add_argument('--device', choices=['cpu', 'cuda', 'mps'], default='cpu')
    p.add_argument('--seed', type=int, default=42)
    p.add_argument('--threads', type=int, default=2)
    p.add_argument('--val-fraction', type=float, default=.1)
    p.add_argument('--ask', help='Ask an initialized or resumed model; no training')
    args = p.parse_args()
    if args.init and args.resume:
        p.error('Use either --init or --resume')
    if args.steps < 1 or args.batch_size < 1 or args.lr <= 0 or args.threads < 1 or not 0 <= args.val_fraction < 1:
        p.error('Invalid training settings')
    torch.set_num_threads(args.threads)
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    ckpt = torch.load(args.resume, map_location='cpu', weights_only=True) if args.resume else None
    model = Tiny(**ckpt['config']) if ckpt else load_bin(args.init) if args.init else Tiny(args.d, args.layers, args.heads, args.hidden)
    if ckpt:
        model.load_state_dict(ckpt['model'])
    model.to(args.device)
    if args.ask:
        if not (args.init or args.resume):
            p.error('--ask requires --init or --resume')
        print(answer(model, args.ask))
        return
    if not args.data:
        p.error('--data is required for training')
    pairs = read_pairs(args.data)
    # Keep repeated question wordings together to avoid exact-question leakage.
    groups = {}
    for pair in pairs:
        key = tuple(pair[0][:pair[1]])
        groups.setdefault(key, []).append(pair)
    keys = list(groups)
    random.shuffle(keys)
    nv = min(len(keys)-1, max(1, int(len(keys)*args.val_fraction))) if args.val_fraction and len(keys)>1 else 0
    val = [pair for k in keys[:nv] for pair in groups[k]]
    train = [pair for k in keys[nv:] for pair in groups[k]]
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    initial_step = 0
    if ckpt:
        optimizer.load_state_dict(ckpt['optimizer'])
        initial_step = ckpt['step']
        random.setstate(ckpt['python_rng'])
        torch.set_rng_state(ckpt['torch_rng'])
    print(json.dumps({'config': model.config, 'train_pairs': len(train), 'validation_pairs': len(val), 'device': args.device}), flush=True)
    for step in range(1, args.steps+1):
        model.train()
        optimizer.zero_grad(set_to_none=True)
        value = loss(model, random.choices(train, k=args.batch_size), args.device)
        if not torch.isfinite(value):
            raise ValueError('Nonfinite training loss')
        value.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step == 1 or step % 50 == 0 or step == args.steps:
            metrics = {'step': initial_step+step, 'train_loss': round(value.item(), 5)}
            if val:
                model.eval()
                with torch.no_grad():
                    # Token-weighted validation, bounded memory.
                    total = count = 0
                    for i in range(0, len(val), args.batch_size):
                        chunk = val[i:i+args.batch_size]
                        nt = sum(len(seq)-1-qlen for seq, qlen in chunk)
                        total += loss(model, chunk, args.device).item()*nt
                        count += nt
                    metrics['validation_loss'] = round(total/count, 5)
            print(json.dumps(metrics), flush=True)
    export_bin(model, args.out)
    torch.save({'config': model.config, 'model': model.state_dict(), 'optimizer': optimizer.state_dict(), 'step': initial_step+args.steps, 'python_rng': random.getstate(), 'torch_rng': torch.get_rng_state()}, args.out.with_suffix('.pt'))
    print(f'Exported {args.out} and {args.out.with_suffix(".pt")}', flush=True)


if __name__ == '__main__':
    main()
