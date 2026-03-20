# Agent Guide for Actions Repository (PlayCanvas to SFTP)

## Contexto del Proyecto

Este repositorio contiene un pipeline de automatización desarrollado en **TypeScript** (Node.js) diseñado para ejecutarse (en el futuro) mediante **GitHub Actions**. Su propósito principal es automatizar el ciclo de vida de despliegue de un proyecto de PlayCanvas: pedir el build, modificar assets locales, subir los archivos mediante **SFTP** a un servidor remoto, invalidar caché en **AWS CloudFront** y registrar el despliegue.

## Arquitectura y Flujo de Trabajo

El sistema está modularizado en scripts dentro de `src/`, orquestados principalmente por `main.ts` de forma secuencial:

1. **`fetch_playcanvas.ts`**: Interacciona con la API de PlayCanvas para disparar un job de compilación (build), esperar a que termine, y descargar el archivo `.zip`.
2. **`modify_build.ts`**: Descomprime el `.zip` (usando `adm-zip`), manipula el `index.html` (para inyectar URLs de CDN, cambiar el título, etc.) según la configuración de despliegue.
3. **`deploy_sftp.ts`**: Se conecta por SFTP al servidor de destino. Limpia el directorio remoto o reemplaza los archivos del nuevo build generado hacia la ruta remota de forma segura.
4. **`invalidate_cache.ts`**: Conecta a la API de AWS CloudFront para invalidar la caché (paths dependientes de la config), asegurando que los usuarios reciban la versión más reciente sin afectar el uptime.
5. **`log_deploy.ts`**: Registra detalles del despliegue exitoso (o fallido) en algún sistema de logs o archivo.

## Estructura del Proyecto

- `src/`: Contiene toda la lógica de los scripts en TypeScript. Contiene una subcarpeta `types/` donde se definen interfaces (como el esquema de la configuración).
- `deploy_config.json`: **El archivo central de configuración.** Sirve como "fuente de verdad" donde se define el ID del proyecto de PlayCanvas, distribución de CloudFront a invalidar, y ruta remota de SFTP. La idea es que los cambios aquí gatillen acciones.
- `temp/` / `dist/`: Directorios temporales/generados localmente usados para alojar el `.zip` descargado y los archivos descomprimidos/modificados antes de subirlos. Se recomienda ignorarlos en Git.
- `logs/`: Directorio probable para guardado de logs locales.

## Variables de Entorno (Secrets)

Para que los scripts funcionen, dependen de credenciales sensibles que no deben versionarse. El proyecto usa `dotenv` localmente, y en uso productivo requerirá variables inyectadas (ej. vía GitHub Secrets):

- **PlayCanvas:** `PLAYCANVAS_API_KEY`
- **AWS:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- **SFTP:** `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PASSWORD`

## Instrucciones para el IA Agent trabajando en este repo

Al interactuar y escribir código en este repositorio, el Agente debe seguir estas directrices:

1. **TypeScript Estricto**: Todo el código nuevo debe estar tipado correctamente. Aprovechar/actualizar las interfaces en `src/types/` si se modifica `deploy_config.json` o contratos de funciones.
2. **Respetar la "Fuente de Verdad"**: Cualquier script debe leer de `deploy_config.json` para sus configuraciones de dónde conectar o qué subir, parseando y validando esos datos.
3. **Manejo de Errores y Robustez**: Los scripts están pensados para correr en CI/CD (GitHub Actions). Por lo tanto, deben hacer `throw` de errores claros, o salir con código `exit 1` ante un fallo fatal para que el pipeline se caiga y un humano lo revise, logueando detalladamente qué salió mal e interceptándolo por `log_deploy`.
4. **Manejo de Archivos multiplataforma**: Usar el módulo `path` (`path.join`, etc.) de Node para rutas locales para interoperabilidad Windows/Linux. Sin embargo, **al interactuar con SFTP**, usar estrictamente `/` como divisor de path ya que los servidores remotos suelen ser y esperar sintaxis Unix.
5. **Testing/Ejecución Local**: Para probar un proyecto, no olvidar que la ejecución es a través de Node. Puedes invocar directamente procesos en TypeScript mediante `tsx` o `ts-node`:

   ```bash
   npx tsx src/main.ts
   # o
   npx ts-node src/fetch_playcanvas.ts
   ```

6. **Sensibilidad en SFTP/AWS**: El script de vaciado/upload SFTP (`deploy_sftp.ts`) es destructivo por naturaleza. Cuidar la lógica que hace el *wipe* para no borrar en lugares no deseados (siempre validar `remote_path` contra un formato seguro que empiece con `html/`).

## Dependencias Clave y Ecosistema

- `ssh2-sftp-client` - Subida de ficheros al servidor.
- `@aws-sdk/client-cloudfront` - Invalidación de cache de assets en CDN.
- `adm-zip` - Extracción de builds de PlayCanvas.
- `dotenv` - Lectura de archivo `.env` local.
