const fs = require('fs');

// Ler imagem e converter para Base64
const imageBuffer = fs.readFileSync('../src/frontend/assets/images/UBS_Nac_Branco.png');
const base64Image = imageBuffer.toString('base64');
const dataUri = `data:image/png;base64,${base64Image}`;

console.log('✅ Logo convertido para Base64');
console.log(`📦 Tamanho: ${(base64Image.length / 1024).toFixed(2)} KB`);
console.log('');
console.log('Data URI (primeiros 100 caracteres):');
console.log(dataUri.substring(0, 100) + '...');

// Salvar em arquivo para referência
fs.writeFileSync('logo-base64.txt', dataUri);
console.log('');
console.log('✅ Salvo em: logo-base64.txt');
