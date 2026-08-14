#!/usr/bin/env ts-node
import dotenv from 'dotenv';
import { startPipeServer, PIPE_PATH, PIPE_NAME } from './pipe-server.js';

dotenv.config();

const openaiKey = process.env.OPENAI_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

function mask(k?: string) {
  if (!k) return 'missing';
  return k.slice(0, 7) + '...' + k.slice(-4);
}

console.log(`[ortho-ai] starting AI gateway`);
console.log(`[ortho-ai] PIPE_NAME=${PIPE_NAME} PIPE_PATH=${PIPE_PATH}`);
console.log(`[ortho-ai] providers: openai=${mask(openaiKey)} anthropic=${mask(anthropicKey)}`);
if (!openaiKey && !anthropicKey) {
  console.warn(`[ortho-ai] WARNING: No provider keys set. Inference will return failed events (not fake). Set ANTHROPIC_API_KEY or OPENAI_API_KEY.`);
}
console.log(`[ortho-ai] default model: ${process.env.ORTHO_DEFAULT_MODEL || '(auto)'}`);

const server = startPipeServer(PIPE_PATH);

console.log(`[ortho-ai] READY - IPC server running, awaiting ORTHOHost connections`);
console.log(`[ortho-ai] Expecting MessageEnvelope JSON lines with action INFERENCE_SUBMIT / MODELS_LIST`);

export { server };
