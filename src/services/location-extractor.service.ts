/**
 * Location Extractor Service
 * Extração robusta de localização (city/state) de bios do Instagram
 *
 * Fontes de extração:
 * 1. Padrões de emoji 📍 + texto
 * 2. Registros profissionais (CRM, CREF, OAB, CRO, etc.)
 * 3. Padrões de texto (cidade - UF, cidade/UF)
 * 4. Mapa expandido de cidades brasileiras
 * 5. DDD de telefone
 * 6. Inferência de state a partir de city conhecida
 */

// ============================================
// MAPA EXPANDIDO DE CIDADES BRASILEIRAS
// ============================================

export const BRAZILIAN_CITIES: Record<string, string> = {
  // São Paulo - SP
  'são paulo': 'SP', 'sao paulo': 'SP', 'sp': 'SP',
  'campinas': 'SP', 'santos': 'SP', 'guarulhos': 'SP',
  'osasco': 'SP', 'santo andré': 'SP', 'santo andre': 'SP',
  'são bernardo': 'SP', 'sao bernardo': 'SP', 'abc paulista': 'SP',
  'ribeirão preto': 'SP', 'ribeirao preto': 'SP',
  'sorocaba': 'SP', 'bauru': 'SP', 'piracicaba': 'SP',
  'jundiaí': 'SP', 'jundiai': 'SP', 'mogi das cruzes': 'SP',
  'são josé dos campos': 'SP', 'sao jose dos campos': 'SP', 'sjc': 'SP',
  'presidente prudente': 'SP', 'marília': 'SP', 'marilia': 'SP',
  'araraquara': 'SP', 'são carlos': 'SP', 'sao carlos': 'SP',
  'franca': 'SP', 'taubaté': 'SP', 'taubate': 'SP',
  'limeira': 'SP', 'americana': 'SP', 'indaiatuba': 'SP',
  'itapetininga': 'SP', 'itu': 'SP', 'jacareí': 'SP', 'jacarei': 'SP',
  'barueri': 'SP', 'cotia': 'SP', 'alphaville': 'SP',
  'moema': 'SP', 'pinheiros': 'SP', 'vila mariana': 'SP',
  'jardins': 'SP', 'itaim bibi': 'SP', 'mooca': 'SP',
  'santana': 'SP', 'tucuruvi': 'SP', 'tatuapé': 'SP', 'tatuape': 'SP',
  'zona norte': 'SP', 'zona sul': 'SP', 'zona leste': 'SP', 'zona oeste': 'SP',

  // Rio de Janeiro - RJ
  'rio de janeiro': 'RJ', 'rio': 'RJ', 'rj': 'RJ',
  'niterói': 'RJ', 'niteroi': 'RJ', 'são gonçalo': 'RJ', 'sao goncalo': 'RJ',
  'duque de caxias': 'RJ', 'nova iguaçu': 'RJ', 'nova iguacu': 'RJ',
  'campos dos goytacazes': 'RJ', 'petrópolis': 'RJ', 'petropolis': 'RJ',
  'volta redonda': 'RJ', 'macaé': 'RJ', 'macae': 'RJ',
  'cabo frio': 'RJ', 'angra dos reis': 'RJ', 'teresópolis': 'RJ',
  'barra da tijuca': 'RJ', 'barra': 'RJ', 'copacabana': 'RJ',
  'ipanema': 'RJ', 'leblon': 'RJ', 'botafogo': 'RJ',
  'flamengo': 'RJ', 'tijuca': 'RJ', 'méier': 'RJ', 'meier': 'RJ',
  'jacarepaguá': 'RJ', 'jacarepagua': 'RJ', 'recreio': 'RJ',
  'icaraí': 'RJ', 'icarai': 'RJ', 'centro do rio': 'RJ',

  // Minas Gerais - MG
  'belo horizonte': 'MG', 'bh': 'MG', 'mg': 'MG',
  'uberlândia': 'MG', 'uberlandia': 'MG', 'contagem': 'MG',
  'juiz de fora': 'MG', 'betim': 'MG', 'montes claros': 'MG',
  'uberaba': 'MG', 'governador valadares': 'MG', 'ipatinga': 'MG',
  'sete lagoas': 'MG', 'divinópolis': 'MG', 'divinopolis': 'MG',
  'poços de caldas': 'MG', 'pocos de caldas': 'MG',
  'patos de minas': 'MG', 'pouso alegre': 'MG', 'varginha': 'MG',
  'barbacena': 'MG', 'conselheiro lafaiete': 'MG', 'itabira': 'MG',
  'savassi': 'MG', 'lourdes': 'MG', 'funcionários': 'MG',

  // Paraná - PR
  'curitiba': 'PR', 'cwb': 'PR', 'pr': 'PR',
  'londrina': 'PR', 'maringá': 'PR', 'maringa': 'PR',
  'ponta grossa': 'PR', 'cascavel': 'PR', 'foz do iguaçu': 'PR',
  'foz do iguazu': 'PR', 'são josé dos pinhais': 'PR',
  'colombo': 'PR', 'guarapuava': 'PR', 'paranaguá': 'PR',
  'toledo': 'PR', 'apucarana': 'PR', 'campo largo': 'PR',
  'batel': 'PR', 'água verde': 'PR', 'agua verde': 'PR',

  // Rio Grande do Sul - RS
  'porto alegre': 'RS', 'poa': 'RS', 'rs': 'RS',
  'caxias do sul': 'RS', 'pelotas': 'RS', 'canoas': 'RS',
  'santa maria': 'RS', 'gravataí': 'RS', 'gravatai': 'RS',
  'viamão': 'RS', 'viamao': 'RS', 'novo hamburgo': 'RS',
  'são leopoldo': 'RS', 'sao leopoldo': 'RS', 'rio grande': 'RS',
  'alvorada': 'RS', 'passo fundo': 'RS', 'sapucaia do sul': 'RS',
  'uruguaiana': 'RS', 'santa cruz do sul': 'RS', 'cachoeirinha': 'RS',
  'moinhos de vento': 'RS', 'bela vista': 'RS',

  // Santa Catarina - SC
  'florianópolis': 'SC', 'florianopolis': 'SC', 'floripa': 'SC', 'sc': 'SC',
  'joinville': 'SC', 'blumenau': 'SC', 'são josé': 'SC',
  'chapecó': 'SC', 'chapeco': 'SC', 'itajaí': 'SC', 'itajai': 'SC',
  'criciúma': 'SC', 'criciuma': 'SC', 'jaraguá do sul': 'SC',
  'lages': 'SC', 'palhoça': 'SC', 'palhoca': 'SC', 'balneário camboriú': 'SC',
  'balneario camboriu': 'SC', 'bc': 'SC', 'brusque': 'SC',

  // Bahia - BA
  'salvador': 'BA', 'ssa': 'BA', 'ba': 'BA',
  'feira de santana': 'BA', 'vitória da conquista': 'BA',
  'vitoria da conquista': 'BA', 'camaçari': 'BA', 'camacari': 'BA',
  'itabuna': 'BA', 'juazeiro': 'BA', 'lauro de freitas': 'BA',
  'ilhéus': 'BA', 'ilheus': 'BA', 'jequié': 'BA', 'jequie': 'BA',
  'teixeira de freitas': 'BA', 'barreiras': 'BA', 'alagoinhas': 'BA',
  'porto seguro': 'BA', 'eunápolis': 'BA', 'eunapois': 'BA',

  // Pernambuco - PE
  'recife': 'PE', 'pe': 'PE', 'jaboatão dos guararapes': 'PE',
  'jaboatao dos guararapes': 'PE', 'olinda': 'PE', 'caruaru': 'PE',
  'petrolina': 'PE', 'paulista': 'PE', 'cabo de santo agostinho': 'PE',
  'camaragibe': 'PE', 'garanhuns': 'PE', 'vitória de santo antão': 'PE',
  'boa viagem': 'PE', 'casa forte': 'PE',

  // Ceará - CE
  'fortaleza': 'CE', 'ce': 'CE', 'caucaia': 'CE',
  'juazeiro do norte': 'CE', 'maracanaú': 'CE', 'maracanau': 'CE',
  'sobral': 'CE', 'crato': 'CE', 'itapipoca': 'CE',
  'maranguape': 'CE', 'iguatu': 'CE', 'quixadá': 'CE',
  'aldeota': 'CE', 'meireles': 'CE',

  // Goiás - GO
  'goiânia': 'GO', 'goiania': 'GO', 'go': 'GO',
  'aparecida de goiânia': 'GO', 'aparecida de goiania': 'GO',
  'anápolis': 'GO', 'anapolis': 'GO', 'rio verde': 'GO',
  'luziânia': 'GO', 'luziania': 'GO', 'águas lindas de goiás': 'GO',
  'valparaíso de goiás': 'GO', 'valparaiso de goias': 'GO',
  'trindade': 'GO', 'formosa': 'GO', 'senador canedo': 'GO',
  'setor bueno': 'GO', 'setor marista': 'GO',

  // Distrito Federal - DF
  'brasília': 'DF', 'brasilia': 'DF', 'bsb': 'DF', 'df': 'DF',
  'taguatinga': 'DF', 'ceilândia': 'DF', 'ceilandia': 'DF',
  'samambaia': 'DF', 'plano piloto': 'DF', 'águas claras': 'DF',
  'aguas claras': 'DF', 'guará': 'DF', 'guara': 'DF',
  'sobradinho': 'DF', 'planaltina': 'DF', 'gama': 'DF',
  'asa sul': 'DF', 'asa norte': 'DF', 'lago sul': 'DF', 'lago norte': 'DF',

  // Amazonas - AM
  'manaus': 'AM', 'am': 'AM', 'parintins': 'AM',
  'itacoatiara': 'AM', 'manacapuru': 'AM', 'coari': 'AM',

  // Pará - PA
  'belém': 'PA', 'belem': 'PA', 'pa': 'PA',
  'ananindeua': 'PA', 'santarém': 'PA', 'santarem': 'PA',
  'marabá': 'PA', 'maraba': 'PA', 'castanhal': 'PA',
  'parauapebas': 'PA', 'abaetetuba': 'PA',

  // Maranhão - MA
  'são luís': 'MA', 'sao luis': 'MA', 'ma': 'MA',
  'imperatriz': 'MA', 'são josé de ribamar': 'MA',
  'timon': 'MA', 'caxias': 'MA', 'codó': 'MA',

  // Mato Grosso - MT
  'cuiabá': 'MT', 'cuiaba': 'MT', 'mt': 'MT',
  'várzea grande': 'MT', 'varzea grande': 'MT',
  'rondonópolis': 'MT', 'rondonopolis': 'MT',
  'sinop': 'MT', 'tangará da serra': 'MT', 'cáceres': 'MT',

  // Mato Grosso do Sul - MS
  'campo grande': 'MS', 'ms': 'MS',
  'dourados': 'MS', 'três lagoas': 'MS', 'tres lagoas': 'MS',
  'corumbá': 'MS', 'corumba': 'MS', 'ponta porã': 'MS',

  // Espírito Santo - ES
  'vitória': 'ES', 'vitoria': 'ES', 'es': 'ES',
  'vila velha': 'ES', 'serra': 'ES', 'cariacica': 'ES',
  'cachoeiro de itapemirim': 'ES', 'linhares': 'ES',
  'são mateus': 'ES', 'colatina': 'ES', 'guarapari': 'ES',

  // Rio Grande do Norte - RN
  'natal': 'RN', 'rn': 'RN', 'mossoró': 'RN', 'mossoro': 'RN',
  'parnamirim': 'RN', 'são gonçalo do amarante': 'RN',
  'macaíba': 'RN', 'ceará-mirim': 'RN', 'caicó': 'RN',
  'ponta negra': 'RN',

  // Paraíba - PB
  'joão pessoa': 'PB', 'joao pessoa': 'PB', 'pb': 'PB',
  'campina grande': 'PB', 'santa rita': 'PB', 'patos': 'PB',
  'bayeux': 'PB', 'cabedelo': 'PB', 'cajazeiras': 'PB',

  // Alagoas - AL
  'maceió': 'AL', 'maceio': 'AL', 'al': 'AL',
  'arapiraca': 'AL', 'rio largo': 'AL', 'palmeira dos índios': 'AL',
  'união dos palmares': 'AL', 'penedo': 'AL',

  // Sergipe - SE
  'aracaju': 'SE', 'se': 'SE', 'nossa senhora do socorro': 'SE',
  'lagarto': 'SE', 'itabaiana': 'SE', 'são cristóvão': 'SE',

  // Piauí - PI
  'teresina': 'PI', 'pi': 'PI', 'parnaíba': 'PI', 'parnaiba': 'PI',
  'picos': 'PI', 'piripiri': 'PI', 'floriano': 'PI',

  // Tocantins - TO
  'palmas': 'TO', 'to': 'TO', 'araguaína': 'TO', 'araguaina': 'TO',
  'gurupi': 'TO', 'porto nacional': 'TO',

  // Rondônia - RO
  'porto velho': 'RO', 'ro': 'RO', 'ji-paraná': 'RO',
  'ji parana': 'RO', 'ariquemes': 'RO', 'vilhena': 'RO',

  // Acre - AC
  'rio branco': 'AC', 'ac': 'AC', 'cruzeiro do sul': 'AC',

  // Amapá - AP
  'macapá': 'AP', 'macapa': 'AP', 'ap': 'AP', 'santana do amapa': 'AP',

  // Roraima - RR
  'boa vista': 'RR', 'rr': 'RR',
};

