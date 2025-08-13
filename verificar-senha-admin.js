const bcrypt = require('bcrypt');

async function verificarSenha() {
    // Hash atual no banco
    const hashAtual = '$2a$10$.USfJ4MJQt7aqt4hBudjMOF2Gn.kDa8mBzCNVVHvJSu9iI4h2K0.m';
    
    // Senha que deveria funcionar
    const senhaCorreta = 'Admin123';
    
    // Verificar se a senha confere
    const resultado = await bcrypt.compare(senhaCorreta, hashAtual);
    
    console.log('🔐 Senha Admin123 confere com hash atual:', resultado);
    
    if (!resultado) {
        console.log('❌ A senha foi alterada! Precisa ser atualizada.');
        
        // Gerar novo hash para Admin123
        const novoHash = await bcrypt.hash(senhaCorreta, 10);
        console.log('🔧 Hash correto para Admin123:', novoHash);
        
        console.log('\n📝 Comando para atualizar no banco:');
        console.log(`UPDATE admin_users SET password_hash = '${novoHash}' WHERE email = 'admin@universalbooking.com';`);
    } else {
        console.log('✅ Senha está correta!');
    }
}

verificarSenha().catch(console.error);