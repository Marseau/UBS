/**
 * AIC Humanizer Service
 *
 * Serviço responsável por humanizar o envio de mensagens:
 * - Digitação com velocidade variável
 * - Erros de digitação controlados (typos)
 * - Pausas naturais entre frases
 * - Delays de "pensamento" antes de responder
 */

export interface HumanizerConfig {
  // Velocidade de digitação
  baseTypingSpeedWPM: number;
  typingSpeedVariance: number; // 0.2 = 20% variação

  // Erros de digitação
  typoProbability: number; // 0.03 = 3% chance
  typoCorrectionDelayMs: number;
  commonTypos: Record<string, string>;

  // Pausas naturais
  thinkingDelayMs: number;
  thinkingDelayVariance: number;
  sentencePauseMs: number;
  paragraphPauseMs: number;
  emojiPauseMs: number;

  // Anti-flood
  minDelayBetweenMessagesMs: number;
  maxDelayBetweenMessagesMs: number;
}

export interface TypingStep {
  action: 'type' | 'pause' | 'backspace' | 'wait';
  value?: string;
  durationMs: number;
}

export interface HumanizedMessage {
  originalText: string;
  steps: TypingStep[];
  totalDurationMs: number;
  includesTypos: boolean;
  typoCount: number;
}

const DEFAULT_CONFIG: HumanizerConfig = {
  baseTypingSpeedWPM: 90,
  typingSpeedVariance: 0.20,

  typoProbability: 0.03,
  typoCorrectionDelayMs: 500,
  commonTypos: {
    'a': 's', 's': 'a', 'd': 'f', 'f': 'd',
    'e': 'r', 'r': 'e', 'w': 'q', 'q': 'w',
    'o': 'p', 'p': 'o', 'i': 'u', 'u': 'i',
    'n': 'm', 'm': 'n', 'b': 'v', 'v': 'b',
    'c': 'x', 'x': 'c', 'z': 'a', 'l': 'k'
  },

  thinkingDelayMs: 2000,
  thinkingDelayVariance: 0.50,
  sentencePauseMs: 800,
  paragraphPauseMs: 1500,
  emojiPauseMs: 300,

  minDelayBetweenMessagesMs: 3000,
  maxDelayBetweenMessagesMs: 8000
};

export class AICHumanizerService {
  private config: HumanizerConfig;

  constructor(config: Partial<HumanizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gera variação gaussiana para valores
   */
  private gaussianRandom(mean: number, variance: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z * (mean * variance);
  }

  /**
   * Calcula tempo de digitação para uma palavra
   */
  private getTypingDelayForChar(): number {
    // WPM para ms por caractere (assumindo 5 chars por palavra)
    const baseDelayMs = (60 * 1000) / (this.config.baseTypingSpeedWPM * 5);
    return this.gaussianRandom(baseDelayMs, this.config.typingSpeedVariance);
  }

  /**
   * Decide se deve introduzir um typo
   */
  private shouldIntroduceTypo(): boolean {
    return Math.random() < this.config.typoProbability;
  }

  /**
   * Gera um typo para um caractere
   */
  private getTypoChar(originalChar: string): string {
    const lowerChar = originalChar.toLowerCase();
    const typo = this.config.commonTypos[lowerChar];

    if (typo) {
      // Preservar case
      return originalChar === originalChar.toUpperCase()
        ? typo.toUpperCase()
        : typo;
    }

    // Se não tem typo mapeado, duplica ou troca com adjacente
    return originalChar + originalChar;
  }

  /**
   * Detecta se é fim de frase
   */
  private isEndOfSentence(char: string): boolean {
    return ['.', '!', '?'].includes(char);
  }

  /**
   * Detecta se é fim de parágrafo
   */
  private isEndOfParagraph(text: string, index: number): boolean {
    return text.slice(index, index + 2) === '\n\n';
  }

  /**
   * Detecta se é emoji
   */
  private isEmoji(char: string): boolean {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    return emojiRegex.test(char);
  }

  /**
   * Humaniza uma mensagem gerando steps de digitação
   */
  humanize(text: string, includeTypos: boolean = true): HumanizedMessage {
    const steps: TypingStep[] = [];
    let totalDurationMs = 0;
    let typoCount = 0;

    // 1. Delay inicial de "pensamento"
    const thinkingDelay = this.gaussianRandom(
      this.config.thinkingDelayMs,
      this.config.thinkingDelayVariance
    );
    steps.push({
      action: 'wait',
      durationMs: Math.max(500, thinkingDelay)
    });
    totalDurationMs += thinkingDelay;

    // 2. Processar cada caractere
    const chars = [...text]; // Spread para lidar com emojis

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i] || '';
      const typingDelay = this.getTypingDelayForChar();

      // Verificar se deve introduzir typo
      if (includeTypos && this.shouldIntroduceTypo() && char && /[a-zA-Z]/.test(char)) {
        // Digitar o caractere errado
        const typoChar = this.getTypoChar(char);
        steps.push({
          action: 'type',
          value: typoChar,
          durationMs: typingDelay
        });
        totalDurationMs += typingDelay;

        // Pausa de percepção do erro
        const noticeDelay = this.gaussianRandom(
          this.config.typoCorrectionDelayMs,
          0.3
        );
        steps.push({
          action: 'pause',
          durationMs: noticeDelay
        });
        totalDurationMs += noticeDelay;

        // Apagar o erro
        const backspaceCount = typoChar.length;
        for (let b = 0; b < backspaceCount; b++) {
          steps.push({
            action: 'backspace',
            durationMs: typingDelay * 0.7 // Backspace é mais rápido
          });
          totalDurationMs += typingDelay * 0.7;
        }

        typoCount++;
      }

      // Digitar o caractere correto
      steps.push({
        action: 'type',
        value: char,
        durationMs: typingDelay
      });
      totalDurationMs += typingDelay;

      // Pausas naturais
      if (this.isEmoji(char)) {
        steps.push({
          action: 'pause',
          durationMs: this.config.emojiPauseMs
        });
        totalDurationMs += this.config.emojiPauseMs;
      } else if (this.isEndOfParagraph(text, i)) {
        steps.push({
          action: 'pause',
          durationMs: this.config.paragraphPauseMs
        });
        totalDurationMs += this.config.paragraphPauseMs;
      } else if (this.isEndOfSentence(char)) {
        steps.push({
          action: 'pause',
          durationMs: this.config.sentencePauseMs
        });
        totalDurationMs += this.config.sentencePauseMs;
      }
    }

