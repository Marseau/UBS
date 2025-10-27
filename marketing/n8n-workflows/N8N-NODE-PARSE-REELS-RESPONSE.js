// 📋 N8N Code Node - Parse Reels Response (ESTRUTURA 3 REELS SEPARADOS)
// VERSÃO ATUALIZADA: Parseia reel_1, reel_2, reel_3 explicitamente

const response = $input.item.json;

// Parse da resposta do GPT
const contentText = response.choices[0].message.content.trim();
let parsedContent;

try {
  const jsonMatch = contentText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    parsedContent = JSON.parse(jsonMatch[0]);
  } else {
    parsedContent = JSON.parse(contentText);
  }
} catch (error) {
  throw new Error('Failed to parse GPT Reels response as JSON: ' + error.message);
}

// Validar estrutura com 3 reels separados
if (!parsedContent.reel_1 || !parsedContent.reel_2 || !parsedContent.reel_3) {
  throw new Error('Formato JSON inválido. Expected reel_1, reel_2, reel_3. Keys: ' + Object.keys(parsedContent).join(', '));
}

// Extrair dados de cada Reel
const reel1 = parsedContent.reel_1;
const reel2 = parsedContent.reel_2;
const reel3 = parsedContent.reel_3;

// Validar campos obrigatórios em cada Reel
const validateReel = (reel, reelNumber) => {
  const requiredFields = ['sub_theme', 'carla_script', 'bruno_script', 'instagram_caption', 'instagram_hashtags'];
  for (const field of requiredFields) {
    if (!reel[field]) {
      throw new Error(`Reel ${reelNumber} missing required field: ${field}`);
    }
  }

  // Validar que hashtags é array
  if (!Array.isArray(reel.instagram_hashtags)) {
    throw new Error(`Reel ${reelNumber} instagram_hashtags must be an array`);
  }

  // Validar limites de palavras
  const carlaWords = reel.carla_script.split(/\s+/).length;
  const brunoWords = reel.bruno_script.split(/\s+/).length;

  if (carlaWords < 55 || carlaWords > 75) {
    console.warn(`⚠️ Reel ${reelNumber} Carla script has ${carlaWords} words (expected 55-75)`);
  }

  if (brunoWords < 95 || brunoWords > 120) {
    console.warn(`⚠️ Reel ${reelNumber} Bruno script has ${brunoWords} words (expected 95-120)`);
  }

  // Validar limite de caption
  if (reel.instagram_caption.length > 150) {
    console.warn(`⚠️ Reel ${reelNumber} caption has ${reel.instagram_caption.length} chars (max 150)`);
  }

  return true;
};

validateReel(reel1, 1);
validateReel(reel2, 2);
validateReel(reel3, 3);

console.log(`✅ Parsed 3 Reels successfully`);
console.log(`📌 Reel 1: "${reel1.sub_theme}"`);
console.log(`📌 Reel 2: "${reel2.sub_theme}"`);
console.log(`📌 Reel 3: "${reel3.sub_theme}"`);

// Retornar dados estruturados para próximo nó
return {
  json: {
    // Dados do Reel 1
    reel_1_sub_theme: reel1.sub_theme,
    reel_1_carla_script: reel1.carla_script,
    reel_1_bruno_script: reel1.bruno_script,
    reel_1_instagram_caption: reel1.instagram_caption,
    reel_1_instagram_hashtags: reel1.instagram_hashtags,

    // Dados do Reel 2
    reel_2_sub_theme: reel2.sub_theme,
    reel_2_carla_script: reel2.carla_script,
    reel_2_bruno_script: reel2.bruno_script,
    reel_2_instagram_caption: reel2.instagram_caption,
    reel_2_instagram_hashtags: reel2.instagram_hashtags,

    // Dados do Reel 3
    reel_3_sub_theme: reel3.sub_theme,
    reel_3_carla_script: reel3.carla_script,
    reel_3_bruno_script: reel3.bruno_script,
    reel_3_instagram_caption: reel3.instagram_caption,
    reel_3_instagram_hashtags: reel3.instagram_hashtags,

    // Metadata para tracking
    parsed_at: new Date().toISOString(),
    reel_count: 3,

    // Debug info
    reel_1_carla_word_count: reel1.carla_script.split(/\s+/).length,
    reel_1_bruno_word_count: reel1.bruno_script.split(/\s+/).length,
    reel_2_carla_word_count: reel2.carla_script.split(/\s+/).length,
    reel_2_bruno_word_count: reel2.bruno_script.split(/\s+/).length,
    reel_3_carla_word_count: reel3.carla_script.split(/\s+/).length,
    reel_3_bruno_word_count: reel3.bruno_script.split(/\s+/).length
  }
};