// ============================================
// ESTADOS BRASILEIROS
// ============================================

export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

// ============================================
// DDD → LOCALIZAÇÃO
// ============================================

export const DDD_TO_LOCATION: Record<number, { city: string; state: string }> = {
  // São Paulo
  11: { city: 'São Paulo', state: 'SP' },
  12: { city: 'São José dos Campos', state: 'SP' },
  13: { city: 'Santos', state: 'SP' },
  14: { city: 'Bauru', state: 'SP' },
  15: { city: 'Sorocaba', state: 'SP' },
  16: { city: 'Ribeirão Preto', state: 'SP' },
  17: { city: 'São José do Rio Preto', state: 'SP' },
  18: { city: 'Presidente Prudente', state: 'SP' },
  19: { city: 'Campinas', state: 'SP' },
  // Rio de Janeiro
  21: { city: 'Rio de Janeiro', state: 'RJ' },
  22: { city: 'Campos dos Goytacazes', state: 'RJ' },
  24: { city: 'Volta Redonda', state: 'RJ' },
  // Espírito Santo
  27: { city: 'Vitória', state: 'ES' },
  28: { city: 'Cachoeiro de Itapemirim', state: 'ES' },
  // Minas Gerais
  31: { city: 'Belo Horizonte', state: 'MG' },
  32: { city: 'Juiz de Fora', state: 'MG' },
  33: { city: 'Governador Valadares', state: 'MG' },
  34: { city: 'Uberlândia', state: 'MG' },
  35: { city: 'Poços de Caldas', state: 'MG' },
  37: { city: 'Divinópolis', state: 'MG' },
  38: { city: 'Montes Claros', state: 'MG' },
  // Paraná
  41: { city: 'Curitiba', state: 'PR' },
  42: { city: 'Ponta Grossa', state: 'PR' },
  43: { city: 'Londrina', state: 'PR' },
  44: { city: 'Maringá', state: 'PR' },
  45: { city: 'Foz do Iguaçu', state: 'PR' },
  46: { city: 'Pato Branco', state: 'PR' },
  // Santa Catarina
  47: { city: 'Joinville', state: 'SC' },
  48: { city: 'Florianópolis', state: 'SC' },
  49: { city: 'Chapecó', state: 'SC' },
  // Rio Grande do Sul
  51: { city: 'Porto Alegre', state: 'RS' },
  53: { city: 'Pelotas', state: 'RS' },
  54: { city: 'Caxias do Sul', state: 'RS' },
  55: { city: 'Santa Maria', state: 'RS' },
  // Distrito Federal e Goiás
  61: { city: 'Brasília', state: 'DF' },
  62: { city: 'Goiânia', state: 'GO' },
  64: { city: 'Rio Verde', state: 'GO' },
  // Tocantins
  63: { city: 'Palmas', state: 'TO' },
  // Mato Grosso
  65: { city: 'Cuiabá', state: 'MT' },
  66: { city: 'Rondonópolis', state: 'MT' },
  // Mato Grosso do Sul
  67: { city: 'Campo Grande', state: 'MS' },
  // Acre
  68: { city: 'Rio Branco', state: 'AC' },
  // Rondônia
  69: { city: 'Porto Velho', state: 'RO' },
  // Bahia
  71: { city: 'Salvador', state: 'BA' },
  73: { city: 'Ilhéus', state: 'BA' },
  74: { city: 'Juazeiro', state: 'BA' },
  75: { city: 'Feira de Santana', state: 'BA' },
  77: { city: 'Vitória da Conquista', state: 'BA' },
  // Sergipe
  79: { city: 'Aracaju', state: 'SE' },
  // Pernambuco
  81: { city: 'Recife', state: 'PE' },
  87: { city: 'Petrolina', state: 'PE' },
  // Alagoas
  82: { city: 'Maceió', state: 'AL' },
  // Paraíba
  83: { city: 'João Pessoa', state: 'PB' },
  // Rio Grande do Norte
  84: { city: 'Natal', state: 'RN' },
  // Ceará
  85: { city: 'Fortaleza', state: 'CE' },
  88: { city: 'Sobral', state: 'CE' },
  // Piauí
  86: { city: 'Teresina', state: 'PI' },
  89: { city: 'Picos', state: 'PI' },
  // Pará
  91: { city: 'Belém', state: 'PA' },
  93: { city: 'Santarém', state: 'PA' },
  94: { city: 'Marabá', state: 'PA' },
  // Amazonas
  92: { city: 'Manaus', state: 'AM' },
  97: { city: 'Coari', state: 'AM' },
  // Roraima
  95: { city: 'Boa Vista', state: 'RR' },
  // Amapá
  96: { city: 'Macapá', state: 'AP' },
  // Maranhão
  98: { city: 'São Luís', state: 'MA' },
  99: { city: 'Imperatriz', state: 'MA' }
};

