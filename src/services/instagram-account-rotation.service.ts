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
import { createClient } from '@supabase/supabase-js';

interface AccountConfig {
  username: string;                  // Email para login
  instagramUsername?: string;        // Username público do Instagram (@marciofranco2)
  password: string;
  cookiesFile: string;
  failureCount: number;
  lastFailureTime: number;
  isBlocked: boolean;
}

interface AccountState {
  username: string;
  instagramUsername?: string;        // Username público do Instagram
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

// Supabase client para audit logging
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

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
    const account1InstagramHandle = process.env.INSTAGRAM_UNOFFICIAL_USERNAME_HANDLE;
    const account2Username = process.env.INSTAGRAM_UNOFFICIAL2_USERNAME;
    const account2InstagramHandle = process.env.INSTAGRAM_UNOFFICIAL2_USERNAME_HANDLE;
    const password = process.env.INSTAGRAM_UNOFFICIAL_PASSWORD || process.env.INSTAGRAM_PASSWORD;

    if (!account1Username || !password) {
      throw new Error('Credenciais do Instagram não encontradas no .env');
    }

    // Conta 1
    this.accounts.push({
      username: account1Username,
      instagramUsername: account1InstagramHandle,
      password: password,
      cookiesFile: path.join(COOKIES_DIR, 'instagram-cookies-account1.json'),
      failureCount: 0,
      lastFailureTime: 0,
      isBlocked: false
    });

    console.log(`📧 Conta 1: ${account1Username} → Instagram: @${account1InstagramHandle || 'não configurado'}`);

