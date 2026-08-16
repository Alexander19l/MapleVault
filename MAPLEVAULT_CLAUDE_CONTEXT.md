# MapleVault: contexto de continuidad para Claude Code

## Propósito

MapleVault es una aplicación de escritorio local-first para administrar una biblioteca de anime y una sección independiente de manga. El objetivo principal es ofrecer catálogo, búsqueda online, scraping controlado, reproducción protegida, traducción local opcional y asistencia conversacional sin sacrificar estabilidad, privacidad ni mantenibilidad.

Este documento es el punto de entrada para continuar el desarrollo cuando una sesión de Codex termine. Debe actualizarse cuando cambien contratos, fuentes, procesos de instalación o decisiones de arquitectura.

## Estado de la versión

- Producto: MapleVault.
- Versión empaquetada actual: `1.0.15`.
- Repositorio: `https://github.com/Alexander19l/MapleVault`.
- Rama de trabajo publicada: `codex/safe-sqlite-restore`.
- Último checkpoint publicado antes de esta fase: commit `51223ab7`; esta fase queda pendiente de publicar.
- Release existente: `v1.0.14`.
- Sistema objetivo principal: Windows 10/11 x64.
- El instalador no está firmado digitalmente. SmartScreen puede mostrar una advertencia.

## Tecnologías y frameworks

### Aplicación de escritorio

- Electron 42.
- TypeScript.
- `contextIsolation: true`.
- `nodeIntegration: false` en la ventana principal.
- Preload con API IPC limitada y validada.
- Electron Builder con instalador NSIS.

### Frontend

- React 19.
- Vite 8.
- Tailwind CSS 4.
- Lucide React para iconografía.
- Assistant UI para el chatbot.
- Zustand y estado React local según el componente.
- Axios para consumir la API local.

### Backend

- Node.js 22 o superior.
- Express.
- TypeScript.
- SQLite con `better-sqlite3`.
- Vitest para pruebas.
- Nodemon y ts-node durante desarrollo.

### Integraciones

- AniList y fuentes de metadata de anime.
- LibreTranslate local opcional para traducción inglés-español.
- Ollama opcional para redacción/comprensión asistida, sin autorización de acciones.
- MangaDex como proveedor principal de manga.
- ZonaTMO y ShadeManga como proveedores secundarios aislados.
- El detalle online de manga se presenta en un `Modal`; la ficha se traduce mediante `translateTextForAnime` usando una clave `manga:<proveedor>:<id>` y la caché SQLite existente.
- MangaDex ofrece tags y filtros de género/tema; la búsqueda envía IDs oficiales con `includedTagsMode=AND`.
- `/manga/online/recent` carga muestras bajo demanda por proveedor. ShadeManga usa su endpoint de recientes y degrada a lista vacía si la fuente no lo expone.
- Las páginas online se transforman en enlaces temporales firmados por `mangaPageProxy.ts`; el proxy solo permite CDNs de los tres proveedores, valida HTTPS, tamaño y tipo MIME, y añade `Referer`.
- Proveedores de episodios externos detrás de adaptadores con validación de identidad.

## Estructura principal

