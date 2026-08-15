# MapleVault - Referencias de Proyectos, Fuentes y Ruta de Integración

## Objetivo

Este documento registra referencias externas revisadas para mejorar MapleVault sin romper su enfoque local-first. La prioridad es arquitectura, seguridad, rendimiento y preparación de manga. Las fuentes de episodios se aíslan detrás de adaptadores beta y nunca forman parte del dominio principal ni de los datos del usuario.

## Proyectos Revisados

| Proyecto | Enlace | Aporte útil para MapleVault | Riesgo |
|---|---|---|---|
| Seanime | https://github.com/5rahim/seanime | Media server anime/manga, desktop/web, AniList, marketplace de extensiones, offline mode, schedule, manga reader. | Alto si se imitan torrents, debrid o fuentes de streaming sin sandbox. |
| Shoko Server | https://github.com/ShokoAnime/ShokoServer | Matching local, organización de colección, integración con servidores multimedia y manejo de series sin archivos. | Medio/alto: AniDB y escaneo avanzado requieren límites y conocimiento operativo. |
| Mangayomi | https://github.com/kodjodevf/mangayomi | Lectura manga/anime, extensiones, backups, tracking AniList/MAL/Kitsu. | Alto si se importan proveedores no auditados. |
| Aniyomi | https://github.com/aniyomiorg/aniyomi | Ecosistema maduro de extensiones anime/manga, categorías, lector y reproductor configurables. | Alto: extensión externa sin sandbox puede romper seguridad. |
| Unyo | https://unyo.k3vinb5.dev/ | Desktop anime/manga, AniList/MAL, Aniyomi extensions, torrentio. | Alto por torrents/proveedores externos. |

## Funciones Integrables Priorizadas

1. **Capa formal de proveedores**: contratos separados para metadata, episodios, manga y fuentes inestables.
2. **Matching manual con confianza**: cola de series no reconocidas, aliases y overrides por temporada.
3. **Manga como dominio separado**: tablas, rutas y vista propia, sin mezclar capítulos con episodios.
4. **Fuente de metadata local/exportable**: JSON/NFO para backup y portabilidad.
5. **Airing schedule y capítulos perdidos**: usando metadata estable, no scraping frágil.
6. **Marketplace futuro de fuentes**: solo con sandbox, permisos, firma y auditoría.
7. **Integraciones externas opcionales**: servicios aislados de lectura/exportación, no como dependencia central.

## Fuentes y APIs Candidatas

### Metadata y tracking de bajo riesgo

| Fuente | Enlace | Uso recomendado |
|---|---|---|
| AniList | https://graphql.anilist.co | Metadata principal de anime/manga, temporadas, relaciones y búsqueda. |
| Jikan / MyAnimeList | https://api.jikan.moe/v4 | Fallback de metadata, MAL ID y puntuaciones. |
| Kitsu | https://kitsu.io/api/edge | Fallback de metadata y títulos alternativos. |
| MangaDex | https://api.mangadex.org | Candidato principal para manga por API pública, con rate limit e idioma. |

### Ecosistemas de extensiones

| Fuente | Enlace | Uso recomendado |
|---|---|---|
| Seanime Providers | https://github.com/Seanime-contributions/Seanime-Providers | Referencia de arquitectura de proveedores. No instalar directo. |
| Aniyomi | https://github.com/aniyomiorg/aniyomi | Referencia de marketplace/extensiones. No ejecutar código externo sin sandbox. |

### Fuentes en español ya conocidas o candidatas de alto riesgo

| Fuente | Enlace | Estado recomendado |
|---|---|---|
| AnimeAV1 | https://animev1.com | Mantener aislada, rate limit alto, validación fail-closed por MAL ID/título/año/formato. |
| TioAnime | https://tioanime.com | Fallback aislado; no bloquear UI si falla. |
| JKAnime | https://jkanime.net | Fallback aislado; validar identidad antes de guardar slug. |
| AnimeFLV | https://animeflv.net | Fallback aislado; tratar HTML como inestable. |

