# WebTiny pas2js engine

`webtinynet.pas` implements the binary parser, typed-array storage, matrix/vector multiplication, RMS normalization, int8 key/value caching, causal attention, feed-forward blocks, and sampling in Object Pascal. pas2js compiles it to JavaScript. `dist/engine-pascal.js` only adapts Pascal object construction and incremental streaming to the existing worker interface. Both engines share input cleanup.

## Build

Download and extract official [pas2js 3.2.0](https://getpas2js.freepascal.org/) for your machine. Keep its bin and packages directories together. Add its bin directory to PATH, then run from the repository root:

```sh
python3 scripts/build_pascal.py
```

Or set the PAS2JS environment variable to the compiler's absolute path. The script uses `-Jc -Jirtl.js -O2 -OoRemoveNotUsedDeclarations-`, then appends an ES-module export boundary. Retaining public declarations makes the Pascal class accessible to the JavaScript adapter. The generated artifact and runtime are committed, so running the app does not require a compiler or WASM. Do not edit the generated file manually.

The generated runtime is larger than the hand-written engine. It loads dynamically only when Pascal is selected. Changing engines uses the same already-loaded model, including a user-selected model, and is disabled during generation. A failed replacement model leaves the working model available. Refresh defaults to JavaScript.

## Correctness

`node tests/pascal.test.mjs` verifies all 60 reference answers, exact logits and activity on a step-by-step prefix, seeded sampling at creativity 5 and 9, and invalid model rejection. `node tests/worker.test.mjs` checks engine switching in both directions, streaming, cancellation, and preservation of the active model after a failed load.

## PasTiny reference

[FMXExpress/PasTiny](https://github.com/FMXExpress/PasTiny), inspected at `cad51833918f72da0de469b9b510c834ff656431`, contains the same byte-for-byte model and question set. Its TNYNET.PAS is useful as an independently validated Pascal reference, especially its integer matvec/attention and regression tests. This initial browser engine follows WebTiny's float32 math to isolate compiler differences. It does not include PasTiny's integer path, DOS memory/pointer layer, or assembly. Native/DOS integer speedups do not establish a JavaScript speedup. No PasTiny source was copied into this implementation.
