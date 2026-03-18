import { fetchPlayCanvas } from "./fetch_playcanvas.js";
import { modifyBuild } from "./modify_build.js";
import { deploySFTP } from "./deploy_sftp.js";

async function main () {
    const startTime = Date.now();
    console.log("🚀 Iniciando proceso de despliegue automatizado...");
    
    try{
        console.log("\n--- PASO 1: Descargando Build ---");
        await fetchPlayCanvas();

        console.log("\n--- PASO 2: Modificando Build ---");
        await modifyBuild();

        console.log("\n--- PASO 3: Desplegando a Servidor ---");
        await deploySFTP();

        /*
        console.log("\n--- PASO 4: Registro de Despliegue ---");
        await logDeployment();*/
    } catch (error : any ) {
        console.error("❌ Error crítico durante el despliegue:");
        console.error(error.message || error);
        process.exit(1);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Despliegue completado en ${duration}s`);
    console.log("✨ ¡Proceso de despliegue finalizado exitosamente! ✨");
    
}


main();