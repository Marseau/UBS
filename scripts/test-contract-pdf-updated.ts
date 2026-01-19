
import { contractPDFService } from '../src/services/contract-pdf.service';
import * as fs from 'fs';

async function testPDF() {
  console.log('Gerando PDF de teste...\n');

  // Teste 1: Pessoa Física (CPF)
  const pdfPF = await contractPDFService.generateContractPDF({
    client_name: 'João da Silva Santos',
    client_document: '123.456.789-00',
    client_address: 'Rua das Flores, 123 - Centro - São Paulo/SP - CEP 01234-567',
    client_representative: '',
    campaign_name: 'Campanha Clínicas Estéticas SP',
    project_name: 'Expansão Clínica 2026',
    target_niche: 'Clínicas de Estética e Harmonização Facial',
    service_description: 'Consultoria em marketing digital especializada em clínicas estéticas',
    target_audience: 'Donos de clínicas de estética com faturamento acima de R$ 50.000/mês',
    campaign_whatsapp: '(11) 99999-8888',
    contract_id: 'AIC-TEST-001',
    contract_date: new Date().toISOString(),
    contract_value: 4000,
    lead_value: 10,
    signature_name: 'João da Silva Santos',
    signature_ip: '189.100.50.25',
    signature_date: new Date().toISOString(),
    signature_user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
  });

  fs.writeFileSync('/tmp/contrato-pessoa-fisica.pdf', pdfPF.buffer);
  console.log('✓ PDF Pessoa Física salvo em: /tmp/contrato-pessoa-fisica.pdf');

  // Teste 2: Pessoa Jurídica (CNPJ)
  const pdfPJ = await contractPDFService.generateContractPDF({
    client_name: 'Clínica Beleza Total LTDA',
    client_document: '12.345.678/0001-90',
    client_address: 'Av. Paulista, 1000 - Bela Vista - São Paulo/SP - CEP 01310-100',
    client_representative: 'Maria Oliveira da Costa',
    campaign_name: 'Campanha Dentistas Premium',
    project_name: 'Prospecção Odontologia 2026',
    target_niche: 'Dentistas e Clínicas Odontológicas',
    service_description: 'Serviços de estética dental, implantes e harmonização orofacial',
    target_audience: 'Clínicas odontológicas com 3+ cadeiras, foco em estética dental',
    campaign_whatsapp: '(11) 98765-4321',
    contract_id: 'AIC-TEST-002',
    contract_date: new Date().toISOString(),
    contract_value: 6000,
    lead_value: 15,
    signature_name: 'Maria Oliveira da Costa',
    signature_ip: '200.150.100.50',
    signature_date: new Date().toISOString(),
    signature_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  });

  fs.writeFileSync('/tmp/contrato-pessoa-juridica.pdf', pdfPJ.buffer);
  console.log('✓ PDF Pessoa Jurídica salvo em: /tmp/contrato-pessoa-juridica.pdf');

  console.log('\n✅ Teste concluído! Abra os PDFs para validar.');

  await contractPDFService.close();
  process.exit(0);
}

testPDF().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
