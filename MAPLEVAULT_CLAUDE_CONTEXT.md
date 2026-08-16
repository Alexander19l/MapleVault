# MapleVault: contexto de continuidad para Claude Code

## Propósito

MapleVault es una aplicación de escritorio local-first para administrar una biblioteca de anime y una sección independiente de manga. El objetivo principal es ofrecer catálogo, búsqueda online, scraping controlado, reproducción protegida, traducción local opcional y asistencia conversacional sin sacrificar estabilidad, privacidad ni mantenibilidad.

Este documento es el punto de entrada para continuar el desarrollo cuando una sesión de Codex termine. Debe actualizarse cuando cambien contratos, fuentes, procesos de instalación o decisiones de arquitectura.

## Estado de la versión

- Producto: MapleVault.
- Versión empaquetada actual: `1.0.16`.
- Repositorio: `https://github.com/Alexander19l/MapleVault`.
- Rama de trabajo publicada: `codex/safe-sqlite-restore`.
- Último checkpoint publicado antes de esta fase: commit `1628cfbd`; esta fase queda pendiente de publicar.
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

## Estado detallado de la fase de MangaDex

### Correcciones aplicadas

1. **Visualización de páginas**
   - El endpoint `GET /manga/online/chapters/:chapterId/pages` ahora convierte cada página en una URL absoluta del backend local.
   - La URL utiliza `mangaPageProxy.ts`, firma HMAC temporal y expiración de cinco minutos.
   - El proxy valida proveedor, HTTPS, host permitido y tipo MIME `image/*`.
   - El middleware de sesión permite únicamente esa ruta sin el header de sesión porque un elemento `<img>` no puede enviar el token HTTP; la firma temporal reemplaza ese header en este caso concreto.
   - No se debe convertir el proxy en una ruta genérica que acepte cualquier URL.

2. **Paginación de capítulos**
   - MangaDex usa páginas de 100 capítulos.
   - `MangaDexProvider.getChapters()` recorre offsets sucesivos hasta que una página contiene menos de 100 elementos o alcanza el máximo local de 2000 capítulos.
   - Se deduplican IDs antes de ordenar.
   - Solo se aceptan idiomas `es` y `en`, de acuerdo con la política del producto.
   - Si en el futuro se requieren otros idiomas, se debe cambiar explícitamente la política, el frontend y los tests; no eliminar el filtro silenciosamente.

3. **Filtros**
   - MangaDex recibe `includedTags[]`, `includedTagsMode=AND` y `status[]`.
   - Los valores de tags son IDs proporcionados por `/manga/tag`; nunca se deben enviar nombres libres del usuario directamente a la API.
   - El frontend limita a cuatro géneros y cuatro temas para evitar URLs excesivas y combinaciones que devuelvan cero resultados por accidente.
   - Las fuentes HTML secundarias pueden no soportar filtros. En ese caso la UI debe indicarlo y mantener la búsqueda por título.

### Pruebas añadidas

- Búsqueda con género, tema y estado; se valida el query enviado a MangaDex.
- Paginación de 125 capítulos simulando dos respuestas remotas.
- Verificación de que las páginas devueltas por el router son absolutas y apuntan a `/manga/online/page-proxy`.
- Suite dirigida actual: `2` archivos y `16` pruebas aprobadas.
- Suite histórica completa antes de esta fase: `82` archivos y `671` pruebas aprobadas. Debe volver a ejecutarse después de cada cambio de backend.

### Diagnóstico operativo del error de capítulos

Cuando el lector muestre una página vacía, revisar en este orden:

1. Network del proceso backend: `GET /manga/online/chapters/<id>/pages` debe responder `200` y una lista `pages` con URLs absolutas.
2. La URL debe contener `provider=mangadex`, `url`, `exp` y `sig`.
3. Abrir la URL en el mismo backend: `200`, `Content-Type: image/jpeg`, `image/png` o `image/webp`.
4. Si responde `403`, la firma expiró o fue alterada.
5. Si responde `502`, la CDN rechazó la solicitud, agotó el timeout o devolvió un MIME no visual.
6. Si capítulos antiguos no aparecen, comprobar que la respuesta remota tenga `offset=100`, `offset=200`, etc.; no aumentar el límite de una sola petición.

No se debe solucionar el problema desactivando la lista blanca, aceptando HTTP, quitando la comprobación MIME o cargando URLs arbitrarias desde el navegador.

## Contratos de la sección Manga

### Flujo de lectura

```text
Manga.tsx
  -> api.getMangaOnlinePages()
  -> GET /manga/online/chapters/:id/pages
  -> proveedor seleccionado
  -> validación y orden de páginas
  -> mangaPageProxy.ts
  -> MangaReader.tsx
```

El proveedor es responsable de descubrir y ordenar páginas. El router es responsable de seguridad y traducción de respuesta. El lector solo presenta imágenes; no debe conocer reglas de CDN ni scraping.

### Flujo de ficha y traducción

