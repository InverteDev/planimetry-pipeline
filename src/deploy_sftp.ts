import 'dotenv/config'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Client from 'ssh2-sftp-client';
import type { DeployConfig } from 'deploy_config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, '../deploy_config.json');
const distPath = path.resolve(__dirname, '../dist');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as DeployConfig;

// Validación en tiempo de ejecución
if (!config.sftp?.remote_path?.startsWith('html/')) {
    console.error("❌ Error de configuración: 'sftp.remote_path' DEBE comenzar con 'html/'");
    process.exit(1);
}


const {SFTP_HOST, SFTP_PORT,SFTP_USER, SFTP_PASSWORD,} = process.env;

console.log(SFTP_HOST, SFTP_PORT,SFTP_USER, SFTP_PASSWORD)
if (!SFTP_HOST || !SFTP_PORT || !SFTP_USER || !SFTP_PASSWORD){
    console.error("❌ Error: faltan variables de entorno para SFTP");
    process.exit(1);
}

export async function deploySFTP(){
    const sftp = new Client();
    try{
        console.log('🚀 Iniciando proceso de deploy vía SFTP...');

        if (!fs.existsSync(distPath)) {
            throw new Error(`No se encontró la carpeta local: ${distPath}. Asegúrate de correr el build primero.`);
        }

        const remotePath = config.sftp?.remote_path;
        if (!remotePath) {
            throw new Error("Falta definir 'sftp.remote_path' en deploy_config.json");
        }

        console.log(`🔌 Conectando al servidor SFTP (${SFTP_HOST}:${SFTP_PORT || 22})...`);
        await sftp.connect({
            host: SFTP_HOST as string,
            port: SFTP_PORT ? parseInt(SFTP_PORT, 10) : 22,
            username: SFTP_USER as string,
            password: SFTP_PASSWORD as string,
        });

        console.log('✅ Conexión establecida con éxito.');

        // Verificamos si el directorio remoto existe, si no, intentamos crearlo
        const remoteExists = await sftp.exists(remotePath);
        if (!remoteExists) {
            console.log(`📁 El directorio remoto no existe. Creando: ${remotePath}...`);
            //await sftp.mkdir(remotePath, true);
        } else {
            // 2. Wipe selectivo: Borramos todo MENOS el index.html
            console.log(`🧹 Realizando wipe selectivo en el remoto para optimizar espacio...`);
            const remoteFiles = await sftp.list(remotePath);
            const cleanRemotePath = remotePath.replace(/\/+$/, '');
           
            for (const item of remoteFiles){
                if (item.name === 'index.html'){
                    console.log(`🛡️  Protegiendo 'index.html' para mantener el caché del CDN intacto.`);
                    continue;
                }
                const itemFullPath = `${cleanRemotePath}/${item.name}`;

                if (item.type === 'd') {
                    console.log("🗑️📁 Removiendo directorio: ", itemFullPath);
                    //await sftp.rmdir(itemFullPath, true);
                } else {
                    console.log("🗑️📄 Removiendo archivo: ", itemFullPath);
                    //await sftp.delete(itemFullPath);
                }
            }
            console.log(`✅ Directorio remoto limpio.`);
        }

    
        console.log(`📤 Subiendo archivos desde '${path.basename(distPath)}' hacia '${remotePath}'...`);
        //await sftp.uploadDir(distPath, remotePath);
        console.log('✅ ¡Deploy subido con éxito!');
    } catch (error){
        console.error("❌ Error durante el deploy SFTP:", error);
        process.exit(1);
    } finally {
        try{
            await sftp.end();
            console.log("✅ Conexión SFTP cerrada correctamente");
        } catch (error){
            console.error("❌ Error: No se pudo cerrar la conexión SFTP", error);
        }
    }
}


deploySFTP();