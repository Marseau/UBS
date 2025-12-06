/**
 * LEAD EMBEDDING WEBHOOK SERVICE
 *
 * Dispara webhook para n8n embedar leads após inserção/atualização.
 * Não bloqueia o scraper - fire-and-forget com retry.
 *
 * Uso nos scrapers:
 *   import { triggerLeadEmbedding } from './lead-embedding-webhook.service';
 *   // Após INSERT ou UPDATE:
 *   triggerLeadEmbedding(leadId, username, 'insert');
 */

const WEBHOOK_URL = process.env.N8N_EMBEDDING_WEBHOOK_URL || 'http://localhost:5678/webhook/embedar-lead';
const WEBHOOK_ENABLED = process.env.ENABLE_EMBEDDING_WEBHOOK !== 'false'; // Enabled by default
const WEBHOOK_TIMEOUT_MS = 5000; // 5 segundos timeout

interface EmbeddingWebhookPayload {
  lead_id: string;
  username: string;
  action: 'insert' | 'update';
  timestamp: string;
  source: string;
}

/**
 * Dispara webhook para embedar lead (fire-and-forget)
 * Não bloqueia execução do scraper
 */
export async function triggerLeadEmbedding(
  leadId: string,
  username: string,
  action: 'insert' | 'update',
  source: string = 'scraper'
): Promise<void> {
  if (!WEBHOOK_ENABLED) {
    return;
  }

  if (!leadId) {
    console.log(`   ⚠️  [EMBEDDING] Lead ID não fornecido para @${username}`);
    return;
  }

  const payload: EmbeddingWebhookPayload = {
    lead_id: leadId,
    username,
    action,
    timestamp: new Date().toISOString(),
    source
  };

  // Fire-and-forget - não await
  fireWebhook(payload).catch(err => {
    // Log silencioso - não interrompe o scraper
    console.log(`   ⚠️  [EMBEDDING] Webhook falhou para @${username}: ${err.message}`);
  });
}

/**
 * Dispara webhook com retry simples
 */
async function fireWebhook(payload: EmbeddingWebhookPayload, retries = 2): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      console.log(`   🔗 [EMBEDDING] Webhook disparado para @${payload.username} (${payload.action})`);
    } else if (retries > 0) {
      // Retry em caso de erro não-fatal
      await new Promise(r => setTimeout(r, 1000));
      return fireWebhook(payload, retries - 1);
    }
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (retries > 0 && error.name !== 'AbortError') {
      await new Promise(r => setTimeout(r, 1000));
      return fireWebhook(payload, retries - 1);
    }
    throw error;
  }
}

/**
 * Dispara webhook em batch para múltiplos leads
 * Útil para processamento de followers
 */
export async function triggerBatchLeadEmbedding(
  leads: Array<{ id: string; username: string }>,
  source: string = 'batch'
): Promise<void> {
  if (!WEBHOOK_ENABLED || leads.length === 0) {
    return;
  }

  const batchPayload = {
    leads: leads.map(l => ({
      lead_id: l.id,
      username: l.username
    })),
    action: 'batch_insert',
    timestamp: new Date().toISOString(),
    source,
    count: leads.length
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchPayload)
    });
    console.log(`   🔗 [EMBEDDING] Batch webhook disparado para ${leads.length} leads`);
  } catch (err: any) {
    console.log(`   ⚠️  [EMBEDDING] Batch webhook falhou: ${err.message}`);
  }
}

/**
 * Verifica se webhook está configurado e acessível
 */
export async function checkWebhookHealth(): Promise<{ ok: boolean; url: string; enabled: boolean }> {
  return {
    ok: WEBHOOK_ENABLED,
    url: WEBHOOK_URL,
    enabled: WEBHOOK_ENABLED
  };
}
