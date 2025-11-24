/**
 * Proxy Rotation Service
 *
 * Gerencia rotação de proxies para evitar bloqueios do Instagram
 * Suporta múltiplos providers: ProxyEmpire, AnyIP, FlyProxy, etc.
 */

interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol: 'http' | 'https' | 'socks5';
  // Sticky session support (Decodo)
  stickySession?: boolean;
  sessionId?: string;
  sessionDuration?: number; // em minutos (1-1440)
  country?: string; // código do país (ex: 'br')
  city?: string; // nome da cidade
}

interface ProxyProvider {
  name: string;
  type: 'residential' | 'mobile' | 'datacenter';
  enabled: boolean;
  proxies: ProxyConfig[];
}

class ProxyRotationService {
  private providers: Map<string, ProxyProvider> = new Map();
  private currentProxyIndex: number = 0;
  private proxyUsageStats: Map<string, { requests: number; failures: number; lastUsed: Date }> = new Map();
  private rotationStrategy: 'round-robin' | 'random' | 'least-used' = 'round-robin';
  private maxFailuresPerProxy: number = 3;
  private cooldownMinutes: number = 5;

  constructor() {
    this.initializeProviders();
  }

  /**
   * Inicializa providers de proxy baseado nas variáveis de ambiente
   */
  private initializeProviders(): void {
    // ProxyEmpire (Residential - Brasil)
    if (process.env.PROXY_EMPIRE_ENABLED === 'true') {
      this.addProvider({
        name: 'ProxyEmpire',
        type: 'residential',
        enabled: true,
        proxies: this.parseProxyList(process.env.PROXY_EMPIRE_LIST || ''),
      });
    }

    // AnyIP (Low-cost option)
    if (process.env.ANYIP_ENABLED === 'true') {
      this.addProvider({
        name: 'AnyIP',
        type: 'residential',
        enabled: true,
        proxies: this.parseProxyList(process.env.ANYIP_LIST || ''),
      });
    }

    // FlyProxy (Affordable option)
    if (process.env.FLYPROXY_ENABLED === 'true') {
      this.addProvider({
        name: 'FlyProxy',
        type: 'residential',
        enabled: true,
        proxies: this.parseProxyList(process.env.FLYPROXY_LIST || ''),
      });
    }

    // Webshare (Rotating Residential com Sticky Session)
    if (process.env.WEBSHARE_ENABLED === 'true') {
      const webshareProxies = this.parseWebshareProxies();
      if (webshareProxies.length > 0) {
        this.addProvider({
          name: 'Webshare',
          type: 'residential',
          enabled: true,
          proxies: webshareProxies,
        });
      }
    }

    // Decodo/SmartProxy (Residential com Sticky Session)
    if (process.env.DECODO_ENABLED === 'true') {
      const decodoproxies = this.parseDecodoproxies();
      if (decodoproxies.length > 0) {
        this.addProvider({
          name: 'Decodo',
          type: 'residential',
          enabled: true,
          proxies: decodoproxies,
        });
      }
    }

    // SmartProxy/Decodo (legacy - mantido para compatibilidade)
    if (process.env.SMARTPROXY_ENABLED === 'true') {
      this.addProvider({
        name: 'SmartProxy',
        type: 'residential',
        enabled: true,
        proxies: this.parseProxyList(process.env.SMARTPROXY_LIST || ''),
      });
    }

    // Proxy genérico (formato: protocol://username:password@host:port)
    if (process.env.CUSTOM_PROXY_LIST) {
      this.addProvider({
        name: 'Custom',
        type: 'residential',
        enabled: true,
        proxies: this.parseProxyList(process.env.CUSTOM_PROXY_LIST),
      });
    }

    console.log(`🔄 Proxy Rotation Service initialized with ${this.getTotalProxies()} proxies from ${this.providers.size} providers`);
  }

