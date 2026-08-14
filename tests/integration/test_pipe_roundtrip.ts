import net from 'net';
import { startPipeServer, PIPE_PATH } from '../../src/ipc/pipe-server.js';

const TIMEOUT_MS = 30000;

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function run() {
  const hasKey = !!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY;
  if (!hasKey) {
    console.error('FAIL: Integration test requires real provider key. Set OPENAI_API_KEY or ANTHROPIC_API_KEY. No fake/mocked streaming allowed.');
    process.exit(1);
  }

  console.log(`[test] starting in-process pipe server at ${PIPE_PATH}`);
  const server = startPipeServer(PIPE_PATH);
  await new Promise<void>(r => setTimeout(r, 300));

  const correlationId = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const requestId = `req-${Date.now()}`;
  const envelope = {
    requestId,
    correlationId,
    source: 'test-client',
    target: 'ortho-ai',
    action: 'INFERENCE_SUBMIT',
    payload: {
      prompt: 'Say the word HELLO exactly and nothing else.',
      model: process.env.ORTHO_TEST_MODEL || (process.env.OPENAI_API_KEY ? 'gpt-4o-mini' : 'claude-3-5-sonnet-20241022'),
      max_tokens: 20
    },
    capabilityContext: {},
    timestamp: new Date().toISOString()
  };

  const events: any[] = [];
  let finalEvent: any = null;

  await new Promise<void>((resolve, reject) => {
    const client = net.createConnection(PIPE_PATH, () => {
      console.log(`[test] connected, sending INFERENCE_SUBMIT correlationId=${correlationId}`);
      client.write(JSON.stringify(envelope) + '\n');
    });

    client.setEncoding('utf8');
    let buffer = '';
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error(`Timeout ${TIMEOUT_MS}ms waiting for completed event. Received: ${JSON.stringify(events).slice(0, 1000)}`));
    }, TIMEOUT_MS);

    client.on('data', (chunk: string) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let evt: any;
        try { evt = JSON.parse(line); } catch (e) { console.error('[test] invalid JSON event', line); continue; }
        console.log('[test] event', evt.type, evt.delta ? `delta=${JSON.stringify(evt.delta).slice(0,80)}` : '', `corr=${evt.correlationId}`);
        events.push(evt);

        // Assert correlationId matches for every event
        try {
          assert(evt.correlationId === correlationId, `correlationId mismatch expected ${correlationId} got ${evt.correlationId}`);
        } catch (e) { clearTimeout(timer); reject(e); client.destroy(); return; }

        if (evt.type === 'token') {
          assert(typeof evt.delta === 'string' && evt.delta.length > 0, 'token event must have delta');
        }

        if (evt.type === 'completed') {
          finalEvent = evt;
          clearTimeout(timer);
          // Must have completed after at least zero tokens (some models may stream 1 chunk)
          assert(events.some(e => e.type === 'token') || (evt.text && evt.text.length > 0), 'expected at least one token before completed');
          client.end();
          resolve();
          break;
        }
        if (evt.type === 'failed') {
          clearTimeout(timer);
          reject(new Error(`Inference failed event: ${evt.error} . Ensure real provider key is valid.`));
          client.destroy();
          break;
        }
      }
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    client.on('close', () => {
      if (!finalEvent) {
        // If server closed without completed, fail
        // handled by timeout or explicit reject
      }
    });
  });

  assert(finalEvent, 'no final event');
  assert(finalEvent.type === 'completed', `final event type must be completed got ${finalEvent.type}`);
  assert(finalEvent.correlationId === correlationId, 'final correlationId mismatch');

  console.log(`[test] PASSED pipe roundtrip correlationId=${correlationId} events=${events.length} text=${JSON.stringify(finalEvent.text).slice(0,200)}`);

  server.close();
  if (process.platform !== 'win32') {
    try { require('fs').unlinkSync(PIPE_PATH); } catch {}
  }
  process.exit(0);
}

run().catch(err => {
  console.error('[test] FAILED', err);
  process.exit(1);
});
