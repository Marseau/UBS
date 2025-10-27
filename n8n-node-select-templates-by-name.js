/**
 * 🎨 N8N Node: Select Templates by Name
 *
 * Seleciona templates Canva baseado em padrões de nome:
 * - Main Template: Contém "Template Base", "UBS Template" ou similar
 * - CTA Template: Contém "Pag Final", "CTA Final", "UBS Nac" ou similar
 *
 * Input esperado: Array de designs do Canva com id, title, thumbnail_url
 * Output: { main_design_id, main_design_name, cta_design_id, cta_design_name, category }
 */

const items = $input.all()[0].json.items;

console.log(`🔍 Total de templates recebidos: ${items.length}`);
items.forEach((item, idx) => {
  console.log(`  [${idx}] ${item.id} - "${item.title}"`);
});

// Padrões para identificar Main Template (conteúdo principal)
// Nome exato: "UBS Template Base"
const mainPatterns = [
  'ubs template base',
  'template base',
  'ubs template',
  'base template'
];

// Padrões para identificar CTA Template (call-to-action final)
// Nome exato: "UBS Pag Final"
const ctaPatterns = [
  'ubs pag final',
  'pag final',
  'pagina final',
  'ubs final'
];

/**
 * Verifica se o título do template contém algum dos padrões
 */
function matchesPattern(title, patterns) {
  const titleLower = title.toLowerCase();
  return patterns.some(pattern => titleLower.includes(pattern));
}

// Buscar Main Template
let mainTemplate = items.find(t => matchesPattern(t.title, mainPatterns));

// Buscar CTA Template
let ctaTemplate = items.find(t => matchesPattern(t.title, ctaPatterns));

// Fallback: Se não encontrar por nome, usar posição
// Assume que Main = segundo template, CTA = primeiro template
if (!mainTemplate && items.length >= 2) {
  console.log('⚠️ Main template não encontrado por nome, usando fallback (items[1])');
  mainTemplate = items[1];
}

if (!ctaTemplate && items.length >= 1) {
  console.log('⚠️ CTA template não encontrado por nome, usando fallback (items[0])');
  ctaTemplate = items[0];
}

// Validação final
if (!mainTemplate || !ctaTemplate) {
  throw new Error(`Templates insuficientes. Recebidos: ${items.length}, Necessários: 2 (Main + CTA)`);
}

// Garantir que não são o mesmo template
if (mainTemplate.id === ctaTemplate.id) {
  console.log('❌ ERRO: Main e CTA são o mesmo template!');
  console.log(`  Main: ${mainTemplate.id} - "${mainTemplate.title}"`);
  console.log(`  CTA:  ${ctaTemplate.id} - "${ctaTemplate.title}"`);

  // Tentar corrigir pegando templates diferentes
  if (items.length >= 2) {
    console.log('🔄 Tentando correção automática...');
    const differentTemplates = items.filter(t => t.id !== mainTemplate.id);
    if (differentTemplates.length > 0) {
      ctaTemplate = differentTemplates[0];
      console.log(`✅ CTA corrigido para: ${ctaTemplate.id} - "${ctaTemplate.title}"`);
    } else {
      throw new Error('Não foi possível encontrar 2 templates diferentes');
    }
  }
}

console.log(`✅ Main Template selecionado: ${mainTemplate.id} - "${mainTemplate.title}"`);
console.log(`✅ CTA Template selecionado: ${ctaTemplate.id} - "${ctaTemplate.title}"`);

// Retornar ambos os templates selecionados
return {
  main_design_id: mainTemplate.id,
  main_design_name: mainTemplate.title,
  main_thumbnail_url: mainTemplate.thumbnail_url,
  cta_design_id: ctaTemplate.id,
  cta_design_name: ctaTemplate.title,
  cta_thumbnail_url: ctaTemplate.thumbnail_url,
  category: $input.all()[0].json.category || 'marketing',
  total_templates_available: items.length
};