// ============================================
// INTERFACE DE RESULTADO
// ============================================

export interface LocationResult {
  city: string | null;
  state: string | null;
  source: string;
  confidence: 'high' | 'medium' | 'low';
}

// ============================================
// FUNÇÕES DE EXTRAÇÃO
// ============================================

/**
 * Remove acentos de uma string
 */
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Extrai UF de registros profissionais (CRM, CREF, OAB, CRO, CRP, etc.)
 */
export function extractStateFromProfessionalRegistry(text: string): string | null {
  if (!text) return null;

  // Padrões de registros profissionais com UF
  const patterns = [
    /CRM[\s\/:.-]*(\d+[\s\/:.-]*)?([A-Z]{2})/i,           // CRM/SP, CRM-SP, CRM 12345/SP
    /CRM[\s\/:.-]*([A-Z]{2})[\s\/:.-]*\d*/i,              // CRM-SP-12345
    /CREF[\s\/:.-]*\d+[\s\/:.-]*G?[\s\/:.-]*\/?\s*([A-Z]{2})/i,  // CREF 146803-G/SP
    /CRO[\s\/:.-]*(\d+[\s\/:.-]*)?([A-Z]{2})/i,           // CRO/SP (Odontologia)
    /CRP[\s\/:.-]*(\d+[\s\/:.-]*)?\/?\s*(\d+)?[\s\/:.-]*([A-Z]{2})?/i, // CRP 06/12345 (Psicologia)
    /OAB[\s\/:.-]*([A-Z]{2})[\s\/:.-]*\d*/i,              // OAB/SP, OAB-SP
    /OAB[\s\/:.-]*\d+[\s\/:.-]*([A-Z]{2})/i,              // OAB 12345/SP
    /COREN[\s\/:.-]*([A-Z]{2})/i,                          // COREN-SP (Enfermagem)
    /CRN[\s\/:.-]*\d*[\s\/:.-]*([A-Z]{2})?/i,             // CRN (Nutrição)
    /CONFEF[\s\/:.-]*\d+[\s\/:.-]*([A-Z]{2})/i,           // CONFEF (Ed. Física)
    /CRFa[\s\/:.-]*\d*[\s\/:.-]*([A-Z]{2})/i,             // CRFa (Fonoaudiologia)
    /CREFITO[\s\/:.-]*\d*[\s\/:.-]*([A-Z]{2})?/i,         // CREFITO (Fisioterapia)
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Encontrar a UF no match (pode estar em diferentes grupos)
      for (let i = match.length - 1; i >= 1; i--) {
        const potential = match[i];
        if (potential && potential.length === 2 && BRAZILIAN_STATES.includes(potential.toUpperCase())) {
          return potential.toUpperCase();
        }
      }
    }
  }

  return null;
}