  /**
   * Parse lista de proxies do formato string para ProxyConfig[]
   * Formato esperado: protocol://username:password@host:port,protocol://username:password@host:port
   * Ou simplificado: host:port:username:password,host:port:username:password
   */
  private parseProxyList(proxyListString: string): ProxyConfig[] {
    if (!proxyListString || proxyListString.trim() === '') {
      return [];
    }

    const proxies: ProxyConfig[] = [];
    const proxyStrings = proxyListString.split(',').map(p => p.trim());

    for (const proxyStr of proxyStrings) {
      try {
        let config: ProxyConfig;

        // Formato URL completo: http://user:pass@host:port
        if (proxyStr.includes('://')) {
          const url = new URL(proxyStr);
          const protocol = url.protocol.replace(':', '') as 'http' | 'https' | 'socks5';
          // Se port não especificado, usar porta padrão do protocolo
          const defaultPort = protocol === 'https' ? 443 : (protocol === 'socks5' ? 1080 : 80);
          config = {
            protocol,
            host: url.hostname,
            port: parseInt(url.port) || defaultPort,
            username: url.username || undefined,
            password: url.password || undefined,
          };
        }
        // Formato simplificado: host:port:username:password
        else {
          const parts = proxyStr.split(':');
          if (parts.length < 2 || !parts[0] || !parts[1]) {
            console.warn(`⚠️  Formato de proxy inválido: ${proxyStr}`);
            continue;
          }

          const parsedPort = parseInt(parts[1]);
          if (isNaN(parsedPort)) {
            console.warn(`⚠️  Porta inválida no proxy: ${proxyStr}`);
            continue;
          }

          config = {
            protocol: 'http',
            host: parts[0],
            port: parsedPort,
            username: parts[2] ? parts[2] : undefined,
            password: parts[3] ? parts[3] : undefined,
          };
        }

        proxies.push(config);
      } catch (error) {
        console.error(`❌ Erro ao parsear proxy: ${proxyStr}`, error);
      }
    }

    return proxies;
  }

  /**
   * Parse configuração de proxies Webshare com sticky session
   * Formato: username-1, username-2, etc para rotating
   */
  private parseWebshareProxies(): ProxyConfig[] {
    const proxies: ProxyConfig[] = [];

    // Configurações do Webshare
    const host = process.env.WEBSHARE_HOST || 'p.webshare.io';
    const port = parseInt(process.env.WEBSHARE_PORT || '80');
    const username = process.env.WEBSHARE_USERNAME;
    const password = process.env.WEBSHARE_PASSWORD;
    const country = process.env.WEBSHARE_COUNTRY || 'br';
    const sessionDuration = parseInt(process.env.WEBSHARE_SESSION_DURATION || '480'); // 8h padrão

    if (!username || !password) {
      console.warn('⚠️  Webshare: USERNAME ou PASSWORD não configurados');
      return proxies;
    }

    // Gerar múltiplas sessões com sufixo -1, -2, -3
    const numSessions = parseInt(process.env.WEBSHARE_NUM_SESSIONS || '3');

    for (let i = 1; i <= numSessions; i++) {
      const sessionUsername = `${username}-${i}`;

      proxies.push({
        protocol: 'http',
        host,
        port,
        username: sessionUsername,
        password,
        country,
        sessionDuration,
        stickySession: false, // Webshare já rotaciona automaticamente com sufixo
        sessionId: undefined, // Não precisa de session ID separado
      });
    }

    console.log(`🔄 Webshare: ${proxies.length} sessões configuradas (8h sticky, país: ${country})`);
    return proxies;
  }

