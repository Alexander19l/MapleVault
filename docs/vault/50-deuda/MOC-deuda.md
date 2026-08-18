---
tags: [moc, indice, deuda]
actualizado: 2026-08-17
---

# MOC · Deuda y defectos

Todo lo pendiente, ordenado por prioridad. Volver a [[MOC-MapleVault]].

## Prioridad alta

| Nota | Tipo | Esfuerzo |
|---|---|---|
| [[DEUDA-sin-ci]] | Proceso | bajo |
| [[BUG-busqueda-superior-inerte]] | Defecto funcional | bajo |
| [[BUG-tokens-button-inexistentes]] | Defecto visual | bajo |
| [[BUG-modal-sin-focus-trap]] | Accesibilidad | bajo |
| [[DEUDA-waterfalls]] | Rendimiento | bajo |
| [[DEUDA-sin-cache-ni-abort]] | Arquitectura | medio |

Los cinco primeros son de esfuerzo bajo. Ese es el argumento para hacerlos ya.

## Prioridad media

| Nota | Tipo | Esfuerzo |
|---|---|---|
| [[BUG-ruta-datos-dependiente-layout]] | Defecto de configuración | bajo |
| [[BUG-mylist-peticion-duplicada]] | Rendimiento | bajo |
| [[BUG-sidebar-refetch-por-navegacion]] | Rendimiento | bajo |
| [[DEUDA-deriva-documentacion]] | Documentación | bajo |
| [[DEUDA-zustand-sin-usar]] | Dependencias | bajo |
| [[DEUDA-errores-silenciados-frontend]] | Observabilidad | medio |
| [[DEUDA-tests-frontend-ausentes]] | Pruebas | medio |
| [[DEUDA-desktop-sin-tests]] | Pruebas | medio |
| [[DEUDA-componentes-gigantes]] | Mantenibilidad | alto |
| [[DEUDA-repo-pesado]] | Repositorio | alto |

## Prioridad baja

| Nota | Tipo | Esfuerzo |
|---|---|---|
| [[DEUDA-codigo-muerto]] | Limpieza | bajo |
| [[DEUDA-sin-virtualizacion]] | Rendimiento | medio |
| [[DEUDA-tokens-diseno-inline]] | Mantenibilidad | alto |

## Dónde se concentra

Once de las diecinueve notas apuntan a [[frontend-app-estado]], [[frontend-capa-datos]] o
[[frontend-sistema-diseno]]. El frontend es la zona con más deuda del proyecto, y no por
casualidad: es la única capa sin tests.

Cuatro salen directa o indirectamente de [[ADR-005-sin-router-estado-en-app]].

## Regla

No mezclar deuda con funcionalidad en el mismo cambio. Cada nota de aquí debería poder cerrarse
por separado y verificarse por separado.
