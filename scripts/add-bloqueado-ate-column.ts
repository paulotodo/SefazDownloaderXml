import { supabaseAdmin } from '../server/supabase.js';

async function addColumn() {
  console.log('Adicionando coluna bloqueado_ate na tabela empresas...\n');

  // Executa SQL diretamente via API administrativa
  const { data, error } = await supabaseAdmin.rpc('exec_sql', {
    sql_query: 'ALTER TABLE empresas ADD COLUMN bloqueado_ate TIMESTAMP;'
  });

  if (error) {
    console.log('❌ ERRO:', error.message);
    console.log('Tentando método alternativo...\n');
    
    // Se RPC não funcionar, tenta via query direta
    const { error: error2 } = await supabaseAdmin
      .from('empresas')
      .update({ bloqueado_ate: null })
      .eq('id', '00000000-0000-0000-0000-000000000000'); // Query fake para forçar detecção

    if (error2) {
      console.log('❌ Método alternativo também falhou:', error2.message);
      console.log('\n⚠️  SOLUÇÃO: Você precisa adicionar a coluna manualmente no Supabase:');
      console.log('   1. Acesse: https://supabase.com/dashboard');
      console.log('   2. Vá em: Table Editor > empresas');
      console.log('   3. Clique em "New Column" e adicione:');
      console.log('      - Nome: bloqueado_ate');
      console.log('      - Tipo: timestamp');
      console.log('      - Nullable: SIM (checked)');
      console.log('      - Default: (deixe vazio)');
    }
  } else {
    console.log('✅ Coluna adicionada com sucesso!');
  }
}

addColumn();
