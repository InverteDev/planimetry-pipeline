import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import AdmZip from "adm-zip";
import fsPromises from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, "../deploy_config.json");
const zipPath = path.resolve(__dirname, "../temp/build.zip");
const distPath = path.resolve(__dirname, "../dist");

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

/**
 * Inyecta todos los metas de branding y SEO desde la configuración
 */
async function injectBrandingAndSEO(
  indexPath: string,
  config: any,
): Promise<void> {
  try {
    let htmlContent = await fsPromises.readFile(indexPath, "utf-8");

    const branding = config.html_modify?.branding;
    if (!branding) {
      console.log(
        `⚠️ No se encontró bloque 'branding' en config. Omitiendo SEO.`,
      );
      return;
    }

    // Sanear valores para evitar inyecciones
    const sanitize = (str: string) => str?.replace(/"/g, "&quot;") || "";

    const title = sanitize(branding.title);
    const description = sanitize(branding.description);
    const canonicalUrl = sanitize(branding.canonical_url);
    const socialImage = sanitize(branding.social_image_url);
    const faviconUrl = sanitize(branding.favicon_url);
    const keywords = sanitize(
      branding.keywords || "Inverte, planimetría, 3D, bienes raíces",
    );
    const themeColor = sanitize(branding.theme_color || "#000000");

    // Reemplazar title
    htmlContent = htmlContent.replace(
      /<title>.*?<\/title>/s,
      `<title>${title}</title>`,
    );

    // Remover metas viejos que vamos a reemplazar (para evitar duplicados)
    htmlContent = htmlContent.replace(/<meta\s+name="description"[^>]*>/gi, "");
    htmlContent = htmlContent.replace(/<meta\s+name="keywords"[^>]*>/gi, "");
    htmlContent = htmlContent.replace(/<link\s+rel="canonical"[^>]*>/gi, "");
    htmlContent = htmlContent.replace(/<link\s+rel="icon"[^>]*>/gi, "");
    htmlContent = htmlContent.replace(
      /<link\s+rel="apple-touch-icon"[^>]*>/gi,
      "",
    );
    htmlContent = htmlContent.replace(/<meta\s+property="og:[^>]*>/gi, "");
    htmlContent = htmlContent.replace(/<meta\s+name="twitter:[^>]*>/gi, "");

    // Generar nuevos metas
    const newMetas = `    <!-- Meta esenciales -->
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover" />

    <!-- SEO -->
    <meta name="description" content="${description}" />
    <meta name="keywords" content="${keywords}" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
    
    <!-- Canonical y Favicon -->
    <link rel="canonical" href="${canonicalUrl}" />
    <link rel="icon" type="image/x-icon" href="${faviconUrl}" />
    <link rel="apple-touch-icon" href="${faviconUrl}" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${socialImage}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:locale" content="es_AR" />
    <meta name="theme-color" content="${themeColor}" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${socialImage}" />`;

    // Insertar antes de </head>
    if (htmlContent.includes("</head>")) {
      htmlContent = htmlContent.replace("</head>", `${newMetas}\n    </head>`);
    }

    await fsPromises.writeFile(indexPath, htmlContent, "utf-8");
    console.log(
      `✅ Branding & SEO Inyectado: Metas actualizados desde config.`,
    );
  } catch (error) {
    console.error(`❌ Error al inyectar branding y SEO:`, error);
    throw error;
  }
}

/**
 * Inyecta el SDK de Inverte en el importmap del index.html
 */
async function injectSDKImportMap(
  indexPath: string,
  config: any,
): Promise<void> {
  try {
    let htmlContent = await fsPromises.readFile(indexPath, "utf-8");

    const sdkLink = config.playcanvas?.sdk_cdn_link;
    if (!sdkLink) {
      console.log(
        `⚠️ No se encontró 'sdk_cdn_link' en config.playcanvas. Omitiendo inyección de SDK.`,
      );
      return;
    }

    // Buscar el importmap existente
    const importmapMatch = htmlContent.match(
      /<script\s+type="importmap">(.*?)<\/script>/s,
    );

    let importmapObj: { imports: Record<string, string> } = {
      imports: {
        playcanvas: "https://code.playcanvas.com/playcanvas-2.16.1.mjs",
      },
    };

    // Si existe importmap, parsear y mergear
    if (importmapMatch && importmapMatch[1]) {
      try {
        const existingMap = JSON.parse(importmapMatch[1]);
        importmapObj = { ...existingMap };
      } catch (e) {
        console.log(
          `⚠️ No se pudo parsear importmap existente, creando uno nuevo.`,
        );
      }
    }

    // Agregar o actualizar inverte-sdk
    importmapObj.imports["inverte-sdk"] = sdkLink;

    const newImportmapScript = `<script type="importmap">
    ${JSON.stringify(importmapObj, null, 2)}
  </script>`;

    // Reemplazar importmap completo o insertarlo antes de </head>
    if (importmapMatch) {
      htmlContent = htmlContent.replace(
        /<script\s+type="importmap">(.*?)<\/script>/s,
        newImportmapScript,
      );
    } else {
      // Insertarlo antes de </head> si no existe
      if (htmlContent.includes("</head>")) {
        htmlContent = htmlContent.replace(
          "</head>",
          `    ${newImportmapScript}\n    </head>`,
        );
      }
    }

    await fsPromises.writeFile(indexPath, htmlContent, "utf-8");
    console.log(`✅ SDK Importmap Inyectado: ${sdkLink}`);
  } catch (error) {
    console.error(`❌ Error al inyectar SDK en importmap:`, error);
    throw error;
  }
}

/**
 * Inyecta Google Analytics (gtag) en el head
 */
async function injectGoogleAnalytics(indexPath: string): Promise<void> {
  const gtagId = config.html_modify?.["gtag-id"];

  try {
    let htmlContent = await fsPromises.readFile(indexPath, "utf-8");

    // Remover gtag anterior si existe
    htmlContent = htmlContent.replace(
      /<script\s+async\s+src="https:\/\/www\.googletagmanager\.com\/gtag\/js[^>]*><\/script>[\s\n]*<script>[\s\S]*?gtag\("config",\s*"[^"]*"\);\s*<\/script>/s,
      "",
    );

    // Generar nuevo script
    const gtagScript = `    <!-- Google tag (gtag.js) -->
    <script
      async
      src="https://www.googletagmanager.com/gtag/js?id=${gtagId}"
    ></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        dataLayer.push(arguments);
      }
      gtag("js", new Date());
      gtag("config", "${gtagId}");
    </script>`;

    // Insertar antes de </head>
    if (htmlContent.includes("</head>")) {
      htmlContent = htmlContent.replace(
        "</head>",
        `${gtagScript}\n    </head>`,
      );
    }

    await fsPromises.writeFile(indexPath, htmlContent, "utf-8");
    console.log(`✅ Google Analytics Inyectado: ${gtagId}`);
  } catch (error) {
    console.error(`❌ Error al inyectar Google Analytics:`, error);
  }
}

/**
 * Inyecta Schema.org Structured Data para RealEstateAgent
 */
async function injectStructuredData(
  indexPath: string,
  config: any,
): Promise<void> {
  try {
    let htmlContent = await fsPromises.readFile(indexPath, "utf-8");

    const branding = config.html_modify?.branding;
    if (!branding) return;

    // Remover schema viejo si existe
    htmlContent = htmlContent.replace(
      /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/,
      "",
    );

    const schema = {
      "@context": "https://schema.org",
      "@type": "RealEstateAgent",
      name: branding.title,
      description: branding.description,
      url: branding.canonical_url,
      image: branding.social_image_url,
      areaServed: "Buenos Aires, Argentina",
      priceRange: "$$$",
    };

    const schemaScript = `    <!-- Schema.org Structured Data -->
    <script type="application/ld+json">
      ${JSON.stringify(schema, null, 2)}
    </script>`;

    // Insertar antes de </head>
    if (htmlContent.includes("</head>")) {
      htmlContent = htmlContent.replace(
        "</head>",
        `${schemaScript}\n    </head>`,
      );
    }

    await fsPromises.writeFile(indexPath, htmlContent, "utf-8");
    console.log(`✅ Structured Data Inyectado: Schema RealEstateAgent`);
  } catch (error) {
    console.error(`❌ Error al inyectar Structured Data:`, error);
  }
}

async function injectSceneDataToHTML(
  distPath: string,
  indexPath: string,
): Promise<void> {
  const indexMjsPath = path.join(distPath, "js", "index.mjs");

  if (!fs.existsSync(indexMjsPath)) {
    console.log(`⚠️ No se encontró index.mjs para extraer SCENE_PATH.`);
    return;
  }

  try {
    const settingsContent = await fsPromises.readFile(indexMjsPath, "utf-8");
    const scenePathMatch = settingsContent.match(
      /const SCENE_PATH\s*=\s*"([^"]+)";/,
    );

    if (!scenePathMatch || !scenePathMatch[1]) return;

    const sceneFilename = scenePathMatch[1];
    const sceneJsonPath = path.join(distPath, sceneFilename);

    if (!fs.existsSync(sceneJsonPath)) return;

    const sceneJsonContent = await fsPromises.readFile(sceneJsonPath, "utf-8");
    const sceneData = JSON.parse(sceneJsonContent);

    const branchId = sceneData.branch_id;
    const checkpointId = sceneData.checkpoint_id;
    const sceneId = sceneData.id;

    if (!branchId || !checkpointId) return;

    let htmlContent = await fsPromises.readFile(indexPath, "utf-8");

    // Formateado con la indentación exacta
    const metaTags = `    <meta name="pc-branch-id" content="${branchId}" />
    <meta name="pc-checkpoint-id" content="${checkpointId}" />
    <meta name="pc-scene-id" content="${sceneId}" />
    <!-- Deployed on: ${new Date().toISOString()} -->
    `;

    if (htmlContent.includes("</head>")) {
      htmlContent = htmlContent.replace("</head>", `${metaTags}</head>`);
    }

    await fsPromises.writeFile(indexPath, htmlContent, "utf-8");
    console.log(`✅ PlayCanvas Scene Metadata Inyectado.`);
  } catch (error) {
    console.error(`❌ Error al inyectar datos de la escena:`, error);
  }
}

async function modifyJS(distPath: string, config: any): Promise<void> {
  const jsPath = path.join(distPath, "js", "index.mjs");
  if (!fs.existsSync(jsPath)) {
    console.log(
      `⚠️ No se encontró el archivo index.mjs. Omitiendo modificación de JS.`,
    );
    return;
  }

  const cdnUrl = config.html_modify?.cdn_url;
  const projectPath = config.sftp?.remote_path;

  if (!cdnUrl || !projectPath) {
    console.log(
      `⚠️ Faltan 'cdn_url' o 'project_name' en el config. No se puede modificar JS.`,
    );
    return;
  }

  // Limpiamos los segmentos para evitar dobles barras
  const cleanCdn = cdnUrl.replace(/\/+$/, "");
  // Quitamos 'html/' del remote_path para el CDN, y limpiamos barras
  const cleanPath = projectPath
    .replace(/^html\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  const baseUrl = `${cleanCdn}/${cleanPath}`;

  try {
    let content = await fsPromises.readFile(jsPath, "utf-8");

    // Reemplazamos usando expresiones regulares para encontrar y sustituir exactamente los valores
    // Agregamos una barra al final solo si no queda vacía la baseUrl
    const prefix = baseUrl ? `${baseUrl}/` : "";
    content = content.replace(
      /const ASSET_PREFIX\s*=\s*"[^"]*";/,
      `const ASSET_PREFIX = "${prefix}";`,
    );
    content = content.replace(
      /const SCRIPT_PREFIX\s*=\s*"[^"]*";/,
      `const SCRIPT_PREFIX = "${prefix}";`,
    );
    content = content.replace(
      /const CONFIG_FILENAME\s*=\s*"[^"]*";/,
      `const CONFIG_FILENAME = "${prefix}config.json";`,
    );

    await fsPromises.writeFile(jsPath, content, "utf-8");
    console.log(
      `✅ JS Modificado: Se actualizaron ASSET, SCRIPT y CONFIG en index.mjs`,
    );
  } catch (error) {
    console.error(`❌ Error al modificar ${jsPath}:`, error);
    throw error;
  }
}

