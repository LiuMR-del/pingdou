import { convert } from '../core/convert';
import type { ConvertRequest, ConvertResponse } from '../model';

self.onmessage = (event: MessageEvent<ConvertRequest>) => {
  const request = event.data;
  try {
    const start = performance.now();
    const pattern = convert(request.input);
    pattern.durationMs = performance.now() - start;
    const response: ConvertResponse = { id: request.id, pattern };
    self.postMessage(response);
  } catch (error) {
    const response: ConvertResponse = { id: request.id, error: error instanceof Error ? error.message : String(error) };
    self.postMessage(response);
  }
};
