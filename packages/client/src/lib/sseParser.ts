export interface SseEvent { event: string; data: string; }

/**
 * Stateful chunk parser. Feed it text chunks from a streaming response, get back
 * fully parsed events. Holds an internal buffer for partial events that cross
 * chunk boundaries.
 */
export function createSseParser(): {
  push: (chunk: string) => SseEvent[];
  flush: () => SseEvent[];
} {
  let buf = '';
  function parseBlock(block: string): SseEvent | null {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue; // comment / heartbeat
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return null;
    return { event, data: dataLines.join('\n') };
  }
  return {
    push(chunk) {
      buf += chunk;
      const out: SseEvent[] = [];
      let sep;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const ev = parseBlock(block);
        if (ev) out.push(ev);
      }
      return out;
    },
    flush() {
      if (!buf) return [];
      const ev = parseBlock(buf);
      buf = '';
      return ev ? [ev] : [];
    },
  };
}
