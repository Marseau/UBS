const fs = require('fs').promises;

class ValidationReverter {
    constructor() {
        this.validationFile = './frontend-validation-simple.js';
    }

    async revertValidationToAdmin() {
        try {
            console.log(' Revertendo validação para usar /admin...');
            
            // Ler o arquivo atual
            let content = await fs.readFile(this.validationFile, 'utf8');
            
            // Substituir qualquer rota /dashboard por /admin
            content = content.replace(
                /{ url: `\${this\.baseUrl}\/dashboard`, name: 'Dashboard' }/g,
                `{ url: \`\${this.baseUrl}/admin\`, name: 'Dashboard' }`
            );
            
            // Também substituir se estiver como dashboard.html
            content = content.replace(
                /{ url: `\${this\.baseUrl}\/dashboard\.html`, name: 'Dashboard' }/g,
                `{ url: \`\${this.baseUrl}/admin\`, name: 'Dashboard' }`
            );
            
            // Salvar o arquivo
            await fs.writeFile(this.validationFile, content, 'utf8');
            console.log('✅ Validação revertida para usar /admin');
            
        } catch (error) {
            console.error('❌ Erro ao reverter validação:', error.message);
        }
    }

    async removeDashboardFile() {
        try {
            await fs.unlink('./src/frontend/dashboard.html');
            console.log('✅ Arquivo dashboard.html removido');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('ℹ️ Arquivo dashboard.html não existe');
            } else {
                console.error('❌ Erro ao remover arquivo:', error.message);
            }
        }
    }
}

// Executar reversão
async function main() {
    const reverter = new ValidationReverter();
    
    console.log(' Revertendo para estado original...\n');
    
    // Remover arquivo dashboard.html se existir
    await reverter.removeDashboardFile();
    
    // Reverter validação para usar /admin
    await reverter.revertValidationToAdmin();
    
    console.log('\n✅ Reversão completa!');
    console.log('\n📝 Estado atual:');
    console.log('  - /admin -> Dashboard (index.html)');
    console.log('  - /dashboard -> 404 (como deveria ser)');
    console.log('\n🔄 Para testar:');
    console.log('  1. Reinicie o servidor: npm run dev');
    console.log('  2. Execute validação: node frontend-validation-simple.js');
}

main().catch(console.error); 