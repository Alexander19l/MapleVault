# MapleVault Local

MapleVault Local es una aplicación de escritorio para gestionar una biblioteca personal de anime con almacenamiento local en SQLite. Usa Electron para el contenedor nativo, React/Vite para la interfaz y Express para la API local.

## Launcher De Raiz

Para probar el programa desde Windows, usa el launcher de la carpeta raíz:

```bat
MapleVault.bat
```

Opciones disponibles:

- `1`: iniciar MapleVault en modo desarrollo con backend, frontend Vite y Electron.
- `2`: compilar backend, frontend y desktop.
- `3`: validar código con typecheck, lint frontend y todas las pruebas del backend.
- `4`: empaquetar instalador con Electron Builder.
- `5`: preparar el entorno local de LibreTranslate.

`iniciar.bat` queda como alias compatible y llama internamente a `MapleVault.bat`.

## Capacidades Principales

- Catálogo local con filtros por título, género, temporada, año, estado, tipo y puntuación.
- Importación normalizada desde AniList y fuentes de scraping configuradas.
- Lista personal con estados: viendo, pendiente, completado y abandonado.
- Seguimiento de episodios vistos, progreso y estados personales.
- Maple Assistant con motor regex local y soporte opcional de Ollama.
- Acciones del asistente protegidas por token de confirmación.
- Endpoint `GET /chat/capabilities` para consultar funciones, acciones y ejemplos del asistente.
- Backups SQLite mediante `VACUUM INTO`.
- Electron con `contextIsolation`, `sandbox` y `nodeIntegration` desactivado en la ventana principal.

## Estructura

```text
maplevault-local/
|-- MapleVault.bat
|-- iniciar.bat
|-- app/
|   |-- backend/   # Express, SQLite, scraping, traduccion y chatbot
|   |-- frontend/  # React, Vite, UI y cliente API
|   `-- desktop/   # Electron main/preload/launcher
|-- docs/          # Arquitectura, auditoria y Maple Assistant
|-- scripts/       # Scripts auxiliares de build
|-- tests/         # E2E Playwright
`-- package.json   # Scripts raíz
```

## Desarrollo

```bash
npm install
npm run dev
```

Servicios por defecto:

- Backend: `http://localhost:5000`
- Frontend Vite: `http://localhost:5173`
- Ollama opcional: `http://localhost:11434`

## Verificación

```bash
npm run typecheck
npm run typecheck:frontend
npm run test:security
npm run test:backend
npm run test:chatbot
npm run lint:frontend
```

También se puede usar:

```bash
npm run check
```

## Instalador

El instalador de Windows se genera con:

```bash
npm run package
```

La salida validada queda en `dist/MapleVault-Setup-<version>-x64.exe`.
Los comandos `npm run dist`, `npm run dist:win` y `npm run dist:linux`
compilan y verifican sus entradas antes de empaquetar para evitar builds
obsoletos o incompletos.

## Datos Locales

En producción, Electron usa `app.getPath('userData')` para la base de datos, logs y backups. En desarrollo, los datos se crean bajo `app/data` o la ruta definida por `DATABASE_PATH`.

Los archivos SQLite, backups, logs, instaladores y builds generados no deben versionarse.

MapleVault no incluye descarga de episodios. Los instaladores de la aplicacion
se distribuiran desde un portal web y un repositorio de versiones verificadas.

## Maple Assistant

El asistente sigue este flujo:

```text
mensaje -> sanitizeChatInput -> parseIntent -> handleLocalIntent -> action token -> executeChatbotAction
```

Toda acción de escritura declarada por el asistente requiere confirmación temporal antes de modificar la biblioteca.

Guías:

- `docs/MAPLE_ASSISTANT.md`
- `docs/CHATBOT_ROADMAP.md`
- `docs/METADATA_TRANSLATION_ES.md`
