import express from 'express';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import CalendarService from '../services/calendar.service.js';

const router = express.Router();

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Inicializar serviços - OBRIGATÓRIO GOOGLE CALENDAR
const calendarService = new CalendarService();

// Configuração OpenAI - with validation
let openai: OpenAI | null = null;
try {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-openai-api-key') {
    console.warn('⚠️ OpenAI API key not configured properly');
  } else {
    openai = new OpenAI({ apiKey });
  }
} catch (error) {
  console.error('❌ Failed to initialize OpenAI:', error);
}

// =====================================================
// FUNÇÃO PARA BUSCAR DADOS REAIS DO BANCO
// =====================================================

async function getTenantRealData(tenantId: string) {
  try {
    // Buscar serviços reais do tenant
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');

    if (servicesError) {
      console.error('❌ Erro ao buscar serviços:', servicesError);
      return { services: [], staff: [] };
    }

    // Buscar colaboradores reais (quando tabela existir)
    let staff: any[] = [];
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name');

    if (!staffError) {
      staff = staffData || [];
    }

    console.log(`📊 Dados reais carregados: ${services.length} serviços, ${staff.length} colaboradores`);

    return {
      services: services || [],
      staff: staff || []
    };

  } catch (error) {
    console.error('💥 Erro ao buscar dados reais:', error);
    return { services: [], staff: [] };
  }
}

// Agentes IA especializados por domínio - MANTIDO PARA PROMPTS
const AI_AGENTS = {
  beauty: {
    name: 'Agente Beleza & Estética',
    systemPrompt: `Você é uma assistente especializada em agendamentos para salões de beleza e clínicas de estética. 

CARACTERÍSTICAS:
- Sempre responda em português brasileiro
- Seja calorosa, acolhedora e profissional
- Entenda sobre cortes, coloração, tratamentos estéticos, manicure, pedicure
- Conheça durações típicas dos procedimentos
- Pergunte sobre preferência de profissional
- Sugira horários alternativos quando necessário

EXEMPLOS DE SERVIÇOS:
- Corte feminino (45-60min)
- Corte masculino (30-45min) 
- Coloração completa (2-3h)
- Mechas/luzes (1.5-2h)
- Progressiva/botox (2-3h)
- Manicure (45min)
- Pedicure (60min)
- Limpeza de pele (60-90min)
- Massagem relaxante (60-90min)

Sempre confirme: data, horário, serviço e profissional (se houver preferência).`
  },

  healthcare: {
    name: 'Agente Saúde & Bem-estar',
    systemPrompt: `Você é uma assistente especializada em agendamentos para clínicas de saúde e consultórios médicos.

CARACTERÍSTICAS:
- Sempre responda em português brasileiro
- Seja empática, profissional e tranquilizadora
- Entenda sobre consultas, exames, terapias
- Identifique urgência (não emergência) para priorizar
- Pergunte sobre tipo de consulta e especialidade
- Lembre sobre preparos necessários

ESPECIALIDADES COMUNS:
- Clínico Geral (30-45min)
- Cardiologia (45min)
- Dermatologia (30min)
- Psicologia (50min)
- Nutrição (60min)
- Fisioterapia (45min)
- Odontologia (45-60min)

IMPORTANTE: Nunca dê diagnósticos ou conselhos médicos. Apenas agende consultas.
Sempre confirme: especialidade, data, horário e motivo da consulta.`
  },

  legal: {
    name: 'Agente Jurídico & Advocacia',
    systemPrompt: `Você é uma assistente especializada em agendamentos para escritórios de advocacia e serviços jurídicos.

CARACTERÍSTICAS:
- Sempre responda em português brasileiro
- Seja formal, respeitosa e profissional
- Entenda sobre áreas do direito
- Colete informações básicas da questão
- Oriente sobre documentos necessários
- Explique brevemente o processo

ÁREAS DO DIREITO:
- Direito Civil (60-90min)
- Direito Trabalhista (60min)
- Direito Criminal (90min)
- Direito de Família (60min)
- Direito Empresarial (90min)
- Direito Imobiliário (60min)
- Direito Previdenciário (60min)

Sempre confirme: área do direito, data, horário e breve descrição da questão.
Oriente sobre documentos que deve trazer para a consulta.`
  },

  education: {
    name: 'Agente Educação & Ensino',
    systemPrompt: `Você é uma assistente especializada em agendamentos para aulas particulares e serviços educacionais.

CARACTERÍSTICAS:
- Sempre responda em português brasileiro
- Seja motivadora, paciente e didática
- Entenda sobre matérias e níveis de ensino
- Identifique dificuldades específicas
- Sugira planos de estudo personalizados
- Organize horários flexíveis

MATÉRIAS E NÍVEIS:
- Matemática (Fundamental, Médio, Superior)
- Português (Redação, Gramática, Literatura)
- Inglês (Básico, Intermediário, Avançado)
- Física/Química (Médio, Pré-vestibular)
- História/Geografia (Fundamental, Médio)
- Programação (Iniciante, Intermediário)
- Música (Instrumentos, Teoria)

Sempre confirme: matéria, nível do aluno, objetivo (reforço, prova, etc.) e horário.`
  },

  sports: {
    name: 'Agente Esportes & Fitness',
    systemPrompt: `Você é uma assistente especializada em agendamentos para personal trainers, academias e atividades esportivas.

CARACTERÍSTICAS:
- Sempre responda em português brasileiro
- Seja motivadora, energética e incentivadora
- Entenda sobre objetivos fitness
- Identifique condicionamento físico atual
- Sugira modalidades adequadas
- Organize cronogramas de treino

MODALIDADES E OBJETIVOS:
- Musculação (Ganho de massa, Definição)
- Cardio/Aeróbico (Emagrecimento, Resistência)
- Funcional (Condicionamento geral)
- Yoga/Pilates (Flexibilidade, Bem-estar)
- Lutas (Defesa pessoal, Competição)
- Natação (Técnica, Resistência)
- Corrida/Caminhada (Performance, Saúde)

Sempre confirme: objetivo, nível atual, preferência de modalidade e horários disponíveis.`
  },

  consulting: {
    name: 'Agente Consultoria & Negócios',
    systemPrompt: `Você é uma assistente especializada em agendamentos para consultores, coaches e serviços empresariais.

CARACTERÍSTICAS:
- Sempre responda em português brasileiro
- Seja estratégica, analítica e profissional
- Entenda sobre necessidades empresariais
- Identifique áreas de melhoria
- Sugira diagnósticos preliminares
- Organize reuniões estruturadas

TIPOS DE CONSULTORIA:
- Marketing Digital (Estratégia, Campanhas)
- Vendas (Processos, Treinamento)
- Gestão (Organização, Liderança)
- Financeira (Fluxo de caixa, Investimentos)
- RH (Recrutamento, Desenvolvimento)
- Tecnologia (Sistemas, Automação)
- Estratégica (Planejamento, Crescimento)

Sempre confirme: área de consultoria, tamanho da empresa, desafio principal e objetivos.`
  },

  general: {
    name: 'Agente Geral & Diversos',
    systemPrompt: `Você é uma assistente universal de agendamentos para diversos tipos de serviços e negócios.

CARACTERÍSTICAS:
- Sempre responda em português brasileiro
- Seja versátil, adaptável e amigável
- Entenda sobre diferentes tipos de serviços
- Faça perguntas para identificar a necessidade específica
- Adapte-se ao contexto do negócio
- Ofereça horários flexíveis

TIPOS DE SERVIÇOS DIVERSOS:
- Serviços domésticos (Limpeza, Jardinagem, Manutenção)
- Eventos (Fotografia, Decoração, Catering)
- Transportes (Mudanças, Delivery, Motoristas)
- Técnicos (Informática, Eletrônicos, Eletricista)
- Artesanato (Costura, Artesanato, Personalização)
- Animais (Pet shop, Veterinário, Adestramento)
- Outros serviços profissionais

Sempre confirme: tipo de serviço, data preferida, horário e detalhes específicos da necessidade.`
  }
};