  /**
   * Parse configuração de proxies Decodo com sticky session
   * Formato: host:port ou usa variáveis específicas
   */
  private parseDecodoproxies(): ProxyConfig[] {
    const proxies: ProxyConfig[] = [];

    // Configurações do Decodo
    const host = process.env.DECODO_HOST || 'gate.decodo.com'; // ex: gate.smartproxy.com
    const port = parseInt(process.env.DECODO_PORT || '7000');
    const username = process.env.DECODO_USERNAME;
    const password = process.env.DECODO_PASSWORD;
    const country = process.env.DECODO_COUNTRY || 'br'; // Brasil por padrão
    const city = process.env.DECODO_CITY; // Opcional: sp, rj, etc
    const sessionDuration = parseInt(process.env.DECODO_SESSION_DURATION || '30'); // minutos
    const stickySession = process.env.DECODO_STICKY_SESSION === 'true';

    if (!username || !password) {
      console.warn('⚠️  Decodo: USERNAME ou PASSWORD não configurados');
      return proxies;
    }

    // Gerar múltiplas sessões se sticky session estiver ativo
    const numSessions = parseInt(process.env.DECODO_NUM_SESSIONS || '3');

    for (let i = 0; i < numSessions; i++) {
      const sessionId = `instagram-scraper-${i + 1}`;

      proxies.push({
        protocol: 'http', // Puppeteer não suporta https:// para proxy
        host,
        port,
        username,
        password,
        country,
        city,
        sessionDuration,
        stickySession,
        sessionId,
      });
    }

    console.log(`🔄 Decodo: ${proxies.length} sessões configuradas (sticky: ${stickySession}, duração: ${sessionDuration}min, país: ${country})`);
    return proxies;
  }

  /**
   * Adiciona um provider de proxies
   */
  private addProvider(provider: ProxyProvider): void {
    if (provider.proxies.length === 0) {
      console.warn(`⚠️  Provider ${provider.name} não tem proxies configurados`);
      return;
    }

    this.providers.set(provider.name, provider);
    console.log(`✅ Provider ${provider.name} adicionado com ${provider.proxies.length} proxies (${provider.type})`);
  }

  /**
   * Obtém o próximo proxy baseado na estratégia de rotação
   */
  public getNextProxy(): ProxyConfig | null {
    const allProxies = this.getAllActiveProxies();

    if (allProxies.length === 0) {
      console.error('❌ Nenhum proxy disponível');
      return null;
    }

    let selectedProxy: ProxyConfig;

    switch (this.rotationStrategy) {
      case 'round-robin':
        selectedProxy = allProxies[this.currentProxyIndex % allProxies.length]!;
        this.currentProxyIndex = (this.currentProxyIndex + 1) % allProxies.length;
        break;

      case 'random':
        const randomIndex = Math.floor(Math.random() * allProxies.length);
        selectedProxy = allProxies[randomIndex]!;
        break;

      case 'least-used':
        selectedProxy = this.getLeastUsedProxy(allProxies)!;
        break;

      default:
        selectedProxy = allProxies[0]!;
    }

    // Verificar se proxy está em cooldown devido a falhas
    const proxyKey = this.getProxyKey(selectedProxy);
    const stats = this.proxyUsageStats.get(proxyKey);

    if (stats && stats.failures >= this.maxFailuresPerProxy) {
      const cooldownEnd = new Date(stats.lastUsed.getTime() + this.cooldownMinutes * 60000);
      if (new Date() < cooldownEnd) {
        console.warn(`⏳ Proxy ${proxyKey} em cooldown até ${cooldownEnd.toLocaleTimeString()}`);
        // Recursivamente buscar outro proxy
        this.currentProxyIndex++;
        return this.getNextProxy();
      } else {
        // Reset failures após cooldown
        stats.failures = 0;
      }
    }

    this.recordProxyUsage(selectedProxy);
    return selectedProxy;
  }

  /**
   * Obtém todos os proxies ativos (não em cooldown)
   */
  private getAllActiveProxies(): ProxyConfig[] {
    const proxies: ProxyConfig[] = [];

    for (const provider of this.providers.values()) {
      if (provider.enabled) {
        proxies.push(...provider.proxies);
      }
    }

    return proxies;
  }