```text
selección de tarjeta
  -> GET /manga/online/:id/details
  -> proveedor.getDetails()
  -> translateTextForAnime(entityKey=manga:<provider>:<id>)
  -> caché anime_translations
  -> Modal de ficha
```

LibreTranslate es opcional. Si no está instalado o no responde, se conserva el texto original y el panel debe seguir siendo usable.

## Agentes y subagentes de desarrollo

MapleVault no debe delegar decisiones críticas a un agente generativo sin validación determinista. La división recomendada es por responsabilidad y evidencia:

| Agente | Responsabilidad | Herramientas permitidas | Salida obligatoria |
|---|---|---|---|
| `lead-architect` | Coordinar cambios, contratos y riesgos | Lectura de código, planes, revisión de diff | Plan, riesgos y archivos exactos |
| `manga-provider-auditor` | Revisar APIs, HTML, identidad y orden | Tests mock, fixtures, validadores | Fixture reproducible y matriz de campos |
| `manga-search-agent` | Filtros, tags, deduplicación y paginación | Solo APIs de proveedor y tests | Query normalizada y conteos |
| `manga-reader-agent` | Lector, zoom, dirección, errores de imagen | Frontend, Playwright, capturas | Evidencia visual y consola limpia |
| `scraping-safety-agent` | Rate limit, SSRF, hosts, MIME y límites | Revisión estática y tests de seguridad | Casos bloqueados y allowlist |
| `translation-agent` | LibreTranslate, caché y degradación | Servicio local y tests | Estado de traducción sin inventar texto |
| `performance-agent` | Memoria, carga, paginación y cache | Profiling y métricas | Antes/después cuantificable |
| `release-agent` | Build, instalador y artefactos | Scripts de packaging, hash, LFS | Instalador, hash y lista de archivos |
| `test-agent` | Ejecutar regresión y casos negativos | Vitest, ESLint, TypeScript, Playwright | Comandos, resultados y fallos |

### Reglas para reducir tokens y carga

- El agente líder debe leer primero contratos y tests relevantes, no todo el repositorio en cada tarea.
- Cada subagente recibe un alcance de archivos cerrado y devuelve un resumen estructurado.
- No usar Ollama ni un LLM para detectar tags, IDs, estado o URLs; esas tareas son deterministas.
- Cachear tags de MangaDex durante un TTL y no solicitarlos en cada tecla escrita.
- No traducir resultados masivos de búsqueda; traducir la ficha seleccionada y cachear por hash.
- Ejecutar proveedores en paralelo solo cuando no compartan una puerta de rate limit.
- Cancelar búsquedas anteriores en el frontend cuando el usuario cambia de proveedor o consulta.
- Entregar al agente líder únicamente diff, tests y logs relevantes; no pegar bases SQLite ni respuestas HTML completas.
- Toda salida generativa debe considerarse sugerencia hasta pasar validación de esquema y allowlist.

### Protocolo de delegación

1. `lead-architect` define objetivo, archivos permitidos y criterio de aceptación.
2. `manga-provider-auditor` aporta contrato o fixture antes de cambiar un adaptador.
3. `manga-reader-agent` implementa UI únicamente después de que el contrato de páginas esté estable.
4. `test-agent` ejecuta pruebas negativas y regresión.
5. `scraping-safety-agent` revisa cualquier URL, proxy, descarga o parser nuevo.
6. `release-agent` solo empaqueta después de typecheck, lint y suite completa.
7. El agente líder integra y documenta; ningún subagente publica directamente.

## Trabajo pendiente priorizado

### Prioridad alta

- Probar con respuestas reales de MangaDex varias obras largas y registrar el número de páginas de capítulos antes y después de la paginación.
- Añadir cache TTL para `/manga/tag` y evitar llamadas repetidas al cambiar de pestaña.
- Incorporar cancelación de requests en búsquedas y carga de recientes mediante `AbortController`.
- Añadir pruebas Playwright con un backend local mockeado para abrir una ficha, seleccionar un capítulo, cargar tres páginas y cambiar LTR/RTL.
- Medir el proxy con imágenes grandes y confirmar límites de memoria y `Content-Length`.

### Prioridad media

- Reemplazar la lista de capítulos completa por paginación visual o virtualización cuando supere 200 elementos.
- Agregar filtros de idioma visibles en la ficha en vez de mezclar idiomas sin explicación.
- Persistir el último proveedor, filtros y página de lectura sin guardar datos sensibles.
- Agregar cache HTTP controlada para portadas y recientes con límite de tamaño.
- Crear fixtures HTML versionados para ZonaTMO y tests de regresión cuando cambien selectores.

### Prioridad baja

- Permitir filtros combinados con grupos guardados por el usuario.
- Añadir historial de lectura de manga y reanudación por capítulo/página.
- Incorporar estadísticas de fuente: latencia, errores, capítulos encontrados y fecha de comprobación.
- Evaluar un adaptador de API de metadata independiente para enriquecer autores, artistas y relaciones.

## Checklist de aceptación de esta fase