/**
 * Extrai localização de padrões com emoji 📍
 */
export function extractLocationFromEmoji(text: string): LocationResult | null {
  if (!text) return null;

  // Padrões com emoji de localização
  const emojiPatterns = [
    // 📍SP ou 📍 SP
    /📍\s*([A-Z]{2})\b/i,
    // 📍São Paulo ou 📍 São Paulo - SP
    /📍\s*([^|\n,]+?)(?:\s*[-\/]\s*([A-Z]{2}))?\s*(?:[|\n,]|$)/i,
    // 🏠 Localização similar
    /🏠\s*([^|\n,]+?)(?:\s*[-\/]\s*([A-Z]{2}))?\s*(?:[|\n,]|$)/i,
  ];

  for (const pattern of emojiPatterns) {
    const match = text.match(pattern);
    if (match) {
      // Se capturou apenas UF (2 letras)
      if (match[1] && match[1].trim().length === 2) {
        const state = match[1].trim().toUpperCase();
        if (BRAZILIAN_STATES.includes(state)) {
          return { city: null, state, source: 'emoji-uf', confidence: 'high' };
        }
      }

      // Se capturou cidade e possivelmente UF
      const cityText = match[1]?.trim();
      const stateText = match[2]?.trim().toUpperCase();

      if (cityText) {
        // Tentar inferir state da cidade
        const inferredState = inferStateFromCity(cityText);
        const state = (stateText && BRAZILIAN_STATES.includes(stateText))
          ? stateText
          : inferredState;

        return {
          city: cityText,
          state,
          source: 'emoji-city',
          confidence: state ? 'high' : 'medium'
        };
      }
    }
  }

  return null;
}

