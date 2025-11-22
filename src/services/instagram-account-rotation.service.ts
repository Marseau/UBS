/**
 * Instagram Account Rotation Service
 *
 * Gerencia rotação inteligente entre múltiplas contas Instagram
 * para evitar bloqueios e shadowbans
 *
 * LÓGICA:
 * - Conta 1 → Falha 3x → Cooldown 30min → Troca para Conta 2
 * - Conta 2 → Falha 3x → Cooldown 30min → Volta Conta 1
 * - Se ambas falharem no mesmo ciclo → Para por 2h
 * - Máximo 2 ciclos completos → Para completamente
 */

import fs from 'fs';
import path from 'path';

interface AccountConfig {
  username: string;
  password: string;
  cookiesFile: string;
  failureCount: number;
  lastFailureTime: number;
  isBlocked: boolean;
}

interface AccountState {
  username: string;
  failureCount: number;
  lastFailureTime: number;
  isBlocked: boolean;
}

interface RotationState {
  currentAccountIndex: number;
  cyclesCompleted: number;
  lastRotationTime: number;
  globalCooldownUntil: number;
  accounts: AccountState[]; // 🎯 NOVO: Persistir estado das contas
}

const COOKIES_DIR = path.join(process.cwd(), 'cookies');
const STATE_FILE = path.join(COOKIES_DIR, 'rotation-state.json');

// Configurações
const ACCOUNT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 horas (conta com falhas recentes)
const GLOBAL_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 horas (ambas falharam)
const MAX_ROTATION_CYCLES = 2;

class InstagramAccountRotation {
  private accounts: AccountConfig[] = [];
  private state: RotationState;

  constructor() {
    // Criar diretório de cookies se não existir
    if (!fs.existsSync(COOKIES_DIR)) {
      fs.mkdirSync(COOKIES_DIR, { recursive: true });
    }

    // Inicializar contas do .env
    this.initializeAccounts();

    // Carregar estado
    this.state = this.loadState();
  }

  private initializeAccounts(): void {
    const account1Username = process.env.INSTAGRAM_UNOFFICIAL_USERNAME || process.env.INSTAGRAM_USERNAME;
    const account2Username = process.env.INSTAGRAM_UNOFFICIAL2_USERNAME;
    const password = process.env.INSTAGRAM_UNOFFICIAL_PASSWORD || process.env.INSTAGRAM_PASSWORD;

    if (!account1Username || !password) {
      throw new Error('Credenciais do Instagram não encontradas no .env');
    }

    // Conta 1
    this.accounts.push({
      username: account1Username,
      password: password,
      cookiesFile: path.join(COOKIES_DIR, 'instagram-cookies-account1.json'),
      failureCount: 0,
      lastFailureTime: 0,
      isBlocked: false
    });

    // Conta 2 (se configurada)
    if (account2Username) {
      this.accounts.push({
        username: account2Username,
        password: password,
        cookiesFile: path.join(COOKIES_DIR, 'instagram-cookies-account2.json'),
        failureCount: 0,
        lastFailureTime: 0,
        isBlocked: false
      });

      console.log(`🔄 Sistema de rotação ativado: ${this.accounts.length} contas`);
    } else {
      console.log(`⚠️ Apenas 1 conta configurada - rotação desabilitada`);
    }
  }

  private loadState(): RotationState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = fs.readFileSync(STATE_FILE, 'utf8');
        const loadedState = JSON.parse(data);

        // 🔄 RESTAURAR estado das contas (failureCount, lastFailureTime) se existir
        if (loadedState.accounts && Array.isArray(loadedState.accounts)) {
          // Mesclar dados persistidos com contas configuradas
          loadedState.accounts.forEach((savedAccount: AccountState) => {
            const account = this.accounts.find(acc => acc.username === savedAccount.username);
            if (account) {
              account.failureCount = savedAccount.failureCount;
              account.lastFailureTime = savedAccount.lastFailureTime;
              account.isBlocked = savedAccount.isBlocked;
              console.log(`   ♻️  Restaurado: ${account.username} (${account.failureCount} falhas, última: ${new Date(account.lastFailureTime).toLocaleString('pt-BR')})`);
            }
          });
        }