- [x] MangaDex consulta offsets sucesivos.
- [x] Filtros de tags usan IDs oficiales y modo AND.
- [x] Estado se envía como `status[]`.
- [x] URLs del lector son absolutas y apuntan al backend.
- [x] El proxy no acepta dominios arbitrarios.
- [x] El proxy comprueba expiración y firma.
- [x] Tests dirigidos de MangaDex y rutas pasan.
- [ ] Prueba real con una obra MangaDex de más de 100 capítulos.
- [ ] Prueba real de las tres fuentes con CDN desde una instalación Windows limpia.
- [ ] Prueba visual automatizada de filtros y lector en escritorio y ventana compacta.
- [ ] Métrica de memoria durante carga de capítulo grande.

## Implementación 1.0.16: filtros, biblioteca local y lectura offline

Esta fase agrega un flujo completo para convertir una obra online en una entrada local sin
romper los proveedores existentes.

### Búsqueda por filtros y páginas

- La interfaz permite consultar por título, género/tag y estado sin exigir texto libre.
- MangaDex recibe los IDs oficiales de tags, `includedTagsMode=AND`, estados y `offset` por
  página. El frontend expone navegación anterior/siguiente y conserva `hasMore`.
- ZonaTMO conserva búsqueda por título y pasa la página como `_pg`; sus filtros quedan
  limitados por el contrato real de la fuente.
- ShadeManga dejó de depender de un endpoint de recientes que no existe en su web pública.
  Ahora inspecciona la portada, toma enlaces `/serie/<id>`, título y portada, deduplica y
  devuelve una muestra acotada. Si cambia el HTML, debe actualizarse el fixture y el parser.
- Los proveedores que no soporten filtros no deben fingir filtrado: la UI debe comunicar la
  limitación y mantener la búsqueda por título.

### Biblioteca local de manga

`POST /manga/library` valida proveedor, identificador externo, título y capítulos antes de
guardar. La operación registra metadata en `manga`, la relación del usuario en
`manga_user_list`, géneros en `genres`/`manga_genres` y capítulos en `manga_chapters`.

La UI muestra la biblioteca local en la página inicial de Manga, permite abrir la ficha local,
ver sinopsis y capítulos disponibles, y separa la ficha local de la ficha online. El contrato
actual usa `external_id` con afinidad numérica histórica; como una fuente puede usar UUIDs,
la migración futura recomendada es agregar `external_key TEXT` y conservar `external_id` para
compatibilidad.

### Descarga y lectura offline

- El proceso de descarga guarda el ZIP en `Downloads/MapleVault/Mangas/<serie>/`.
- Después de guardar, extrae imágenes permitidas (`png`, `jpg`, `jpeg`, `webp`, `gif`) en una
  carpeta hermana del capítulo.
- Hay límites de seguridad: 500 páginas por capítulo, 256 MiB descomprimidos y rechazo de
  rutas con `..` o fuera de la carpeta destino.
- El lector local carga las imágenes como data URLs y no habilita descarga duplicada.
- Ajustes abre directamente la carpeta de mangas descargados mediante IPC.

El retorno completo de páginas en base64 es intencionalmente acotado para esta primera fase,
pero no es la solución definitiva para capítulos muy grandes. La siguiente mejora debe ser
carga por página o streaming controlado para reducir el pico de memoria del proceso Electron.

### Pruebas ejecutadas en esta fase

- Suite backend completa: `82` archivos y `677` pruebas aprobadas.
- Suite dirigida de MangaDex, ShadeManga y rutas: `17` pruebas aprobadas.
- TypeScript backend, desktop y frontend: aprobado.
- ESLint frontend: aprobado.
- Instalador Windows x64 generado: `MapleVault-Setup-1.0.16-x64.exe`.
- SHA-256 del instalador: `D9E5925A5EB4AD9283A5BF424BB64117646AFEBF888AEA0C4EBD84AB0F9D9DF0`.

Estas pruebas son deterministas y usan contratos/fixtures. No deben presentarse como prueba
de disponibilidad permanente de MangaDex, ZonaTMO o ShadeManga. La aceptación final requiere
ejecutar una prueba manual o Playwright con red real, una instalación Windows limpia y una
obra con más de 100 capítulos.

### Guía de continuación para agentes

Antes de modificar un proveedor, el agente debe crear un fixture reproducible y demostrar el
contrato de identidad, idioma, capítulos y páginas. Antes de cambiar el lector debe preservar
el contrato `pages: string[]` y cubrir LTR/RTL, zoom, pantalla completa, errores y ventana
compacta. Antes de publicar, `test-agent` debe ejecutar la regresión completa y `release-agent`
debe verificar versión, contenido de `dist`, hash y LFS.

Ningún agente debe ejecutar descargas masivas, traducir resultados completos o enviar URLs
arbitrarias al navegador. Los cambios de scraping deben mantener límites, allowlist de hosts,
timeouts, deduplicación, orden estable y degradación sin bloquear la interfaz.