### Fuentes en inglés de alto riesgo operativo

| Fuente | Enlace | Estado recomendado |
|---|---|---|
| Gogoanime | https://gogoanime.by/ | Integrada como beta; búsqueda verificada por título y reproducción en ventana aislada. |
| Animepahe | https://animepahe.ch/ | Integrada como beta; índice de series cacheado y embeds externos aislados. Los episodios históricos pueden expirar. |
| Aniwaves | https://aniwaves.ru/home | Integrada como beta; solo se ofrece Vidplay/Echovideo en modo de ventana directa. Hosts incompatibles se descartan. |
| Aniwatch | https://aniwatch.co.at/ | Integrada como beta mediante sus rutas públicas de episodios y servidores. |
| Nyaa / Torrentio | Varios dominios | No integrar: MapleVault no implementa torrent ni magnets. |
| Consumet / Anify | Repos/APIs comunitarias | Mantener solo como referencia; no ejecutar servicios remotos de terceros dentro del core. |

## Selección Acotada de Nuevas Fuentes

La revisión del reproductor confirmó este contrato real: los embeds HTTPS, HLS y MP4Upload funcionan dentro de una sesión Electron efímera con el `Referer` de la página de episodio. Torrents y magnets no están implementados. MapleVault registra las cuatro fuentes solicitadas como beta y permite seleccionarlas desde la misma lista de fuentes de episodios.

| Prioridad | Integración | Idioma catalogado | Transporte | Estado verificado |
|---|---|---|---|---|
| 1 | Gogoanime | Inglés | Embed HTTPS anidado | Serie, episodios y video comprobados |
| 2 | Animepahe | Inglés | Blogger u host externo | Serie, episodios y reproductor vigente comprobados |
| 3 | Aniwaves | Inglés | Vidplay/Echovideo | Video comprobado en `direct-window` |
| 4 | Aniwatch | Inglés | VidSrc/MegaPlay | Serie, episodios y video comprobados |

Reglas comprobables del registro:

- Máximo cuatro integraciones adicionales.
- Las cuatro se catalogan como inglés y se distinguen visualmente de las fuentes españolas.
- Cada asociación serie-fuente se valida por títulos locales y se guarda en `anime_episode_sources`.
- Las listas de episodios se reutilizan durante 60 segundos, con un máximo de 128 entradas por proceso, para reducir solicitudes repetidas y riesgo de rate limit.
- Si una asociación guardada ya no coincide con el título o temporada local, se elimina solo esa relación regenerable y se vuelve a resolver antes de mostrar capítulos.
- Las URLs de catálogo deben pertenecer al dominio declarado por el adaptador.
- Los reproductores usan una partición Electron efímera, sin Node, sin permisos, sin descargas y sin popups.
- `direct-window` solo se admite para hosts verificados y limita la navegación principal al mismo origen.
- No se intenta evadir DRM, autenticación, CAPTCHA, Cloudflare ni políticas de origen; un host incompatible se omite.
- Ninguna fuente torrent puede declararse compatible mientras MapleVault no tenga un cliente aislado y auditado.
- Los proveedores comunitarios no se descargan ni ejecutan como extensiones de código remoto.

## Agentes y Subagentes en MapleVault

MapleVault usa agentes como perfiles de trabajo, no como framework pesado. Esto reduce tokens porque cada subagente tiene scope, guardrails y salida esperada:

- `security-reviewer`: seguridad, IPC, rutas, tokens, dependencias.
- `code-optimizer`: rendimiento, consultas, duplicación y limpieza segura.
- `scraping-analyst`: proveedores, rate limits, identidad y degradación.
- `chatbot-evaluator`: intents, memoria, capacidades y pruebas semánticas.
- `manga-planner`: expansión de manga sin mezclar dominio.
- `test-runner`: verificación reproducible.

