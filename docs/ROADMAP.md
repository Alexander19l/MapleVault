# MapleVault — Roadmap

**Actualizado:** 2026-08-17 · **Versión actual:** 1.0.19

Este roadmap no se inventó: se extrajo de `MAPLEVAULT_CLAUDE_CONTEXT.md` (secciones "Trabajo
pendiente priorizado", "Checklist de aceptación" y "Checklist de entrega") y se fusionó con los
hallazgos de la inspección del 2026-08-17.

El detalle de cada elemento está en `docs/vault/50-deuda/` y `docs/vault/60-seguridad/`.

---

## Ahora

Seis elementos. Cinco son de esfuerzo bajo — ese es el argumento para hacerlos ya.

| # | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| 1 | Configurar CI (`npm run check` en cada push) | 84 archivos de test que solo valen si alguien los ejecuta; `playwright.config.ts` ya espera `process.env.CI` | bajo |
| 2 | Arreglar la barra de búsqueda superior | Hoy teclear ahí no hace nada; `searchValue` no llega a ninguna página | bajo |
| 3 | Definir los tokens `--primary` y `--destructive` | `button.tsx` los usa y no existen: variantes con color indefinido | bajo |
| 4 | Focus trap en `Modal` | Es la base de todos los diálogos; un arreglo lo corrige en toda la app | bajo |
| 5 | `Promise.all` en `AdvancedSearch.tsx:85-111` | Búsqueda local y online son independientes y van en serie | bajo |
| 6 | `confirmToken` en las cuatro rutas destructivas | Asimetría con el chatbot, que sí lo exige (S1) | medio |

## Siguiente

| Qué | Por qué |
|---|---|
| Actualizar `axios` de forma aislada y verificar el scraping | Única dependencia directa vulnerable, en el camino real de datos (S6) |
| Versionado de esquema con `PRAGMA user_version` | Hoy los `ALTER TABLE` fallan en silencio; sin dependencias nuevas (S4) |
| Cache, deduplicación y `AbortController` en la capa de datos | Ya estaba en el roadmap original; Zustand ya está pagado y sin usar |
| Decidir sobre Zustand: adoptarlo o eliminarlo | Declarado y nunca importado; mantenerlo así es la peor opción |
| Sustituir `catch (_)` mudos y añadir handler de errores y 404 | Un fallo de acción confirmada desaparece sin rastro (S5) |
| Dividir `Settings.tsx` (1540 líneas) por sección | Refactor mecánico, riesgo bajo si se hace sección a sección |
| Primeros tests de frontend: `components/ui/` y `services/api.ts` | Cero cobertura hoy; los cuatro bugs de esta inspección se habrían detectado |
| Cablear los presets `scraping` y `search`, o eliminarlos | Definidos y muertos, dan falsa impresión de cobertura (S7) |
| Corregir la ruta de datos dependiente del layout | `launcher.ts:51` genera un árbol `app/app/data/` huérfano con datos reales |

## Después

| Qué | Condición |
|---|---|
| Virtualización de listados | **Solo tras medir.** Probar antes `React.memo` en `AnimeCard`, que es más barato |
| Historial de lectura de manga y reanudación por capítulo/página | Ya estaba en prioridad baja del roadmap original |
| Estadísticas por fuente: latencia, errores, capítulos, última comprobación | Ídem |
| Filtros combinados con grupos guardados por el usuario | Ídem |
| Paginación visual o virtualización de capítulos cuando superen 200 | Ídem |
| Filtros de idioma visibles en la ficha | Ídem |
| Persistir último proveedor, filtros y página de lectura | Sin guardar datos sensibles |
| Cache HTTP para portadas y recientes con límite de tamaño | Ídem |
| Fixtures HTML versionados para ZonaTMO | Para tests de regresión cuando cambien los selectores |
| Migrar `external_id` a `external_key TEXT` | Una fuente puede usar UUID; conservar `external_id` por compatibilidad |
| Adaptador de metadata independiente | Para enriquecer autores, artistas y relaciones |
| Investigar el peso del repositorio (1.1 GB) | **Confirmar la causa antes de tocar nada.** Reescribir historia es irreversible |
| Limpiar código muerto | `validateSafePath`, `downloads/`, `e2e/` vacíos |
| Reducir el consumo inline de tokens de diseño | 502 sustituciones; aplicar la regla en código nuevo, no migrar de golpe |

---

## Verificaciones manuales pendientes

Arrastradas desde 1.0.16 y nunca marcadas. Ninguna se puede automatizar del todo, y las cuatro
siguen abiertas:

- [ ] Prueba real con una obra de MangaDex de más de 100 capítulos.
- [ ] Prueba de las tres fuentes con CDN desde una instalación Windows limpia.
- [ ] Prueba visual automatizada de filtros y lector, en escritorio y ventana compacta.
- [ ] Medición de memoria durante la carga de un capítulo grande.

Y del checklist de entrega:

- [ ] Artefactos `dist` excluidos del repositorio.
- [ ] Hash y Release verificados.

## Cómo usar esto

Un elemento por cambio. No mezclar deuda con funcionalidad: cada línea de aquí debería poder
cerrarse y verificarse por separado.

Al cerrar un elemento, actualizar también la nota correspondiente del vault — el `estado` en el
frontmatter, no borrando la nota. El grafo debe conservar la historia.