/**
 * Since PlayCanvas is PURE BULLSHIT, and it exports config.json with /api/ URLs,
 * we need to fix it ourselves.
 */
async function modifyConfigJSON(distPath: string): Promise<void> {
  const configJsonPath = path.join(distPath, "config.json");
  if (!fs.existsSync(configJsonPath)) return;

  try {
    const configData = JSON.parse(
      await fsPromises.readFile(configJsonPath, "utf-8"),
    );

    let modified = false;
    if (configData.assets) {
      for (const key in configData.assets) {
        const asset = configData.assets[key];
        // Si la URL arranca con /api/, la pisamos por la ruta real de los assets
        if (
          asset.file &&
          asset.file.url &&
          asset.file.url.startsWith("/api/")
        ) {
          asset.file.url = `files/assets/${key}/1/${asset.file.filename}`;
          modified = true;
        }
      }
    }

    if (modified) {
      // Guardamos el JSON pisado sin espacios extra para ahorrar peso
      await fsPromises.writeFile(
        configJsonPath,
        JSON.stringify(configData),
        "utf-8",
      );
      console.log(
        `✅ config.json Modificado: Se corrigieron las rutas huérfanas '/api/'.`,
      );
    }
  } catch (error) {
    console.error(`❌ Error al modificar config.json:`, error);
  }
}

