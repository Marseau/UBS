/**
 * Gender Inference Utility
 * Sistema inteligente para inferir gender baseado em nomes brasileiros
 */

interface GenderInference {
  gender: 'male' | 'female' | 'unknown';
  confidence: number;
  reason: string;
}

// Nomes tipicamente masculinos (alta confiança)
const MALE_NAMES = new Set([
  // Nomes comuns masculinos
  'joão', 'josé', 'antônio', 'francisco', 'carlos', 'paulo', 'pedro', 'lucas', 'luiz', 'marcos',
  'luis', 'gabriel', 'rafael', 'daniel', 'marcelo', 'bruno', 'eduardo', 'felipe', 'raimundo', 'rodrigo',
  'manoel', 'nelson', 'roberto', 'fabio', 'fábio', 'joão', 'anderson', 'antônio', 'andré', 'diego',
  'fernando', 'gustavo', 'henrique', 'igor', 'jorge', 'leonardo', 'marcio', 'márcio', 'mateus', 'ricardo',
  'sérgio', 'thiago', 'vinicius', 'vinícius', 'wagner', 'wesley', 'alexandre', 'cesar', 'césar',
  'cristiano', 'douglas', 'edson', 'everton', 'gilberto', 'ivan', 'jefferson', 'leandro', 'mario', 'mário',
  'mauricio', 'maurício', 'mauro', 'michel', 'nilton', 'oscar', 'oscar', 'patrick', 'renan', 'renato',
  'ronaldo', 'samuel', 'sergio', 'sérgio', 'tiago', 'victor', 'vítor', 'william', 'yuri',

  // Apelidos/diminutivos masculinos
  'beto', 'chico', 'duda', 'guto', 'leco', 'nico', 'rafa', 'ruan', 'zé', 'zeca'
]);

// Nomes tipicamente femininos (alta confiança)
const FEMALE_NAMES = new Set([
  // Nomes comuns femininos
  'maria', 'ana', 'francisca', 'antônia', 'adriana', 'juliana', 'márcia', 'fernanda', 'patrícia',
  'aline', 'sandra', 'camila', 'amanda', 'bruna', 'jessica', 'jéssica', 'letícia', 'júlia',
  'mariana', 'carolina', 'isabela', 'larissa', 'vanessa', 'cristina', 'simone', 'viviane',
  'karina', 'sabrina', 'daniela', 'gabriela', 'rafaela', 'carla', 'paula', 'luana', 'priscila',
  'tatiana', 'monica', 'mônica', 'denise', 'eliane', 'luciana', 'michele', 'renata', 'silvia', 'sílvia',
  'valeria', 'valéria', 'barbara', 'bárbara', 'beatriz', 'cláudia', 'edna', 'fatima', 'fátima',
  'helena', 'ingrid', 'joana', 'kelly', 'livia', 'lívia', 'lorena', 'luiza', 'nayara', 'natalia', 'natália',
  'patricia', 'patrícia', 'raquel', 'rosana', 'sara', 'tânia', 'tania', 'vivian', 'yasmin',

  // Apelidos/diminutivos femininos
  'bel', 'bela', 'bia', 'carol', 'dani', 'fê', 'gabi', 'jú', 'lê', 'lú', 'mari', 'nat', 'pati', 'rê', 'vivi'
]);

// Terminações tipicamente masculinas
const MALE_ENDINGS = [
  'andro', 'ando', 'ardo', 'ário', 'ério', 'ório', 'son', 'ton', 'mar', 'ber', 'ger', 'der', 'ter',
  'go', 'do', 'to', 'no', 'ro', 'so', 'zo', 'el', 'al', 'ol', 'ul', 'il'
];

// Terminações tipicamente femininas
const FEMALE_ENDINGS = [
  'ana', 'ina', 'ena', 'ona', 'una', 'yna', 'anda', 'enda', 'inda', 'onda', 'unda',
  'ária', 'éria', 'ória', 'ília', 'ânia', 'ência', 'ança', 'ença', 'iça', 'aça', 'eça',
  'ela', 'ila', 'ola', 'ula', 'alla', 'ella', 'illa', 'olla', 'ulla', 'ete', 'ite', 'ote', 'ute'
];

