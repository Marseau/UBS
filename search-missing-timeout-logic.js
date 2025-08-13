// Investigar por que não existe lógica de timeout de 30 segundos
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function investigateMissingTimeoutLogic() {
  console.log('🔍 === INVESTIGANDO LÓGICA DE TIMEOUT AUSENTE ===');
  
  try {
    console.log('\n❌ PROBLEMAS IDENTIFICADOS:');
    console.log('1. NÃO existe lógica de timeout de 30 segundos');
    console.log('2. NÃO existe status "abandoned" para appointments');
    console.log('3. NÃO existe cleanup automático de appointments pending');
    console.log('4. NÃO existe detecção de inatividade do usuário');
    
    // =====================================================
    // 1. VERIFICAR STATUS POSSÍVEIS DOS APPOINTMENTS
    // =====================================================
    
    console.log('\n📊 === STATUS DISPONÍVEIS DOS APPOINTMENTS ===');
    
    const { data: statusSample } = await supabase
      .from('appointments')
      .select('status')
      .limit(100);
    
    const uniqueStatuses = [...new Set(statusSample?.map(a => a.status))];
    console.log('Status encontrados na tabela:', uniqueStatuses);
    
    // Status esperados segundo o que você disse
    const expectedStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled', 'abandoned'];
    const missingStatuses = expectedStatuses.filter(status => !uniqueStatuses.includes(status));
    
    if (missingStatuses.length > 0) {
      console.log('❌ Status AUSENTES:', missingStatuses);
    }
    
    // =====================================================
    // 2. VERIFICAR APPOINTMENTS ÓRFÃOS (PENDING ANTIGOS)
    // =====================================================
    
    console.log('\n🕐 === APPOINTMENTS PENDING ANTIGOS ===');
    
    const { data: oldPendingAppointments } = await supabase
      .from('appointments')
      .select('id, created_at, updated_at, status')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    
    if (oldPendingAppointments && oldPendingAppointments.length > 0) {
      console.log(`📊 Total de appointments pending: ${oldPendingAppointments.length}`);
      
      const now = new Date();
      oldPendingAppointments.forEach((apt, i) => {
        const createdAt = new Date(apt.created_at);
        const minutesOld = (now - createdAt) / (1000 * 60);
        
        if (i < 10) { // Mostrar os 10 primeiros
          console.log(`${i + 1}. ID: ${apt.id.substring(0, 8)}... | ${minutesOld.toFixed(0)} minutos atrás`);
        }
      });
      
      // Contar por faixas de tempo
      const timeRanges = {
        '< 1 hora': 0,
        '1-24 horas': 0,
        '> 24 horas': 0,
        '> 7 dias': 0
      };
      
      oldPendingAppointments.forEach(apt => {
        const minutesOld = (now - new Date(apt.created_at)) / (1000 * 60);
        
        if (minutesOld < 60) {
          timeRanges['< 1 hora']++;
        } else if (minutesOld < 1440) { // 24 horas
          timeRanges['1-24 horas']++;
        } else if (minutesOld < 10080) { // 7 dias
          timeRanges['> 24 horas']++;
        } else {
          timeRanges['> 7 dias']++;
        }
      });
      
      console.log('\n📊 Distribuição por idade:');
      Object.entries(timeRanges).forEach(([range, count]) => {
        console.log(`   ${range}: ${count} appointments`);
      });
      
      // Appointments pending muito antigos (provavelmente abandonados)
      const veryOldPending = oldPendingAppointments.filter(apt => {
        const minutesOld = (now - new Date(apt.created_at)) / (1000 * 60);
        return minutesOld > 60; // Mais de 1 hora
      });
      
      console.log(`\n🚨 Appointments pending > 1 hora (provavelmente abandonados): ${veryOldPending.length}`);
      console.log('   Estes deveriam ter status "abandoned" conforme sua regra!');
    }
    
    // =====================================================
    // 3. SIMULAR O QUE DEVERIA ACONTECER
    // =====================================================
    
    console.log('\n💡 === O QUE DEVERIA ACONTECER (SEGUNDO SUA REGRA) ===');
    console.log('');
    console.log('🕐 FLUXO DE TIMEOUT CORRETO:');
    console.log('1. Cliente inicia conversa → appointment status "pending"');
    console.log('2. Se cliente não responde por 30s → IA pergunta "Você ainda está aí?"');
    console.log('3. Se cliente não responde por mais 30s → IA diz "Encerrando por falta de comunicação"');
    console.log('4. Sistema atualiza appointment status para "abandoned"');
    console.log('5. Sistema limpa conversation_state');
    console.log('6. Sistema libera recursos da memória');
    console.log('');
    console.log('❌ REALIDADE ATUAL:');
    console.log('1. Cliente inicia conversa → appointment status "pending" ✅');
    console.log('2. Cliente abandona → NÃO há timeout implementado ❌');
    console.log('3. Appointment fica "preso" em pending para sempre ❌');
    console.log('4. Sem cleanup automático ❌');
    console.log('5. Sem status "abandoned" ❌');
    
    // =====================================================
    // 4. CONSEQUÊNCIAS DOS APPOINTMENTS ÓRFÃOS
    // =====================================================
    
    console.log('\n🚨 === CONSEQUÊNCIAS DOS APPOINTMENTS ÓRFÃOS ===');
    console.log('');
    console.log('📊 IMPACTO NAS MÉTRICAS:');
    console.log(`   - ${oldPendingAppointments?.length || 0} appointments pending órfãos`);
    console.log('   - Inflam o número total de appointments');
    console.log('   - Distorcem a eficiência operacional');
    console.log('   - Criam dados inconsistentes');
    console.log('');
    console.log('🔧 CORREÇÕES NECESSÁRIAS:');
    console.log('1. Implementar timer de timeout de 30+30 segundos');
    console.log('2. Adicionar status "abandoned" ao enum');
    console.log('3. Criar job de limpeza de appointments órfãos');
    console.log('4. Implementar mensagens de timeout na IA');
    console.log('5. Corrigir métricas para excluir abandoned/pending');
    
    // =====================================================
    // 5. SUGESTÃO DE CORREÇÃO IMEDIATA
    // =====================================================
    
    console.log('\n🔧 === CORREÇÃO IMEDIATA SUGERIDA ===');
    console.log('');
    console.log('OPÇÃO 1 - Marcar appointments antigos como abandoned:');
    console.log(`UPDATE appointments SET status = 'abandoned' WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour';`);
    console.log('');
    console.log('OPÇÃO 2 - Deletar appointments órfãos muito antigos:');
    console.log(`DELETE FROM appointments WHERE status = 'pending' AND created_at < NOW() - INTERVAL '24 hours';`);
    console.log('');
    console.log('OPÇÃO 3 - Implementar lógica de timeout completa (recomendado)');
    
    return oldPendingAppointments?.length || 0;
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

investigateMissingTimeoutLogic();