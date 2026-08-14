import type { MessageEnvelope } from './pipe-server.js';

interface ModelsResult {
  type: 'completed' | 'failed';
  payload?: any;
  error?: string;
}

export async function handleModels(envelope: MessageEnvelope): Promise<ModelsResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // No fake data: requires real provider key to fetch live catalog
  if (!openaiKey && !anthropicKey) {
    return {
      type: 'failed',
      error: 'No provider API key configured. Cannot fetch model catalog. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.'
    };
  }

  const models: any[] = [];
  const errors: string[] = [];

  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${openaiKey}` }
      });
      if (!res.ok) {
        errors.push(`OpenAI models ${res.status}: ${await res.text()}`);
      } else {
        const data: any = await res.json();
        // data.data is array of {id, object, created, owned_by}
        for (const m of data.data || []) {
          models.push({
            id: m.id,
            provider: 'openai',
            owned_by: m.owned_by,
            created: m.created,
            object: m.object
          });
        }
      }
    } catch (e: any) {
      errors.push(`OpenAI fetch failed: ${e.message}`);
    }
  }

  if (anthropicKey) {
    // Anthropic now supports GET /v1/models (2024+). Use real endpoint, no fake.
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        }
      });
      if (!res.ok) {
        // Fallback: validate key with minimal models-known check but mark source
        // We still only return catalog if endpoint succeeds; otherwise report error
        errors.push(`Anthropic models ${res.status}: ${await res.text()}`);
      } else {
        const data: any = await res.json();
        const list = data.data || data.models || [];
        for (const m of list) {
          models.push({
            id: m.id || m.name,
            provider: 'anthropic',
            display_name: m.display_name,
            created_at: m.created_at
          });
        }
      }
    } catch (e: any) {
      errors.push(`Anthropic fetch failed: ${e.message}`);
    }
  }

  if (models.length === 0) {
    return {
      type: 'failed',
      error: `Failed to fetch live catalog. ${errors.join(' | ')}`
    };
  }

  // Sort for determinism
  models.sort((a, b) => a.id.localeCompare(b.id));

  return {
    type: 'completed',
    payload: {
      models,
      fetchedAt: new Date().toISOString(),
      providers: {
        openai: !!openaiKey,
        anthropic: !!anthropicKey
      },
      errors: errors.length ? errors : undefined
    }
  };
}
