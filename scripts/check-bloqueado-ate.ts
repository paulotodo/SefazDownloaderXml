import { supabaseAdmin } from '../server/supabase.js';

async function verificarColuna() {
  console.log('Verificando coluna bloqueado_ate no Supabase...\n');

  const { data, error } = await supabaseAdmin
    .from('empresas')
    .select('id, cnpj, razao_social, bloqueado_ate')
    .limit(1);

  if (error) {
    console.log('❌ ERRO ao consultar:', error.message);
    console.log('Código:', error.code);
    console.log('Detalhes:', error.details);
    process.exit(1);
  } else {
    console.log('✅ Sucesso! Dados retornados:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n✅ A coluna bloqueado_ate EXISTE no banco!');
  }
}

verificarColuna();
