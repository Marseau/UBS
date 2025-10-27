// 🎬 N8N Code Node - Return Both PNGs (FIXED)
// Este é o código CORRETO para o último nó do workflow XW5G28IkaZQzfWk2
//
// PROBLEMA ORIGINAL:
// ❌ items[0].binary.data retorna referência filesystem
// ❌ items[1].binary.data retorna referência filesystem
//
// SOLUÇÃO:
// ✅ items[0].json.main_png_base64 retorna string base64
// ✅ items[1].json.cta_png_base64 retorna string base64

// Obter metadados dos templates selecionados
const mainDesignId = $('Select Templates').first().json.main_design_id;
const mainDesignName = $('Select Templates').first().json.main_design_name;
const ctaDesignId = $('Select Templates').first().json.cta_design_id;
const ctaDesignName = $('Select Templates').first().json.cta_design_name;

// ✅ FIX: Ler campos base64 criados pelos nós MoveBinaryData
// Nó "main" cria o campo "main_png_base64"
// Nó "CTA" cria o campo "cta_png_base64"
const mainPng = items[0].json.main_png_base64;
const ctaPng = items[1].json.cta_png_base64;

// Validação (opcional, mas recomendado)
if (!mainPng || typeof mainPng !== 'string' || mainPng.length < 100) {
  throw new Error('❌ main_png_base64 inválido! Verifique se o nó "main" (MoveBinaryData) está funcionando.');
}

if (!ctaPng || typeof ctaPng !== 'string' || ctaPng.length < 100) {
  throw new Error('❌ cta_png_base64 inválido! Verifique se o nó "CTA" (MoveBinaryData) está funcionando.');
}

// Retornar dados para o workflow parent (Content Seeder)
return {
  success: true,
  main_design_id: mainDesignId,
  main_design_name: mainDesignName,
  main_png_binary: mainPng,        // ✅ String base64 pura
  cta_design_id: ctaDesignId,
  cta_design_name: ctaDesignName,
  cta_png_binary: ctaPng,          // ✅ String base64 pura
  format: 'png',
  dimensions: '1080x1350',
  aspect_ratio: '4:5',
  // Debug info
  main_png_length: mainPng.length,
  cta_png_length: ctaPng.length,
  main_png_preview: mainPng.substring(0, 50) + '...',
  cta_png_preview: ctaPng.substring(0, 50) + '...'
};
