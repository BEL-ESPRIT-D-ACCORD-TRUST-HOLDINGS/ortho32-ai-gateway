import net from 'net';
import { handleInference } from './inference-handler.js';
import { handleModels } from './models-handler.js';

export const PIPE_NAME = 'ortho-ai';
export const PIPE_PATH = process.platform === 'win32'
  ? `\\\\.\\pipe\\${PIPE_NAME}`
  : `/tmp/${PIPE_NAME}.sock`;

export interface MessageEnvelope {
  requestId: string;
  correlationId: string;
  source: string;
  target: string;
  action: string;
  payload: any;
  capabilityContext?: any;
  timestamp: string;
}

export interface InferenceEvent {
  type: 'token' | 'completed' | 'failed' | 'models';
  correlationId: string;
  requestId?: string;
  delta?: string;
  text?: string;
  error?: string;
  payload?: any;
  timestamp: string;
}

function log(...args: any[]) {
  console.log(`[pipe-server:${PIPE_NAME}]`, ...args);
}

function sendEvent(socket: net.Socket, event: InferenceEvent) {
  if (socket.destroyed || !socket.writable) return;
  try {
    socket.write(JSON.stringify(event) + '\n');
  } catch (e) {
    log('write failed (client disconnected?)', (e as Error).message);
  }
}

async function dispatchEnvelope(envelope: MessageEnvelope, socket: net.Socket) {
  const correlationId = envelope.correlationId || envelope.requestId;
  const action = envelope.action;

  log(`dispatch action=${action} correlationId=${correlationId} source=${envelope.source}`);

  try {
    if (action === 'INFERENCE_SUBMIT' || action === 'inference.submit' || action === 'CHAT_SUBMIT') {
      for await (const event of handleInference(envelope)) {
        sendEvent(socket, event);
        if (event.type === 'failed' || event.type === 'completed') break;
      }
    } else if (action === 'MODELS_LIST' || action === 'models.list' || action === 'MODELS_SUBMIT') {
      const result = await handleModels(envelope);
      sendEvent(socket, {
        type: result.type as any,
        correlationId,
        requestId: envelope.requestId,
        payload: result.payload,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    } else {
      sendEvent(socket, {
        type: 'failed',
        correlationId,
        requestId: envelope.requestId,
        error: `unknown action: ${action}`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (err: any) {
    log('dispatch error', err?.message || err);
    sendEvent(socket, {
      type: 'failed',
      correlationId,
      requestId: envelope.requestId,
      error: err?.message || String(err),
      timestamp: new Date().toISOString()
    });
  }
}

export function startPipeServer(portOrPath: string = PIPE_PATH): net.Server {
  // Clean up stale unix socket
  if (process.platform !== 'win32') {
    try { require('fs').unlinkSync(portOrPath); } catch {}
  }

  const server = net.createServer((socket) => {
    log(`client connected ${socket.remoteAddress || 'pipe'}`);
    socket.setEncoding('utf8');
    socket.setNoDelay(true);

    let buffer = '';

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let envelope: MessageEnvelope;
        try {
          envelope = JSON.parse(line);
        } catch (e: any) {
          log('invalid JSON, ignoring:', line.slice(0, 200), e.message);
          sendEvent(socket, {
            type: 'failed',
            correlationId: 'unknown',
            error: `invalid MessageEnvelope JSON: ${e.message}`,
            timestamp: new Date().toISOString()
          });
          continue;
        }
        // handle without blocking socket loop, but crashes are isolated
        dispatchEnvelope(envelope, socket).catch(err => {
          log('unhandled dispatch error', err?.message);
        });
      }
    });

    socket.on('error', (err) => {
      // MUST NOT CRASH SERVER ON CLIENT DISCONNECT
      log(`socket error (client disconnect handled): ${err.message}`);
    });

    socket.on('close', (hadError) => {
      log(`client disconnected hadError=${hadError}`);
      buffer = '';
    });

    socket.on('end', () => {
      log('client ended connection');
    });
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      log(`pipe ${portOrPath} in use, retrying after unlink`);
      if (process.platform !== 'win32') {
        try { require('fs').unlinkSync(portOrPath); } catch {}
        server.listen(portOrPath);
      }
    } else {
      log('server error', err.message);
    }
  });

  server.listen(portOrPath, () => {
    log(`READY listening on ${portOrPath} (PIPE_NAME=${PIPE_NAME})`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('SIGINT closing');
    server.close();
    process.exit(0);
  });

  return server;
}