    // Conta 2 (se configurada)
    if (account2Username) {
      this.accounts.push({
        username: account2Username,
        instagramUsername: account2InstagramHandle,
        password: password,
        cookiesFile: path.join(COOKIES_DIR, 'instagram-cookies-account2.json'),
        failureCount: 0,
        lastFailureTime: 0,
        isBlocked: false
      });

      console.log(`📧 Conta 2: ${account2Username} → Instagram: @${account2InstagramHandle || 'não configurado'}`);
      console.log(`🔄 Sistema de rotação ativado: ${this.accounts.length} contas`);
    } else {
      console.log(`⚠️  Apenas 1 conta configurada - rotação desabilitada`);
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
        instagramUsername: acc.instagramUsername,
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
   * Encontra conta pelo Instagram username
   * @param instagramUsername - Username do Instagram (ex: "marciofranco2")
   * @returns Índice da conta ou -1 se não encontrado
   */
  findAccountByInstagramUsername(instagramUsername: string): number {
    if (!instagramUsername) return -1;

    const normalized = instagramUsername.toLowerCase().replace('@', '');

    return this.accounts.findIndex(acc => {
      if (!acc.instagramUsername) return false;
      const accNormalized = acc.instagramUsername.toLowerCase().replace('@', '');
      return accNormalized === normalized;
    });
  }

  /**
   * Registra evento de rotação no banco de dados
   * @private
   */
  private async logRotationEvent(
    account: AccountConfig,
    eventType: string,
    errorType?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      const cooldownUntil = account.lastFailureTime
        ? new Date(account.lastFailureTime + ACCOUNT_COOLDOWN_MS).toISOString()
        : null;

      await supabase.rpc('log_account_rotation_event', {
        p_account_email: account.username,
        p_account_username: account.instagramUsername || '',
        p_event_type: eventType,
        p_failure_count: account.failureCount,
        p_error_type: errorType || null,
        p_error_message: errorMessage || null,
        p_cooldown_until: cooldownUntil
      });
    } catch (error: any) {
      // Não falhar se logging falhar - apenas avisar
      console.warn(`⚠️  Erro ao registrar evento no audit: ${error.message}`);
    }
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
  async recordFailure(errorType?: string, errorMessage?: string): Promise<void> {
    const account = this.getCurrentAccount();
    account.failureCount++;
    account.lastFailureTime = Date.now();

    console.log(`❌ Falha registrada para ${account.username} (${account.failureCount} falhas)`);

    // Registrar no banco de dados
    await this.logRotationEvent(account, 'failure_registered', errorType, errorMessage);

    // Se atingiu 3 falhas, registrar início de cooldown
    if (account.failureCount >= 3) {
      await this.logRotationEvent(account, 'cooldown_started', errorType, 'Conta atingiu 3 falhas');
    }
  }

  /**
   * Registra sucesso na conta atual (reseta contadores)
   */
  async recordSuccess(): Promise<void> {
    const account = this.getCurrentAccount();
    const wasInCooldown = account.failureCount >= 3;

    account.failureCount = 0;
    account.isBlocked = false;

    console.log(`✅ Sucesso registrado para ${account.username} (contadores resetados)`);

    // Registrar fim de cooldown se estava em cooldown
    if (wasInCooldown) {
      await this.logRotationEvent(account, 'cooldown_ended', undefined, 'Conta recuperada com sucesso');
    }

    // Registrar sessão recuperada
    await this.logRotationEvent(account, 'session_recovered');
  }

  /**
   * Verifica se deve rotacionar para próxima conta
   */
  shouldRotate(): boolean {
    console.log(`\n🔍 ========== DEBUG shouldRotate() ==========`);

    // Não rotacionar se tem apenas 1 conta
    if (this.accounts.length <= 1) {
      console.log(`   ❌ shouldRotate = FALSE: Só tem ${this.accounts.length} conta(s)`);
      console.log(`==========================================\n`);
      return false;
    }
    console.log(`   ✅ Check 1 PASSOU: ${this.accounts.length} contas configuradas`);

    // Não rotacionar se está em cooldown global
    if (this.isInGlobalCooldown()) {
      const minutesLeft = this.getGlobalCooldownMinutes();
      const cooldownUntil = new Date(this.state.globalCooldownUntil).toLocaleString('pt-BR');
      console.log(`   ❌ shouldRotate = FALSE: Em COOLDOWN GLOBAL`);
      console.log(`      Cooldown até: ${cooldownUntil}`);
      console.log(`      Tempo restante: ${minutesLeft} minutos`);
      console.log(`      Ciclos completados: ${this.state.cyclesCompleted}/${MAX_ROTATION_CYCLES}`);
      console.log(`==========================================\n`);
      return false;
    }
    console.log(`   ✅ Check 2 PASSOU: Não está em cooldown global`);

    const account = this.getCurrentAccount();
    console.log(`   🔍 Conta atual: ${account.username}`);
    console.log(`   🔍 Failure count: ${account.failureCount}`);
    console.log(`   🔍 Última falha: ${account.lastFailureTime ? new Date(account.lastFailureTime).toLocaleString('pt-BR') : 'nunca'}`);

    // Rotacionar se a conta atual atingiu limite de falhas
    const should = account.failureCount >= 3;
    if (should) {
      console.log(`   ✅ shouldRotate = TRUE: failureCount (${account.failureCount}) >= 3`);
    } else {
      console.log(`   ❌ shouldRotate = FALSE: failureCount (${account.failureCount}) < 3`);
    }
    console.log(`==========================================\n`);

    return should;
  }

  /**
   * Rotaciona para próxima conta
   * @param forceRotation - Se TRUE, ignora cooldown global (usar para SESSION_INVALID)
   */
  async rotateToNextAccount(forceRotation: boolean = false): Promise<{
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

    // Verificar cooldown global (SKIP se forceRotation = true)
    if (!forceRotation && this.isInGlobalCooldown()) {
      const minutesLeft = this.getGlobalCooldownMinutes();
      return {
        success: false,
        message: `Sistema em cooldown global - aguarde ${minutesLeft} minutos`,
        newAccount: this.getCurrentAccount().username,
        requiresWait: true,
        waitMinutes: minutesLeft
      };
    }

    // Se forçando rotação apesar de cooldown global, avisar
    if (forceRotation && this.isInGlobalCooldown()) {
      const minutesLeft = this.getGlobalCooldownMinutes();
      console.log(`\n⚠️  ROTAÇÃO FORÇADA apesar de cooldown global (${minutesLeft}min restantes)`);
      console.log(`   Razão: SESSION_INVALID detectado - precisa trocar conta agora`);
    }

    const currentAccount = this.getCurrentAccount();
    console.log(`\n🔄 ========== ROTAÇÃO DE CONTAS ==========`);
    console.log(`   Conta atual: ${currentAccount.username}`);
    console.log(`   Falhas: ${currentAccount.failureCount}`);

    // Marcar conta atual como bloqueada temporariamente
    currentAccount.isBlocked = true;

    // Calcular próxima conta
    const nextIndex = (this.state.currentAccountIndex + 1) % this.accounts.length;
    const nextAccount = this.accounts[nextIndex];

    if (!nextAccount) {
      throw new Error(`Nenhuma conta encontrada no índice ${nextIndex}`);
    }

    // ✅ VERIFICAR SE PRÓXIMA CONTA ESFRIOU (ANTES de incrementar ciclos)
    const elapsedMs = Date.now() - nextAccount.lastFailureTime;
    const hasCooledDown = elapsedMs >= ACCOUNT_COOLDOWN_MS || nextAccount.failureCount === 0;
    const cooledMinutes = Math.floor(elapsedMs / 60000);

    console.log(`\n🔍 Verificando próxima conta: ${nextAccount.username}`);
    console.log(`   Falhas anteriores: ${nextAccount.failureCount}`);
    if (nextAccount.failureCount > 0) {
      console.log(`   Tempo desde última falha: ${cooledMinutes} minutos`);
      console.log(`   Cooldown necessário: ${ACCOUNT_COOLDOWN_MS / 60000} minutos (2h)`);
      console.log(`   Status: ${hasCooledDown ? '✅ ESFRIOU - Pode usar' : '⏳ Ainda aquecida'}`);
    }

    // ✅ SE CONTA ESFRIOU: Permite rotação SEM incrementar ciclos
    if (hasCooledDown && !forceRotation) {
      console.log(`\n✅ ========== ROTAÇÃO COM CONTA ESFRIADA ==========`);
      console.log(`   Próxima conta esfriou completamente!`);
      console.log(`   Resetando status de bloqueio e contadores`);
      console.log(`   NÃO incrementando ciclos (recuperação natural)`);
      console.log(`===================================================\n`);

      // Resetar status da próxima conta (ela esfriou)
      nextAccount.isBlocked = false;
      nextAccount.failureCount = 0;
      nextAccount.lastFailureTime = 0;

      // NÃO incrementar cyclesCompleted - recuperação natural
      this.state.currentAccountIndex = nextIndex;
      this.state.lastRotationTime = Date.now();
      this.saveState();

      console.log(`   ✅ Rotacionado para: ${nextAccount.username} (conta recuperada)`);
      console.log(`   ⏰ Delay: 1min (apenas login)`);
      console.log(`=========================================\n`);

      return {
        success: true,
        message: `Rotacionado para ${nextAccount.username} (conta esfriou após ${cooledMinutes}min)`,
        newAccount: nextAccount.username,
        requiresWait: true,
        waitMinutes: 1
      };
    }

    // ❌ PRÓXIMA CONTA AINDA ESTÁ QUENTE: Incrementar ciclos
    console.log(`\n⚠️  Próxima conta ainda não esfriou completamente`);

    // Se voltou para primeira conta, incrementa ciclo
    if (nextIndex === 0) {
      this.state.cyclesCompleted++;
      console.log(`   🔄 Ciclo completo: ${this.state.cyclesCompleted}/${MAX_ROTATION_CYCLES}`);
    }

    // Verificar se atingiu limite de ciclos (SKIP se forceRotation = true)
    if (!forceRotation && this.state.cyclesCompleted >= MAX_ROTATION_CYCLES) {
      console.log(`\n❌ ============================================`);
      console.log(`❌ LIMITE DE CICLOS ATINGIDO (${MAX_ROTATION_CYCLES})`);
      console.log(`❌ Ambas as contas estão quentes simultaneamente`);
      console.log(`❌ ============================================`);
      console.log(`\n💡 Ações recomendadas:`);
      console.log(`   1. Aguardar 4 horas para cooldown global expirar`);
      console.log(`   2. Verificar ambas as contas no Instagram`);
      console.log(`   3. Sistema rotacionará automaticamente após cooldown\n`);

      // Ativar cooldown global de 4 horas
      this.state.globalCooldownUntil = Date.now() + GLOBAL_COOLDOWN_MS;
      this.saveState();

      return {
        success: false,
        message: 'Ambas as contas quentes - cooldown global de 4h ativado',
        newAccount: currentAccount.username,
        requiresWait: true,
        waitMinutes: 240
      };
    }

    // Se forçando rotação apesar de limite de ciclos, avisar e resetar ciclos
    if (forceRotation && this.state.cyclesCompleted >= MAX_ROTATION_CYCLES) {
      console.log(`\n⚠️  LIMITE DE CICLOS ATINGIDO (${this.state.cyclesCompleted}/${MAX_ROTATION_CYCLES})`);
      console.log(`   ✅ MAS rotação forçada por SESSION_INVALID - resetando contador de ciclos`);
      this.state.cyclesCompleted = 0; // Reset para permitir nova tentativa
    }

    // Rotacionar mesmo com conta quente (aguardará cooldown restante)
    this.state.currentAccountIndex = nextIndex;
    this.state.lastRotationTime = Date.now();
    this.saveState();

    // Registrar rotação no banco de dados
    await this.logRotationEvent(currentAccount, 'rotation_completed', undefined, `Rotacionado de ${currentAccount.username} para ${nextAccount.username}`);
    await this.logRotationEvent(nextAccount, 'rotation_started');

    // 🎯 DELAY INTELIGENTE com cálculo de tempo RESTANTE de cooldown
    // (usa elapsedMs já calculado anteriormente)
    const isFreshAccount = nextAccount.failureCount === 0;
    let delayMs: number;
    let delayReason: string;

    if (isFreshAccount) {
      // Conta fresca (sem falhas) → apenas tempo de login
      delayMs = 60000; // 1 minuto
      delayReason = 'conta fresca - apenas login';
    } else {
      // Conta com falhas → calcular tempo RESTANTE de cooldown
      const remainingCooldownMs = ACCOUNT_COOLDOWN_MS - elapsedMs;

      if (remainingCooldownMs <= 0) {
        // Conta já esfriou completamente → apenas tempo de login
        delayMs = 60000; // 1 minuto
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
   * Define manualmente qual conta usar (útil para testes/operação manual)
   * @param accountIdentifier - Username ou índice da conta (0, 1, etc)
   * @returns true se conseguiu setar, false se conta não encontrada
   */
  setAccount(accountIdentifier: string | number): boolean {
    let targetIndex: number;

    if (typeof accountIdentifier === 'number') {
      // Índice direto
      targetIndex = accountIdentifier;
    } else {
      // Buscar por username
      targetIndex = this.accounts.findIndex(acc => {
        const accLower = acc.username.toLowerCase();
        const identLower = accountIdentifier.toLowerCase();
        const accBase = accLower.split('@')[0] || accLower;
        return accLower.includes(identLower) || identLower.includes(accBase);
      });
    }

    if (targetIndex >= 0 && targetIndex < this.accounts.length) {
      const account = this.accounts[targetIndex];
      if (!account) {
        console.log(`❌ Erro interno: índice ${targetIndex} inválido`);
        return false;
      }
      console.log(`🎯 Conta setada manualmente: ${account.username} (index ${targetIndex})`);
      this.state.currentAccountIndex = targetIndex;
      this.saveState();
      return true;
    }

    console.log(`❌ Conta não encontrada: ${accountIdentifier}`);
    return false;
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