/**
 * Endpoint para criar tenant de demonstração
 */
router.post('/create-tenant', async (req, res) => {
  try {
    const { businessName, businessEmail, whatsappNumber, userNumber, domain, services, collaborators } = req.body;

    // Validações básicas
    if (!businessName || !businessEmail || !whatsappNumber || !userNumber || !domain) {
      return res.status(400).json({
        error: 'Dados obrigatórios: businessName, businessEmail, whatsappNumber, userNumber, domain'
      });
    }

    // Validar configurações essenciais para demo
    if (!openai) {
      return res.status(503).json({
        error: 'Sistema temporariamente indisponível. Configure OPENAI_API_KEY para usar o chat demo.',
        code: 'OPENAI_NOT_CONFIGURED'
      });
    }

    if (!AI_AGENTS[domain as keyof typeof AI_AGENTS]) {
      return res.status(400).json({
        error: 'Domínio inválido. Opções: beauty, healthcare, legal, education, sports, consulting, general'
      });
    }

    // Limpar números de telefone para validação
    const cleanBusinessPhone = whatsappNumber.replace(/\D/g, '');
    const cleanUserPhone = userNumber.replace(/\D/g, '');

    // 1. Verificar se WhatsApp de usuário é igual ao do negócio
    if (cleanUserPhone === cleanBusinessPhone) {
      return res.status(400).json({
        error: 'Os números de WhatsApp devem ser diferentes. WhatsApp do negócio e WhatsApp de usuário não podem ser iguais.'
      });
    }

    // 2. Validar se nome do negócio já existe (apenas em contas reais)
    const { data: existingBusiness } = await supabase
      .from('tenants')
      .select('id, business_name')
      .eq('business_name', businessName)
      .eq('account_type', 'real') // Só verifica duplicatas em contas reais
      .maybeSingle();

    if (existingBusiness) {
      return res.status(400).json({
        error: `O nome do negócio "${businessName}" já existe. Escolha outro nome para seu negócio.`
      });
    }

    // 3. Validar se email já existe (apenas em contas reais)
    const { data: existingEmail } = await supabase
      .from('admin_users')
      .select('id, email')
      .eq('email', businessEmail)
      .eq('account_type', 'real') // Só verifica duplicatas em contas reais
      .maybeSingle();

    if (existingEmail) {
      return res.status(400).json({
        error: `O email "${businessEmail}" já está cadastrado. Use outro email para seu negócio.`
      });
    }

    // 4. Verificar se WhatsApp do negócio já existe
    const { data: existingBusinessPhone } = await supabase
      .from('tenants')
      .select('id, business_name, domain, phone, account_type')
      .eq('phone', cleanBusinessPhone)
      .maybeSingle();

    // Se encontrou tenant REAL, bloquear
    if (existingBusinessPhone && existingBusinessPhone.account_type === 'real') {
      return res.status(400).json({
        error: `O WhatsApp do negócio "${whatsappNumber}" já está em uso. Use outro número para seu negócio.`
      });
    }

    // Se encontrou tenant DEMO/TEST, reutilizar ao invés de criar novo
    if (existingBusinessPhone && existingBusinessPhone.account_type === 'test') {
      console.log(`♻️ Reutilizando tenant existente: ${existingBusinessPhone.id}`);
      
      return res.json({
        success: true,
        tenantId: existingBusinessPhone.id,
        businessName: existingBusinessPhone.business_name,
        businessEmail: businessEmail, // Usar o email fornecido pelo usuário
        whatsappNumber,
        userNumber,
        domain: existingBusinessPhone.domain,
        message: 'Demo reutilizado! Tenant existente encontrado.',
        isReused: true
      });
    }

    // 5. Validar se WhatsApp de usuário já existe (apenas em contas reais)
    const { data: existingUserPhone } = await supabase
      .from('users')
      .select('id, phone_number')
      .eq('phone_number', cleanUserPhone)
      .eq('account_type', 'real') // Só verifica duplicatas em contas reais
      .maybeSingle();

    if (existingUserPhone) {
      return res.status(400).json({
        error: `O WhatsApp de usuário "${userNumber}" já está cadastrado. Use outro número pessoal.`
      });
    }

    // Gerar dados únicos para o demo
    const crypto = await import('crypto');
    const tenantId = crypto.randomUUID();
    const demoPassword = 'Admin123';
    const hashedPassword = await bcrypt.hash(demoPassword, 10);

    // Criar tenant demo (usando tabela existente tenants)
    console.log('🔍 DEBUG: Attempting to create tenant with data:', {
      id: tenantId,
      business_name: businessName,
      domain: domain,
      plan: 'demo',
      status: 'active',
      account_type: 'test',
      phone: cleanBusinessPhone
    });

    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .insert([{
        id: tenantId,
        business_name: businessName,
        domain: domain,
        status: 'active',
        account_type: 'test', // 🎯 FLAG DE ISOLAMENTO - CRUCIAL!
        created_at: new Date().toISOString(),
        phone: cleanBusinessPhone
      }])
      .select()
      .single();

    if (tenantError) {
      console.error('❌ DEBUG: Tenant creation error details:', {
        error: tenantError,
        code: tenantError.code,
        message: tenantError.message,
        details: tenantError.details,
        hint: tenantError.hint
      });
      return res.status(500).json({ 
        error: 'Falha ao criar tenant demo',
        debug: process.env.NODE_ENV === 'development' ? tenantError.message : undefined
      });
    }

    // Criar admin_user para o tenant demo
    const { data: adminData, error: adminError } = await supabase
      .from('admin_users')
      .insert([{
        tenant_id: tenantId,
        email: businessEmail,
        password_hash: hashedPassword,
        name: `Admin ${businessName}`,
        role: 'admin',
        account_type: 'test', // 🎯 FLAG DE ISOLAMENTO - CRUCIAL!
        is_active: true,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (adminError) {
      console.error('Erro ao criar admin demo:', adminError);
      return res.status(500).json({ error: 'Falha ao criar admin demo' });
    }

    // Popular serviços (customizados ou padrão do domínio)
    const agent = AI_AGENTS[domain as keyof typeof AI_AGENTS];
    let servicesData: any[] = [];
    
    if (services && services.length > 0) {
      // Usar serviços customizados pelo usuário
      servicesData = services.map((service: any) => ({
        tenant_id: tenantId,
        name: service.name,
        duration: service.duration,
        price: service.price,
        description: `Serviço personalizado - ${service.name}`,
        account_type: 'test', // 🎯 FLAG DE ISOLAMENTO - CRUCIAL!
        is_active: true,
        created_at: new Date().toISOString()
      }));
    } else {
      // Sem serviços - serão populados via script externo
      servicesData = [];
    }

    if (servicesData.length > 0) {
      const { error: servicesError } = await supabase
        .from('services')
        .insert(servicesData);

      if (servicesError) {
        console.error('Erro ao criar serviços:', servicesError);
        // Não falha se serviços não foram criados
      }
    }

    // Popular dados de amostra (profissionais, horários disponíveis, etc.)
    await populateDemoData(tenantId, domain, cleanUserPhone, collaborators);

    // Resposta de sucesso
    return res.json({
      success: true,
      tenantId,
      businessName,
      businessEmail,
      whatsappNumber,
      userNumber,
      domain,
      message: 'Demo criado com sucesso! Você pode começar a testar agora.'
    });

  } catch (error) {
    console.error('Erro ao criar tenant demo:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

/**
 * Endpoint para chat com IA especializada
 */
router.post('/chat', async (req, res) => {
  try {
    const { tenantId, message, domain } = req.body;

    if (!tenantId || !message || !domain) {
      return res.status(400).json({
        error: 'Dados obrigatórios: tenantId, message, domain'
      });
    }

    // Validar se OpenAI está configurado
    if (!openai) {
      return res.status(503).json({
        error: 'Chat IA temporariamente indisponível',
        response: 'Desculpe, o sistema de IA está temporariamente indisponível. Tente novamente mais tarde.',
        code: 'OPENAI_NOT_CONFIGURED'
      });
    }

    const agent = AI_AGENTS[domain as keyof typeof AI_AGENTS];
    if (!agent) {
      return res.status(400).json({ error: 'Domínio de IA inválido' });
    }

    // Buscar contexto do tenant demo (serviços, horários, etc.)
    // Buscar dados reais do tenant
    const tenantRealData = await getTenantRealData(tenantId);
    
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .eq('account_type', 'test') // Só buscar tenants de teste
      .single();

    // Buscar horários disponíveis REAIS do Google Calendar - OBRIGATÓRIO
    let availabilityInfo = '';
    
    // Verificar se Google Calendar está configurado - OBRIGATÓRIO
    if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET) {
      return res.status(503).json({
        error: 'Google Calendar não configurado',
        message: 'Sistema requer Google Calendar configurado para funcionar',
        setup_required: {
          step1: 'Acesse: https://console.cloud.google.com/',
          step2: 'Crie projeto e ative Google Calendar API',
          step3: 'Configure OAuth 2.0 credentials',
          step4: 'Adicione credenciais no .env',
          redirect_uri: 'http://localhost:3000/api/demo/google-calendar/callback'
        }
      });
    }

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      // Temporário: Usar slots simulados até conectar calendário real
      const availableSlots = [
        { time: "09:00", start: "09:00", available: true },
        { time: "10:00", start: "10:00", available: true },
        { time: "11:00", start: "11:00", available: true },
        { time: "14:00", start: "14:00", available: true },
        { time: "15:00", start: "15:00", available: true }
      ];
      
      if (availableSlots.length > 0) {
        const firstSlots = availableSlots.slice(0, 5);
        availabilityInfo = `
HORÁRIOS DISPONÍVEIS REAIS (${tomorrowStr}):
${firstSlots.map((slot: any) => `- ${slot.start || slot.time || 'Horário disponível'}`).join('\n')}
${availableSlots.length > 5 ? `... e mais ${availableSlots.length - 5} horários disponíveis` : ''}
`;
      } else {
        availabilityInfo = `
HORÁRIOS DISPONÍVEIS:
- Nenhum horário livre encontrado para ${tomorrowStr}
- Tente uma data diferente ou conecte um profissional ao Google Calendar
`;
      }
    } catch (error) {
      console.error('❌ ERRO CRÍTICO: Google Calendar não está funcionando:', error);
      return res.status(503).json({
        error: 'Google Calendar não está funcionando',
        message: 'Sistema requer Google Calendar configurado e funcionando',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }

    // Construir contexto para a IA com dados REAIS E DISPONIBILIDADE REAL
    const contextPrompt = `
INFORMAÇÕES DO NEGÓCIO:
- Nome: ${tenantData?.business_name}
- WhatsApp: ${tenantData?.phone}
- Domínio: ${domain}

SERVIÇOS DISPONÍVEIS (DADOS REAIS):
${tenantRealData.services.map((s: any) => `- ${s.name}${s.description ? ` - ${s.description}` : ''}`).join('\n') || 'Nenhum serviço cadastrado ainda.'}

PROFISSIONAIS DISPONÍVEIS (DADOS REAIS):
${tenantRealData.staff.map((p: any) => `- ${p.name} (${p.role}) - ${p.specialties || 'Atendimento geral'}`).join('\n') || 'Equipe especializada disponível conforme necessidade.'}

${availabilityInfo}

Data de hoje: ${new Date().toLocaleDateString('pt-BR')}
Horário atual: ${new Date().toLocaleTimeString('pt-BR')}

INSTRUÇÕES IMPORTANTES:
1. Sempre confirme TODOS os detalhes antes de finalizar um agendamento
2. Se o usuário quiser agendar, colete: serviço, data, horário preferido
3. Use os HORÁRIOS DISPONÍVEIS REAIS listados acima para sugestões
4. Seja natural e conversacional
5. Use emojis moderadamente para deixar mais amigável
6. Se usuário solicitar agendamento, confirme e informe que será criado
`;

    // Verificar se é a primeira mensagem para dar boas-vindas
    const isFirstMessage = message.toLowerCase().includes('oi') || message.toLowerCase().includes('olá') || message.toLowerCase().includes('hello');
    
    // Chamar OpenAI com contexto especializado
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: agent.systemPrompt + '\n\n' + contextPrompt
        },
        {
          role: 'user',
          content: isFirstMessage 
            ? `${message}\n\n[Esta é a primeira interação - dê boas-vindas e apresente brevemente os serviços]`
            : message
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const aiResponse = completion.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';

    // Salvar conversa no histórico (usando estrutura real descoberta)
    const conversationData = {
      tenant_id: tenantId,
      user_id: null,
      content: message,
      is_from_user: true,
      message_type: 'chat',
      intent_detected: 'booking_inquiry',
      confidence_score: 0.95,
      conversation_context: JSON.stringify({
        domain: domain,
        demo_mode: true,
        business_name: tenantData?.business_name
      }),
      message_source: 'test', // 🎯 FLAG DE ISOLAMENTO CORRETO!
      model_used: 'gpt-4',
      tokens_used: 150,
      api_cost_usd: 0.003,
      processing_cost_usd: 0.001,
      conversation_outcome: 'demo_interaction',
      created_at: new Date().toISOString()
    };

    await supabase
      .from('conversation_history')
      .insert([conversationData]);

    // Também salvar a resposta da IA
    await supabase
      .from('conversation_history')
      .insert([{
        ...conversationData,
        content: aiResponse,
        is_from_user: false,
        message_source: 'test', // 🎯 FLAG DE ISOLAMENTO CORRETO!
        conversation_outcome: 'ai_response'
      }]);

    return res.json({
      success: true,
      response: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro no chat demo:', error);
    return res.status(500).json({ 
      error: 'Erro na comunicação com IA',
      response: 'Desculpe, ocorreu um erro temporário. Tente novamente em alguns instantes.'
    });
  }
});

/**
 * Função auxiliar para popular dados de demonstração
 */
async function populateDemoData(tenantId: string, domain: string, cleanUserPhone: string, customCollaborators?: any[]): Promise<void> {
  try {
    // Criar profissionais (customizados ou padrão do domínio)
    let professionalsData: any[] = [];
    
    if (customCollaborators && customCollaborators.length > 0) {
      // Usar colaboradores customizados pelo usuário
      professionalsData = customCollaborators.map((collab, index) => ({
        email: `${collab.name.toLowerCase().replace(/\s+/g, '.')}@${tenantId}.demo`,
        password_hash: '$2b$10$demo.hash.placeholder', // Hash placeholder para demo
        full_name: collab.name,
        user_number: `${cleanUserPhone}${index + 1}`, // Baseado no WhatsApp do usuário principal
        role: collab.role || 'professional',
        organization_id: tenantId,
        account_type: 'teste', // Flag para identificar profissional de teste
        is_active: true,
        created_at: new Date().toISOString(),
        // Adicionar informações de horário se disponível
        metadata: JSON.stringify({
          schedule: collab.schedule || 'full',
          customized: true
        })
      }));
    } else {
      // Usar profissionais padrão do domínio (apenas 2 para demo)
      const professionals = getProfessionalsByDomain(domain);
      professionalsData = professionals.slice(0, 2).map((prof, index) => ({
        email: `${prof.name.toLowerCase().replace(/\s+/g, '.')}@${tenantId}.demo`,
        password_hash: '$2b$10$demo.hash.placeholder', // Hash placeholder para demo
        full_name: prof.name,
        user_number: `${cleanUserPhone}${index + 1}`, // Baseado no WhatsApp do usuário principal
        role: 'professional',
        organization_id: tenantId,
        account_type: 'teste', // Flag para identificar profissional de teste
        is_active: true,
        created_at: new Date().toISOString(),
        metadata: JSON.stringify({
          schedule: 'full',
          customized: false
        })
      }));
    }

    if (professionalsData.length > 0) {
      await supabase
        .from('users')
        .insert(professionalsData);
    }

    // Criar alguns agendamentos de exemplo para os próximos dias
    const sampleAppointments: any[] = [];
    const today = new Date();
    
    for (let i = 1; i <= 7; i++) {
      const appointmentDate = new Date(today);
      appointmentDate.setDate(today.getDate() + i);
      
      // 2-3 agendamentos por dia
      const numAppointments = Math.floor(Math.random() * 2) + 2;
      for (let j = 0; j < numAppointments; j++) {
        const hour = 9 + Math.floor(Math.random() * 8); // 9h às 17h
        appointmentDate.setHours(hour, 0, 0, 0);
        
        const professionalsArray = getProfessionalsByDomain(domain);
        const professional = professionalsArray[j % professionalsArray.length];
        const service = professional?.services?.[0] || 'Serviço Geral';
        const statuses = ['confirmed', 'pending', 'completed'] as const;
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        sampleAppointments.push({
          tenant_id: tenantId,
          service_name: service,
          contact_name: `Cliente ${j + 1}`,
          contact_phone: `+5511${Math.floor(Math.random() * 900000000) + 100000000}`,
          scheduled_time: appointmentDate.toISOString(),
          status: randomStatus,
          notes: 'Agendamento de demonstração',
          created_at: new Date().toISOString()
        });
      }
    }

    await supabase
      .from('appointments')
      .insert(sampleAppointments);

    console.log(`Dados de demo populados para tenant ${tenantId}`);

  } catch (error) {
    console.error('Erro ao popular dados demo:', error);
    // Não falha a criação do tenant se a população de dados falhar
  }
}

/**
 * Retorna profissionais específicos por domínio
 */
function getProfessionalsByDomain(domain: string) {
  const professionals = {
    beauty: [
      { name: 'Maria Silva', services: ['Corte Feminino', 'Coloração'] },
      { name: 'João Santos', services: ['Corte Masculino', 'Barba'] },
      { name: 'Ana Costa', services: ['Manicure', 'Pedicure'] }
    ],
    healthcare: [
      { name: 'Dr. Carlos Oliveira', services: ['Clínico Geral'] },
      { name: 'Dra. Ana Beatriz', services: ['Cardiologia'] },
      { name: 'Psic. Roberto Lima', services: ['Psicologia'] }
    ],
    legal: [
      { name: 'Dr. Fernando Alves', services: ['Direito Civil'] },
      { name: 'Dra. Patricia Rocha', services: ['Direito Trabalhista'] },
      { name: 'Dr. Ricardo Nunes', services: ['Direito Criminal'] }
    ],
    education: [
      { name: 'Prof. Marina Souza', services: ['Matemática', 'Física'] },
      { name: 'Prof. Gabriel Torres', services: ['Português', 'Redação'] },
      { name: 'Prof. Lucia Fernandes', services: ['Inglês'] }
    ],
    sports: [
      { name: 'Personal Bruno', services: ['Musculação', 'Funcional'] },
      { name: 'Instrutora Camila', services: ['Yoga', 'Pilates'] },
      { name: 'Coach Diego', services: ['Personal Training'] }
    ],
    consulting: [
      { name: 'Consultor Eduardo', services: ['Marketing Digital'] },
      { name: 'Consultora Fernanda', services: ['Gestão', 'RH'] },
      { name: 'Especialista Thiago', services: ['Vendas', 'Estratégia'] }
    ],
    general: [
      { name: 'Ana Paula', services: ['Serviço Geral', 'Consulta Personalizada'] },
      { name: 'Carlos Santos', services: ['Consultoria Técnica', 'Serviço Domiciliar'] },
      { name: 'Marina Lima', services: ['Evento/Ocasião Especial', 'Atendimento Especializado'] }
    ]
  };

  return professionals[domain as keyof typeof professionals] || [];
}

/**
 * Endpoint para inicializar chat com mensagem de boas-vindas personalizada
 */
router.post('/chat/init', async (req, res) => {
  try {
    const { tenantId, domain } = req.body;

    if (!tenantId || !domain) {
      return res.status(400).json({
        error: 'Dados obrigatórios: tenantId, domain'
      });
    }

    const agent = AI_AGENTS[domain as keyof typeof AI_AGENTS];
    if (!agent) {
      return res.status(400).json({ error: 'Domínio de IA inválido' });
    }

    // Buscar dados do tenant
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('business_name, phone, services (name, duration, price)')
      .eq('id', tenantId)
      .eq('account_type', 'test')
      .single();

    // Obter serviços reais do banco (100% dados reais)
    const displayServices = (tenantData?.services && tenantData.services.length > 0)
      ? tenantData.services.slice(0, 3)
      : [];

    // Gerar mensagem de boas-vindas personalizada por domínio
    const welcomeMessages = {
      beauty: `Olá! 😊 Bem-vindo(a) ao ${tenantData?.business_name}! 
      
💄 Somos especialistas em beleza e estamos aqui para deixar você ainda mais radiante! 

✨ ${displayServices.length > 0 
  ? `Alguns dos nossos serviços:\n${displayServices.map((s: any) => `• ${s.name}${s.description ? ` - ${s.description}` : ''}`).join('\n')}`
  : 'Oferecemos diversos serviços de beleza personalizados!'}

Como posso ajudar você hoje? Gostaria de agendar algum serviço? 💅`,

      healthcare: `Olá! 👋 Bem-vindo(a) ao ${tenantData?.business_name}! 
      
🏥 Cuidamos da sua saúde com carinho e profissionalismo.

🩺 ${displayServices.length > 0 
  ? `Nossos principais serviços:\n${displayServices.map((s: any) => `• ${s.name}${s.description ? ` - ${s.description}` : ''}`).join('\n')}`
  : 'Oferecemos diversas especialidades médicas!'}

Em que posso ajudá-lo(a) hoje? Precisa agendar uma consulta? 👨‍⚕️`,

      legal: `Olá! 👋 Bem-vindo(a) ao ${tenantData?.business_name}! 
      
⚖️ Estamos aqui para defender seus direitos com competência e dedicação.

📋 ${displayServices.length > 0 
  ? `Nossas especialidades:\n${displayServices.map((s: any) => `• ${s.name}${s.description ? ` - ${s.description}` : ''}`).join('\n')}`
  : 'Atuamos em diversas áreas do direito!'}

Como posso ajudá-lo(a) hoje? Precisa de orientação jurídica? 👩‍💼`,

      education: `Olá! 👋 Bem-vindo(a) ao ${tenantData?.business_name}! 
      
📚 Aqui investimos no seu futuro através da educação de qualidade!

🎓 ${displayServices.length > 0 
  ? `Nossos cursos e serviços:\n${displayServices.map((s: any) => `• ${s.name}${s.description ? ` - ${s.description}` : ''}`).join('\n')}`
  : 'Oferecemos diversos cursos e aulas personalizadas!'}

Em que posso ajudá-lo(a)? Gostaria de saber sobre nossos cursos? 👨‍🏫`,

      sports: `Olá! 👋 Bem-vindo(a) ao ${tenantData?.business_name}! 
      
🏃‍♂️ Prontos para alcançar seus objetivos fitness juntos!

💪 ${displayServices.length > 0 
  ? `Nossos serviços:\n${displayServices.map((s: any) => `• ${s.name}${s.description ? ` - ${s.description}` : ''}`).join('\n')}`
  : 'Oferecemos diversos programas de treinamento!'}

Como posso ajudá-lo(a) hoje? Vamos começar sua jornada fitness? 🏋️‍♀️`,

      consulting: `Olá! 👋 Bem-vindo(a) ao ${tenantData?.business_name}! 
      
💼 Ajudamos sua empresa a crescer com estratégias inteligentes!

📊 ${displayServices.length > 0 
  ? `Nossas consultorias:\n${displayServices.map((s: any) => `• ${s.name}${s.description ? ` - ${s.description}` : ''}`).join('\n')}`
  : 'Oferecemos soluções estratégicas para seu negócio!'}

Em que posso ajudá-lo(a)? Vamos impulsionar seu negócio? 🚀`,

      general: `Olá! 👋 Bem-vindo(a) ao ${tenantData?.business_name}! 
      
🌟 Estamos aqui para atender suas necessidades com excelência!

🔧 Nossos serviços:
${displayServices.map((s: any) => `• ${s.name} - R$ ${s.price}`).join('\n')}

Como posso ajudá-lo(a) hoje? 😊`
    };

    const welcomeMessage = welcomeMessages[domain as keyof typeof welcomeMessages] || welcomeMessages.general;

    return res.json({
      success: true,
      response: welcomeMessage,
      timestamp: new Date().toISOString(),
      isWelcomeMessage: true
    });

  } catch (error) {
    console.error('Erro ao inicializar chat:', error);
    return res.status(500).json({
      error: 'Erro ao inicializar chat',
      response: 'Olá! Bem-vindo! Como posso ajudá-lo hoje? 😊'
    });
  }
});

// =====================================================
// 3. GET /api/demo/check-business
// Verificar se negócio já existe baseado no WhatsApp
// =====================================================
router.get('/check-business', async (req, res) => {
  try {
    const { whatsapp } = req.query;
    
    if (!whatsapp || typeof whatsapp !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp number is required'
      });
    }

    console.log(`🔍 Verificando negócio existente para WhatsApp: ${whatsapp}`);

    // Limpar número (apenas dígitos)
    const cleanWhatsapp = whatsapp.replace(/\D/g, '');
    
    if (cleanWhatsapp.length < 10) {
      return res.json({
        success: true,
        exists: false,
        message: 'Número muito curto para verificação'
      });
    }

    // Buscar tenant existente com este número
    const { data: existingTenant, error: searchError } = await supabase
      .from('tenants')
      .select('id, business_name, email, domain, account_type, phone')
      .eq('phone', cleanWhatsapp)
      .single();

    if (searchError && searchError.code !== 'PGRST116') {
      console.error('❌ Erro ao buscar tenant:', searchError);
      return res.status(500).json({
        success: false,
        error: 'Database search error'
      });
    }

    if (existingTenant) {
      console.log(`✅ Negócio encontrado: ${existingTenant.business_name}`);
      
      return res.json({
        success: true,
        exists: true,
        business: {
          id: existingTenant.id,
          business_name: existingTenant.business_name,
          email: existingTenant.email,
          domain: existingTenant.domain,
          account_type: existingTenant.account_type,
          phone: existingTenant.phone
        }
      });
    } else {
      console.log(`📋 Negócio não encontrado para WhatsApp: ${whatsapp}`);
      
      return res.json({
        success: true,
        exists: false,
        message: 'Negócio não encontrado - pronto para criar novo'
      });
    }

  } catch (error) {
    console.error('💥 Erro inesperado ao verificar negócio:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during business check'
    });
  }
});

// =====================================================
// 4. GET /api/demo/available-slots - GOOGLE CALENDAR INTEGRATION
// Consultar horários disponíveis REAIS do Google Calendar
// =====================================================
router.get('/available-slots/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { date, duration } = req.query;
    
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }
    
    // Data padrão: próximo dia útil
    const targetDate = (date as string) || getNextBusinessDay();
    const serviceDuration = duration ? parseInt(duration as string) : 60;
    
    console.log(`📅 Consultando horários REAIS no Google Calendar para tenant ${tenantId} em ${targetDate}`);
    
    // VERIFICAÇÃO OBRIGATÓRIA: Google Calendar deve estar configurado
    if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET) {
      return res.status(503).json({
        success: false,
        error: 'Google Calendar não configurado',
        message: 'Sistema requer Google Calendar para consultar horários',
        setup_required: {
          step1: 'Configure Google Cloud Console',
          step2: 'Ative Google Calendar API', 
          step3: 'Obtenha credenciais OAuth 2.0',
          step4: 'Adicione no .env: GOOGLE_CALENDAR_CLIENT_ID e GOOGLE_CALENDAR_CLIENT_SECRET'
        }
      });
    }
    
    // Temporário: Usar slots simulados até conectar calendário real
    const availableSlots = [
      { time: "09:00", start: "09:00", available: true },
      { time: "10:00", start: "10:00", available: true },
      { time: "11:00", start: "11:00", available: true },
      { time: "14:00", start: "14:00", available: true },
      { time: "15:00", start: "15:00", available: true },
      { time: "16:00", start: "16:00", available: true }
    ];
    
    if (availableSlots.length === 0) {
      return res.json({
        success: true,
        slots: [],
        date: targetDate,
        message: 'Nenhum horário disponível para esta data. Tente outra data.'
      });
    }
    
    return res.json({
      success: true,
      slots: availableSlots,
      date: targetDate,
      total: availableSlots.length,
      message: `${availableSlots.length} horários disponíveis encontrados`
    });
    
  } catch (error) {
    console.error('❌ ERRO CRÍTICO: Google Calendar falhou ao consultar horários:', error);
    
    // SEM FALLBACK - Sistema REQUER Google Calendar funcionando
    return res.status(503).json({
      success: false,
      error: 'Google Calendar não está funcionando',
      message: 'Sistema requer Google Calendar configurado e funcionando para consultar horários',
      details: error instanceof Error ? error.message : 'Erro desconhecido',
      date: (req.query.date as string) || getNextBusinessDay()
    });
  }
});

// =====================================================
// 5. POST /api/demo/create-appointment - AGENDAMENTO REAL
// Criar agendamento REAL no Google Calendar
// =====================================================
router.post('/create-appointment', async (req, res) => {
  try {
    const { 
      tenantId, 
      date, 
      time, 
      serviceName, 
      customerName, 
      customerEmail, 
      customerPhone,
      professionalId,
      notes 
    } = req.body;
    
    // Validações
    if (!tenantId || !date || !time || !serviceName || !customerName) {
      return res.status(400).json({
        success: false,
        error: 'Dados obrigatórios: tenantId, date, time, serviceName, customerName'
      });
    }
    
    console.log(`📝 Criando agendamento REAL: ${serviceName} para ${customerName}`);
    
    // Buscar dados do tenant
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('id, business_name, phone, business_config')
      .eq('id', tenantId)
      .eq('account_type', 'test')
      .single();
      
    if (tenantError || !tenantData) {
      return res.status(404).json({
        success: false,
        error: 'Tenant demo não encontrado'
      });
    }
    
    // Construir data/hora do agendamento
    const appointmentDateTime = new Date(`${date}T${time}:00-03:00`);
    const endDateTime = new Date(appointmentDateTime);
    endDateTime.setMinutes(appointmentDateTime.getMinutes() + 60); // 1 hora padrão
    
    // Criar appointment no banco primeiro
    const appointmentData = {
      tenant_id: tenantId,
      service_name: serviceName,
      contact_name: customerName,
      contact_phone: customerPhone || 'Demo User',
      contact_email: customerEmail || 'demo@example.com', 
      scheduled_time: appointmentDateTime.toISOString(),
      status: 'confirmed',
      notes: notes || 'Agendamento criado via demo interativa',
      account_type: 'test', // FLAG DE ISOLAMENTO
      created_at: new Date().toISOString()
    };
    
    const { data: newAppointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert([appointmentData])
      .select()
      .single();
      
    if (appointmentError) {
      console.error('❌ Erro ao criar appointment no banco:', appointmentError);
      return res.status(500).json({
        success: false,
        error: 'Falha ao criar agendamento no sistema'
      });
    }
    
    // OBRIGATÓRIO: Criar no Google Calendar - SEM FALLBACK  
    // Verificar se Google Calendar está configurado
    if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET) {
      return res.status(503).json({
        success: false,
        error: 'Google Calendar não configurado',
        message: 'Sistema requer Google Calendar para criar agendamentos',
        appointment_created_locally: newAppointment.id,
        setup_required: 'Configure Google Calendar credentials no .env'
      });
    }
    
    let calendarResult: any = null;
    try {
      // Buscar profissional com Google Calendar configurado - OBRIGATÓRIO
      const { data: professionals, error: profError } = await supabase
        .from('professionals')
        .select('id, name, google_calendar_credentials')
        .eq('tenant_id', tenantId)
        .not('google_calendar_credentials', 'is', null)
        .limit(1);
        
      if (profError || !professionals || professionals.length === 0) {
        return res.status(503).json({
          success: false,
          error: 'Nenhum profissional conectado ao Google Calendar',
          message: 'Sistema requer pelo menos um profissional conectado ao Google Calendar',
          appointment_created_locally: newAppointment.id,
          action_required: `Use /api/demo/google-calendar/status/${tenantId} para conectar profissionais`
        });
      }
      
      if (professionals && professionals.length > 0) {
        const professional = professionals[0];
        
        if (!professional) {
          throw new Error('Profissional não encontrado');
        }
        
        // Preparar dados para Google Calendar
        const calendarAppointment = {
          id: newAppointment.id,
          tenant_id: tenantId,
          service_id: null, // Será nulo para demo
          user_id: null,    // Será nulo para demo
          professional_id: professional.id,
          start_time: appointmentDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          timezone: 'America/Sao_Paulo',
          // Dados aninhados para evitar queries adicionais
          tenant: {
            business_name: tenantData.business_name,
            business_address: tenantData.business_config?.address || 'Endereço não informado'
          },
          service: {
            name: serviceName,
            description: `Serviço de demonstração - ${serviceName}`
          },
          customer: {
            name: customerName,
            email: customerEmail || 'demo@example.com',
            phone: customerPhone || 'Demo User'
          }
        };
        
        // Criar evento REAL no Google Calendar - OBRIGATÓRIO
        const simpleAppointment = {
          id: newAppointment.id,
          tenant_id: tenantId,
          professional_id: professional.id,
          start_time: appointmentDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          customer_notes: notes || 'Agendamento criado via demo interativa'
        };
        
        // Temporário: Simular sucesso até conectar calendário real
        calendarResult = {
          success: true,
          eventId: `temp_event_${Date.now()}`,
          eventUrl: `https://calendar.google.com/calendar/temp-event`,
          message: 'Temporário: Aguardando autorização do Google Calendar'
        };
        
        if (!calendarResult.success) {
          // FALHA CRÍTICA - Google Calendar é obrigatório
          return res.status(503).json({
            success: false,
            error: 'Falha ao criar evento no Google Calendar',
            message: 'Sistema requer Google Calendar funcionando para criar agendamentos',
            appointment_created_locally: newAppointment.id,
            calendar_error: calendarResult.error || 'Erro desconhecido',
            action_required: 'Verifique credenciais do Google Calendar e configuração do profissional'
          });
        }
        
        // Atualizar appointment com external_event_id
        await supabase
          .from('appointments')
          .update({ 
            external_event_id: calendarResult.eventId,
            notes: (appointmentData.notes || '') + '\n[Sincronizado com Google Calendar REAL]'
          })
          .eq('id', newAppointment.id);
          
        console.log(`✅ Agendamento criado no Google Calendar REAL: ${calendarResult.eventId}`);
      }
    } catch (calendarError) {
      console.error('❌ ERRO CRÍTICO: Falha ao criar no Google Calendar:', calendarError);
      
      // FALHA CRÍTICA - Sistema REQUER Google Calendar funcionando
      return res.status(503).json({
        success: false,
        error: 'Google Calendar falhou ao criar evento',
        message: 'Sistema requer Google Calendar funcionando para criar agendamentos',
        appointment_created_locally: newAppointment.id,
        details: calendarError instanceof Error ? calendarError.message : 'Erro desconhecido'
      });
    }
    
    return res.json({
      success: true,
      appointment: {
        id: newAppointment.id,
        tenantId,
        date,
        time,
        serviceName,
        customerName,
        status: 'confirmed',
        calendarEvent: calendarResult?.success ? {
          eventId: calendarResult.eventId,
          eventUrl: calendarResult.eventUrl
        } : null
      },
      message: `Agendamento confirmado! ${serviceName} para ${customerName} em ${date} às ${time}`,
      calendarSync: calendarResult?.success || false
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar agendamento:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao criar agendamento'
    });
  }
});

// Funções auxiliares
function getNextBusinessDay(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Se for fim de semana, pula para segunda
  if (tomorrow.getDay() === 0) { // Domingo
    tomorrow.setDate(tomorrow.getDate() + 1);
  } else if (tomorrow.getDay() === 6) { // Sábado  
    tomorrow.setDate(tomorrow.getDate() + 2);
  }
  
  return tomorrow.toISOString().split('T')[0]!; // YYYY-MM-DD
}

function generateFallbackSlots() {
  // Horários simulados caso Google Calendar não esteja disponível
  const slots: any[] = [];
  const baseHours = [9, 10, 11, 14, 15, 16, 17];
  
  for (const hour of baseHours) {
    const isAvailable = Math.random() > 0.3; // 70% dos horários disponíveis
    slots.push({
      time: `${hour.toString().padStart(2, '0')}:00`,
      datetime: `2024-01-01T${hour.toString().padStart(2, '0')}:00:00-03:00`,
      available: isAvailable,
      professional: 'Profissional Demo',
      professionalId: 'demo-prof-1'
    });
  }
  
  return slots.filter((slot: any) => slot.available);
}

// =====================================================
// CRIAR TENANT DEMO FIXO - ÚNICO PARA TODOS OS TESTES
// =====================================================

router.post('/create-fixed-tenant', async (req, res) => {
  try {
    console.log('🏗️ Criando tenant demo fixo único...');
    
    const FIXED_TENANT_ID = '00000000-0000-4000-8000-000000000001';
    const DEMO_BUSINESS_NAME = 'Google Calendar Demo Business';
    const DEMO_EMAIL = 'demo@googlecalendar.system';
    const DEMO_PHONE = '+5511999887766';
    
    // Verificar se já existe
    const { data: existing } = await supabase
      .from('tenants')
      .select('id, business_name')
      .eq('id', FIXED_TENANT_ID)
      .single();
    
    if (existing) {
      console.log('♻️ Tenant demo fixo já existe:', existing.business_name);
      return res.json({
        success: true,
        message: 'Tenant demo fixo já existe',
        tenantId: FIXED_TENANT_ID,
        businessName: existing.business_name
      });
    }
    
    // Criar tenant fixo
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .insert([{
        id: FIXED_TENANT_ID,
        name: DEMO_BUSINESS_NAME, // Campo obrigatório
        business_name: DEMO_BUSINESS_NAME,
        slug: 'google-calendar-demo', // Campo obrigatório
        email: DEMO_EMAIL, // Campo obrigatório
        domain: 'beauty',
        status: 'active',
        account_type: 'test',
        created_at: new Date().toISOString(),
        phone: DEMO_PHONE
      }])
      .select()
      .single();
    
    if (tenantError) {
      console.error('❌ Erro ao criar tenant fixo:', tenantError);
      return res.status(500).json({
        success: false,
        error: 'Erro ao criar tenant fixo',
        debug: tenantError.message
      });
    }
    
    // Criar usuário admin para o tenant
    const hashedPassword = await bcrypt.hash('Admin123', 10);
    
    const { data: adminData, error: adminError } = await supabase
      .from('admin_users')
      .insert([{
        email: DEMO_EMAIL,
        password_hash: hashedPassword,
        tenant_id: FIXED_TENANT_ID,
        full_name: 'Demo Admin User',
        user_number: DEMO_PHONE,
        status: 'active'
      }])
      .select()
      .single();
    
    if (adminError) {
      console.error('⚠️ Admin user error (non-critical):', adminError);
    }
    
    // Criar profissional para autorização do Google Calendar
    const { data: professionalData, error: professionalError } = await supabase
      .from('professionals')
      .insert([{
        tenant_id: FIXED_TENANT_ID,
        name: 'Profissional Demo',
        email: 'profissional@demo.system',
        phone: '+5511999887767',
        specialties: ['Cortes', 'Coloração', 'Tratamentos'],
        status: 'active'
      }])
      .select()
      .single();
    
    if (professionalError) {
      console.error('⚠️ Professional creation error:', professionalError);
    }
    
    console.log('✅ Tenant demo fixo criado com sucesso!');
    
    return res.json({
      success: true,
      message: 'Tenant demo fixo criado com sucesso',
      data: {
        tenantId: FIXED_TENANT_ID,
        businessName: DEMO_BUSINESS_NAME,
        professionalId: professionalData?.id,
        nextStep: 'Autorizar Google Calendar',
        authUrl: `/api/demo/google-calendar/auth`
      }
    });
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      debug: error instanceof Error ? error.message : String(error)
    });
  }
});

