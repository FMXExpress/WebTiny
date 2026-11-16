# Third-party materials

WebTiny ports the inference algorithm of [WollyMonjac/Tiny-2.1](https://github.com/WollyMonjac/Tiny-2.1). Original architecture, runtime, and pretrained model credit belongs to that project. Its README credits Fable 5.2 for writing and Opus 5.5 for training.

`dist/TINY.BIN` is copied unchanged from upstream. At the reviewed revision the upstream repository provided no license file. The MIT license in this repository does not relicense upstream code, model weights, or other upstream-derived material. No additional permission for those materials is represented here.

`tests/reference.json` contains outputs captured from the original C program. The JavaScript port preserves its behavior, including incorrect answers. The reconstructed Python trainer is not the original missing TRAINKIT and does not include its training corpus.

The interface optionally loads DM Sans and Manrope through Google Fonts, with local font fallbacks.

## pas2js runtime

`dist/pascal-engine.generated.js` includes generated pas2js runtime code from the official 3.2.0 distribution (Free Pascal/pas2js development team; System, Math, Types, JS and rtl.js). Copyright notices and corresponding unmodified runtime source are preserved under `third_party/pas2js/`. See its `COPYING` and `COPYING.FPC` for the Library GPL and linking exception. These components are not relicensed under this repository's MIT license. Official compiler distribution: https://getpas2js.freepascal.org/ . PasTiny was consulted as a reference; its source was not incorporated.