    return {
      originalText: text,
      steps,
      totalDurationMs: Math.round(totalDurationMs),
      includesTypos: typoCount > 0,
      typoCount
    };
  }

  /**
   * Calcula delay entre mensagens (anti-flood)
   */
  getDelayBetweenMessages(): number {
    return Math.round(
      this.config.minDelayBetweenMessagesMs +
      Math.random() * (this.config.maxDelayBetweenMessagesMs - this.config.minDelayBetweenMessagesMs)
    );
  }

  /**
   * Verifica se está dentro da janela de envio
   */
  isWithinSendWindow(
    windowStart: string = '08:00',
    windowEnd: string = '21:00'
  ): boolean {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const startParts = windowStart.split(':').map(Number);
    const endParts = windowEnd.split(':').map(Number);

    const startHour = startParts[0] ?? 8;
    const startMin = startParts[1] ?? 0;
    const endHour = endParts[0] ?? 21;
    const endMin = endParts[1] ?? 0;

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    return currentTime >= startTime && currentTime <= endTime;
  }

  /**
   * Calcula próximo horário válido de envio
   */
  getNextValidSendTime(
    windowStart: string = '08:00',
    windowEnd: string = '21:00'
  ): Date {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const startParts = windowStart.split(':').map(Number);
    const endParts = windowEnd.split(':').map(Number);

    const startHour = startParts[0] ?? 8;
    const startMin = startParts[1] ?? 0;
    const endHour = endParts[0] ?? 21;
    const endMin = endParts[1] ?? 0;

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (currentTime < startTime) {
      // Antes da janela - agendar para início
      now.setHours(startHour, startMin, 0, 0);
      return now;
    } else if (currentTime > endTime) {
      // Depois da janela - agendar para amanhã
      now.setDate(now.getDate() + 1);
      now.setHours(startHour, startMin, 0, 0);
      return now;
    }

    // Dentro da janela
    return now;
  }

  /**
   * Estima duração total de digitação para uma mensagem
   */
  estimateTypingDuration(text: string): number {
    const wordCount = text.split(/\s+/).length;
    const baseTimeMs = (wordCount / this.config.baseTypingSpeedWPM) * 60 * 1000;

    // Adicionar tempo para pausas e possíveis typos
    const pauseTime = (text.match(/[.!?]/g) || []).length * this.config.sentencePauseMs;
    const typoTime = text.length * this.config.typoProbability * this.config.typoCorrectionDelayMs * 2;

    return Math.round(baseTimeMs + pauseTime + typoTime + this.config.thinkingDelayMs);
  }
}

// Singleton para uso global
export const humanizerService = new AICHumanizerService();

export default AICHumanizerService;
