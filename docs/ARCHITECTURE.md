# MapleVault Local - Arquitectura

## Vision General

MapleVault Local usa una arquitectura local de tres capas:

```text
Electron Main/Preload
        |
        v
React Renderer <-> Express API <-> SQLite
                         |
                         +-> Scraping / AniList / Traducción / Maple Assistant
```

El sistema está orientado a privacidad local: la base de datos vive en el equipo del usuario y solo se consulta internet cuando el usuario usa búsqueda, sincronización, scraping, traducción o IA local/remota configurada.

## Componentes

- `app/desktop/electron/main.ts`: ciclo de vida de Electron, backend embebido, IPC y ventanas.
- `app/desktop/electron/preload.ts`: API segura expuesta al renderer por `contextBridge`.
- `app/backend/src/server.ts`: API HTTP local.
- `app/backend/src/database/db.ts`: conexion SQLite, tablas y migraciones simples.
- `app/backend/src/database/backup.ts`: backups con `VACUUM INTO`.
- `app/backend/src/security`: validadores, sanitizacion y rate limiting.
- `app/backend/src/chatbot`: NLP, memoria, confirmaciones, capacidades y acciones del asistente.
- `app/backend/src/scraping`: AniList y fuentes externas.
- `app/frontend/src/services/api.ts`: cliente HTTP centralizado.

## Flujo del Chatbot

```text
Usuario escribe
  -> sanitizeChatInput
  -> parseIntent
  -> handleLocalIntent
  -> respuesta visual/opcional action
  -> registerPendingAction
  -> usuario confirma
  -> consumePendingAction
  -> executeChatbotAction
```

`actionExecutor.ts` actúa como despachador y frontera de seguridad. La lógica de dominio está separada en `libraryActionExecutor.ts`, `episodeActionExecutor.ts`, `statusActionExecutor.ts` y `syncActionExecutor.ts`.

Principio aplicado: el parser no ejecuta acciones; solo detecta intención. La ejecución pasa por una política de acciones permitidas y confirmación.

El contrato público del asistente se expone en `GET /chat/capabilities`. Ese endpoint debe actualizarse cada vez que se agregue una intención o acción nueva, porque funciona como inventario de funciones, política de seguridad y guía de uso para la UI y la documentación.

## Seguridad

- Prepared statements en SQLite.
- Validacion centralizada para IDs, payloads, filtros, anime y lista de usuario.
- Sanitizacion de contenido externo antes de persistir o responder.
- Confirmación obligatoria para acciones de escritura del asistente.
- Electron con `nodeIntegration: false`, `contextIsolation: true` y `sandbox: true`.
- Backups transaccionales mediante SQLite.

MapleVault no descarga episodios. La unica descarga prevista fuera de la
aplicacion es la distribucion del instalador desde el futuro portal web.

## Paginacion De Busquedas Online

Las busquedas del asistente usan un cursor remoto separado de los cursores
locales:

```text
consulta
  -> AniList Page(page, perPage)
  -> fallback Jikan si no hay resultados
  -> normalizacion y traduccion
  -> remote_search_cursor en SQLite
  -> pagina visible en Assistant UI
```

El cursor conserva consulta, proveedor, pagina y limites. El proveedor no
cambia a mitad de una navegacion. Se limita a 20 paginas y usa cache de cinco
minutos para reducir latencia y solicitudes repetidas.

## Deuda Tecnica Restante

- `server.ts` aun concentra demasiadas rutas; debe separarse en routes/services/repositories.
- Las fuentes de scraping dependen de HTML externo y deben aislarse tras una interfaz de provider.
- Conviene migrar validacion a esquemas compartidos con frontend si el proyecto crece.

## Rendimiento De Lecturas

Las pantallas Inicio, Catalogo y Temporadas usan respuestas acotadas:

- Las grillas de anime no incluyen sinopsis salvo que la vista de lista la solicite.
- Inicio, resumen de temporadas y recomendaciones usan cache breve invalidada
  cuando cambia el catalogo o la lista personal.
- Las recomendaciones agrupan generos en consultas SQL y evitan consultas N+1.
- Los indices compuestos `year + season + popularity` y
  `status + popularity + score` aceleran las rutas mas usadas tras scraping masivo.