/**
 * Extrai localização de padrões de texto (Cidade - UF, Cidade/UF, etc.)
 */
export function extractLocationFromTextPatterns(text: string): LocationResult | null {
  if (!text) return null;

  // Padrões de texto para localização
  const textPatterns = [
    // São Paulo - SP, São Paulo/SP, São Paulo | SP
    /\b([A-Za-zÀ-ÿ\s]+?)\s*[-\/|]\s*([A-Z]{2})\b/i,
    // Atendimento em São Paulo
    /atend(?:imento|o)?\s+(?:em\s+)?([A-Za-zÀ-ÿ\s]+?)(?:\s*[-\/|,]|$)/i,
    // Clínica em São Paulo
    /(?:clínica|consultório|escritório|loja|studio|espaço)\s+(?:em\s+)?([A-Za-zÀ-ÿ\s]+?)(?:\s*[-\/|,]|$)/i,
    // Online & Presencial em São Paulo
    /presencial\s+(?:em\s+)?([A-Za-zÀ-ÿ\s]+?)(?:\s*[-\/|,]|$)/i,
    // Apenas UF isolada (ex: "SP" ou "| SP")
    /(?:^|\s|[|,\-])\s*([A-Z]{2})\s*(?:$|\s|[|,\-])/,
  ];

  for (const pattern of textPatterns) {
    const match = text.match(pattern);
    if (match) {
      const captured1 = match[1]?.trim();
      const captured2 = match[2]?.trim().toUpperCase();

      // Se segundo grupo é UF válida
      if (captured2 && captured2.length === 2 && BRAZILIAN_STATES.includes(captured2)) {
        return {
          city: captured1 && captured1.length > 2 ? captured1 : null,
          state: captured2,
          source: 'text-pattern',
          confidence: 'high'
        };
      }

      // Se primeiro grupo é UF válida (padrão de UF isolada)
      if (captured1 && captured1.length === 2 && BRAZILIAN_STATES.includes(captured1.toUpperCase())) {
        return {
          city: null,
          state: captured1.toUpperCase(),
          source: 'text-uf-isolated',
          confidence: 'medium'
        };
      }

      // Se capturou apenas cidade, tentar inferir state
      if (captured1 && captured1.length > 2) {
        const inferredState = inferStateFromCity(captured1);
        if (inferredState) {
          return {
            city: captured1,
            state: inferredState,
            source: 'text-city-inferred',
            confidence: 'medium'
          };
        }
      }
    }
  }

  return null;
}

