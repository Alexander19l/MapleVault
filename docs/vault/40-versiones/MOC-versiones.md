---
tags: [moc, indice, version]
actualizado: 2026-08-17
---

# MOC · Versiones

La evolución del producto, extraída del monolito de contexto. Volver a [[MOC-MapleVault]].

| Versión | Tema | Módulos tocados |
|---|---|---|
| [[v1.0.16-filtros-biblioteca-offline]] | Filtros, biblioteca local y descarga offline | [[backend-manga]], [[desktop-electron]] |
| [[v1.0.17-lector-paginado]] | Carga paginada del lector offline | [[desktop-electron]], [[backend-manga]] |
| [[v1.0.18-almacenamiento-testeable]] | Extracción de la lógica de ZIP a módulo testeable | [[desktop-electron]], [[pruebas-y-verificacion]] |
| [[v1.0.19-lector-online-feed-sinopsis]] | Lector online, feed completo, sinopsis traducidas | [[backend-manga]], [[backend-traduccion]], [[frontend-sistema-diseno]] |

## La línea narrativa

Las cuatro versiones cuentan una sola historia: **convertir el manga online en manga leíble
offline sin abrir un agujero de seguridad**.

1. **1.0.16** abre el flujo completo, pero devuelve el capítulo entero en base64.
2. **1.0.17** corrige el coste en memoria con carga paginada.
3. **1.0.18** saca esa lógica de `main.ts` para poder probarla.
4. **1.0.19** cierra el lado online con la CSP y las firmas ajustadas.

El paso 3 es el que más conviene imitar: un refactor cuyo único objetivo era hacer testeable algo
que ya funcionaba. Ver [[DEUDA-desktop-sin-tests]].

## Pendientes arrastrados

Estos siguen sin marcar desde 1.0.16 y se mantienen en el roadmap:

- Prueba real con una obra de más de 100 capítulos.
- Prueba de las tres fuentes desde una instalación Windows limpia.
- Prueba visual automatizada de filtros y lector.
- Medición de memoria durante la carga de un capítulo grande.
