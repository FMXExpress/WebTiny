import {parentPort} from 'node:worker_threads';
globalThis.self={};globalThis.postMessage=data=>parentPort.postMessage(data);
await import('../dist/worker.js');
parentPort.on('message',data=>self.onmessage({data}));
parentPort.postMessage({type:'booted'});
