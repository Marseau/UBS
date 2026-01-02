import axios from 'axios';

const WHAPI_TOKEN = 'pot7O6eCrMNhsXIIFiwaqPZ6uuXFvLiu';
const WHAPI_URL = 'https://gate.whapi.cloud';

const phones = [
  '+5541996153628',
  '+5515948258143',
  '+5516914272090',
  '+5527996258525',
  '+5511921842066',
  '+5521981094053',
  '+554830331450',
  '+5533996076963',
  '+551134439587',
  '+5532991448754',
  '+5535999694828',
  '+5511966403770',
  '+5561914030899',
  '+5534999781323',
  '+5511974551322',
  '+5511939475686',
  '+5541985940333',
  '+5571986354200',
  '+551154306700',
  '+5523934375282',
  '+5544930016255',
  '+5531985277040',
  '+5541985940333',
  '+5524998295078',
  '+5523931623932',
  '+5527997349670',
  '+5531920041001',
  '+5513996908999',
  '+5512991479728',
  '+5583981062349'
];

async function checkNumber(phone: string): Promise<{phone: string, hasWhatsApp: boolean, error?: string}> {
  try {
    // Formato: remover o + e usar só números
    const cleanPhone = phone.replace('+', '');

    const response = await axios.post(
      `${WHAPI_URL}/contacts`,
      {
        blocking: 'wait',
        contacts: [cleanPhone]
      },
      {
        headers: {
          'Authorization': `Bearer ${WHAPI_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const contact = response.data?.contacts?.[0];
    const hasWhatsApp = contact?.status === 'valid';

    return { phone, hasWhatsApp };
  } catch (error: any) {
    return {
      phone,
      hasWhatsApp: false,
      error: error.response?.data?.message || error.message
    };
  }
}

async function main() {
  console.log('Iniciando validacao de 30 numeros via Whapi.cloud...\n');

  const startTime = Date.now();
  const results = {
    valid: [] as string[],
    invalid: [] as string[],
    errors: [] as {phone: string, error: string}[]
  };

  for (let i = 0; i < phones.length; i++) {
    const phone: string = phones[i] as string;
    process.stdout.write(`[${i+1}/30] Verificando ${phone}... `);

    const result = await checkNumber(phone);

    if (result.error) {
      console.log(`Erro: ${result.error}`);
      results.errors.push({phone: phone, error: result.error});
    } else if (result.hasWhatsApp) {
      console.log('TEM WhatsApp');
      results.valid.push(phone);
    } else {
      console.log('SEM WhatsApp');
      results.invalid.push(phone);
    }

    // Pequeno delay para não sobrecarregar
    await new Promise(r => setTimeout(r, 500));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const taxaValidacao = Math.round((results.valid.length / phones.length) * 100);

  console.log('\n========== RESULTADO ==========');
  console.log(`Tempo total: ${elapsed}s`);
  console.log(`Com WhatsApp: ${results.valid.length}`);
  console.log(`Sem WhatsApp: ${results.invalid.length}`);
  console.log(`Erros: ${results.errors.length}`);
  console.log(`Taxa de validacao: ${taxaValidacao}%`);

  if (results.valid.length > 0) {
    console.log('\nNumeros validos:');
    results.valid.forEach(p => console.log(`   ${p}`));
  }

  if (results.errors.length > 0) {
    console.log('\nErros:');
    results.errors.forEach(e => console.log(`   ${e.phone}: ${e.error}`));
  }
}

main().catch(console.error);
