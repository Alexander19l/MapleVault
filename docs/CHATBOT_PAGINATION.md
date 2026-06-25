# Paginacion Conversacional De Maple Assistant

Maple Assistant usa tres contextos paginados persistentes con TTL de 30 minutos:

- Catalogo local: reconstruye cada pagina desde SQLite usando filtros y offset.
- Resultados acotados: conserva hasta 32 resultados de busquedas, pendientes,
  completados y recomendaciones.
- Busqueda online: conserva consulta, proveedor y pagina; cada pagina se obtiene
  bajo demanda desde AniList o Jikan.

Cada pagina visible actualiza `last_search_results`. Por eso referencias como
`info el 2` siempre apuntan a la pagina que el usuario esta viendo.

## Comandos

- `ver mas resultados`: continua busquedas, pendientes, completados o recomendaciones.
- `ver mas series de mi catalogo`: continua explicitamente el catalogo.
- `mostrame mas series`: continua el unico contexto activo.
- `siguiente pagina`: continua el unico contexto activo.
- `pagina anterior`: vuelve dentro del unico contexto activo.
- `ir a la pagina 3`: abre una pagina concreta si existe.

Las tarjetas paginadas muestran controles compactos para retroceder, avanzar y
seleccionar una pagina. El backend valida el rango solicitado y actualiza
`last_search_results` con los elementos visibles.

Al iniciar una busqueda o recomendacion se invalida el cursor anterior del
catalogo. Al abrir el catalogo se invalida el cursor anterior de resultados.
Esto evita continuar accidentalmente una conversacion vieja.

## Limites

- Pagina de catalogo: 8 series.
- Pagina de resultados: 6 series.
- Resultados persistidos: maximo 32.
- Busqueda online: 6 resultados por pagina y maximo 20 paginas navegables.
- Cache online: 5 minutos y maximo 64 paginas recientes en memoria de proceso.
- TTL de referencias y cursores: 30 minutos.

AniList es la fuente primaria. Jikan funciona como fallback cuando AniList no
responde o no devuelve coincidencias. Una vez elegido el proveedor, el cursor
lo conserva durante toda la navegacion para evitar cambios de orden y
duplicados entre paginas.

## Pruebas

- `catalogPagination.test.ts`: paginas reconstruidas desde SQLite.
- `resultPagination.test.ts`: paginas acotadas y referencias visibles.
- `remoteSearchPagination.test.ts`: cursor remoto, limites y recuperacion.
- `onlineAnimeSearch.test.ts`: fallback de proveedor y cache.
- `capabilitiesHelp.test.ts`: variantes de lenguaje natural para navegar.
