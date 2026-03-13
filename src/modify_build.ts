import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import fsPromises from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, '../deploy_config.json');
const zipPath = path.resolve(__dirname, 'build.zip');
const distPath = path.resolve(__dirname, '../dist');

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

async function modifyHTML(indexPath: string, config: any): Promise<void> {
    // Implementación pendiente
    return Promise.resolve();
}

async function modifyJS(distPath: string, config: any): Promise<void> {
    const jsPath = path.join(distPath, 'js', '__settings__.mjs');
    if (!fs.existsSync(jsPath)) {
        console.log(`⚠️ No se encontró el archivo js/__settings__.mjs. Omitiendo modificación de JS.`);
        return;
    }

    const cdnUrl = config.html_modify?.cdn_url;
    const projectPath = config.sftp?.remote_path;

    if (!cdnUrl || !projectPath) {
        console.log(`⚠️ Faltan 'cdn_url' o 'project_name' en el config. No se puede modificar JS.`);
        return;
    }

    // Limpiamos los segmentos para evitar dobles barras
    const cleanCdn = cdnUrl.replace(/\/+$/, '');
    const cleanPath = projectPath.replace(/^\/+/, '').replace(/\/+$/, '');
    const baseUrl = `${cleanCdn}/${cleanPath}`;

    try {
        let content = await fsPromises.readFile(jsPath, 'utf-8');

        // Reemplazamos usando expresiones regulares para encontrar y sustituir exactamente los valores
        // Agregamos una barra al final solo si no queda vacía la baseUrl
        const prefix = baseUrl ? `${baseUrl}/` : '';
        content = content.replace(/const ASSET_PREFIX\s*=\s*"[^"]*";/, `const ASSET_PREFIX = "${prefix}";`);
        content = content.replace(/const SCRIPT_PREFIX\s*=\s*"[^"]*";/, `const SCRIPT_PREFIX = "${prefix}";`);
        content = content.replace(/const CONFIG_FILENAME\s*=\s*"[^"]*";/, `const CONFIG_FILENAME = "${prefix}config.json";`);

        await fsPromises.writeFile(jsPath, content, 'utf-8');
        console.log(`✅ JS Modificado: Se actualizaron ASSET, SCRIPT y CONFIG en js/__settings__.mjs`);
    } catch (error) {
        console.error(`❌ Error al modificar ${jsPath}:`, error);
        throw error;
    }
}

export async function modifyBuild() {
    try {
        console.log('🏗️ Iniciando proceso de modificación del build...');

        if (!fs.existsSync(zipPath)) {
            throw new Error("No se encontró build.zip. Asegúrate de correr fetch_playcanvas.ts primero.");
        }

        if (fs.existsSync(distPath)) {
            console.log(`🗑️ Limpiando carpeta dist anterior...`);
            fs.rmSync(distPath, { recursive: true, force: true });
        }

        console.log(`📦🔜📂 Extrayendo archivos...`);
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(distPath, true);
        console.log(`✅ Archivos extraídos en: ${distPath}`);

        const indexPath = path.join(distPath, 'index.html');
        if (!fs.existsSync(indexPath)) {
            throw new Error("No se encontró index.html dentro del archivo extraído.");
        }

        const tasks: Promise<void>[] = [];

        const mods = config.html_modify;
        if (mods && mods.modify_indexhtml) {
            tasks.push(modifyHTML(indexPath, config));
        } else {
            console.log(`⏩ Modificaciones HTML deshabilitadas en el config. Borrando index.html del build.`);
            if (fs.existsSync(indexPath)) {
                fs.unlinkSync(indexPath);
            }
        }

        tasks.push(modifyJS(distPath, config));

        if (tasks.length > 0) {
            console.log('💫 Aplicando modificaciones en paralelo...');
            await Promise.all(tasks);
            console.log('✅ Modificaciones completadas.');
        }

        // Limpieza final: borrar el .zip si todo salió bien
        if (fs.existsSync(zipPath)) {
            console.log(`🧹 Limpiando archivo temporal: ${path.basename(zipPath)}`);
            fs.unlinkSync(zipPath);
        }
        
    } catch (error) {
        console.error("❌ Error: proceso interrumpido", error);
        process.exit(1);
    }
}

modifyBuild();
