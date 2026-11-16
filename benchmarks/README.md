# JavaScript versus pas2js

Run `npm run benchmark` from the repository root. Raw measurements are in engines-node.json. This is a same-process CPU engine benchmark, not a browser UI benchmark.

Environment: Node.js v24.22.1, Linux x64, Intel Xeon Platinum 8573C. Both engines use the same unchanged 381,808-byte model, float32 rounding, and the same 60 reference questions. Creativity is 0. Five warmup answers per engine, then three full rounds with engine order alternating. Three runs are a small sample, not a statistical guarantee.

| Metric | JavaScript | Pascal via pas2js 3.2.0 |
| --- | ---: | ---: |
| Median of mean answer times across rounds | 81.53 ms | 82.41 ms |
| Median processing throughput, input + separator + output | 523.28 char/s | 517.69 char/s |
| Median model parse/allocate time, 25 loads | 0.57 ms | 1.39 ms |
| Matches with original C output, each round | 60/60 | 60/60 |
| Engine JS source bytes, uncompressed | 4,425 | 180,751 generated + 1,005 adapter |

The pas2js engine's median run was about 1.1% slower. Run-to-run variation is larger than that difference, so these measurements do not establish a meaningful inference-speed winner. The hand-written engine has a clear source-size advantage. Retaining Pascal is useful for Pascal maintenance and compiler experiments; JavaScript stays the default.

Model-load timing excludes downloading bytes and module import. Throughput excludes worker timers, rendering, and network I/O. Source size is not runtime memory usage. Pascal also shares the JavaScript input-cleanup module. All figures are characters, not subword tokens. Matching the C reference confirms compatibility, not factual accuracy. Browser, mobile, and other JS engine performance remains unmeasured.
