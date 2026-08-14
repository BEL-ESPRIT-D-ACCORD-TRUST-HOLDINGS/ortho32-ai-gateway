import type { MessageEnvelope, InferenceEvent } from './pipe-server.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function getProviderConfig(payloadModel?: string) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  // Model-driven selection, fallback to available key
  if (payloadModel?.startsWith('claude') && anthropicKey) return { provider: 'anthropic' as const, key: anthropicKey };
  if (payloadModel?.startsWith('gpt') && openaiKey) return { provider: 'openai' as const, key: openaiKey };
  if (anthropicKey) return { provider: 'anthropic' as const, key: anthropicKey };
  if (openaiKey) return { provider: 'openai' as const, key: openaiKey };
  return { provider: 'none' as const, key: null };
}

async function* streamOpenAI(
  envelope: MessageEnvelope,
  apiKey: string,
  model: string,
  prompt: string,
  system?: string
): AsyncGenerator<InferenceEvent> {
  const correlationId = envelope.correlationId || envelope.requestId;
  const messages: any[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages,
      stream: true,
      temperature: envelope.payload?.temperature ?? 0.7
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    yield {
      type: 'failed',
      correlationId,
      requestId: envelope.requestId,
      error: `OpenAI ${res.status}: ${txt}`,
      timestamp: new Date().toISOString()
    };
    return;
  }

  if (!res.body) {
    yield { type: 'failed', correlationId, requestId: envelope.requestId, error: 'OpenAI response body empty', timestamp: new Date().toISOString() };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            yield {
              type: 'token',
              correlationId,
              requestId: envelope.requestId,
              delta,
              text: fullText,
              timestamp: new Date().toISOString()
            };
          }
          if (json.choices?.[0]?.finish_reason) {
            // will emit completed after loop
          }
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {
    type: 'completed',
    correlationId,
    requestId: envelope.requestId,
    text: fullText,
    payload: { model: model || 'gpt-4o-mini', provider: 'openai' },
    timestamp: new Date().toISOString()
  };
}

async function* streamAnthropic(
  envelope: MessageEnvelope,
  apiKey: string,
  model: string,
  prompt: string,
  system?: string
): AsyncGenerator<InferenceEvent> {
  const correlationId = envelope.correlationId || envelope.requestId;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: envelope.payload?.max_tokens ?? 1024,
      system: system || undefined,
      messages: [{ role: 'user', content: prompt }],
      stream: true
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    yield { type: 'failed', correlationId, requestId: envelope.requestId, error: `Anthropic ${res.status}: ${txt}`, timestamp: new Date().toISOString() };
    return;
  }
  if (!res.body) {
    yield { type: 'failed', correlationId, requestId: envelope.requestId, error: 'Anthropic body empty', timestamp: new Date().toISOString() };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        try {
          const json = JSON.parse(data);
          // Anthropic streaming delta: type content_block_delta -> delta.text
          if (json.type === 'content_block_delta' && json.delta?.text) {
            const delta = json.delta.text;
            fullText += delta;
            yield { type: 'token', correlationId, requestId: envelope.requestId, delta, text: fullText, timestamp: new Date().toISOString() };
          } else if (json.type === 'message_delta' && json.delta?.text) {
            const delta = json.delta.text;
            fullText += delta;
            yield { type: 'token', correlationId, requestId: envelope.requestId, delta, text: fullText, timestamp: new Date().toISOString() };
          }
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield {
    type: 'completed',
    correlationId,
    requestId: envelope.requestId,
    text: fullText,
    payload: { model: model || 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
    timestamp: new Date().toISOString()
  };
}

export async function* handleInference(envelope: MessageEnvelope): AsyncGenerator<InferenceEvent> {
  const correlationId = envelope.correlationId || envelope.requestId;
  const payload = envelope.payload || {};
  const prompt = payload.prompt ?? payload.message ?? payload.text ?? '';
  const model = payload.model ?? process.env.ORTHO_DEFAULT_MODEL ?? '';
  const system = payload.system;

  if (!prompt || typeof prompt !== 'string') {
    yield { type: 'failed', correlationId, requestId: envelope.requestId, error: 'INFERENCE_SUBMIT missing payload.prompt', timestamp: new Date().toISOString() };
    return;
  }

  const cfg = getProviderConfig(model);

  if (cfg.provider === 'none' || !cfg.key) {
    // REAL failure, NOT fake streaming
    yield {
      type: 'failed',
      correlationId,
      requestId: envelope.requestId,
      error: 'No provider API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY. Streaming aborted.',
      timestamp: new Date().toISOString()
    };
    return;
  }

  if (cfg.provider === 'openai') {
    yield* streamOpenAI(envelope, cfg.key, model, prompt, system);
  } else {
    yield* streamAnthropic(envelope, cfg.key, model, prompt, system);
  }
}
