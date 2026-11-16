# WebTiny training kit

This is a newly reconstructed PyTorch trainer, not the missing original TRAINKIT. It implements the public TINY 2.1 architecture and exports the unchanged TNY2 binary format consumed by the JavaScript app and original runtime. Training runs on your computer in Python. Inference runs in the browser.

## Install

Use Python 3.10+ in a virtual environment:

```sh
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows PowerShell instead: .venv\Scripts\Activate.ps1
python -m pip install -r training/requirements.txt
```

For a smaller CPU-only PyTorch install on supported systems:

```sh
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
```

Run commands below from the extracted kit root. The kit includes the browser app in dist/, its existing model, and tests/.

## Your dataset

Create a UTF-8 JSONL file, one question/answer pair per line:

```json
{"question":"what is my project called","answer":"My project is called Acorn."}
{"question":"name my project","answer":"Acorn."}
```

Both fields must contain nonempty printable ASCII text. Questions are limited to 72 characters; question + one separator + answer must fit 128 characters. EOS is appended for training. Use lower-case questions, varied phrasings, accurate concise answers, and enough examples for the intended subject. The included eight examples demonstrate the format; they are not a replacement for the missing original 3,500-fact corpus.

## Fine-tune the shipped model

```sh
python training/train.py --init dist/TINY.BIN --data training/example.jsonl --steps 1000 --batch-size 16 --lr 0.0001 --out trained/TINY.BIN
```

Replace example.jsonl with your own data. Fine-tuning only a few new examples can erase old knowledge. Mix in representative old questions and answers, use a low learning rate, and evaluate both old and new facts. There is no guaranteed good step count; monitor held-out loss and actual answers. Validation groups identical questions together; use a separate set of unseen paraphrases to assess generalization. Small datasets give noisy validation estimates.

## Train from scratch

```sh
python training/train.py --data your-data.jsonl --d 96 --layers 4 --heads 4 --hidden 256 --steps 10000 --out trained/TINY.BIN
```

CPU is the default. Add --device cuda for a compatible GPU PyTorch installation, or --device mps on a supported Mac. Those accelerators were not tested here. A small experimental model can use --d 32 --layers 2 --heads 4 --hidden 64. Scratch training needs a substantial dataset and tuning; the demonstration does not establish broad question-answering accuracy.

## Resume and ask

```sh
python training/train.py --resume trained/TINY.pt --data your-data.jsonl --steps 500 --out trained/TINY.BIN
python training/train.py --init trained/TINY.BIN --ask "what is my project called"
```

The .pt checkpoint preserves float weights, optimizer, step count, and Python/CPU Torch random state. Resume with the same dataset, seed, split and batch settings; the saved optimizer's learning rate is restored. Full accelerator reproducibility is not guaranteed. --init starts a new optimizer from quantized model weights. --ask uses the PyTorch forward pass; confirm final outputs in the browser because floating-point order can change close decisions.

## Use your model

Open the WebTiny app. Choose **Load a different TINY.BIN**, then select trained/TINY.BIN. Every question uses the currently loaded model. Refreshing restores the bundled original model. To bundle your own model permanently in a separately hosted copy, replace dist/TINY.BIN and serve dist/ over HTTP/HTTPS.

The trainer uses answer-only cross-entropy with EOS, causal attention, tied input/output embeddings, learned position embeddings, RMS normalization, ReLU feed-forward blocks, and per-token int8 key/value fake quantization with straight-through gradients. Export quantizes weights per row to signed int8. Training weights remain float; export can reduce accuracy. The original training dataset, optimizer schedule and hyperparameters are unknown.

## Checks

```sh
python training/test_trainer.py
node tests/engine.test.mjs
```

Validated on CPU PyTorch 2.15.0: five representative answers match in PyTorch; re-exported original model matches all 60 C answers in the independent JavaScript engine; a 16-wide scratch model learned hi → Hello. in 180 steps, reducing loss from 4.6125 to 0.0032, then answered correctly in JavaScript after binary export. Binary corruption checks and CLI fine-tuning/checkpoint resume also passed. These are compatibility and smoke checks, not a quality evaluation of a newly trained knowledge model.

Upstream model/code: https://github.com/WollyMonjac/Tiny-2.1 . The upstream repository has no license file at the reviewed revision. This kit remains on the existing private Site; obtain the author's permission before public redistribution of upstream materials.
