// Test phone validation logic
const phone = '5518998109757'; // Número encontrado no wa.me

console.log('Testando número:', phone);
console.log('Length:', phone.length);

const cleaned = phone.replace(/[^0-9]/g, '');
console.log('Cleaned:', cleaned);
console.log('Cleaned length:', cleaned.length);

// Must be 10 or 11 digits (with area code)
if (cleaned.length !== 10 && cleaned.length !== 11) {
  console.log('❌ FALHOU: Deve ter 10 ou 11 dígitos');
} else {
  console.log('✅ PASSOU: Tem 10 ou 11 dígitos');
}

// If 11 digits, 3rd digit must be 9 (mobile)
if (cleaned.length === 11 && cleaned[2] !== '9') {
  console.log('❌ FALHOU: 11 dígitos mas 3º dígito não é 9');
} else if (cleaned.length === 11) {
  console.log('✅ PASSOU: 11 dígitos e 3º dígito é 9');
}

// Area code must be between 11-99
const areaCode = parseInt(cleaned.substring(0, 2));
console.log('Area code:', areaCode);
if (areaCode < 11 || areaCode > 99) {
  console.log('❌ FALHOU: DDD deve estar entre 11-99');
} else {
  console.log('✅ PASSOU: DDD válido');
}

// Must not be all same digits
if (/^(\d)\1+$/.test(cleaned)) {
  console.log('❌ FALHOU: Todos os dígitos iguais');
} else {
  console.log('✅ PASSOU: Dígitos não são todos iguais');
}

console.log('\n=== PROBLEMA ENCONTRADO ===');
console.log('O número tem 13 dígitos (55 + 11 dígitos)');
console.log('Mas a validação espera 10 ou 11 dígitos SEM o código do país (55)');
console.log('Precisamos REMOVER o 55 antes de validar!');