/**
 * Infere o estado a partir do nome da cidade
 */
export function inferStateFromCity(city: string): string | null {
  if (!city) return null;

  // Normalizar cidade para busca
  const normalizedCity = removeAccents(city.toLowerCase().trim());

  // Buscar no mapa de cidades
  if (BRAZILIAN_CITIES[normalizedCity]) {
    return BRAZILIAN_CITIES[normalizedCity];
  }

  // Tentar busca parcial (início da string)
  for (const [cityKey, state] of Object.entries(BRAZILIAN_CITIES)) {
    if (normalizedCity.startsWith(cityKey) || cityKey.startsWith(normalizedCity)) {
      return state;
    }
  }

  return null;
}

/**
 * Extrai localização do DDD do telefone
 */
export function extractLocationFromPhone(phone: string): LocationResult | null {
  if (!phone) return null;

  const cleanPhone = phone.replace(/\D/g, '');
  let ddd: number;

  // Telefone com código do país (55)
  if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
    ddd = parseInt(cleanPhone.substring(2, 4));
  }
  // Telefone sem código do país
  else if (cleanPhone.length >= 10) {
    ddd = parseInt(cleanPhone.substring(0, 2));
  }
  else {
    return null;
  }

  const location = DDD_TO_LOCATION[ddd];
  if (location) {
    return {
      city: location.city,
      state: location.state,
      source: 'phone-ddd',
      confidence: 'medium'
    };
  }

  return null;
}

