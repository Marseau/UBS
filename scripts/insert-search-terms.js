const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/marseau/Developer/WhatsAppSalon-N8N/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const nichos = [
  // PRIORIDADE ALTA (gap >= 15)
  {
    target_segment: 'marketingdigital',
    categoria_geral: 'marketing',
    search_terms: ["marketingdigital", "marketingdeconteudo", "marketingonline", "marketingderesultados", "digitalmarketing", "marketingdigitalbrasil", "estrategiasdigitais", "marketingparaempreendedores", "socialmediamarketing", "contentmarketing", "inboundmarketing", "marketingdeafiliados", "emailmarketing", "marketingdeinfluencia", "growthmarketing", "performancemarketing", "agenciadigital", "consultoriadigital", "estrategistadigital", "marketeiro", "copywriting", "funil", "funildevendas", "lancamento", "lancamentodigital"],
    prioridade: 'alta'
  },
  {
    target_segment: 'trafego',
    categoria_geral: 'marketing',
    search_terms: ["trafegopago", "gestordetrafego", "trafegomanager", "trafegoorganico", "anunciosonline", "midiapaga", "compradetrafego", "trafegoqualificado", "facebookads", "googleads", "instagramads", "tiktokads", "linkedinads", "metaads", "youtubeads", "pinterestads", "spotifyads", "gestordeanuncios", "anunciospatrocinados", "roi", "cpa", "cpc", "ctr", "remarketing", "retargeting", "pixelfacebook", "conversao"],
    prioridade: 'alta'
  },
  {
    target_segment: 'coach',
    categoria_geral: 'desenvolvimento',
    search_terms: ["coach", "coaching", "coachdevida", "lifecoach", "coachdecarreira", "coachfinanceiro", "coachempresarial", "businesscoach", "executivecoach", "coachdeemagrecimento", "coachderelacionamento", "coachdelideranca", "mindsetcoach", "coachdesucesso", "highperformance", "coachingonline", "mentoria", "mentor", "mentordevendas", "mentordenegocios", "mentoraempresarial", "desenvolvimentopessoal", "transformacao", "metaseconsquistas"],
    prioridade: 'alta'
  },
  {
    target_segment: 'maquiagem',
    categoria_geral: 'beleza',
    search_terms: ["maquiagem", "maquiagemprofissional", "makeup", "makeuptutorial", "makeupartist", "maquiadora", "maquiadoraprofissional", "beautymakeup", "makeuplovers", "makenoiva", "maquiagemdenoiva", "makeformatura", "makefesta", "makesocial", "makeartistica", "makenatural", "makeclassica", "makeglam", "makeeditorial", "contorno", "contouring", "sobrancelhaperfeita", "ciliosposticos", "extensaodecilios", "designdesobrancelha", "micropigmentacao", "labios", "olhoesfumado"],
    prioridade: 'alta'
  },
  {
    target_segment: 'sobrancelha',
    categoria_geral: 'beleza',
    search_terms: ["sobrancelha", "sobrancelhas", "sobrancelhaperfeita", "sobrancelhalinda", "designdesobrancelha", "designerdesobrancelha", "sobrancelhadiva", "micropigmentacao", "micropigmentacaodesobrancelha", "microblading", "nanoblading", "shadowbrows", "powderbrows", "ombrebrows", "fioapio", "sobrancelhafioapio", "designerdepermanente", "especialistaemsobrancelha", "browartist", "browdesigner", "henna", "hennasobrancelha", "sobrancelhadehenna", "browlamination", "laminacaodesobrancelha"],
    prioridade: 'alta'
  },
  {
    target_segment: 'pilates',
    categoria_geral: 'fitness',
    search_terms: ["pilates", "pilatesbrasil", "pilateslovers", "pilateslife", "pilateseveryday", "pilatesinstrutor", "instrutordepilates", "studiodepilates", "pilatestudio", "pilatesreformer", "pilatesaparelho", "pilatessolo", "matpilates", "pilatesball", "pilatesclinico", "pilatesparagestante", "pilatesterceiraidade", "pilatesparaidosos", "metodopilates", "josephpilates", "contrology", "powerhouse", "respiracao", "flexibilidade", "fortalecimento", "postura", "conscienciacorporal"],
    prioridade: 'alta'
  },
  {
    target_segment: 'yoga',
    categoria_geral: 'fitness',
    search_terms: ["yoga", "yogabrasil", "yogalife", "yogalove", "yogaeveryday", "yogapractice", "yogainstrutor", "professorrayoga", "aulayoga", "classedeyoga", "studiodeyoga", "hathayoga", "vinyasa", "vinyasayoga", "ashtanga", "kundalini", "iyengar", "yogaflow", "poweryoga", "yinyoga", "yogarestaurativa", "yoganidra", "meditacao", "pranayama", "asana", "namaste", "chakras", "mantra", "mindfulness", "consciencia", "autoconhecimento", "bemestarespiritual"],
    prioridade: 'alta'
  },
  {
    target_segment: 'dentista',
    categoria_geral: 'saude',
    search_terms: ["dentista", "odontologia", "odonto", "dentistry", "odontologo", "cirurgiaodentista", "clinicaodontologica", "consultorioodontologico", "ortodontia", "ortodontista", "implante", "implantedentario", "protese", "endodontia", "periodontia", "odontopediatria", "harmonizacaofacial", "lentesdecontato", "clareamento", "clareamentodental", "sorriso", "sorrisoperfeito", "facetas", "designdosoriso", "esteticadental", "odontoporamor"],
    prioridade: 'alta'
  },
  // PRIORIDADE MÉDIA (gap 10-14)
  {
    target_segment: 'unha',
    categoria_geral: 'beleza',
    search_terms: ["unhas", "unhasdecoradas", "unhasperfeitas", "unhaslindas", "unhasdasemana", "naildesigner", "nailart", "nails", "nailsofinstagram", "nailtech", "unhasdegel", "unhasemgel", "gelunhas", "unhasacrigel", "fibradeidro", "unhasdeporcelana", "alongamentodeunhas", "unhasposticas", "unhasemacrilico", "manicure", "manicureprofissional", "manicurebrasileira", "nailartist", "esmalteria", "studiodenails", "espacodeunhas", "cursomanicure"],
    prioridade: 'media'
  },
  {
    target_segment: 'cabelo',
    categoria_geral: 'beleza',
    search_terms: ["cabelo", "cabelos", "cabeloperfeito", "cabelolindo", "cabelodivo", "hair", "hairstyle", "haircut", "haircolor", "hairdesign", "cabeleireiro", "cabeleireira", "hairsylist", "hairdresser", "colorista", "visagista", "salaodebeleza", "salaobeleza", "barbearia", "barbeiro", "cortefeminino", "cortemasculino", "mechas", "luzes", "balayage", "ombre", "progressiva", "botox", "hidratacao", "tratamentocapilar", "reconstrucao"],
    prioridade: 'media'
  },
  {
    target_segment: 'personal',
    categoria_geral: 'fitness',
    search_terms: ["personal", "personaltrainer", "personalonline", "personaloffline", "treinadorpessoal", "treinopersonalizado", "consultoriaonline", "assessoriaesportiva", "treinofuncional", "treinodehipertrofia", "treinofeminino", "personalgestante", "treino50mais", "personalparaobeso", "treinoparaidosos", "treinoaolado", "fitnessprofessional", "educadorfisico", "profissionaldeeducacaofisica", "cref", "treinoonline", "planilhadetreino", "prescricaodetreino", "periodizacao"],
    prioridade: 'media'
  },
  {
    target_segment: 'fitness',
    categoria_geral: 'fitness',
    search_terms: ["fitness", "fitnessbrasil", "fitnesslife", "fitnessmotivation", "fitnesslifestyle", "vidasaudavel", "vidafit", "estilodevida", "bemestar", "qualidadedevida", "academia", "musculacao", "treino", "treinopesado", "hipertrofia", "definicao", "crossfit", "funcional", "aerobico", "cardio", "hiit", "spinning", "fitgirl", "fitboy", "fitnessmodel", "bodybuilding", "shapeemconstrucao", "foconofoco", "disciplina", "determinacao", "nuncadesista"],
    prioridade: 'media'
  },
  {
    target_segment: 'fisioterapia',
    categoria_geral: 'saude',
    search_terms: ["fisioterapia", "fisioterapeuta", "fisio", "physiotherapy", "physio", "fisioterapiabrasil", "crefito", "fisioprofissional", "clinicadefisioterapia", "fisioortopedica", "fisioesportiva", "fisioneurologica", "fisiorespiatoria", "rpg", "pilatesclínico", "quiropraxia", "osteopatia", "acupuntura", "reabilitacao", "reabilitacaofisica", "tratamentofisioterapeutico", "dor", "lesao", "recuperacao", "postura", "coluna", "joelho", "ombro"],
    prioridade: 'media'
  },
  // PRIORIDADE BAIXA (gap < 10)
  {
    target_segment: 'medico',
    categoria_geral: 'saude',
    search_terms: ["medico", "medicina", "medicinabrasileira", "doctor", "saude", "clinicamedica", "consultoriomedico", "atendimentomedico", "dermatologista", "cardiologista", "ginecologista", "pediatra", "ortopedista", "psiquiatra", "neurologista", "endocrinologista", "nutricionista", "geriatra", "cirurgiaplastica", "medicinaestetica", "nutrologia", "medicinaesportiva", "medicinadotrabalho", "medicinarural", "medicinafamiliar", "clinicogeral"],
    prioridade: 'baixa'
  }
];

async function insertSearchTerms() {
  console.log('=== INSERINDO TERMOS DE BUSCA PARA SCRAPING ===\n');

  let inserted = 0;
  let errors = 0;

  for (const nicho of nichos) {
    const row = {
      target_segment: nicho.target_segment,
      categoria_geral: nicho.categoria_geral,
      area_especifica: nicho.target_segment,
      search_terms: nicho.search_terms
    };

    const { data, error } = await supabase
      .from('lead_search_terms')
      .insert(row)
      .select();

    if (error) {
      console.log(`❌ ${nicho.target_segment}: ${error.message}`);
      errors++;
    } else {
      console.log(`✅ ${nicho.target_segment} (${nicho.prioridade}): ${nicho.search_terms.length} termos`);
      inserted++;
    }
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`Inseridos: ${inserted}`);
  console.log(`Erros: ${errors}`);
  console.log(`Total de hashtags: ${nichos.reduce((sum, n) => sum + n.search_terms.length, 0)}`);
}

insertSearchTerms().catch(console.error);