        return loadedState;
      }
    } catch (error: any) {
      console.warn(`⚠️ Erro ao carregar estado de rotação: ${error.message}`);
    }

    // Estado padrão
    return {
      currentAccountIndex: 0,
      cyclesCompleted: 0,
      lastRotationTime: 0,
      globalCooldownUntil: 0,
      accounts: []
    };
  }

  private saveState(): void {
    try {
      // 💾 SALVAR estado das contas (failureCount, lastFailureTime) para persistir entre restarts
      this.state.accounts = this.accounts.map(acc => ({
        username: acc.username,
        failureCount: acc.failureCount,
        lastFailureTime: acc.lastFailureTime,
        isBlocked: acc.isBlocked
      }));

      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (error: any) {
      console.error(`❌ Erro ao salvar estado de rotação: ${error.message}`);
    }
  }

  /**
   * Retorna a conta ativa atual
   */
  getCurrentAccount(): AccountConfig {
    const account = this.accounts[this.state.currentAccountIndex];
    if (!account) {
      throw new Error(`Nenhuma conta encontrada no índice ${this.state.currentAccountIndex}`);
    }
    return account;
  }

  /**
   * Verifica se está em cooldown global
   */
  isInGlobalCooldown(): boolean {
    return Date.now() < this.state.globalCooldownUntil;
  }

  /**
   * Retorna tempo restante de cooldown global em minutos
   */
  getGlobalCooldownMinutes(): number {
    if (!this.isInGlobalCooldown()) return 0;
    return Math.ceil((this.state.globalCooldownUntil - Date.now()) / 60000);
  }

  /**
   * Registra falha na conta atual
   */
  recordFailure(): void {
    const account = this.getCurrentAccount();
    account.failureCount++;
    account.lastFailureTime = Date.now();

    console.log(`❌ Falha registrada para ${account.username} (${account.failureCount} falhas)`);
  }

  /**
   * Registra sucesso na conta atual (reseta contadores)
   */
  recordSuccess(): void {
    const account = this.getCurrentAccount();
    account.failureCount = 0;
    account.isBlocked = false;

    console.log(`✅ Sucesso registrado para ${account.username} (contadores resetados)`);
  }

  /**
   * Verifica se deve rotacionar para próxima conta
   */
  shouldRotate(): boolean {
    // Não rotacionar se tem apenas 1 conta
    if (this.accounts.length <= 1) return false;

    // Não rotacionar se está em cooldown global
    if (this.isInGlobalCooldown()) return false;

    const account = this.getCurrentAccount();

    // Rotacionar se a conta atual atingiu limite de falhas
    return account.failureCount >= 3;
  }

  /**
   * Rotaciona para próxima conta
   */
  async rotateToNextAccount(): Promise<{
    success: boolean;
    message: string;
    newAccount: string;
    requiresWait: boolean;
    waitMinutes?: number;
  }> {
    // Verificar se pode rotacionar
    if (this.accounts.length <= 1) {
      return {
        success: false,
        message: 'Apenas 1 conta configurada - rotação não disponível',
        newAccount: this.getCurrentAccount().username,
        requiresWait: false
      };
    }

    // Verificar cooldown global
    if (this.isInGlobalCooldown()) {
      const minutesLeft = this.getGlobalCooldownMinutes();
      return {
        success: false,
        message: `Sistema em cooldown global - aguarde ${minutesLeft} minutos`,
        newAccount: this.getCurrentAccount().username,
        requiresWait: true,
        waitMinutes: minutesLeft
      };
    }

    const currentAccount = this.getCurrentAccount();
    console.log(`\n🔄 ========== ROTAÇÃO DE CONTAS ==========`);
    console.log(`   Conta atual: ${currentAccount.username}`);
    console.log(`   Falhas: ${currentAccount.failureCount}`);

    // Marcar conta atual como bloqueada
    currentAccount.isBlocked = true;

    // Ir para próxima conta
    const nextIndex = (this.state.currentAccountIndex + 1) % this.accounts.length;

    // Se voltou para primeira conta, incrementa ciclo
    if (nextIndex === 0) {
      this.state.cyclesCompleted++;
      console.log(`   🔄 Ciclo completo: ${this.state.cyclesCompleted}/${MAX_ROTATION_CYCLES}`);
    }

    // Verificar se atingiu limite de ciclos
    if (this.state.cyclesCompleted >= MAX_ROTATION_CYCLES) {
      console.log(`\n❌ ============================================`);
      console.log(`❌ LIMITE DE CICLOS ATINGIDO (${MAX_ROTATION_CYCLES})`);
      console.log(`❌ Todas as contas falharam múltiplas vezes`);
      console.log(`❌ ============================================`);
      console.log(`\n💡 Ações recomendadas:`);
      console.log(`   1. Aguardar 2-4 horas antes de tentar novamente`);
      console.log(`   2. Verificar ambas as contas no Instagram`);
      console.log(`   3. Considerar adicionar mais contas`);
      console.log(`   4. Reduzir frequência de scraping\n`);

      // Ativar cooldown global de 2 horas
      this.state.globalCooldownUntil = Date.now() + GLOBAL_COOLDOWN_MS;
      this.saveState();

      return {
        success: false,
        message: 'Limite de ciclos atingido - cooldown global de 2h ativado',
        newAccount: currentAccount.username,
        requiresWait: true,
        waitMinutes: 120
      };
    }

    this.state.currentAccountIndex = nextIndex;
    this.state.lastRotationTime = Date.now();
    this.saveState();

    const nextAccount = this.getCurrentAccount();

    // 🎯 DELAY INTELIGENTE com cálculo de tempo RESTANTE de cooldown
    const isFreshAccount = nextAccount.failureCount === 0;
    let delayMs: number;
    let delayReason: string;

    if (isFreshAccount) {
      // Conta fresca (sem falhas) → apenas tempo de login
      delayMs = 60000; // 1 minuto
      delayReason = 'conta fresca - apenas login';
    } else {
      // Conta com falhas → calcular tempo RESTANTE de cooldown
      const elapsedMs = Date.now() - nextAccount.lastFailureTime;
      const remainingCooldownMs = ACCOUNT_COOLDOWN_MS - elapsedMs;

      if (remainingCooldownMs <= 0) {
        // Conta já esfriou completamente → apenas tempo de login
        delayMs = 60000; // 1 minuto
        const cooledMinutes = Math.floor(elapsedMs / 60000);
        delayReason = `já esfriou (${cooledMinutes}min desde última falha)`;
      } else {
        // Ainda precisa esfriar → aguardar tempo RESTANTE
        delayMs = remainingCooldownMs;
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const remainingMinutes = Math.ceil(remainingCooldownMs / 60000);
        delayReason = `já esfriou ${elapsedMinutes}min, faltam ${remainingMinutes}min`;
      }
    }

    const delayMinutes = Math.ceil(delayMs / 60000);

    console.log(`   ✅ Próxima conta: ${nextAccount.username}`);
    console.log(`   📊 Status conta: ${isFreshAccount ? 'FRESCA (sem falhas)' : `${nextAccount.failureCount} falhas anteriores`}`);
    console.log(`   ⏰ Delay: ${delayMinutes}min (${delayReason})`);
    console.log(`=========================================\n`);

    return {
      success: true,
      message: `Rotacionado para ${nextAccount.username}`,
      newAccount: nextAccount.username,
      requiresWait: true,
      waitMinutes: delayMinutes
    };
  }

  /**
   * Reseta estado de rotação (limpa falhas e cooldowns)
   */
  reset(): void {
    console.log(`🔄 Resetando sistema de rotação...`);

    // Resetar contadores de todas as contas
    this.accounts.forEach(account => {
      account.failureCount = 0;
      account.lastFailureTime = 0;
      account.isBlocked = false;
    });

    // Resetar estado
    this.state = {
      currentAccountIndex: 0,
      cyclesCompleted: 0,
      lastRotationTime: 0,
      globalCooldownUntil: 0,
      accounts: []
    };

    this.saveState();
    console.log(`✅ Sistema de rotação resetado`);
  }

  /**
   * Retorna estatísticas do sistema de rotação
   */
  getStats(): {
    totalAccounts: number;
    currentAccount: string;
    cyclesCompleted: number;
    maxCycles: number;
    inGlobalCooldown: boolean;
    globalCooldownMinutes: number;
    accounts: Array<{
      username: string;
      failureCount: number;
      isBlocked: boolean;
    }>;
  } {
    return {
      totalAccounts: this.accounts.length,
      currentAccount: this.getCurrentAccount().username,
      cyclesCompleted: this.state.cyclesCompleted,
      maxCycles: MAX_ROTATION_CYCLES,
      inGlobalCooldown: this.isInGlobalCooldown(),
      globalCooldownMinutes: this.getGlobalCooldownMinutes(),
      accounts: this.accounts.map(acc => ({
        username: acc.username,
        failureCount: acc.failureCount,
        isBlocked: acc.isBlocked
      }))
    };
  }
}

// Singleton instance
let rotationInstance: InstagramAccountRotation | null = null;

export function getAccountRotation(): InstagramAccountRotation {
  if (!rotationInstance) {
    rotationInstance = new InstagramAccountRotation();
  }
  return rotationInstance;
}

export function resetAccountRotation(): void {
  if (rotationInstance) {
    rotationInstance.reset();
  }
}