```text
MapleVault/
|-- MapleVault.bat              Launcher de desarrollo y herramientas
|-- iniciar.bat                 Alias compatible del launcher
|-- package.json                Scripts de build, pruebas y distribución
|-- electron-builder.json       Configuración NSIS y archivos empaquetados
|-- app/
|   |-- backend/
|   |   |-- src/server.ts       API local Express
|   |   |-- src/database/       SQLite, migraciones y datos locales
|   |   |-- src/chatbot/        NLP local, memoria y acciones protegidas
|   |   |-- src/manga/          Adaptadores MangaDex, ZonaTMO y ShadeManga
|   |   |-- src/episodes/       Proveedores y playback de episodios
|   |   |-- src/translation/    Runtime e instalador de LibreTranslate
|   |   |-- src/routes/          Rutas HTTP del backend
|   |   `-- tests/               Tests unitarios, integración y estrés
|   |-- frontend/
|   |   |-- src/pages/           Vistas principales, incluida Manga.tsx
|   |   |-- src/components/      UI, chatbot y MangaReader
|   |   |-- src/services/api.ts  Cliente HTTP
|   |   `-- src/types.ts         Contratos de frontend
|   `-- desktop/
|       |-- electron/main.ts     Ciclo de vida, ventana y backend empaquetado
|       |-- electron/preload.ts  Puente IPC seguro
|       `-- assets/              Iconos, mascota y recursos de Electron
|-- docs/                        Documentación técnica y de fuentes
|-- scripts/                     Build, runtime y validación del instalador
`-- dist/                        Salida local generada; no debe versionarse
```

## Flujo crítico de anime

1. El usuario busca o abre una serie.
2. El frontend solicita metadata al backend.
3. El backend normaliza título, año, temporada, géneros y relaciones.
4. Los episodios se asocian a una identidad estable de serie y temporada.
5. Las fuentes externas se consultan mediante adaptadores aislados.
6. Antes de reproducir, se valida que el episodio pertenezca a la serie y temporada solicitadas.
7. El reproductor local recibe una URL validada y usa una capa de protección.

Nunca se deben aceptar episodios únicamente porque coincidan por texto parcial. Las coincidencias ambiguas deben descartarse o requerir una validación adicional.

## Flujo crítico de manga

1. El usuario selecciona el servidor: MangaDex, ZonaTMO o ShadeManga.
2. La vista debe mostrar búsqueda, filtros de género/tags y una muestra de obras recientes.
3. Al seleccionar una obra se abre un panel de detalle con portada, título, sinopsis, idioma, estado y capítulos.
4. La sinopsis pasa por la capa de traducción cuando está en inglés y LibreTranslate está disponible.
5. Los capítulos se solicitan bajo demanda y se ordenan numéricamente.
6. Las páginas se validan por host, protocolo, cantidad y orden.
7. El lector admite modo página o continuo, zoom, ajuste de ancho/página, brillo, fondo, dirección de lectura y pantalla completa.

El lector actual representa cada imagen como una página ordenada. No debe inventarse detección de paneles internos mediante recortes heurísticos porque puede romper la narración. Si se implementa visión por computadora en el futuro, debe ser opcional y reversible.

## Chatbot Maple Assistant

El chatbot separa siempre interpretación y ejecución:

```text
mensaje -> sanitización -> intención/entidades -> handler local -> confirmación -> acción SQLite -> auditoría
```

- Regex local es el comportamiento base.
- Ollama solo ayuda a interpretar o redactar a partir de datos verificados.
- Nunca puede ejecutar SQL ni acciones protegidas directamente.
- Agregar, eliminar, calificar o modificar estados requiere token de confirmación.
- Toda acción se registra en `assistant_prompt_runs`.
- Las respuestas de datos deben venir de SQLite o fuentes reales.
- `/ayuda` debe generarse desde `capabilities.ts`.

## Traducción

LibreTranslate es opcional por su peso. El runtime debe:

- detectar instalación automáticamente;
- iniciar sin bloquear la apertura de MapleVault;
- usar timeout y fallback al texto original;
- no mostrar errores técnicos al usuario;
- guardar cache de traducciones para no repetir solicitudes;
- registrar disponibilidad sin filtrar claves;
- traducir sinopsis y detalles de anime/manga del catálogo, búsquedas y paneles.

Si LibreTranslate no está disponible, el producto continúa funcionando y muestra claramente que el dato traducido no está disponible.

## Procesos de instalación y distribución

Desarrollo:

```powershell
npm install
npm run dev
```

Verificación completa:

```powershell
npm run check
```

Build del instalador:

```powershell
npm run dist:win
```

El proceso debe compilar frontend, backend y Electron, preparar `dist/backend-runtime`, verificar entradas y crear un único instalador NSIS. `dist/`, `app/backend/dist/`, `app/frontend/dist/`, logs, bases SQLite y temporales son artefactos generados y no deben subirse al repositorio.

El instalador de distribución debe ser el único `.exe` publicado. Las versiones anteriores no se deben copiar a la raíz. Para archivos mayores a 100 MiB, usar Git LFS o Release assets; la opción recomendada para usuarios finales es GitHub Release.

## Reglas de scraping y proveedores

- Respetar timeout, rate limit, backoff y cache TTL.
- No hacer scraping masivo en el hilo de UI.
- No confundir una obra relacionada con la serie solicitada.
- Validar título, año, temporada, slug e identidad de proveedor.
- Descartar capítulos sin identidad confiable.
- Aceptar solamente HTTPS y hosts permitidos.
- No ejecutar JavaScript remoto ni descargar ejecutables desde fuentes.
- Registrar errores de fuente sin bloquear toda la aplicación.
- Mostrar datos parciales cuando una fuente esté caída.

## Problemas históricos importantes

- AnimeAV1 devolvía capítulos de otra temporada o de obras relacionadas. La solución debe mantenerse basada en identidad de temporada y coincidencia estricta.
- Algunas fuentes devolvían URLs HLS o MP4 inválidas. Nunca se debe afirmar que un capítulo existe solo porque la ficha contiene un enlace.
- Scraping masivo bloqueaba la interfaz. El trabajo debe ejecutarse por lotes, con progreso y cancelación.
- LibreTranslate podía fallar por Python ausente, módulo incorrecto, modelo no instalado o puerto ocupado. El inicio debe degradar sin bloquear el backend.
- Instancias empaquetadas no deben reutilizar el puerto de desarrollo `5000`; deben usar puerto dinámico y token local.
- Las imágenes de capítulos no se cargan directamente desde el proveedor en el lector: el proxy firmado evita fallos por `Referer` y evita un SSRF abierto.
- Las instalaciones nuevas deben comenzar con catálogo, inicio y lista vacíos.
- La ventana secundaria y el chatbot no deben bloquear el cierre ni la minimización.

## Pruebas obligatorias antes de publicar

- `npm run typecheck`.
- `npm run typecheck:frontend`.
- `npm run lint:frontend`.
- `npm run test:backend`.
- Pruebas de rutas de manga, proveedores y capítulos.
- Pruebas de traducción disponible/no disponible.
- Pruebas de confirmación del chatbot.
- Prueba visual de selección de manga, detalle y lector.
- Prueba de clic LTR y RTL.
- Prueba de zoom y cambio de ajuste sin conflictos.
- Prueba de pantalla completa y salida.
- Prueba de ventana compacta.
- `npm run dist:win`.
- Verificación de hash del instalador.
- Comprobación de que no se subieron `dist/`, bases, logs ni temporales.

## Trabajo de esta fase

Esta fase debe implementar:

1. Panel de selección de manga similar al detalle de anime, con sinopsis y acceso a capítulos.
2. Traducción del panel mediante el servicio común de LibreTranslate.
3. Corrección del cálculo de zoom y separación entre modo página, modo ancho y modo continuo.
4. Navegación LTR/RTL sin invertir accidentalmente controles ni índice.
5. Diagnóstico y reparación del error de apertura de capítulos.
6. Búsqueda por géneros y tags inspirada en MangaDex, con allowlist de valores.
7. Obras recientes al entrar a cada proveedor, sin sincronización masiva automática.
8. Limpieza del proceso de empaquetado para distribuir un único instalador claro.

## Decisiones para continuar

- Preferir KISS y componentes pequeños.
- Mantener contratos HTTP compatibles.
- No borrar archivos dudosos sin referencias y pruebas.
- No añadir dependencias pesadas para resolver un problema simple.
- Separar metadata, capítulos, páginas, traducción y reproducción.
- No hacer que una fuente externa caída bloquee una vista local.
- Todo cambio de esquema debe tener migración reversible.
- Todo cambio de instalación debe probarse en Windows limpio.

## Checklist de entrega

- [x] Contexto actualizado.
- [x] Panel de detalle implementado.
- [x] Traducción integrada en el panel.
- [x] Tags/géneros integrados para MangaDex.
- [x] Recientes por proveedor integrados con degradación controlada.
- [x] Lector LTR/RTL y zoom existentes verificados; ahora recibe páginas protegidas por proxy.
- [x] Error de carga de páginas mitigado con proxy firmado y error/reintento visible.
- [x] Suite completa aprobada: 82 archivos y 671 pruebas.
- [x] Instalador único `MapleVault-Setup-1.0.15-x64.exe` generado.
- [ ] Artefactos `dist` excluidos del repositorio.
- [ ] Hash y Release verificados.
- [ ] Rama y commit informados.
