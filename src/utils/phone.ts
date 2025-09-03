/**
 * Utilitário para normalização de telefone
 * Padronização única para persistir e consultar
 */

export function normalizePhone(input: string): string {
  if (!input) return '';
  
  // Remove tudo que não é dígito
  const digits = input.replace(/\D+/g, '');
  
  // Se já tem prefixo 55 (Brasil)
  if (digits.startsWith('55') && digits.length >= 12) {
    return `+${digits}`;
  }
  
  // DDD + 9 dígitos (celular com 9)
  if (digits.length === 11) {
    return `+55${digits}`;
  }
  
  // DDD + 8 dígitos (fixo ou celular sem 9)
  if (digits.length === 10) {
    return `+55${digits}`;
  }
  
  // Se tem 13+ dígitos, assume que já tem código do país
  if (digits.length >= 13) {
    return `+${digits}`;
  }
  
  // Fallback: adiciona +55
  return `+55${digits}`;
}

/**
 * Gera candidatos de telefone para busca no banco
 * Para lidar com diferentes formatos já salvos
 */
export function generatePhoneCandidates(input: string): string[] {
  const raw = String(input || '').trim();
  const digits = raw.replace(/\D/g, '');
  const candidatesSet = new Set<string>();
  
  if (digits) {
    candidatesSet.add(digits);
    candidatesSet.add(`+${digits}`);
    
    if (digits.startsWith('55')) {
      const local = digits.slice(2);
      if (local) {
        candidatesSet.add(local);
        candidatesSet.add(`+${local}`);
      }
    } else {
      candidatesSet.add(`55${digits}`);
      candidatesSet.add(`+55${digits}`);
    }
  }
  
  return Array.from(candidatesSet);
}