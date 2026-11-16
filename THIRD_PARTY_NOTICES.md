# Third-party materials

WebTiny ports the inference algorithm of [WollyMonjac/Tiny-2.1](https://github.com/WollyMonjac/Tiny-2.1). Original architecture, runtime, and pretrained model credit belongs to that project. Its README credits Fable 5.2 for writing and Opus 5.5 for training.

`dist/TINY.BIN` is copied unchanged from upstream. At the reviewed revision the upstream repository provided no license file. The MIT license in this repository does not relicense upstream code, model weights, or other upstream-derived material. No additional permission for those materials is represented here.

`tests/reference.json` contains outputs captured from the original C program. The JavaScript port preserves its behavior, including incorrect answers. The reconstructed Python trainer is not the original missing TRAINKIT and does not include its training corpus.

The interface optionally loads DM Sans and Manrope through Google Fonts, with local font fallbacks.
