import { orchestrator } from '../services/agent-orchestrator.service'

async function testMultiAgentSystem() {
  console.log('🤖 Teste do Sistema Multi-Agente Colaborativo\n')
  
  // Definir objetivo do projeto
  const projectGoal = `
    Implementar sistema completo de notificações em tempo real que:
    1. Armazene notificações no banco de dados
    2. Forneça APIs REST para gerenciar notificações
    3. Crie widget de notificações no dashboard
    4. Inclua testes automatizados
  `
  
  // Iniciar orquestração
  console.log('📋 Objetivo do projeto:', projectGoal)
  console.log('\n' + '='.repeat(60) + '\n')
  
  // Monitorar progresso em tempo real
  const progressInterval = setInterval(async () => {
    const status = await orchestrator.getProjectStatus()
    
    console.clear()
    console.log('🤖 Sistema Multi-Agente - Status do Projeto\n')
    console.log(`📋 Objetivo: ${status.goal}`)
    console.log(`📊 Status: ${status.status}`)
    console.log(`📈 Progresso Geral: ${status.progress}%`)
    console.log('\n👥 Status dos Agentes:')
    
    for (const agent of status.agents) {
      const icon = agent.status === 'working' ? '🔄' : 
                   agent.status === 'completed' ? '✅' : '⏸️'
      console.log(`  ${icon} ${agent.id}: ${agent.status} ${agent.currentTask ? `(${agent.currentTask})` : ''}`)
    }
    
    console.log('\n📝 Tarefas:')
    for (const task of status.tasks) {
      const statusIcon = task.status === 'completed' ? '✅' :
                        task.status === 'in_progress' ? '🔄' :
                        task.status === 'blocked' ? '🚫' : '⏳'
      
      console.log(`  ${statusIcon} [${task.type}] ${task.description}`)
      if (task.progress) {
        const progressBar = '█'.repeat(Math.floor(task.progress / 10)) + 
                           '░'.repeat(10 - Math.floor(task.progress / 10))
        console.log(`     ${progressBar} ${task.progress}%`)
      }
      if (task.dependencies.length > 0) {
        console.log(`     📌 Depende de: ${task.dependencies.join(', ')}`)
      }
    }
    
    console.log('\n🔗 Contexto Compartilhado:')
    console.log(JSON.stringify(status.sharedContext, null, 2))
    
    // Parar quando completar
    if (status.status === 'completed') {
      clearInterval(progressInterval)
      console.log('\n' + '='.repeat(60))
      console.log('✅ Projeto concluído com sucesso!')
      console.log('📁 Arquivos criados:')
      
      for (const task of status.tasks) {
        if (task.output?.filesCreated) {
          task.output.filesCreated.forEach((file: string) => {
            console.log(`   - ${file}`)
          })
        }
      }
      
      process.exit(0)
    }
  }, 1000)
  
  // Executar projeto
  try {
    await orchestrator.startProject(projectGoal)
  } catch (error) {
    console.error('❌ Erro na execução:', error)
    clearInterval(progressInterval)
    process.exit(1)
  }
}

// Executar teste
testMultiAgentSystem().catch(console.error)