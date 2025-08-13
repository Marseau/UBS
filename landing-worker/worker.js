"use strict";
(() => {
    const SUPABASE_URL = "https://qsdfyffuonywmtnlycri.supabase.co";
    const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU";
    const LEADS_TABLE = "leads";
    
    function validateEmail(email) {
        return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    }
    
    async function handleLead(request) {
        const data = await request.json();
        const requiredFields = ['name', 'email', 'whatsapp', 'company', 'country'];
        for (let field of requiredFields) {
            if (!data[field] || data[field].trim() === '') {
                return new Response(JSON.stringify({ error: data.lang === 'en' ? "Please fill in all fields." : "Por favor, preencha todos os campos." }), { status: 400 });
            }
        }
        if (!validateEmail(data.email)) {
            return new Response(JSON.stringify({ error: data.lang === 'en' ? "Invalid email." : "E-mail inválido." }), { status: 400 });
        }
        
        const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/${LEADS_TABLE}?email=eq.${encodeURIComponent(data.email)}`, {
            method: "GET",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            }
        });
        if (!checkRes.ok) {
            return new Response(JSON.stringify({ error: data.lang === 'en' ? "Failed to check existing lead." : "Falha ao verificar cadastro existente." }), { status: 500 });
        }
        
        const existingLeads = await checkRes.json();
        let supabaseRes;
        
        const payload = {
            name: data.name,
            email: data.email,
            whatsapp: data.whatsapp,
            company: data.company,
            country: data.country,
            lang: data.lang,
            created_at: new Date().toISOString(),
            status: "new"
        };
        
        if (existingLeads.length > 0) {
            const leadId = existingLeads[0].id;
            // Não sobrescreve created_at no PATCH
            const updatePayload = { ...payload };
            delete updatePayload.created_at;
            supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/${LEADS_TABLE}?id=eq.${leadId}`, {
                method: "PATCH",
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`,
                    "Content-Type": "application/json",
                    "Prefer": "return=representation"
                },
                body: JSON.stringify(updatePayload)
            });
        } else {
            supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/${LEADS_TABLE}`, {
                method: "POST",
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`,
                    "Content-Type": "application/json",
                    "Prefer": "return=representation"
                },
                body: JSON.stringify(payload)
            });
        }
        
        if (!supabaseRes.ok) {
            return new Response(JSON.stringify({ error: data.lang === 'en' ? "Failed to save lead." : "Falha ao salvar cadastro." }), { status: 500 });
        }
        
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    
    function landingPageHTML(lang = "pt") {
        return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>UBS App — Pré-lançamento</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
  <style>
    body { font-family: Inter, sans-serif; background: #f8f9fb; margin: 0; padding: 0; }
    .hero-container { background: linear-gradient(135deg, #2D5A9B 0%, #4A7BC8 100%); color: #fff; padding: 0 0 48px 0; text-align: center; position: relative; }
    .language-switch { position: absolute; top: 20px; right: 20px; }
    .language-switch button { background: #fff; color: #2D5A9B; border: none; border-radius: 20px; padding: 5px 14px; font-weight: 700; cursor: pointer; }
    .hero-content { max-width: 720px; margin: 0 auto; padding: 48px 24px 0 24px; display: flex; flex-direction: column; align-items: center; }
    .hero-logo { width: 220px; height: auto; margin-bottom: 18px; filter: drop-shadow(0 4px 16px rgba(45,90,155,0.12)); }
    .badges { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-bottom: 18px; }
    .badge-custom { background: #fff; color: #2D5A9B; font-weight: 700; border-radius: 20px; padding: 7px 18px; font-size: 1em; box-shadow: 0 2px 8px rgba(45,90,155,0.08); display: inline-block; }
    .benefits, .steps { display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; margin-top: 32px; }
    .benefit, .step { background: #fff; border-radius: 12px; box-shadow: 0 2px 16px rgba(45,90,155,0.07); padding: 18px 16px; max-width: 240px; flex: 1 1 180px; text-align: center; font-size: 1em; color: #2D5A9B; display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .benefit i, .step-number { font-size: 2em; margin-bottom: 6px; }
    .step-number { background: #2D5A9B; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1em; margin: 0 auto 8px auto; }
    .hero-form { display: flex; flex-direction: column; gap: 14px; max-width: 420px; margin: 32px auto; }
    .hero-form input { padding: 10px 12px; border-radius: 7px; border: 1px solid #ccc; font-size: 1em; margin: 0; }
    .hero-form button[type=submit] { background: #4CAF50; color: #fff; font-weight: 700; font-size: 1.1em; padding: 12px 0; border: none; border-radius: 7px; cursor: pointer; margin-top: 8px; width: 100%; transition: background 0.2s; }
    .hero-form button[type=submit]:hover { background: #388e3c; }
    #msg { margin-top: 16px; font-size: 1em; padding: 10px; border-radius: 4px; }
    .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
  </style>
</head>
<body>
<section class="hero-container">
  <div class="language-switch"><button id="langBtn">EN</button></div>
  <div class="hero-content">
    <img id="logo" src="https://diversos-stratfin.s3.us-east-005.backblazeb2.com/UBS_NAC_BRANCO.png" alt="UBS App Logo" class="hero-logo">
    <div class="badges">
      <span class="badge-custom" data-pt="Beta Exclusivo" data-en="Exclusive Beta">Beta Exclusivo</span>
      <span class="badge-custom" data-pt="30 dias grátis" data-en="30 days free">30 dias grátis</span>
      <span class="badge-custom" data-pt="Apenas 50 vagas" data-en="Only 50 spots">Apenas 50 vagas</span>
    </div>
    <h1 class="hero-title" data-pt="UBS App — Pré-lançamento" data-en="UBS App — Pre-launch">UBS App — Pré-lançamento</h1>
    <h2 class="hero-subtitle" data-pt="A plataforma definitiva de agendamento, atendimento e gestão via WhatsApp." data-en="The ultimate scheduling, service and management platform via WhatsApp.">A plataforma definitiva de agendamento, atendimento e gestão via WhatsApp.</h2>
    <p class="hero-lead" data-pt="Participe do pré-lançamento e ganhe 30 dias grátis!" data-en="Join the pre-launch and get 30 days free!">Participe do pré-lançamento e ganhe 30 dias grátis!</p>
  </div>
</section>

<section class="benefits">
  <div class="benefit"><i class="fa-solid fa-users"></i> <span data-pt="Multi-tenant, multi-serviço, multi-funcionário" data-en="Multi-tenant, multi-service, multi-employee">Multi-tenant, multi-serviço, multi-funcionário</span></div>
  <div class="benefit"><i class="fa-brands fa-whatsapp"></i> <span data-pt="Agendamento inteligente via WhatsApp" data-en="Smart scheduling via WhatsApp">Agendamento inteligente via WhatsApp</span></div>
  <div class="benefit"><i class="fa-solid fa-chart-line"></i> <span data-pt="Dashboard operacional e financeiro" data-en="Operational and financial dashboard">Dashboard operacional e financeiro</span></div>
  <div class="benefit"><i class="fa-solid fa-credit-card"></i> <span data-pt="Gestão de pagamentos integrada" data-en="Integrated payments management">Gestão de pagamentos integrada</span></div>
  <div class="benefit"><i class="fa-solid fa-robot"></i> <span data-pt="Automação com IA" data-en="AI automation">Automação com IA</span></div>
</section>

<section class="steps">
  <div class="step"><div class="step-number">1</div><span data-pt="Preencha o formulário" data-en="Fill out the form">Preencha o formulário</span></div>
  <div class="step"><div class="step-number">2</div><span data-pt="Receba o acesso por e-mail" data-en="Receive access by email">Receba o acesso por e-mail</span></div>
  <div class="step"><div class="step-number">3</div><span data-pt="Teste e envie seu feedback" data-en="Test and send your feedback">Teste e envie seu feedback</span></div>
</section>

<form id="leadForm" class="hero-form">
  <input name="name" placeholder="Nome" required>
  <input name="email" type="email" placeholder="E-mail" required>
  <input name="whatsapp" placeholder="WhatsApp" required>
  <input name="company" placeholder="Empresa" required>
  <input name="country" placeholder="País" required>
  <button type="submit">Quero participar</button>
</form>
<div id="msg"></div>

<script>
document.addEventListener("DOMContentLoaded", function() {
  const form = document.querySelector('.hero-form');
  const submitBtn = form.querySelector('button[type=submit]');
  let msg = document.getElementById('msg');
  if (!msg) {
    msg = document.createElement('div');
    msg.id = 'msg';
    form.parentNode.insertBefore(msg, form.nextSibling);
  }

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    msg.textContent = '';
    msg.className = '';
    submitBtn.disabled = true;

    // Pega os dados do formulário
    const data = {};
    for (const el of form.elements) {
      if (el.name) data[el.name] = el.value.trim();
    }
    data.lang = document.documentElement.lang || 'pt';

    // Validação extra (todos os campos)
    if (!data.name || !data.email || !data.whatsapp || !data.company || !data.country) {
      msg.textContent = data.lang === 'en' ? "Please fill in all fields." : "Por favor, preencha todos os campos.";
      msg.className = 'error';
      submitBtn.disabled = false;
      return;
    }

    try {
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (res.ok && result.success) {
        msg.textContent = data.lang === 'en'
          ? "Registration successful! We'll contact you soon."
          : "Inscrição realizada com sucesso! Em breve entraremos em contato.";
        msg.className = 'success';
        form.reset();
      } else {
        msg.textContent = result.error || (data.lang === 'en' ? "Failed to submit." : "Falha ao enviar.");
        msg.className = 'error';
      }
    } catch (err) {
      msg.textContent = data.lang === 'en' ? "Network error." : "Erro de rede.";
      msg.className = 'error';
    }
    submitBtn.disabled = false;
  });
});
</script>
</body>
</html>`;
    }
    
    addEventListener("fetch", (event) => {
        event.respondWith(handleRequest(event.request));
    });
    
    async function handleRequest(request) {
        if (request.method === "POST") {
            return handleLead(request);
        }
        return new Response(landingPageHTML(), { headers: { "content-type": "text/html" } });
    }
})();