export class GenderInferenceUtil {
  /**
   * Infere gender baseado no nome completo
   */
  static inferGenderFromName(fullName: string): GenderInference {
    if (!fullName || fullName.trim().length < 2) {
      return {
        gender: 'unknown',
        confidence: 0,
        reason: 'Nome muito curto ou inválido'
      };
    }

    const normalizedName = fullName.trim().toLowerCase();
    const nameParts = normalizedName.split(' ');
    const firstNameOnly = nameParts[0];

    if (!firstNameOnly || firstNameOnly.length < 2) {
      return {
        gender: 'unknown',
        confidence: 0,
        reason: 'Primeiro nome inválido'
      };
    }

    // 1. Verificação direta por nome conhecido (alta confiança)
    if (MALE_NAMES.has(firstNameOnly)) {
      return {
        gender: 'male',
        confidence: 0.95,
        reason: `Nome "${firstNameOnly}" é tipicamente masculino`
      };
    }

    if (FEMALE_NAMES.has(firstNameOnly)) {
      return {
        gender: 'female',
        confidence: 0.95,
        reason: `Nome "${firstNameOnly}" é tipicamente feminino`
      };
    }

    // 2. Análise por terminações (confiança média)
    const maleEndingMatch = MALE_ENDINGS.find(ending => firstNameOnly.endsWith(ending));
    if (maleEndingMatch) {
      return {
        gender: 'male',
        confidence: 0.75,
        reason: `Terminação "${maleEndingMatch}" é tipicamente masculina`
      };
    }

    const femaleEndingMatch = FEMALE_ENDINGS.find(ending => firstNameOnly.endsWith(ending));
    if (femaleEndingMatch) {
      return {
        gender: 'female',
        confidence: 0.75,
        reason: `Terminação "${femaleEndingMatch}" é tipicamente feminina`
      };
    }

    // 3. Heurísticas adicionais (baixa confiança)
    if (firstNameOnly.endsWith('a') && firstNameOnly.length > 3) {
      return {
        gender: 'female',
        confidence: 0.6,
        reason: 'Nome termina em "a" (heurística comum)'
      };
    }

    if (firstNameOnly.endsWith('o') && firstNameOnly.length > 3) {
      return {
        gender: 'male',
        confidence: 0.6,
        reason: 'Nome termina em "o" (heurística comum)'
      };
    }

    // 4. Não foi possível determinar
    return {
      gender: 'unknown',
      confidence: 0,
      reason: 'Nome não encontrado nos padrões conhecidos'
    };
  }

  /**
   * Determina se devemos pular a pergunta de gender baseado na confiança
   */
  static shouldSkipGenderQuestion(inference: GenderInference): boolean {
    // Pula pergunta apenas com confiança muito alta (≥ 85%)
    return inference.confidence >= 0.85;
  }

  /**
   * Gera mensagem personalizada baseada na inferência
   */
  static generateGenderConfirmationMessage(inference: GenderInference, userName: string): string {
    if (inference.confidence >= 0.85) {
      // Alta confiança - não pergunta, só confirma sutilmente
      const treatment = inference.gender === 'male' ? 'Sr.' : 'Sra.';
      return `Perfeito, ${treatment} ${userName}! Cadastro finalizado com sucesso. ✅ Agora vamos ao seu agendamento. Qual serviço você precisa?`;
    } else if (inference.confidence >= 0.6) {
      // Confiança média - pergunta com sugestão
      const suggestion = inference.gender === 'male' ? 'masculino' : 'feminino';
      return `Quase finalizando, ${userName}! Para personalizar melhor o atendimento, você prefere ser tratado(a) como ${suggestion} ou de outra forma? (masculino/feminino/outro)`;
    } else {
      // Baixa confiança - pergunta padrão
      return `Para finalizar seu cadastro, ${userName}, você poderia me informar como gostaria de ser tratado(a)? (masculino/feminino/outro)`;
    }
  }
}