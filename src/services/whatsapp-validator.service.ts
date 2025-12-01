/**
 * Serviço de Validação de WhatsApp via Whapi.cloud
 *
 * Valida se números de telefone possuem WhatsApp ativo.
 * Usado durante o scrape para enriquecer leads com dados validados.
 */

import axios from 'axios';

// Configuração Whapi.cloud
const WHAPI_TOKEN = process.env.WHAPI_TOKEN || 'pot7O6eCrMNhsXIIFiwaqPZ6uuXFvLiu';
const WHAPI_URL = 'https://gate.whapi.cloud';

// Rate limiting
const VALIDATION_DELAY_MS = 300; // 300ms entre validações

export interface ValidatedPhone {
  number: string;
  valid_whatsapp: boolean; // true = tem WhatsApp, false = não tem ou erro
}

export interface ValidationStats {
  total: number;
  valid: number;
  invalid: number;
  errors: number;
}

/**
 * Valida um único número de telefone via Whapi.cloud
 * @param phone Número no formato +55XXXXXXXXXXX
 * @returns true se tem WhatsApp, false se não tem, null se erro
 */
export async function checkWhatsAppNumber(phone: string): Promise<boolean | null> {
  try {
    const cleanPhone = phone.replace('+', '');

    const response = await axios.post(
      `${WHAPI_URL}/contacts`,
      {
        blocking: 'wait',
        contacts: [cleanPhone]
      },
      {
        headers: {
          'Authorization': `Bearer ${WHAPI_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const contact = response.data?.contacts?.[0];
    return contact?.status === 'valid';
  } catch (error: any) {
    console.error('[Whapi] Erro na requisição:', {
      url: '/contacts',
      status: error.response?.status,
      data: error.response?.data
    });

    if (error.response?.status === 404) {
      console.error('[WHAPI] Canal não encontrado (404) - Verifique se o canal WhatsApp está conectado no Whapi.cloud');
      throw new Error('WHAPI_CHANNEL_NOT_FOUND');
    }
    if (error.response?.status === 402) {
      console.error('[WHAPI] Limite de requisições atingido (402)');
      throw new Error('WHAPI_LIMIT_EXCEEDED');
    }
    if (error.response?.status === 401) {
      console.error('[WHAPI] Token inválido (401)');
      throw new Error('WHAPI_UNAUTHORIZED');
    }

    console.error('[Whapi] Erro ao verificar número:', error.message);
    // Outros erros retornam null (não sabemos se é válido)
    return null;
  }
}

/**
 * Valida uma lista de telefones e retorna array de objetos validados
 * @param phones Array de strings com telefones normalizados (+55XXXXXXXXXXX)
 * @returns Array de ValidatedPhone com valid_whatsapp: true apenas para válidos
 */
export async function validatePhones(phones: string[]): Promise<ValidatedPhone[]> {
  if (!phones || phones.length === 0) {
    return [];
  }

  const validatedPhones: ValidatedPhone[] = [];

  for (const phone of phones) {
    try {
      const isValid = await checkWhatsAppNumber(phone);

      // Sempre incluir valid_whatsapp: true ou false
      validatedPhones.push({
        number: phone,
        valid_whatsapp: isValid === true
      });

      // Rate limiting
      await new Promise(r => setTimeout(r, VALIDATION_DELAY_MS));
    } catch (error: any) {
      if (error.message === 'WHAPI_CHANNEL_NOT_FOUND') {
        // Canal não conectado - propagar erro para interromper validação
        throw new Error('WHAPI_CHANNEL_NOT_FOUND: Canal WhatsApp não está conectado no Whapi.cloud');
      }
      if (error.message === 'WHAPI_LIMIT_EXCEEDED') {
        // Se atingiu limite, salvar restante como false (não validado)
        console.warn('[WHAPI] Limite atingido - salvando telefones restantes como não validados');
        for (const remainingPhone of phones.slice(phones.indexOf(phone))) {
          if (!validatedPhones.find(p => p.number === remainingPhone)) {
            validatedPhones.push({ number: remainingPhone, valid_whatsapp: false });
          }
        }
        break;
      }
      // Outros erros - salvar como false
      validatedPhones.push({ number: phone, valid_whatsapp: false });
    }
  }

  return validatedPhones;
}

/**
 * Valida telefones de um lead e retorna phones_normalized pronto para salvar
 * @param phone Telefone principal (campo phone)
 * @param additionalPhones Array de telefones adicionais
 * @returns phones_normalized como array de ValidatedPhone
 */
export async function validateLeadPhones(
  phone: string | null,
  additionalPhones: string[] | null
): Promise<ValidatedPhone[]> {
  // Coletar todos os telefones únicos
  const allPhones: string[] = [];

  if (phone) {
    allPhones.push(phone);
  }

  if (additionalPhones && Array.isArray(additionalPhones)) {
    for (const p of additionalPhones) {
      if (p && !allPhones.includes(p)) {
        allPhones.push(p);
      }
    }
  }

  if (allPhones.length === 0) {
    return [];
  }

  console.log(`   📱 Validando ${allPhones.length} telefone(s) via Whapi...`);

  const validated = await validatePhones(allPhones);

  const validCount = validated.filter(p => p.valid_whatsapp).length;
  console.log(`   ✅ WhatsApp válido: ${validCount}/${validated.length}`);

  return validated;
}

/**
 * Verifica se phones_normalized já está validado (contém objetos)
 * @param phonesNormalized O campo phones_normalized do banco
 * @returns true se já foi validado
 */
export function isPhonesValidated(phonesNormalized: any): boolean {
  if (!phonesNormalized || !Array.isArray(phonesNormalized)) {
    return false;
  }
  if (phonesNormalized.length === 0) {
    return false;
  }
  // Se o primeiro elemento é objeto, já foi validado
  return typeof phonesNormalized[0] === 'object';
}

/**
 * Extrai apenas os telefones com WhatsApp válido
 * @param validatedPhones Array de ValidatedPhone
 * @returns Array apenas com números que têm WhatsApp
 */
export function getValidWhatsAppNumbers(validatedPhones: ValidatedPhone[]): string[] {
  return validatedPhones
    .filter(p => p.valid_whatsapp)
    .map(p => p.number);
}

/**
 * Conta telefones válidos e inválidos
 * @param validatedPhones Array de ValidatedPhone
 * @returns Objeto com contagem de válidos e inválidos
 */
export function countValidatedPhones(validatedPhones: ValidatedPhone[]): { valid: number; invalid: number } {
  const valid = validatedPhones.filter(p => p.valid_whatsapp).length;
  return {
    valid,
    invalid: validatedPhones.length - valid
  };
}

// Estatísticas globais (para monitoramento)
let globalStats: ValidationStats = {
  total: 0,
  valid: 0,
  invalid: 0,
  errors: 0
};

export function getValidationStats(): ValidationStats {
  return { ...globalStats };
}

export function resetValidationStats(): void {
  globalStats = { total: 0, valid: 0, invalid: 0, errors: 0 };
}
