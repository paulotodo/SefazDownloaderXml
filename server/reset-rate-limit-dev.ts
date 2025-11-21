import { supabaseStorage } from "./supabase-storage";

const EMPRESA_ID = "09b75153-fdd1-422a-ad92-325f1563e5d5";

async function main() {
  console.log(`🔄 Resetando rate limit para empresa ${EMPRESA_ID}...`);
  
  try {
    await supabaseStorage.resetRateLimit(EMPRESA_ID);
    console.log("✅ Rate limit resetado com sucesso!");
    console.log("⏰ Próximo ciclo (5min) poderá tentar manifestação");
  } catch (error: any) {
    console.error("❌ Erro:", error.message);
    process.exit(1);
  }
}

main();