export async function modifyBuild() {
  try {
    console.log("🏗️ Iniciando proceso de modificación del build...");

    if (!fs.existsSync(zipPath)) {
      throw new Error(
        "No se encontró build.zip. Asegúrate de correr fetch_playcanvas.ts primero.",
      );
    }

    if (fs.existsSync(distPath)) {
      console.log(`🗑️ Limpiando carpeta dist anterior...`);
      fs.rmSync(distPath, { recursive: true, force: true });
    }

    console.log(`📦🔜📂 Extrayendo archivos...`);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(distPath, true);
    console.log(`✅ Archivos extraídos en: ${distPath}`);

    const indexPath = path.join(distPath, "index.html");
    if (!fs.existsSync(indexPath)) {
      throw new Error("No se encontró index.html dentro del archivo extraído.");
    }

    const tasks: Promise<void>[] = [];

    const mods = config.html_modify;
    if (mods && mods.modify_indexhtml) {
      tasks.push(
        (async () => {
          // Orden secuencial para inyecciones HTML (importante para no duplicar/pisar)
          await injectBrandingAndSEO(indexPath, config); // 1ro: Metas de branding y SEO
          await injectSDKImportMap(indexPath, config); // 2do: Agregar SDK al importmap
          await injectGoogleAnalytics(indexPath); // 3ro: Analytics
          await injectStructuredData(indexPath, config); // 4to: Schema.org
          await injectSceneDataToHTML(distPath, indexPath); // 5to: Metas de PlayCanvas
        })(),
      );
    } else {
      console.log(
        `⏩ Modificaciones HTML deshabilitadas en el config. Borrando index.html del build.`,
      );
      if (fs.existsSync(indexPath)) {
        fs.unlinkSync(indexPath);
      }
    }

    tasks.push(modifyJS(distPath, config));
    tasks.push(modifyConfigJSON(distPath));

    if (tasks.length > 0) {
      console.log("💫 Aplicando modificaciones en paralelo...");
      await Promise.all(tasks);
      console.log("✅ Modificaciones completadas.");
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  modifyBuild();
}
