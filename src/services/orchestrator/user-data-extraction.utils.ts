/**
 * User data extraction utilities
 * Deterministic extraction of user information (name, email, gender, birth date)
 */

import { UserDataExtractionResult, DataCollectionState } from '../../types';

// Helper function to get user by phone in a specific tenant
import { supabaseAdmin } from '../../config/database';

export async function getUserByPhoneInTenant(phone: string, tenantId: string) {
    const { data, error } = await supabaseAdmin
        .from('users')
        .select(`
      id, name, email,
      user_tenants!inner(tenant_id)
    `)
        .eq('phone', phone)
        .eq('user_tenants.tenant_id', tenantId)
        .maybeSingle();

    return { data, error };
}

// Helper para normalizar chaves de contexto (apenas dígitos)
export const toCtxId = (s: string) => String(s || '').replace(/\D/g, ''); // dígitos-only

// Resolve opções simples de desambiguação (pt-BR)
export function resolveDisambiguationChoice(text: string): string | null {
    const t = (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/(servicos?|lista|catalogo)/i.test(t)) return 'services';
    if (/(precos?|preco|valores?|quanto|orcamento)/i.test(t)) return 'pricing';
    if (/(horarios?|agenda|disponivel|amanha|hoje|quando)/i.test(t)) return 'availability';
    return null;
}

// === ONBOARDING HELPERS (determinísticos) ===
export function extractEmailStrict(t: string): string | null {
    const m = (t || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return m ? m[0].toLowerCase() : null;
}

export function inferGenderFromName(name?: string): string | undefined {
    if (!name) return undefined;
    const first = name.split(/\s+/)[0]?.toLowerCase();
    if (!first) return undefined;
    if (/a$/.test(first)) return 'female';
    if (/o$/.test(first)) return 'male';
    return undefined;
}

export function extractBirthDate(text: string): string | null {
    // Regex para formatos: dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/;
    const match = text.match(dateRegex);

    if (!match || !match[1] || !match[2] || !match[3]) return null;

    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    const year = parseInt(match[3]);

    // Validações básicas
    if (day < 1 || day > 31) return null;
    if (month < 1 || month > 12) return null;
    if (year < 1900 || year > new Date().getFullYear()) return null;

    // Retorna no formato ISO (YYYY-MM-DD) para o banco
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function extractNameStrict(t: string): string | null {
    t = (t || '').trim();

    // não confundir saudações com nome
    if (/\b(oi|ol[áa]|bom dia|boa tarde|boa noite|hey|hello)\b/i.test(t)) return null;

    // formatos explícitos
    const m =
        t.match(/\b(meu nome é|me chamo|sou)\s+(.+)/i) ||
        t.match(/\bnome\s*:\s*(.+)/i);

    let candidate = (m?.[2] || m?.[1] || '').trim();

    // Se não achou padrão explícito, tenta padrão genérico CORRIGIDO (aceita nome único)
    if (!candidate) {
        // CORREÇÃO: Aceitar tanto nome único quanto composto
        const genericMatch = t.match(/([A-ZÀ-Ú][a-zA-ZÀ-ÿ''´`-]+(?:\s+[A-ZÀ-Ú][a-zA-ZÀ-ÿ''´`-]+)*)/);
        candidate = genericMatch?.[1]?.trim() || '';
    }

    if (!candidate) return null;

    // ✅ NOVO: Cortar sufixos comuns que não fazem parte do nome
    candidate = candidate.replace(/\s+(e o seu\??|e o teu\??|e vc\??|e você\??|e tu\??)$/i, '');

    // CORREÇÃO: Aceitar tanto nome único quanto múltiplo
    const parts = candidate.split(/\s+/).filter(p => p.length >= 2);
    if (parts.length < 1) return null; // Mínimo 1 palavra (não 2+)

    // anti-lixo básico
    if (/\b(obrigad[ao]|valeu|tchau|por favor|como vai|tudo bem)\b/i.test(candidate)) return null;

    return candidate.replace(/\s+/g, ' ').trim();
}

export function firstName(name?: string) {
    return (name || '').split(' ')[0] || '';
}

/**
 * Extract user data from message text
 */
export function extractUserData(text: string): UserDataExtractionResult {
    const result: UserDataExtractionResult = {
        extractedSuccessfully: false
    };

    // Extract name
    const extractedName = extractNameStrict(text);
    if (extractedName) {
        result.name = extractedName;
        result.extractedSuccessfully = true;
    }

    // Extract email
    const extractedEmail = extractEmailStrict(text);
    if (extractedEmail) {
        result.email = extractedEmail;
        result.extractedSuccessfully = true;
    }

    // Extract birth date
    const extractedBirthDate = extractBirthDate(text);
    if (extractedBirthDate) {
        result.birthDate = extractedBirthDate;
        result.extractedSuccessfully = true;
    }

    // Infer gender from name if name was extracted
    if (result.name) {
        const inferredGender = inferGenderFromName(result.name);
        if (inferredGender) {
            result.gender = inferredGender;
        }
    }

    return result;
}

/**
 * Determine next data collection state based on current data
 */
export function determineNextCollectionState(
    currentState: DataCollectionState,
    hasName: boolean,
    hasEmail: boolean,
    hasGender: boolean
): DataCollectionState {
    // If we have all required data, we're completed
    if (hasName && hasEmail && hasGender) {
        return DataCollectionState.COMPLETED;
    }

    // Otherwise, follow the sequence: name -> email -> gender
    if (!hasName) {
        return DataCollectionState.AWAITING_NAME;
    }

    if (!hasEmail) {
        return DataCollectionState.AWAITING_EMAIL;
    }

    if (!hasGender) {
        return DataCollectionState.AWAITING_GENDER;
    }

    return DataCollectionState.COMPLETED;
}