/**
 * Busca cidade conhecida no texto da bio
 */
export function findKnownCityInText(text: string): LocationResult | null {
  if (!text) return null;

  const normalizedText = removeAccents(text.toLowerCase());

  // Ordenar cidades por tamanho (maior primeiro) para evitar match parcial
  const sortedCities = Object.entries(BRAZILIAN_CITIES)
    .sort(([a], [b]) => b.length - a.length);

  for (const [cityName, state] of sortedCities) {
    // Evitar matches de siglas isoladas (SP, RJ) - elas serão tratadas separadamente
    if (cityName.length <= 2) continue;

    // Buscar cidade como palavra completa
    const regex = new RegExp(`\\b${cityName}\\b`, 'i');
    if (regex.test(normalizedText)) {
      // Capitalizar corretamente
      const properCity = cityName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      return {
        city: properCity,
        state,
        source: 'known-city',
        confidence: 'high'
      };
    }
  }

  return null;
}

/**
 * FUNÇÃO PRINCIPAL: Extrai localização da bio usando múltiplas estratégias
 */
export function extractLocation(
  bio: string | null,
  phone: string | null = null
): LocationResult | null {
  const results: LocationResult[] = [];

  if (bio) {
    // 1. Registros profissionais (maior confiança)
    const stateFromRegistry = extractStateFromProfessionalRegistry(bio);
    if (stateFromRegistry) {
      results.push({
        city: null,
        state: stateFromRegistry,
        source: 'professional-registry',
        confidence: 'high'
      });
    }

    // 2. Emoji de localização 📍
    const fromEmoji = extractLocationFromEmoji(bio);
    if (fromEmoji) {
      results.push(fromEmoji);
    }

    // 3. Padrões de texto (Cidade - UF)
    const fromText = extractLocationFromTextPatterns(bio);
    if (fromText) {
      results.push(fromText);
    }

    // 4. Cidade conhecida no texto
    const fromKnownCity = findKnownCityInText(bio);
    if (fromKnownCity) {
      results.push(fromKnownCity);
    }
  }

  // 5. DDD do telefone (menor prioridade)
  if (phone) {
    const fromPhone = extractLocationFromPhone(phone);
    if (fromPhone) {
      results.push(fromPhone);
    }
  }

  // Selecionar melhor resultado
  if (results.length === 0) {
    return null;
  }

  // Priorizar por confiança e completude
  const prioritized = results.sort((a, b) => {
    // Prioridade 1: Confiança
    const confidenceOrder = { high: 0, medium: 1, low: 2 };
    const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (confDiff !== 0) return confDiff;

    // Prioridade 2: Completude (city + state > apenas state)
    const completenessA = (a.city ? 1 : 0) + (a.state ? 1 : 0);
    const completenessB = (b.city ? 1 : 0) + (b.state ? 1 : 0);
    return completenessB - completenessA;
  });

  // Combinar resultados se possível (ex: city de um, state de outro)
  const best = prioritized[0];

  if (!best) {
    return null;
  }

  // Se best não tem city mas outro resultado tem, usar
  if (!best.city) {
    const withCity = results.find(r => r.city);
    if (withCity) {
      best.city = withCity.city;
    }
  }

  // Se best não tem state mas outro resultado tem, usar
  if (!best.state) {
    const withState = results.find(r => r.state);
    if (withState) {
      best.state = withState.state;
    }
  }

  // Se temos city mas não state, tentar inferir
  if (best.city && !best.state) {
    const inferredState = inferStateFromCity(best.city);
    if (inferredState) {
      best.state = inferredState;
    }
  }

  // Truncar city para 100 caracteres (limite do banco de dados)
  if (best.city && best.city.length > 100) {
    best.city = best.city.substring(0, 100).trim();
  }

  return best;
}

/**
 * Versão batch para processar múltiplos leads
 */
export function extractLocationBatch(
  leads: Array<{ id: string; bio: string | null; phone: string | null }>
): Map<string, LocationResult | null> {
  const results = new Map<string, LocationResult | null>();

  for (const lead of leads) {
    const location = extractLocation(lead.bio, lead.phone);
    results.set(lead.id, location);
  }

  return results;
}
