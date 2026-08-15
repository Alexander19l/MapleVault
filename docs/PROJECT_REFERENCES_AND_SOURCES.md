# MapleVault - Referencias de Proyectos, Fuentes y Ruta de Integración

## Objetivo

Este documento registra referencias externas revisadas para mejorar MapleVault sin romper su enfoque local-first. La prioridad es arquitectura, seguridad, rendimiento y preparación de manga. Las fuentes de streaming o scraping quedan como candidatas desactivadas hasta una revisión técnica y legal.

## Proyectos Revisados

| Proyecto | Enlace | Aporte útil para MapleVault | Riesgo |
|---|---|---|---|
| Seanime | https://github.com/5rahim/seanime | Media server anime/manga, desktop/web, AniList, marketplace de extensiones, offline mode, schedule, manga reader. | Alto si se imitan torrents, debrid o fuentes de streaming sin sandbox. |
| Jellyfin | https://github.com/jellyfin/jellyfin | Patrón de servidor multimedia, API estable, plugins, metadata local, transcodificación/direct play. | Medio: su arquitectura completa sería sobreingeniería para MapleVault actual. |
| Shoko Server | https://github.com/ShokoAnime/ShokoServer | Matching local, organización de colección, integración con Plex/Jellyfin/Kodi, manejo de series sin archivos. | Medio/alto: AniDB y escaneo avanzado requieren límites y conocimiento operativo. |
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
7. **Integraciones externas opcionales**: Jellyfin/Shoko como lectura/exportación, no como dependencia central.

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

### Fuentes en inglés/multilenguaje de alto riesgo

| Fuente | Enlace | Estado recomendado |
|---|---|---|
| Nyaa | https://nyaa.si | No integrar al core; riesgo legal y operativo. |
| Torrentio | https://torrentio.strem.fun | Solo referencia arquitectónica; no activar por defecto. |
| GogoAnime / HiAnime / Aniwatch / Zoro | Varios dominios cambiantes | No integrar sin revisión legal, técnica y sandbox. |
| Consumet / Anify | Repos/APIs comunitarias | Evaluar solo como referencia; alto riesgo de cambios, rate limits y disponibilidad. |

## Selección Acotada de Nuevas Fuentes

La revisión del reproductor confirmó este contrato real: los embeds HTTPS están soportados, MP4 directo y HLS tienen compatibilidad parcial, y torrents o magnets no están implementados. Por estabilidad, MapleVault registra solo cinco integraciones adicionales y ninguna queda activa por defecto.

| Prioridad | Integración | Idioma catalogado | Transporte | Estado |
|---|---|---|---|---|
| 1 | Jellyfin local | Multilenguaje | MP4, HLS, archivos propios | Planificada; primera recomendada |
| 2 | Seanime local | Multilenguaje | Embed, MP4, HLS y torrent mediante servicio externo | Planificada como puente aislado |
| 3 | Google Drive privado | Multilenguaje | MP4 de archivos propios | Planificada; requiere OAuth seguro |
| 4 | AnimeHeaven Community | Inglés | MP4 directo | Solo investigación; alto riesgo |
| 5 | Nyaa Torrent Index | Inglés | Torrent | Solo investigación; reproductor no compatible |

Shoko no entra en estas cinco fuentes porque organiza y relaciona archivos, pero no es un proveedor de reproducción autónomo. Se conserva como referencia para matching y una futura integración con Jellyfin.

Reglas comprobables del registro:

- Máximo cinco integraciones adicionales.
- Máximo dos catalogadas como inglés.
- Todas desactivadas por defecto.
- Ninguna fuente torrent puede declararse compatible mientras MapleVault no tenga un cliente aislado y auditado.
- Los proveedores comunitarios no se ejecutan ni descargan como código remoto.

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
- Fuentes: `AniList Manga` y `MangaDex API` registradas desactivadas por defecto.

Pendiente antes de scrapeo real:

1. Definir contrato `MangaProvider`.
2. Elegir primera fuente estable, preferiblemente API pública.
3. Implementar rate limit, cache, deduplicación e idioma.
4. Agregar tests adversariales de capítulos equivocados, scanlators, idioma y series homónimas.
5. Agregar acciones protegidas del chatbot para lista de manga solo cuando el dominio esté estable.

## Decisión Técnica

La ruta recomendada es seguir como gestor local-first con metadata fuerte y proveedores aislados. No conviene transformar MapleVault en un cliente de streaming/torrent generalista: aumenta riesgo legal, fragilidad operativa, carga de mantenimiento y peso del instalador.