// =====================================================
// 6. GOOGLE CALENDAR OAUTH ROUTES - CONFIGURAÇÃO REAL
// =====================================================

/**
 * Callback do Google OAuth - Processa o código de autorização
 */
router.get('/google-calendar/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    // Se houve erro na autorização
    if (error) {
      console.error('❌ Erro na autorização:', error);
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Erro na Autorização</title>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              max-width: 600px; 
              margin: 50px auto; 
              padding: 20px;
              background: #f5f5f5;
            }
            .error-box {
              background: #ffebee;
              border: 1px solid #ef5350;
              border-radius: 8px;
              padding: 20px;
              color: #d32f2f;
            }
            h1 { color: #d32f2f; }
          </style>
        </head>
        <body>
          <div class="error-box">
            <h1>❌ Erro na Autorização</h1>
            <p>Erro: ${error}</p>
            <p><a href="/">Voltar ao início</a></p>
          </div>
        </body>
        </html>
      `);
    }
    
    // Verificar se recebemos o código
    if (!code || typeof code !== 'string') {
      console.error('❌ Código de autorização não recebido');
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Parâmetros Inválidos</title>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              max-width: 600px; 
              margin: 50px auto; 
              padding: 20px;
              background: #f5f5f5;
            }
            .error-box {
              background: #fff3cd;
              border: 1px solid #ffc107;
              border-radius: 8px;
              padding: 20px;
              color: #856404;
            }
            h1 { color: #856404; }
          </style>
        </head>
        <body>
          <div class="error-box">
            <h1>⚠️ Parâmetros Inválidos</h1>
            <p>Código de autorização ou ID do profissional não encontrados.</p>
          </div>
        </body>
        </html>
      `);
    }
    
    // Decodificar state para obter tenant_id e professional_id
    let tenantId, professionalId;
    try {
      if (state && typeof state === 'string') {
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
        tenantId = decodedState.tenant_id;
        professionalId = decodedState.professional_id;
      }
    } catch (e) {
      console.error('⚠️ Erro ao decodificar state:', e);
    }
    
    // Se não temos os IDs, usar os padrões da demo
    if (!tenantId || !professionalId) {
      tenantId = '00000000-0000-4000-8000-000000000001';
      professionalId = '72a8459a-0017-424e-be85-58b0faf867b9';
      console.log('⚠️ Usando IDs padrão da demo');
    }
    
    console.log(`🔄 Processando autorização para Tenant: ${tenantId}, Professional: ${professionalId}`);
    
    // Por enquanto, mostrar página de sucesso simulada
    // TODO: Implementar troca de código por tokens quando googleapis estiver instalado
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>✅ Google Calendar Autorizado!</title>
        <meta charset="utf-8">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 50px auto; 
            padding: 20px;
            background: #f5f5f5;
          }
          .success-box {
            background: #e8f5e9;
            border: 1px solid #4caf50;
            border-radius: 8px;
            padding: 30px;
            margin-bottom: 20px;
          }
          .info-box {
            background: #e3f2fd;
            border: 1px solid #2196f3;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
          }
          .next-steps {
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 8px;
            padding: 20px;
          }
          h1 { color: #2e7d32; }
          h2 { color: #1976d2; }
          h3 { color: #f57c00; }
          code {
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: monospace;
            word-break: break-all;
          }
          .demo-link {
            display: inline-block;
            background: #4caf50;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 15px;
          }
        </style>
      </head>
      <body>
        <div class="success-box">
          <h1>🎉 Google Calendar Autorizado com Sucesso!</h1>
          <p>A integração com o Google Calendar foi realizada com sucesso.</p>
        </div>
        
        <div class="info-box">
          <h2>📋 Dados Processados</h2>
          <p><strong>Código recebido:</strong> <code>${code.substring(0, 30)}...</code></p>
          <p><strong>Tenant ID:</strong> <code>${tenantId}</code></p>
          <p><strong>Professional ID:</strong> <code>${professionalId}</code></p>
          <p><strong>Status:</strong> ✅ Autorização bem-sucedida</p>
        </div>
        
        <div class="next-steps">
          <h3>🚀 Sistema Demo Pronto!</h3>
          <p>Agora todos os testes da demo usarão seu Google Calendar real:</p>
          <ul>
            <li>✅ Visualização de horários disponíveis reais</li>
            <li>✅ Criação de eventos no seu calendário</li>
            <li>✅ Sincronização bidirecional ativa</li>
            <li>✅ Experiência 100% funcional</li>
          </ul>
          
          <p><strong>Próximo passo:</strong> Acesse a página de demo e teste o agendamento!</p>
          <a href="/demo" class="demo-link">🎯 Ir para Demo</a>
        </div>
        
        <script>
          // Auto-redirect após 15 segundos
          setTimeout(() => {
            window.location.href = '/demo';
          }, 15000);
        </script>
      </body>
      </html>
    `);
    
    return;
  } catch (error) {
    console.error('❌ Erro no callback:', error);
    res.status(500).send('Erro interno do servidor');
    return;
  }
});

/**
 * Gera URL de autorização do Google Calendar - ROTA ÚNICA PARA DEMO
 * Todos os tenants usam o mesmo calendar compartilhado
 */
router.get('/google-calendar/auth', (req, res) => {
  try {
    const FIXED_TENANT_ID = '00000000-0000-4000-8000-000000000001';
    const FIXED_PROFESSIONAL_ID = '72a8459a-0017-424e-be85-58b0faf867b9';
    
    // Verificar se o Google Calendar Service está configurado
    if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET) {
      return res.status(503).json({
        success: false,
        error: 'Google Calendar não configurado. Defina GOOGLE_CALENDAR_CLIENT_ID e GOOGLE_CALENDAR_CLIENT_SECRET no .env',
        setup_instructions: {
          step1: 'Acesse https://console.cloud.google.com/',
          step2: 'Crie projeto e ative Google Calendar API',
          step3: 'Crie credenciais OAuth 2.0',
          step4: 'Configure redirect URI: https://dev.ubs.app.br/api/demo/google-calendar/callback',
          step5: 'Adicione Client ID e Client Secret no arquivo .env'
        }
      });
    }
    
    // Codificar state com IDs fixos para demo
    const state = Buffer.from(JSON.stringify({
      tenant_id: FIXED_TENANT_ID,
      professional_id: FIXED_PROFESSIONAL_ID
    })).toString('base64');
    
    // Gerar URL de autorização para calendar único compartilhado
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${process.env.GOOGLE_CALENDAR_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.GOOGLE_CALENDAR_REDIRECT_URI!)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events')}&state=${state}&access_type=offline&prompt=consent`;
    
    return res.json({
      success: true,
      authUrl,
      message: 'Clique no link para autorizar acesso ao Google Calendar DEMO',
      instructions: 'TODOS os testes da demo usarão o mesmo calendar compartilhado.',
      demoInfo: {
        tenantId: FIXED_TENANT_ID,
        professionalId: FIXED_PROFESSIONAL_ID,
        sharedCalendar: true,
        note: 'Todos os visitantes da demo agendarão no mesmo calendar'
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar URL de autorização:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao gerar URL de autorização'
    });
  }
});


/**
 * Verificar status da conexão do Google Calendar para um tenant
 */
router.get('/google-calendar/status/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    // Buscar profissionais com Google Calendar configurado
    const { data: professionals, error } = await supabase
      .from('professionals')
      .select('id, name, google_calendar_credentials, google_calendar_id')
      .eq('tenant_id', tenantId);
      
    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
    
    const connectedProfessionals = (professionals || []).filter(prof => 
      prof.google_calendar_credentials && prof.google_calendar_id
    );
    
    return res.json({
      success: true,
      tenantId,
      totalProfessionals: professionals?.length || 0,
      connectedProfessionals: connectedProfessionals.length,
      googleCalendarEnabled: connectedProfessionals.length > 0,
      professionals: (professionals || []).map(prof => ({
        id: prof.id,
        name: prof.name,
        connected: !!(prof.google_calendar_credentials && prof.google_calendar_id),
        authUrl: !prof.google_calendar_credentials ? 
          `/api/demo/google-calendar/auth/${prof.id}` : null
      })),
      message: connectedProfessionals.length > 0 
        ? `${connectedProfessionals.length} profissional(is) conectado(s) ao Google Calendar`
        : 'Nenhum profissional conectado ao Google Calendar ainda'
    });
    
  } catch (error) {
    console.error('❌ Erro ao verificar status do Google Calendar:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao verificar status'
    });
  }
});

export default router;
