/**
 * Sistema de Lock/Semaphore para scrapers do Instagram
 *
 * PROBLEMA RESOLVIDO:
 * - Múltiplas requests simultâneas criavam páginas que compartilham cookies
 * - Navegações em uma página afetavam frames de outras (detached frame errors)
 *
 * SOLUÇÃO:
 * - Apenas 1 scraping ativo por vez
 * - Requests adicionais aguardam na fila
 * - Garante que páginas não interferem entre si
 */

interface QueuedRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  timestamp: number;
}

class InstagramScraperLock {
  private isLocked = false;
  private queue: QueuedRequest[] = [];
  private currentOperation: string | null = null;

  /**
   * Adquire o lock (ou aguarda na fila)
   */
  async acquire(operationName: string): Promise<void> {
    // Se não está locked, adquire imediatamente
    if (!this.isLocked) {
      this.isLocked = true;
      this.currentOperation = operationName;
      console.log(`🔒 Lock adquirido: ${operationName}`);
      return;
    }

    // Se está locked, adiciona na fila e aguarda
    console.log(`⏳ Request na fila: ${operationName} (aguardando ${this.currentOperation})`);

    return new Promise((resolve, reject) => {
      this.queue.push({
        resolve: () => {
          this.currentOperation = operationName;
          console.log(`🔓 Lock adquirido da fila: ${operationName}`);
          resolve();
        },
        reject,
        timestamp: Date.now()
      });

      // Timeout de 10 minutos na fila
      setTimeout(() => {
        const index = this.queue.findIndex(req => req.timestamp === Date.now());
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(new Error(`Timeout aguardando lock para ${operationName}`));
        }
      }, 600000);
    });
  }

  /**
   * Libera o lock e processa próximo da fila
   */
  release(): void {
    if (!this.isLocked) {
      console.warn('⚠️ Tentativa de release sem lock ativo');
      return;
    }

    console.log(`🔓 Lock liberado: ${this.currentOperation}`);
    this.currentOperation = null;

    // Se há requests na fila, libera a próxima
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        console.log(`📋 Processando próximo da fila (${this.queue.length} restantes)`);
        next.resolve();
      }
    } else {
      this.isLocked = false;
    }
  }

  /**
   * Estatísticas do lock
   */
  getStats() {
    return {
      isLocked: this.isLocked,
      currentOperation: this.currentOperation,
      queueLength: this.queue.length,
      queuedOperations: this.queue.map((_, i) => `Request ${i + 1}`)
    };
  }
}

// Singleton global
export const scraperLock = new InstagramScraperLock();
