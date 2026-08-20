<div align="center">

<img src="app/desktop/assets/icon.png" width="96" alt="MapleVault" />

# MapleVault

**Tu biblioteca personal de anime y manga, 100% local.**

[![Descargar para Windows](https://img.shields.io/badge/Descargar-Windows%20x64-6d28d9?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Alexander19l/MapleVault/releases/latest)
[![Última versión](https://img.shields.io/github/v/release/Alexander19l/MapleVault?label=versi%C3%B3n&color=6d28d9)](https://github.com/Alexander19l/MapleVault/releases/latest)

</div>

---

## ¿Qué es MapleVault?

MapleVault es una app de escritorio para organizar lo que ves y lees: guarda tu catálogo de anime y manga,
sigue tu progreso capítulo a capítulo, lee y mira directamente desde la propia app, y descarga manga para
leer sin conexión. Todo corre en tu computadora — sin cuentas, sin anuncios, sin que tus datos salgan de tu equipo.

- **Catálogo y lista personal** — filtros, estados (viendo, pendiente, completado...), favoritos y puntuación.
- **Reproductor integrado** — mira episodios desde varias fuentes sin que se abra ninguna ventana aparte.
- **Lector de manga** — modo página o continuo, zoom, brillo y descargas para leer sin conexión.
- **Maple Assistant** — pide recomendaciones y gestiona tu biblioteca por chat, con confirmación antes de cualquier cambio.
- **Privado por diseño** — la base de datos vive en tu equipo; nada se sube a ningún servidor.

## Descarga e instalación

1. Descarga el instalador desde **[la página de versiones](https://github.com/Alexander19l/MapleVault/releases/latest)** (botón de arriba).
2. Ejecuta `MapleVault-Setup-x64.exe`. No hace falta instalar Node, Python ni nada adicional — el traductor
   de metadata es un componente opcional que solo se instala si lo activas.
3. Abre MapleVault y empieza a añadir tus series. La biblioteca empieza vacía; nada de datos de ejemplo.

Requiere Windows 10 u 11 de 64 bits.

---

## 🛠️ Notas técnicas

Todo lo que sigue es documentación para quien quiera compilar, depurar o contribuir al proyecto.

### Stack

Electron para el contenedor nativo, React + Vite para la interfaz y Express con SQLite para la API local.

### Launcher de raíz

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

El instalador de Windows ofrece LibreTranslate como componente opcional, desmarcado por defecto por su peso. Al seleccionarlo, comprueba e instala Python 3.11 y Microsoft Visual C++ Runtime x64 solo si son necesarios, además del servicio y el modelo inglés-español. También se puede instalar, verificar y diagnosticar después desde **Ajustes > Traducción de metadata** sin reinstalar MapleVault.

Las instalaciones nuevas comienzan con Inicio, Catálogo y Mi Lista vacíos. Las series de demostración solo se habilitan deliberadamente en desarrollo mediante `MAPLEVAULT_SEED_DEMO_DATA=true`.

Al reinstalar, el instalador permite seleccionar **Iniciar con biblioteca y ajustes vacíos**. La opción está desmarcada para evitar pérdidas accidentales y elimina únicamente la base y configuración anteriores; el runtime pesado de LibreTranslate se conserva.

### Capacidades principales

- Catálogo local con filtros por título, género, temporada, año, estado, tipo y puntuación.
- Importación normalizada desde AniList y fuentes de scraping configuradas.
- Lista personal con estados: viendo, pendiente, completado y abandonado.
- Seguimiento de episodios vistos, progreso y estados personales.
- Reproductor de episodios embebido en la propia ventana (sin ventanas aparte), con Referer y sesión aislados por fuente y Adblock integrado.
- Manga con proveedores aislados, capítulos bajo demanda y lector interno configurable.
- Lector de manga con modo página o continuo, dirección izquierda-derecha/derecha-izquierda, zoom, brillo, ajuste de ancho, pantalla completa y preferencias persistentes.
- Descargas de manga concurrentes: varios capítulos a la vez sin bloquearse entre sí.
- Maple Assistant con motor regex local y soporte opcional de Ollama.
- Acciones del asistente protegidas por token de confirmación.
- Endpoint `GET /chat/capabilities` para consultar funciones, acciones y ejemplos del asistente.
- Backups SQLite mediante `VACUUM INTO`.
- Electron con `contextIsolation`, `sandbox` y `nodeIntegration` desactivado en todas las ventanas y vistas.
- Backend empaquetado aislado por instancia mediante puerto dinámico, token de sesión e identificador de salud; no reutiliza servidores de desarrollo que estén en el puerto 5000.

### Estructura

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

### Desarrollo

Requisitos:

- Node.js `22.12` o superior.
- npm `10` o superior.
- Windows 10/11 para generar el instalador NSIS.

```bash
npm install
npm run dev
```

Servicios por defecto:

- Backend: `http://localhost:5000`
- Frontend Vite: `http://localhost:5173`
- Ollama opcional: `http://localhost:11434`

### Verificación

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

### Instalador

El instalador de Windows se genera con:

```bash
npm run package
```

La salida validada queda en `dist/MapleVault-Setup-<version>-x64.exe`.
Los comandos `npm run dist`, `npm run dist:win` y `npm run dist:linux`
compilan y verifican sus entradas antes de empaquetar para evitar builds
obsoletos o incompletos.

### Datos locales

En producción, Electron usa `app.getPath('userData')` para la base de datos, logs y backups. En desarrollo, los datos se crean bajo `app/data` o la ruta definida por `DATABASE_PATH`.

Los archivos SQLite, backups, logs, instaladores y builds generados no deben versionarse.

MapleVault no incluye descarga de episodios. Los instaladores de la aplicacion
se distribuiran desde un portal web y un repositorio de versiones verificadas.

### Maple Assistant

El asistente sigue este flujo:

```text
mensaje -> sanitizeChatInput -> parseIntent -> handleLocalIntent -> action token -> executeChatbotAction
```

Toda acción de escritura declarada por el asistente requiere confirmación temporal antes de modificar la biblioteca.

Guías:

- `docs/MAPLE_ASSISTANT.md`
- `docs/CHATBOT_ROADMAP.md`
- `docs/METADATA_TRANSLATION_ES.md`
