// Web Worker que hostea el engine de WebLLM (spike — Open Question #1 del spec v2).
// El modelo corre acá, en un hilo aparte, para no congelar el canvas mientras
// genera. `webllm.ts` lo instancia con `new Worker(new URL(...))`.
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
