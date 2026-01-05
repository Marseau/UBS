/**
 * Instagram Account Rotation Service
 *
 * Gerencia rotação inteligente entre múltiplas contas Instagram
 * para evitar bloqueios e shadowbans
 *
 * LÓGICA SIMPLIFICADA:
 * - Conta atual falha → Verifica se outra conta esfriou (2h desde última falha)
 * - Se esfriou → Rotaciona imediatamente
 * - Se NÃO esfriou → Aguarda tempo restante para esfriar, depois rotaciona
 * - Se AMBAS estão quentes E nenhuma vai esfriar em breve → Cooldown global
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { resetSessionForRotation } from './instagram-session.service';

interface AccountConfig {
  username: string;                  // Email para login
  instagramUsername?: string;        // Username público do Instagram (@marciofranco2)
  password: string;
  cookiesFile: string;
  failureCount: number;
  lastFailureTime: number;
  isBlocked: boolean;
  cooldownUntil?: number;            // Timestamp explícito para cooldown manual
}

interface AccountState {
  username: string;
  instagramUsername?: string;
  failureCount: number;
  lastFailureTime: number;
  isBlocked: boolean;
  cooldownUntil?: number;            // Timestamp explícito para cooldown manual
  usageCount?: number;               // Contador de uso para round-robin equilibrado
}

interface RotationState {
  currentAccountIndex: number;
  lastRotationTime: number;
  lastActivityTime: number;        // Quando o IP foi usado pela última vez (para IP cooling)
  accounts: AccountState[];
}

const COOKIES_DIR = path.join(process.cwd(), 'cookies');
const STATE_FILE = path.join(COOKIES_DIR, 'rotation-state.json');

// Configurações
const ACCOUNT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 horas para conta esfriar
const ROTATION_DELAY_MS = 30 * 60 * 1000; // 30 min de delay obrigatório entre rotações (IP cooling)

// Supabase client para audit logging
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

class InstagramAccountRotation {
  private accounts: AccountConfig[] = [];
  private state: RotationState;
  private syncInitialized: boolean = false;

  constructor() {
    if (!fs.existsSync(COOKIES_DIR)) {
      fs.mkdirSync(COOKIES_DIR, { recursive: true });
    }

    this.initializeAccounts();
    this.state = this.loadState();

    // 🔧 FIX: Inicializar state.accounts se estiver vazio (primeira execução)
    if (!this.state.accounts || this.state.accounts.length === 0) {
      this.state.accounts = this.accounts.map(acc => ({
        username: acc.username,
        instagramUsername: acc.instagramUsername,
        failureCount: 0,
        lastFailureTime: 0,
        isBlocked: false,
        usageCount: 0
      }));
      console.log(`📝 Inicializado state.accounts com ${this.state.accounts.length} contas`);
    }

    // Sincronizar com BD de forma assíncrona após inicialização
    this.syncFromDatabase().catch(err => {
      console.warn(`⚠️  Erro na sincronização inicial com BD: ${err.message}`);
    });
  }

  private initializeAccounts(): void {
    const account1Username = process.env.INSTAGRAM_UNOFFICIAL_USERNAME || process.env.INSTAGRAM_USERNAME;
    const account1InstagramHandle = process.env.INSTAGRAM_UNOFFICIAL_USERNAME_HANDLE;
    const account2Username = process.env.INSTAGRAM_UNOFFICIAL2_USERNAME;
    const account2InstagramHandle = process.env.INSTAGRAM_UNOFFICIAL2_USERNAME_HANDLE;
    const account3Username = process.env.INSTAGRAM_UNOFFICIAL3_USERNAME;
    const account3InstagramHandle = process.env.INSTAGRAM_UNOFFICIAL3_USERNAME_HANDLE;
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
    }

    // Conta 3 (se configurada)
    if (account3Username) {
      this.accounts.push({
        username: account3Username,
        instagramUsername: account3InstagramHandle,
        password: password,
        cookiesFile: path.join(COOKIES_DIR, 'instagram-cookies-account3.json'),
        failureCount: 0,
        lastFailureTime: 0,
        isBlocked: false
      });

      console.log(`📧 Conta 3: ${account3Username} → Instagram: @${account3InstagramHandle || 'não configurado'}`);
    }

    // Log final do sistema de rotação
    if (this.accounts.length > 1) {
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

        // Restaurar estado das contas
        if (loadedState.accounts && Array.isArray(loadedState.accounts)) {
          loadedState.accounts.forEach((savedAccount: AccountState) => {
            const account = this.accounts.find(acc => acc.username === savedAccount.username);
            if (account) {
              account.failureCount = savedAccount.failureCount;
              account.lastFailureTime = savedAccount.lastFailureTime;
              account.isBlocked = savedAccount.isBlocked;
              // 🔧 FIX: Restaurar cooldownUntil para manter cooldowns manuais após reinício
              account.cooldownUntil = savedAccount.cooldownUntil;

              const statusInfo = account.isBlocked ? '🚫 BLOQUEADA' :
                                 account.cooldownUntil ? `⏳ COOLDOWN até ${new Date(account.cooldownUntil).toLocaleString('pt-BR')}` :
                                 '✅ OK';
              console.log(`   ♻️  Restaurado: @${account.instagramUsername} (${account.failureCount} falhas) - ${statusInfo}`);
            }
          });
        }

        // Migrar estado antigo (remover campos obsoletos)
        return {
          currentAccountIndex: loadedState.currentAccountIndex || 0,
          lastRotationTime: loadedState.lastRotationTime || 0,
          lastActivityTime: loadedState.lastActivityTime || loadedState.lastRotationTime || 0,
          accounts: loadedState.accounts || []
        };
      }
    } catch (error: any) {
      console.warn(`⚠️ Erro ao carregar estado de rotação: ${error.message}`);
    }

    return {
      currentAccountIndex: 0,
      lastRotationTime: 0,
      lastActivityTime: 0,
      accounts: []
    };
  }

  async saveState(): Promise<void> {
    try {
      this.state.accounts = this.accounts.map((acc, idx) => ({
        username: acc.username,
        instagramUsername: acc.instagramUsername,
        failureCount: acc.failureCount,
        lastFailureTime: acc.lastFailureTime,
        isBlocked: acc.isBlocked,
        cooldownUntil: acc.cooldownUntil,
        usageCount: this.state.accounts.find(s => s.username === acc.username)?.usageCount || 0
      }));

      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));

      // 🔧 FIX: Sincronizar com BD de forma SÍNCRONA (await obrigatório)
      // Isso garante que o BD está atualizado antes de retornar
      try {
        await this.syncToDatabase();
      } catch (err: any) {
        console.warn(`⚠️  Erro ao sincronizar com BD: ${err.message}`);
        // Não propaga erro - JSON já foi salvo como fallback
      }
    } catch (error: any) {
      console.error(`❌ Erro ao salvar estado de rotação: ${error.message}`);
    }
  }

  /**
   * Sincroniza estado do BD para memória/JSON
   * BD é fonte de verdade para cooldownUntil (cooldowns manuais)
   */
  async syncFromDatabase(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('instagram_account_rotation_state')
        .select('*');

      if (error) {
        console.warn(`⚠️  Erro ao buscar estado do BD: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        console.log(`📥 [SYNC] Nenhum estado no BD - usando JSON local`);
        // Primeira vez: sincronizar JSON -> BD
        await this.syncToDatabase();
        return;
      }

      console.log(`📥 [SYNC] Sincronizando ${data.length} contas do BD...`);

      let hasChanges = false;
      let currentAccountFromDb: string | null = null;

      for (const dbAccount of data) {
        const account = this.accounts.find(acc => acc.username === dbAccount.account_email);
        if (!account) continue;

        // Verificar cooldown manual do BD (prioridade sobre JSON)
        if (dbAccount.cooldown_until) {
          const cooldownUntilTs = new Date(dbAccount.cooldown_until).getTime();
          const now = Date.now();

          if (cooldownUntilTs > now) {
            // Cooldown ainda ativo no BD
            if (!account.cooldownUntil || account.cooldownUntil !== cooldownUntilTs) {
              console.log(`   🔄 @${account.instagramUsername}: cooldown manual do BD até ${new Date(cooldownUntilTs).toLocaleString('pt-BR')}`);
              account.cooldownUntil = cooldownUntilTs;
              account.isBlocked = true;
              // 🔧 FIX BUG 3: Garantir consistência - se bloqueado por cooldown, ter ao menos 1 falha
              if (account.failureCount === 0) {
                account.failureCount = 1;
                console.log(`   🔧 @${account.instagramUsername}: failureCount ajustado para 1 (consistência)`);
              }
              hasChanges = true;
            }
          } else {
            // Cooldown expirou - limpar TUDO
            if (account.cooldownUntil || account.isBlocked) {
              console.log(`   ✅ @${account.instagramUsername}: cooldown manual expirou - limpando estado`);
              account.cooldownUntil = undefined;
              account.isBlocked = false;
              account.failureCount = 0;
              hasChanges = true;
            }
          }
        }

        // Verificar qual conta está ativa no BD
        if (dbAccount.is_current_account) {
          currentAccountFromDb = dbAccount.account_email;
        }

        // 📱 Sincronizar usage_count do BD
        if (typeof dbAccount.usage_count === 'number') {
          const stateAccount = this.state.accounts.find(s => s.username === account.username);
          if (stateAccount) {
            const currentUsage = stateAccount.usageCount || 0;
            if (dbAccount.usage_count !== currentUsage) {
              console.log(`   📊 @${account.instagramUsername}: usage_count ${currentUsage} → ${dbAccount.usage_count} (do BD)`);
              stateAccount.usageCount = dbAccount.usage_count;
              hasChanges = true;
            }
          }
        }
      }

      // Sincronizar conta ativa do BD
      if (currentAccountFromDb) {
        const dbCurrentIndex = this.accounts.findIndex(acc => acc.username === currentAccountFromDb);
        if (dbCurrentIndex >= 0 && dbCurrentIndex !== this.state.currentAccountIndex) {
          console.log(`   🔄 Conta ativa no BD: ${currentAccountFromDb} (index ${dbCurrentIndex})`);
          this.state.currentAccountIndex = dbCurrentIndex;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        // Salvar mudanças no JSON (sem re-sincronizar para BD)
        this.state.accounts = this.accounts.map(acc => {
          const stateAcc = this.state.accounts.find(s => s.username === acc.username);
          return {
            username: acc.username,
            instagramUsername: acc.instagramUsername,
            failureCount: acc.failureCount,
            lastFailureTime: acc.lastFailureTime,
            isBlocked: acc.isBlocked,
            cooldownUntil: acc.cooldownUntil,
            usageCount: stateAcc?.usageCount || 0
          };
        });
        fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
        console.log(`   ✅ JSON atualizado com dados do BD`);
      }

      this.syncInitialized = true;
      console.log(`📥 [SYNC] Sincronização com BD concluída`);

      // 🔧 FIX: Verificar e corrigir estados inconsistentes após sync
      for (const account of this.accounts) {
        this.hasAccountCooledDown(account); // Isso detecta e marca correções necessárias
      }
      await this.flushStateIfNeeded();

    } catch (error: any) {
      console.error(`❌ Erro na sincronização com BD: ${error.message}`);
    }
  }

  /**
   * Sincroniza estado da memória/JSON para BD
   */
  async syncToDatabase(): Promise<void> {
    try {
      const currentAccount = this.accounts[this.state.currentAccountIndex];

      for (const account of this.accounts) {
        const isCurrent = account.username === currentAccount?.username;

        // Calcular cooldown_until
        let cooldownUntil: string | null = null;
        if (account.cooldownUntil && account.cooldownUntil > Date.now()) {
          cooldownUntil = new Date(account.cooldownUntil).toISOString();
        } else if (account.lastFailureTime && account.isBlocked) {
          cooldownUntil = new Date(account.lastFailureTime + ACCOUNT_COOLDOWN_MS).toISOString();
        }

        // Buscar usageCount do state
        const accountState = this.state.accounts.find(s => s.username === account.username);
        const usageCount = accountState?.usageCount || 0;

        const { error } = await supabase
          .from('instagram_account_rotation_state')
          .upsert({
            account_email: account.username,
            account_instagram_username: account.instagramUsername || '',
            failure_count: account.failureCount,
            last_failure_time: account.lastFailureTime ? new Date(account.lastFailureTime).toISOString() : null,
            is_blocked: account.isBlocked,
            is_current_account: isCurrent,
            cooldown_until: cooldownUntil,
            last_rotation_time: this.state.lastRotationTime ? new Date(this.state.lastRotationTime).toISOString() : null,
            usage_count: usageCount,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'account_email'
          });

        if (error) {
          console.warn(`⚠️  Erro ao sincronizar ${account.username} para BD: ${error.message}`);
        }
      }

      console.log(`📤 [SYNC] Estado sincronizado para BD`);
    } catch (error: any) {
      console.error(`❌ Erro ao sincronizar para BD: ${error.message}`);
    }
  }

  /**
   * Define cooldown manual para uma conta (via BD)
   */
  async setManualCooldown(accountIdentifier: string, cooldownUntil: Date, reason?: string): Promise<boolean> {
    const targetIndex = this.accounts.findIndex(acc => {
      const accLower = acc.username.toLowerCase();
      const identLower = accountIdentifier.toLowerCase();
      const instagramLower = (acc.instagramUsername || '').toLowerCase().replace('@', '');
      return accLower.includes(identLower) ||
             identLower.includes(instagramLower) ||
             instagramLower === identLower;
    });

    if (targetIndex < 0) {
      console.log(`❌ Conta não encontrada: ${accountIdentifier}`);
      return false;
    }

    const account = this.accounts[targetIndex];
    if (!account) return false;

    account.cooldownUntil = cooldownUntil.getTime();
    account.isBlocked = true;

    console.log(`⏸️  Cooldown manual definido para @${account.instagramUsername} até ${cooldownUntil.toLocaleString('pt-BR')}`);

    // Registrar no audit
    await this.logRotationEvent(account, 'cooldown_started', undefined, reason || 'Cooldown manual');

    await this.saveState();
    return true;
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
   * Retorna todas as contas configuradas
   */
  getAllAccounts(): AccountConfig[] {
    return this.accounts;
  }

  /**
   * Encontra conta pelo Instagram username
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
      console.warn(`⚠️  Erro ao registrar evento no audit: ${error.message}`);
    }
  }

  /**
   * Verifica se uma conta específica esfriou (passou 2h desde última falha OU cooldown manual)
   * 🔧 FIX v3: Detecta e corrige estados inconsistentes automaticamente
   */
  private hasAccountCooledDown(account: AccountConfig): boolean {
    const now = Date.now();

    // Verificar cooldown manual explícito (prioridade máxima)
    if (account.cooldownUntil && account.cooldownUntil > now) {
      return false; // Cooldown manual ainda ativo
    }

    // Limpar cooldown manual expirado
    if (account.cooldownUntil && account.cooldownUntil <= now) {
      console.log(`   🔧 @${account.instagramUsername}: cooldown manual expirou, limpando...`);
      account.cooldownUntil = undefined;
      account.isBlocked = false;
      account.failureCount = 0;
      // Marcar para salvar (será salvo na próxima operação)
      this._stateNeedsSave = true;
    }

    // 🔧 FIX v3: Detectar estado inconsistente (bloqueada sem razão válida)
    if (account.isBlocked && account.failureCount === 0 && !account.lastFailureTime) {
      console.log(`   🔧 @${account.instagramUsername}: estado inconsistente detectado (bloqueada sem falhas) - corrigindo`);
      account.isBlocked = false;
      account.cooldownUntil = undefined;
      this._stateNeedsSave = true;
      return true; // Agora está disponível
    }

    // Se conta está bloqueada, verificar se o tempo de cooldown já passou
    if (account.isBlocked) {
      // Se tem lastFailureTime, verificar se já passou o tempo de cooldown
      if (account.lastFailureTime) {
        const elapsed = now - account.lastFailureTime;
        if (elapsed >= ACCOUNT_COOLDOWN_MS) {
          // Cooldown expirou - desbloquear automaticamente
          console.log(`   ✅ @${account.instagramUsername}: cooldown de 2h expirou, desbloqueando`);
          account.isBlocked = false;
          account.failureCount = 0;
          account.cooldownUntil = undefined;
          this._stateNeedsSave = true;
          return true;
        }
        return false; // Ainda em cooldown
      }
      // Bloqueada mas sem lastFailureTime E com falhas - manter bloqueada
      if (account.failureCount > 0) {
        return false;
      }
      // Bloqueada sem lastFailureTime E sem falhas - estado inconsistente, desbloquear
      console.log(`   🔧 @${account.instagramUsername}: bloqueada sem motivo válido - desbloqueando`);
      account.isBlocked = false;
      this._stateNeedsSave = true;
      return true;
    }

    // Conta não bloqueada está sempre disponível
    return true;
  }

  // Flag para indicar que estado precisa ser salvo
  private _stateNeedsSave = false;

  /**
   * Verifica e salva estado se necessário (chamado após operações de verificação)
   */
  async flushStateIfNeeded(): Promise<void> {
    if (this._stateNeedsSave) {
      await this.saveState();
      this._stateNeedsSave = false;
      console.log(`   💾 Estado salvo após correção automática`);
    }
  }

  /**
   * Retorna tempo restante para conta esfriar (em minutos)
   */
  private getAccountCooldownRemaining(account: AccountConfig): number {
    if (this.hasAccountCooledDown(account)) return 0;

    const now = Date.now();

    // Verificar cooldown manual explícito (prioridade)
    if (account.cooldownUntil && account.cooldownUntil > now) {
      return Math.ceil((account.cooldownUntil - now) / 60000);
    }

    // Cooldown baseado em lastFailureTime
    const elapsed = now - account.lastFailureTime;
    const remaining = ACCOUNT_COOLDOWN_MS - elapsed;
    return Math.ceil(remaining / 60000);
  }

  /**
   * Registra falha na conta atual
   * @param errorType Tipo do erro (opcional)
   * @param errorMessage Mensagem do erro (opcional)
   * @param forceFailureCount Se definido, usa este valor em vez de incrementar
   */
  async recordFailure(errorType?: string, errorMessage?: string, forceFailureCount?: number): Promise<void> {
    const account = this.getCurrentAccount();
    const FAILURE_THRESHOLD = 3; // 🔧 FIX: Só bloqueia após 3 falhas

    // 🔧 SEMPRE atualizar lastActivityTime (IP cooling) - mesmo em falha, o IP foi usado
    this.state.lastActivityTime = Date.now();

    if (forceFailureCount !== undefined) {
      // Usar valor forçado (para erros críticos que precisam de rotação imediata)
      account.failureCount = forceFailureCount;
    } else {
      account.failureCount++;
    }

    account.lastFailureTime = Date.now();

    // 🔧 FIX: Só marca como bloqueada se atingiu o limite de falhas
    // Isso evita rotação desnecessária após 1 falha isolada
    if (account.failureCount >= FAILURE_THRESHOLD) {
      account.isBlocked = true;

      // 🔧 FIX: NÃO atualizar lastRotationTime aqui!
      // lastRotationTime deve ser atualizado APENAS quando uma rotação REAL acontece
      // O IP cooling é baseado no tempo desde a última ROTAÇÃO, não desde o último BLOQUEIO

      console.log(`❌ Falha registrada para @${account.instagramUsername} (${account.failureCount} falhas) - 🚫 BLOQUEADA`);
      console.log(`   ⏱️  Conta bloqueada. Próxima rotação respeitará IP cooling de 30min.`);
    } else {
      console.log(`⚠️  Falha registrada para @${account.instagramUsername} (${account.failureCount}/${FAILURE_THRESHOLD} falhas) - ainda funcional`);
    }

    await this.logRotationEvent(account, 'failure_registered', errorType, errorMessage);
    await this.saveState();
  }

  /**
   * Registra sucesso na conta atual
   * 🔧 FIX: Decrementa falhas gradualmente em vez de resetar tudo
   * Isso evita que contas instáveis nunca atinjam o threshold de bloqueio
   */
  async recordSuccess(): Promise<void> {
    const account = this.getCurrentAccount();
    const wasBlocked = account.isBlocked;
    const previousFailures = account.failureCount;

    // 🔧 SEMPRE atualizar lastActivityTime (IP cooling)
    this.state.lastActivityTime = Date.now();
    console.log(`📡 [IP] Atividade registrada às ${new Date().toLocaleTimeString('pt-BR')} (@${account.instagramUsername})`);

    // Só faz mais algo se a conta tinha problemas anteriores
    if (!wasBlocked && previousFailures === 0) {
      await this.saveState();
      return;
    }

    // 🔧 FIX: Decrementar gradualmente em vez de resetar para 0
    // Cada sucesso reduz 1 falha, precisa de múltiplos sucessos para "limpar" a conta
    if (previousFailures > 0) {
      account.failureCount = previousFailures - 1;
      console.log(`✅ Sucesso para @${account.instagramUsername}: falhas ${previousFailures} → ${account.failureCount}`);
    }

    // Se estava bloqueada e agora tem 0 falhas, desbloquear
    if (wasBlocked && account.failureCount === 0) {
      account.isBlocked = false;
      console.log(`   🔓 Conta desbloqueada após recuperação completa`);
      await this.logRotationEvent(account, 'cooldown_ended', undefined, 'Conta recuperada com sucesso');
    } else if (previousFailures > 0 && account.failureCount === 0) {
      await this.logRotationEvent(account, 'session_recovered');
    }

    await this.saveState();
  }

  /**
   * Registra atividade do IP (para IP cooling)
   * Deve ser chamado sempre que o scraper fizer qualquer atividade
   */
  async recordActivity(): Promise<void> {
    const now = Date.now();
    this.state.lastActivityTime = now;
    await this.saveState();

    const currentAccount = this.getCurrentAccount();
    console.log(`📡 [IP ACTIVITY] Registrado às ${new Date(now).toLocaleTimeString('pt-BR')} (@${currentAccount.instagramUsername})`);
  }

  /**
   * Retorna quanto tempo falta para o IP esfriar (em minutos)
   */
  getIpCoolingRemaining(): number {
    const timeSinceLastActivity = Date.now() - this.state.lastActivityTime;
    const remaining = Math.max(0, ROTATION_DELAY_MS - timeSinceLastActivity);
    return Math.ceil(remaining / 60000);
  }

  /**
   * Verifica se o IP está frio (pronto para rotação)
   */
  isIpCool(): boolean {
    return this.getIpCoolingRemaining() === 0;
  }

  /**
   * Verifica se deve rotacionar para próxima conta
   */
  shouldRotate(): boolean {
    console.log(`\n🔍 ========== DEBUG shouldRotate() ==========`);

    if (this.accounts.length <= 1) {
      console.log(`   ❌ shouldRotate = FALSE: Só tem ${this.accounts.length} conta(s)`);
      console.log(`==========================================\n`);
      return false;
    }

    const account = this.getCurrentAccount();
    console.log(`   🔍 Conta atual: ${account.username}`);
    console.log(`   🔍 isBlocked: ${account.isBlocked}`);
    console.log(`   🔍 Failure count: ${account.failureCount}`);

    // Rotacionar se a conta atual está bloqueada
    const should = account.isBlocked;
    if (should) {
      console.log(`   ✅ shouldRotate = TRUE: conta está bloqueada`);
    } else {
      console.log(`   ❌ shouldRotate = FALSE: conta não está bloqueada`);
    }
    console.log(`==========================================\n`);

    return should;
  }

  /**
   * Rotaciona para próxima conta
   * Retorna informações sobre o que fazer (rotacionar imediato, aguardar, ou parar)
   */
  async rotateToNextAccount(): Promise<{
    success: boolean;
    message: string;
    newAccount: string;
    requiresWait: boolean;
    waitMinutes?: number;
  }> {
    if (this.accounts.length <= 1) {
      return {
        success: false,
        message: 'Apenas 1 conta configurada - rotação não disponível',
        newAccount: this.getCurrentAccount().username,
        requiresWait: false
      };
    }

    const currentAccount = this.getCurrentAccount();

    // 🔄 ROUND-ROBIN EQUILIBRADO: Ordenar por usageCount, depois por cooldown
    const otherAccounts = this.accounts
      .map((acc, idx) => ({
        account: acc,
        index: idx,
        usageCount: this.state.accounts.find(s => s.username === acc.username)?.usageCount || 0,
        cooldownRemaining: this.getAccountCooldownRemaining(acc)
      }))
      .filter(item => item.account.username !== currentAccount.username)
      .sort((a, b) => {
        // Primeiro: só considerar contas disponíveis (cooldown = 0)
        if (a.cooldownRemaining === 0 && b.cooldownRemaining > 0) return -1;
        if (b.cooldownRemaining === 0 && a.cooldownRemaining > 0) return 1;
        // Entre disponíveis: menor usageCount primeiro
        if (a.cooldownRemaining === 0 && b.cooldownRemaining === 0) {
          return a.usageCount - b.usageCount;
        }
        // Entre indisponíveis: menor cooldown primeiro
        return a.cooldownRemaining - b.cooldownRemaining;
      });

    if (otherAccounts.length === 0) {
      return {
        success: false,
        message: 'Erro: nenhuma outra conta disponível para rotação',
        newAccount: currentAccount.username,
        requiresWait: false
      };
    }

    // Pegar a melhor opção (menos usada entre as disponíveis, ou menor cooldown)
    const bestOption = otherAccounts[0]!;
    const nextAccount = bestOption.account;
    const nextIndex = bestOption.index;

    console.log(`\n🔄 ========== ROTAÇÃO DE CONTAS (ROUND-ROBIN) ==========`);
    console.log(`   Conta atual: ${currentAccount.username} (bloqueada)`);
    console.log(`   🎯 Próxima conta: ${nextAccount.username} (@${nextAccount.instagramUsername})`);

    // Listar todas as opções para debug
    console.log(`   📊 Ranking de contas (ROUND-ROBIN):`);
    for (const opt of otherAccounts) {
      const status = opt.cooldownRemaining === 0 ? '✅ DISPONÍVEL' : `⏳ ${opt.cooldownRemaining}min`;
      console.log(`      - @${opt.account.instagramUsername}: ${status} (uso: ${opt.usageCount}x)`);
    }

    // Verificar se a conta mais fria já esfriou
    const nextCooledDown = this.hasAccountCooledDown(nextAccount);
    const nextCooldownRemaining = bestOption.cooldownRemaining;

    // 🔧 FIX v2: IP cooling baseado em lastFailureTime da conta atual (quando houve PROBLEMA)
    // IP cooling só deve ser aplicado após FALHAS, não após atividades normais bem-sucedidas
    const currentAccountLastFailure = currentAccount.lastFailureTime || 0;
    const timeSinceLastFailure = Date.now() - currentAccountLastFailure;
    const ipCoolingRemaining = currentAccountLastFailure > 0
      ? Math.max(0, ROTATION_DELAY_MS - timeSinceLastFailure)
      : 0; // Se nunca houve falha, não precisa de IP cooling
    const ipCoolingMinutes = Math.ceil(ipCoolingRemaining / 60000);
    const timeSinceFailureMinutes = Math.round(timeSinceLastFailure / 60000);

    console.log(`   Próxima conta esfriou? ${nextCooledDown ? '✅ SIM' : `❌ NÃO (faltam ${nextCooldownRemaining}min)`}`);
    console.log(`   ⏱️  IP cooling: ${ipCoolingRemaining > 0 ? `${ipCoolingMinutes}min restantes (última falha há ${timeSinceFailureMinutes}min)` : '✅ OK (sem falhas recentes ou 30min desde última falha)'}`);

    // IP cooling é SEMPRE obrigatório antes de qualquer rotação
    const waitForIpCooling = ipCoolingRemaining > 0 ? ipCoolingMinutes : 0;
    const waitForAccountCooldown = !nextCooledDown ? nextCooldownRemaining : 0;
    const maxWaitMinutes = Math.max(waitForIpCooling, waitForAccountCooldown);

    if (maxWaitMinutes > 0) {
      const reasons: string[] = [];
      if (waitForIpCooling > 0) reasons.push(`IP cooling: ${waitForIpCooling}min`);
      if (waitForAccountCooldown > 0) reasons.push(`Conta ${nextAccount.instagramUsername}: ${waitForAccountCooldown}min`);

      console.log(`\n⏳ 🚨 AGUARDANDO ${maxWaitMinutes}min ANTES DE ROTACIONAR`);
      console.log(`   Motivos: ${reasons.join(' | ')}`);
      console.log(`   ❌ NÃO rotacionando ainda - aguardar tempo máximo`);

      return {
        success: true,
        message: `Aguardando ${maxWaitMinutes}min (${reasons.join(', ')})`,
        newAccount: currentAccount.username,
        requiresWait: true,
        waitMinutes: maxWaitMinutes
      };
    }

    // ✅ Ambas condições satisfeitas: IP esfriou E próxima conta disponível
    console.log(`\n✅ IP esfriou (30min desde último bloqueio) E próxima conta disponível - rotacionando`);

    nextAccount.failureCount = 0;
    nextAccount.isBlocked = false;
    nextAccount.lastFailureTime = 0;

    this.state.currentAccountIndex = nextIndex;
    this.state.lastRotationTime = Date.now();
    await this.saveState();

    await this.logRotationEvent(nextAccount, 'rotation_started');

    console.log(`   ✅ Rotacionado para: ${nextAccount.username}`);
    console.log(`=========================================\n`);

    return {
      success: true,
      message: `Rotacionado para ${nextAccount.username}`,
      newAccount: nextAccount.username,
      requiresWait: false
    };
  }

  /**
   * Reseta estado de rotação (limpa falhas e cooldowns)
   */
  async reset(): Promise<void> {
    console.log(`🔄 Resetando sistema de rotação...`);

    this.accounts.forEach(account => {
      account.failureCount = 0;
      account.lastFailureTime = 0;
      account.isBlocked = false;
    });

    this.state = {
      currentAccountIndex: 0,
      lastRotationTime: 0,
      lastActivityTime: 0,
      accounts: []
    };

    await this.saveState();
    console.log(`✅ Sistema de rotação resetado`);
  }

  /**
   * Define manualmente qual conta usar
   */
  async setAccount(accountIdentifier: string | number): Promise<boolean> {
    let targetIndex: number;

    if (typeof accountIdentifier === 'number') {
      targetIndex = accountIdentifier;
    } else {
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
      await this.saveState();
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
    currentAccountInstagram: string;
    rotationDelayMinutes: number;
    canRotateNow: boolean;
    lastSyncWithDb: boolean;
    accounts: Array<{
      username: string;
      instagramUsername: string;
      failureCount: number;
      isBlocked: boolean;
      cooledDown: boolean;
      cooldownRemaining: number;
      cooldownUntil: string | null;
      isCurrent: boolean;
      usageCount: number;
    }>;
  } {
    const timeSinceLastRotation = Date.now() - this.state.lastRotationTime;
    const rotationDelayRemaining = Math.max(0, ROTATION_DELAY_MS - timeSinceLastRotation);
    const currentAcc = this.getCurrentAccount();

    return {
      totalAccounts: this.accounts.length,
      currentAccount: currentAcc.username,
      currentAccountInstagram: currentAcc.instagramUsername || '',
      rotationDelayMinutes: Math.ceil(rotationDelayRemaining / 60000),
      canRotateNow: rotationDelayRemaining === 0,
      lastSyncWithDb: this.syncInitialized,
      accounts: this.accounts.map((acc, idx) => ({
        username: acc.username,
        instagramUsername: acc.instagramUsername || '',
        failureCount: acc.failureCount,
        isBlocked: acc.isBlocked,
        cooledDown: this.hasAccountCooledDown(acc),
        cooldownRemaining: this.getAccountCooldownRemaining(acc),
        cooldownUntil: acc.cooldownUntil ? new Date(acc.cooldownUntil).toISOString() : null,
        isCurrent: acc.username === currentAcc.username,
        usageCount: this.state.accounts.find(s => s.username === acc.username)?.usageCount || 0
      }))
    };
  }

  /**
   * Força sincronização imediata com BD
   */
  async forceSync(): Promise<void> {
    console.log(`🔄 [SYNC] Forçando sincronização com BD...`);
    await this.syncFromDatabase();
  }

  /**
   * 🆕 CRÍTICO: Garante que há uma conta disponível ANTES de iniciar sessão
   *
   * 🔧 FIX: LÓGICA CORRIGIDA - Prioriza conta atual se funcionando
   * - Se a conta ATUAL está disponível (não bloqueada) → USA ELA (sem rotação)
   * - Só tenta rotacionar se a conta atual está BLOQUEADA
   * - IP cooling só se aplica quando há NECESSIDADE de rotação
   */
  async ensureAvailableAccount(): Promise<{
    success: boolean;
    account: string;
    rotated: boolean;
    reason?: string;
  }> {
    console.log(`\n🔍 ========== VERIFICANDO CONTA DISPONÍVEL ==========`);

    const currentAccount = this.getCurrentAccount();
    const currentAvailable = this.hasAccountCooledDown(currentAccount);

    console.log(`   📌 Conta atual: @${currentAccount.instagramUsername}`);
    console.log(`   📌 Status: ${currentAvailable ? '✅ DISPONÍVEL' : '🚫 BLOQUEADA'}`);
    console.log(`   📌 Falhas: ${currentAccount.failureCount}, Bloqueada: ${currentAccount.isBlocked}`);

    // 🔧 FIX: Se conta atual está funcionando, USE ELA - não tente otimizar
    if (currentAvailable) {
      // 🔄 ROUND-ROBIN: Incrementar usageCount da conta atual (por username, não índice)
      const accountState = this.state.accounts.find(s => s.username === currentAccount.username);
      if (accountState) {
        accountState.usageCount = (accountState.usageCount || 0) + 1;
      }

      const usageCount = accountState?.usageCount || 1;
      console.log(`   ✅ Conta atual @${currentAccount.instagramUsername} está funcionando - USANDO (uso: ${usageCount}x)`);
      console.log(`====================================================\n`);

      // 🔧 FIX: SEMPRE salvar estado após incrementar usageCount
      await this.saveState();

      return {
        success: true,
        account: currentAccount.instagramUsername || currentAccount.username,
        rotated: false
      };
    }

    // Conta atual BLOQUEADA - precisa rotacionar
    console.log(`   ⚠️  Conta atual BLOQUEADA - buscando alternativa...`);

    // 🔄 ROUND-ROBIN EQUILIBRADO: Rankear por usageCount (menor = menos usada)
    // Se usageCount igual, desempata por lastFailureTime (menor = mais fria)
    const otherAccounts = this.accounts
      .map((acc, idx) => ({
        account: acc,
        index: idx,
        usageCount: this.state.accounts.find(s => s.username === acc.username)?.usageCount || 0,
        lastFailureTime: acc.lastFailureTime || 0,
        available: this.hasAccountCooledDown(acc),
        isCurrent: idx === this.state.currentAccountIndex
      }))
      .filter(item => !item.isCurrent)
      .sort((a, b) => {
        // Primeiro: menor usageCount (menos usada tem prioridade)
        if (a.usageCount !== b.usageCount) {
          return a.usageCount - b.usageCount;
        }
        // Desempate: menor lastFailureTime (mais fria)
        return a.lastFailureTime - b.lastFailureTime;
      });

    console.log(`   📊 Outras contas (por ordem de preferência - ROUND-ROBIN):`);
    for (const item of otherAccounts) {
      let statusText: string;
      if (item.available) {
        statusText = '✅ DISPONÍVEL';
      } else if (item.account.isBlocked) {
        const remaining = this.getAccountCooldownRemaining(item.account);
        statusText = `🚫 BLOQUEADA (${remaining}min restantes)`;
      } else if (item.account.cooldownUntil && item.account.cooldownUntil > Date.now()) {
        const remaining = Math.ceil((item.account.cooldownUntil - Date.now()) / 60000);
        statusText = `⏳ COOLDOWN MANUAL (${remaining}min)`;
      } else {
        const remaining = this.getAccountCooldownRemaining(item.account);
        statusText = `⏳ ESFRIANDO (${remaining}min)`;
      }
      console.log(`      - @${item.account.instagramUsername}: ${statusText} (uso: ${item.usageCount}x)`);
    }

    // Encontrar próxima conta disponível
    const nextAvailable = otherAccounts.find(a => a.available);

    if (!nextAvailable) {
      // Nenhuma outra disponível - calcular tempo de espera
      const allAccounts = [
        { account: currentAccount, cooldown: this.getAccountCooldownRemaining(currentAccount) },
        ...otherAccounts.map(a => ({ account: a.account, cooldown: this.getAccountCooldownRemaining(a.account) }))
      ];
      const waitTime = Math.min(...allAccounts.map(a => a.cooldown));
      console.log(`   ❌ Nenhuma conta disponível. Aguarde ${waitTime}min`);
      console.log(`====================================================\n`);
      await this.flushStateIfNeeded();
      return {
        success: false,
        account: '',
        rotated: false,
        reason: `Todas em cooldown. Aguarde ${waitTime}min`
      };
    }

    // 🔧 FIX v2: IP cooling baseado em lastFailureTime (quando houve PROBLEMA)
    // IP cooling só se aplica após FALHAS, não após atividades normais
    const currentAccountLastFailure = currentAccount.lastFailureTime || 0;
    const timeSinceLastFailure = Date.now() - currentAccountLastFailure;
    const ipCoolingRemaining = currentAccountLastFailure > 0
      ? Math.max(0, ROTATION_DELAY_MS - timeSinceLastFailure)
      : 0; // Se nunca houve falha, não precisa de IP cooling

    if (ipCoolingRemaining > 0) {
      const ipCoolingMinutes = Math.ceil(ipCoolingRemaining / 60000);
      const timeSinceFailureMinutes = Math.round(timeSinceLastFailure / 60000);
      console.log(`   ❌ IP cooling ativo: ${ipCoolingMinutes}min restantes`);
      console.log(`   ⏱️  Última falha há ${timeSinceFailureMinutes}min (precisa 30min para rotacionar)`);
      console.log(`====================================================\n`);
      await this.flushStateIfNeeded();
      return {
        success: false,
        account: currentAccount.instagramUsername || currentAccount.username,
        rotated: false,
        reason: `Aguarde ${ipCoolingMinutes}min (IP cooling - última falha há ${timeSinceFailureMinutes}min)`
      };
    }

    // ✅ Rotacionar para próxima conta disponível
    console.log(`   🔄 Rotacionando para @${nextAvailable.account.instagramUsername}...`);
    await resetSessionForRotation();

    this.state.currentAccountIndex = nextAvailable.index;
    this.state.lastRotationTime = Date.now();

    // 🔄 ROUND-ROBIN: Incrementar usageCount da nova conta (por username, não índice)
    const accountState = this.state.accounts.find(s => s.username === nextAvailable.account.username);
    if (accountState) {
      accountState.usageCount = (accountState.usageCount || 0) + 1;
    }

    await this.saveState();

    const newUsageCount = accountState?.usageCount || 1;
    console.log(`   ✅ Rotacionado para @${nextAvailable.account.instagramUsername} (uso: ${newUsageCount}x)`);
    console.log(`====================================================\n`);
    return {
      success: true,
      account: nextAvailable.account.instagramUsername || nextAvailable.account.username,
      rotated: true
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

export async function resetAccountRotation(): Promise<void> {
  if (rotationInstance) {
    await rotationInstance.reset();
  }
}

/**
 * Registra atividade do IP (deve ser chamado pelo scraper)
 * Isso atualiza lastActivityTime para o IP cooling funcionar corretamente
 */
export async function recordIpActivity(): Promise<void> {
  const rotation = getAccountRotation();
  await rotation.recordActivity();
}

/**
 * Verifica quanto tempo falta para o IP esfriar
 */
export function getIpCoolingStatus(): { isCool: boolean; remainingMinutes: number } {
  const rotation = getAccountRotation();
  const remaining = rotation.getIpCoolingRemaining();
  return {
    isCool: remaining === 0,
    remainingMinutes: remaining
  };
}