  /**
   * Obtém o proxy menos usado
   */
  private getLeastUsedProxy(proxies: ProxyConfig[]): ProxyConfig {
    let leastUsed = proxies[0]!;
    let minRequests = Infinity;

    for (const proxy of proxies) {
      const key = this.getProxyKey(proxy);
      const stats = this.proxyUsageStats.get(key);
      const requests = stats?.requests || 0;

      if (requests < minRequests) {
        minRequests = requests;
        leastUsed = proxy;
      }
    }

    return leastUsed;
  }

  /**
   * Registra uso de um proxy
   */
  private recordProxyUsage(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    const stats = this.proxyUsageStats.get(key) || { requests: 0, failures: 0, lastUsed: new Date() };

    stats.requests++;
    stats.lastUsed = new Date();

    this.proxyUsageStats.set(key, stats);
  }

  /**
   * Registra falha de um proxy
   */
  public recordProxyFailure(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    const stats = this.proxyUsageStats.get(key) || { requests: 0, failures: 0, lastUsed: new Date() };

    stats.failures++;
    stats.lastUsed = new Date();

    this.proxyUsageStats.set(key, stats);

    if (stats.failures >= this.maxFailuresPerProxy) {
      console.warn(`⚠️  Proxy ${key} atingiu ${stats.failures} falhas - entrando em cooldown de ${this.cooldownMinutes} minutos`);
    }
  }

  /**
   * Reseta falhas de um proxy (após sucesso)
   */
  public recordProxySuccess(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    const stats = this.proxyUsageStats.get(key);

    if (stats) {
      stats.failures = 0;
    }
  }

  /**
   * Gera chave única para um proxy
   */
  private getProxyKey(proxy: ProxyConfig): string {
    return `${proxy.protocol}://${proxy.host}:${proxy.port}`;
  }

  /**
   * Formata proxy para uso no Puppeteer
   * Suporta formato especial do Decodo com sticky session
   *
   * Formato Decodo: user-USERNAME-country-COUNTRY-session-SESSIONID-sessionduration-MINUTES:PASSWORD
   * Formato padrão: http://username:password@host:port
   */
  public formatProxyForPuppeteer(proxy: ProxyConfig): string {
    let username = proxy.username || '';
    const password = proxy.password || '';

    // Se for Decodo com sticky session, formatar username especial
    if (proxy.stickySession && proxy.sessionId) {
      // Formato: user-username-country-br-session-mysession-sessionduration-30
      const parts = [`user-${username}`];

      if (proxy.country) {
        parts.push(`country-${proxy.country}`);
      }

      if (proxy.city) {
        parts.push(`city-${proxy.city}`);
      }

      parts.push(`session-${proxy.sessionId}`);

      if (proxy.sessionDuration) {
        parts.push(`sessionduration-${proxy.sessionDuration}`);
      }

      username = parts.join('-');
      console.log(`🔒 Decodo Sticky Session: ${username}`);
    }

    const auth = username && password
      ? `${username}:${password}@`
      : '';

    return `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;
  }

  /**
   * Obtém total de proxies disponíveis
   */
  public getTotalProxies(): number {
    return this.getAllActiveProxies().length;
  }

  /**
   * Obtém estatísticas de uso dos proxies
   */
  public getStats(): {
    totalProxies: number;
    providers: number;
    usageStats: Map<string, { requests: number; failures: number; lastUsed: Date }>
  } {
    return {
      totalProxies: this.getTotalProxies(),
      providers: this.providers.size,
      usageStats: this.proxyUsageStats,
    };
  }

  /**
   * Define estratégia de rotação
   */
  public setRotationStrategy(strategy: 'round-robin' | 'random' | 'least-used'): void {
    this.rotationStrategy = strategy;
    console.log(`🔄 Estratégia de rotação alterada para: ${strategy}`);
  }

  /**
   * Verifica se o serviço de proxy está habilitado
   */
  public isEnabled(): boolean {
    return process.env.ENABLE_PROXY_ROTATION === 'true' && this.getTotalProxies() > 0;
  }
}

// Singleton instance
export const proxyRotationService = new ProxyRotationService();