Contrato consultable:

- `GET /system/agents`
- `GET /system/source-candidates`

## Preparación de Manga

Estado actual preparado:

- Tablas: `manga`, `manga_genres`, `manga_user_list`, `manga_chapters`, `manga_sources`.
- Rutas: `GET /manga`, `GET /manga/:id`, `GET /manga/sources`.
- Frontend: sección `Manga` en navegación principal.
- Proveedores: `MangaDex` es el principal; `ZonaTMO` y `ShadeManga` aportan catálogos públicos en español mediante adaptadores separados.

### Primera integración funcional

La primera integración funcional usa la [API oficial de MangaDex](https://api.mangadex.org/swagger.html) y su flujo MangaDex@Home para:

- buscar obras por título;
- mostrar sinopsis, portada, estado y año cuando están disponibles;
- listar capítulos únicamente en español e inglés;
- cargar páginas bajo demanda en el lector interno;
- empaquetar el capítulo solicitado como ZIP sin ejecutar código remoto;
- guardar el ZIP desde Electron en `Descargas/MapleVault/Mangas/<serie>`.

La API se consulta con límite de resultados, espera mínima entre solicitudes, validación de UUID, allowlist de hosts HTTPS y límites de páginas/tamaño. No se hace sincronización masiva ni se descarga una serie completa automáticamente.

La integración de [ZonaTMO](https://zonatmo.org/) usa un adaptador aislado con búsqueda, capítulos y páginas ordenadas por número. Sus identificadores son específicos de la fuente, las imágenes se limitan a su CDN HTTPS y las solicitudes se espacian para evitar saturación.

[ShadeManga](https://shademanga.com/) se integra mediante los endpoints JSON públicos utilizados por su propia aplicación web. El adaptador excluye contenido marcado para adultos, valida identificadores públicos, comprueba que las páginas pertenezcan a `cdn.shademanga.com` y conserva el orden numérico recibido. ManhwaWeb y NovelCool ES fueron retirados del registro y de la interfaz por requerir mecanismos de acceso más frágiles.

### Lector interno

El lector mantiene dos presentaciones sin alterar el orden entregado por cada proveedor:

- **Página:** muestra una imagen por vez. En la dirección predeterminada de izquierda a derecha, un clic en la mitad derecha avanza y un clic en la mitad izquierda retrocede. También admite flechas, `Page Up`, `Page Down`, espacio, inicio y fin.
- **Continuo:** conserva todas las páginas en una tira vertical con separación configurable y carga diferida después de las primeras imágenes.

La barra de herramientas incluye pantalla completa mediante Fullscreen API, zoom de 50 % a 250 %, ajuste a página o ancho, brillo, fondo, dirección de lectura, selector de página y descarga del capítulo. Las preferencias visuales se validan y persisten localmente bajo `maplevault:manga-reader-preferences:v1`; no se envían al proveedor ni se mezclan con la base de datos del catálogo.

El término "página" representa cada imagen ordenada del capítulo. Detectar paneles internos dentro de una imagen requeriría visión por computadora y no se simula con recortes heurísticos, porque podría alterar el orden narrativo.

Pendiente antes de scrapeo real:

1. Añadir persistencia de obras remotas importadas a `manga` con deduplicación por proveedor e ID externo.
2. Añadir paginación de capítulos para obras extensas y caché con TTL.
3. Agregar tests adversariales de capítulos equivocados, scanlators, idioma y series homónimas.
4. Añadir acciones protegidas del chatbot para lista de manga solo cuando el dominio esté estable.
5. Auditar manualmente cada fuente web antes de implementar un adaptador de lectura o descarga.

## Decisión Técnica

La ruta recomendada es seguir como gestor local-first con metadata fuerte y proveedores aislados. No conviene transformar MapleVault en un cliente de streaming/torrent generalista: aumenta riesgo legal, fragilidad operativa, carga de mantenimiento y peso del instalador.
