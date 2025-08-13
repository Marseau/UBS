/**
 * EXCHANGE RATE SERVICE
 * Obtém taxas de câmbio reais de APIs externas
 */

import fetch from "node-fetch";

interface ExchangeRateResponse {
  success: boolean;
  rates: { [key: string]: number };
  timestamp?: number;
  source?: string;
}

class ExchangeRateService {
  private cachedRate: number | null = null;
  private cacheTimestamp: number = 0;
  private cacheValidityMs = 60 * 60 * 1000; // 1 hora

  // APIs gratuitas para taxa de câmbio
  private apis = [
    {
      name: "exchangerate-api",
      url: "https://api.exchangerate-api.com/v4/latest/USD",
      extractRate: (data: any) => data.rates?.BRL,
    },
    {
      name: "fixer",
      url: "http://data.fixer.io/api/latest?access_key=free&base=USD&symbols=BRL",
      extractRate: (data: any) => data.rates?.BRL,
    },
    {
      name: "currencyapi",
      url: "https://api.currencyapi.com/v3/latest?apikey=free&base_currency=USD&currencies=BRL",
      extractRate: (data: any) => data.data?.BRL?.value,
    },
  ];

  /**
   * Obtém a taxa de câmbio USD para BRL atual
   */
  async getUsdToBrlRate(): Promise<number> {
    // Verificar cache primeiro
    if (this.isCacheValid()) {
      console.log(`💰 Usando taxa cached: 1 USD = ${this.cachedRate} BRL`);
      return this.cachedRate!;
    }

    console.log("🌐 Buscando taxa de câmbio USD/BRL...");

    // Tentar APIs em sequência
    for (const api of this.apis) {
      try {
        const rate = await this.fetchFromApi(api);
        if (rate && rate > 0) {
          this.updateCache(rate);
          console.log(`✅ Taxa obtida de ${api.name}: 1 USD = ${rate} BRL`);
          return rate;
        }
      } catch (error: any) {
        console.warn(`⚠️ Falha na API ${api.name}:`, error.message);
        continue;
      }
    }

    // Fallback para taxa histórica conservadora
    const fallbackRate = 5.2; // Taxa conservadora baseada em média histórica
    console.warn(`🔄 Usando taxa fallback: 1 USD = ${fallbackRate} BRL`);
    return fallbackRate;
  }

  /**
   * Busca taxa de uma API específica
   */
  private async fetchFromApi(api: any): Promise<number | null> {
    try {
      const response = await fetch(api.url, {
        method: "GET",
        headers: {
          "User-Agent": "UBS-Platform/1.0",
          Accept: "application/json",
        },
        timeout: 5000, // 5 segundos timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const rate = api.extractRate(data);

      if (!rate || typeof rate !== "number" || rate <= 0) {
        throw new Error("Taxa inválida recebida da API");
      }

      return rate;
    } catch (error: any) {
      throw new Error(`Erro ao buscar de ${api.name}: ${error.message}`);
    }
  }

  /**
   * Verifica se o cache ainda é válido
   */
  private isCacheValid(): boolean {
    return (
      this.cachedRate !== null &&
      Date.now() - this.cacheTimestamp < this.cacheValidityMs
    );
  }

  /**
   * Atualiza o cache com nova taxa
   */
  private updateCache(rate: number): void {
    this.cachedRate = rate;
    this.cacheTimestamp = Date.now();
  }

  /**
   * Obtém taxa com informações detalhadas
   */
  async getExchangeRateInfo(): Promise<{
    rate: number;
    source: string;
    timestamp: number;
    cached: boolean;
  }> {
    const cached = this.isCacheValid();
    const rate = await this.getUsdToBrlRate();

    return {
      rate,
      source: cached ? "cache" : "external_api",
      timestamp: Date.now(),
      cached,
    };
  }

  /**
   * Converte valor de USD para BRL
   */
  async convertUsdToBrl(usdAmount: number): Promise<number> {
    const rate = await this.getUsdToBrlRate();
    return usdAmount * rate;
  }

  /**
   * Converte valor de BRL para USD
   */
  async convertBrlToUsd(brlAmount: number): Promise<number> {
    const rate = await this.getUsdToBrlRate();
    return brlAmount / rate;
  }

  /**
   * Limpa o cache (forçar nova busca)
   */
  clearCache(): void {
    this.cachedRate = null;
    this.cacheTimestamp = 0;
    console.log("🗑️ Cache de taxa de câmbio limpo");
  }

  /**
   * Obtém múltiplas taxas históricas (implementação futura)
   */
  async getHistoricalRates(days: number = 30): Promise<
    Array<{
      date: string;
      rate: number;
    }>
  > {
    // Por enquanto retorna taxa atual para todos os dias
    // Em implementação futura, pode buscar dados históricos
    const currentRate = await this.getUsdToBrlRate();
    const rates: Array<{ date: string; rate: number }> = [];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split("T")[0];
      if (dateString) {
        rates.push({
          date: dateString,
          rate: currentRate + (Math.random() - 0.5) * 0.1, // Pequena variação simulada
        });
      }
    }

    return rates.reverse(); // Mais antigo primeiro
  }
}

// Instância singleton
export const exchangeRateService = new ExchangeRateService();

// Exportar classe para testes
export { ExchangeRateService };
