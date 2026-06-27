# Ruta De Mejora Continua De Maple Assistant

Este documento define recomendaciones técnicas, pruebas y una ruta evolutiva para convertir Maple Assistant en un asistente local más útil sin romper MapleVault.

## Objetivo

Maple Assistant debe ayudar a buscar, organizar, recomendar y mantener la biblioteca. La regla base es local-first: usar primero SQLite y solo consultar internet cuando el usuario lo pida o cuando no haya suficiente contexto local.

## Estado Actual

Fortalezas:

- Parser local regex con fallback opcional a Ollama.
- Búsqueda local por título, género, temporada y año.
- Búsqueda online desde el asistente con AniList y Jikan como fuentes normalizadas.
- Memoria persistente de última búsqueda con TTL para referencias como `info el 2`.
- Perfil persistente de gustos generado desde SQLite en `assistant_memory` y `app/data/user_soul.json`.
- Ayuda dinámica generada desde `capabilities.ts`.
- Recomendaciones locales con scoring por géneros pedidos, géneros recordados y géneros inferidos.
- Motor `recommendations/scoring` separado del handler del chatbot y cubierto por pruebas unitarias.
- Acciones de escritura con confirmación por token.
- Auditoría en `assistant_prompt_runs` y `bot_actions.log`.
- Endpoint `GET /chat/capabilities` para inventario de funciones.

Limitaciones:

- Muchas intenciones existen en el parser pero no todas tienen handler completo.
- `SYNC_EPISODES`, ordenamiento y apertura de episodios requieren handlers
  completos antes de considerarlas capacidades habilitadas o cambiar su precedencia.
- El scoring ya está separado, pero todavía puede evolucionar con estudios, formatos, duración y feedback conversacional.
- Falta completar Kitsu como proveedor normalizado adicional.
- Suite E2E dedicada para flujos básicos del asistente implementada con backend mockeado; falta ampliarla a flujos de confirmación reales contra backend integrado.
- Integración HTTP del asistente cubierta para capabilities, propuesta de acción, ejecución con token y auditoría en SQLite.
- Feedback conversacional positivo/negativo implementado para géneros, estudios, formatos, duración, series concretas y tonos controlados; falta extenderlo a proveedores externos adicionales y evaluación automática de calidad de recomendaciones.

## Funciones Recomendadas

### Búsqueda Online Avanzada

- Buscar por título exacto y aliases.
- Buscar por género, año, temporada, formato y estado.
- Combinar proveedores: AniList primero, Jikan/Kitsu como fallback.
- Normalizar resultados a `NormalizedAnime`.
- Deduplicar por `external_id`, título normalizado, año y fuente.
- Mostrar confianza de coincidencia: exacta, probable, baja.
- Permitir importar uno o varios resultados con confirmación.

### Recomendaciones Por Genero

- Recomendar por género explícito: `recomendame acción`, `quiero romance`.
- Recomendar por combinaciones: `comedia romantica`, `fantasia oscura`, `slice of life tranquilo`.
- Excluir completados por defecto.
- Priorizar series en la biblioteca local antes de online.
- Explicar cada recomendación: género coincidente, score, popularidad, estado, duración.

### Recomendaciones Por Preferencias Del Usuario

- Guardar preferencias positivas: géneros, estudios, formatos, tonos controlados, duración y series concretas.
- Guardar preferencias negativas: géneros rechazados, tonos no deseados, series rechazadas, formatos no deseados.
- Usar feedback explícito: `me gustó`, `no me interesa`, `no recomiendes esto`.
- Crear score ponderado:

```text
score = género_match * 35
      + estudio_match * 12
      + formato_match * 8
      + duración_match * 8
      + serie_gustada * 20
      + tono_match * 14
      + user_score_similarity * 15
      + popularity_normalized * 10
      + freshness * 5
      - already_completed * 100
      - disliked_genre * 30
      - disliked_studio * 35
      - disliked_format * 25
      - disliked_duration * 12
      - disliked_tone * 28
      - disliked_anime * 200
```

### Asistencia De Biblioteca

- `que debería ver ahora`: recomendar según pendientes y duración.
- `tengo poco tiempo`: recomendar capítulos/series cortas.
- `continúa lo que estaba viendo`: listar siguiente episodio pendiente.
- `limpia duplicados`: vista previa, confirmación, ejecución.
- `actualiza metadatos de X`: sincronizar una serie puntual.
- `muestra series sin género/imagen/episodios`: diagnóstico de calidad de datos.
- `exporta resumen de mi biblioteca`: reporte local.

### Asistencia De Catálogo

- `busca estrenos de primavera 2026`.
- `importa los mejores de 2024`.
- `muestra películas de Studio Ghibli`.
- `busca animes parecidos a Frieren`.
- `muestra secuelas o películas relacionadas`.

### Explicabilidad

Cada recomendación debería incluir:

- Fuente: local, AniList, Jikan, Kitsu.
- Motivo: géneros, preferencias, historial, popularidad.
- Riesgo: datos incompletos, fuente externa, baja confianza.
- Accion disponible: importar, agregar a pendientes, abrir detalle.

## Arquitectura Recomendada

Separar el chatbot en capas:

```text
Chat UI
  -> /chat/message
  -> Intent Parser
  -> Intent Router
  -> Read Tools / Recommendation Service / Search Service
  -> Action Proposal
  -> Confirmation Token
  -> Action Executor
  -> Audit Log
```

Rutas internas sugeridas:

- `chatbot/intents`: catálogo tipado de intenciones.
- `chatbot/router`: decide que handler ejecutar.
- `chatbot/tools`: herramientas de lectura local/online.
- `chatbot/actions`: acciones de escritura confirmables.
- `recommendations/scoring`: motor de ranking explicable.
- `scraping/providers`: proveedores online normalizados.
- `chatbot/evaluation`: fixtures y pruebas de regresión de prompts.

## Matriz De Pruebas

### Unitarias

- Parser regex detecta intencion y entidades.
- Parser Ollama valida JSON y rechaza intenciones alucinadas.
- Sanitizacion limpia input y output.
- Recomendador ordena según pesos esperados.
- Deduplicador normaliza títulos equivalentes.
- Confirmaciones expiran y no permiten replay.

### Integración Backend

- `POST /chat/message` devuelve `visualData` para búsquedas.
- `POST /chat/message` propone acción pero no escribe sin token.
- `POST /chat/execute-action` rechaza acción desconocida.
- `GET /chat/capabilities` contiene toda acción permitida.
- Búsqueda online maneja proveedor caído sin romper respuesta.
- Importación online no duplica registros existentes.

### E2E Frontend

- Buscar online, importar y seguir escribiendo en inputs.
- Abrir detalle externo, importar y cerrar modal sin overlay residual.
- Confirmar acción del bot y verificar actualización en biblioteca.
- Cancelar acción del bot y verificar que no haya escritura.
- Chat abierto/cerrado no bloquea inputs de catálogo/settings.

### Regresion De Chatbot

Crear fixtures con frases reales:

- `busca naruto`
- `recomendame acción`
- `quiero algo corto de comedia`
- `no me recomiendes mecha`
- `me gustó death note`
- `no me interesa frieren`
- `no me recomiendes el 2`
- `quiero algo oscuro sin romance`
- `no quiero romance`
- `que sigo viendo`
- `sincroniza metadatos de frieren`
- `agrega dungeon meshi a pendientes`

Cada fixture debe validar:

- intent
- entities
- respuesta visible
- acción propuesta
- requiere confirmación
- no escritura accidental

## Roadmap Profesional

### Fase 1: Estabilizacion

- Eliminar diálogos nativos bloqueantes en flujos principales. Estado: implementado en importación online.
- Cubrir importacion online con prueba E2E. Estado: implementado.
- Agregar test de `GET /chat/capabilities`. Estado: implementado.
- Agregar suite E2E básica de Maple Assistant con backend mockeado. Estado: implementado.
- Agregar integración backend real para `/chat/message`, `/chat/execute-action` y `/chat/actions/history`. Estado: implementado.
- Corregir warnings de React hooks. Estado: implementado.
- Optimizar bundle frontend con code splitting por páginas, chat y markdown. Estado: implementado.
- Agregar movimiento visual sobrio en navegación, cambios de página, tabs, tarjetas y modales. Estado: implementado.
- Normalizar encoding UTF-8 en archivos fuente y documentación. Estado: implementado.

### Fase 2: Búsqueda Online Robusta

- Crear interfaz `AnimeProvider`.
- Formalizar AniList y Jikan como providers.
- Implementar Kitsu como provider adicional con pruebas.
- Agregar ranking de resultados.
- Agregar cache local con TTL.
- Mostrar fuente y confianza en UI.

### Fase 3: Recomendaciones Explicables

- Ampliar motor `recommendations/scoring`.
- Usar géneros favoritos, historial, abandonados y puntuaciones.
- Agregar feedback positivo/negativo desde chat. Estado: implementado para géneros, estudios, formatos, duración, series concretas y tonos controlados.
- Explicar cada recomendación.
- Validar con fixtures de ranking.

### Fase 4: Acciones Avanzadas Del Bot

- Agregar acciones puntuales: `add_to_plan`, `mark_episode_watched`, `sync_one`. `remember_dislike` ya está implementado como memoria conversacional no destructiva.
- Mantener todas las escrituras con token.
- Agregar historial de acciones visible en Settings con filtros por estado y confirmación. Estado: implementado.
- Permitir deshacer acciones donde sea posible.

### Fase 5: Evaluación Continua

- Dashboard local de intenciones desconocidas.
- Métricas: latencia, tasa de error, tasa de confirmación, acciones canceladas.
- Tests de regresión para prompts frecuentes. Estado: implementado con `chatbot/evaluation`.
- Matriz de fixtures para validar intención, entidades esperadas y falsos positivos. Estado: implementado.
- Dataset local de prompts anonimizados y revisados.

## Criterios De No Implementación

No agregar una función si:

- Ejecuta escrituras sin confirmación.
- Depende de una fuente externa sin fallback.
- No puede probarse con fixtures locales.
- Duplica una pantalla sin mejorar el flujo.
- Requiere credenciales o datos sensibles sin modelo de seguridad.

## Comandos De Validación

```bash
npm run typecheck
npm run typecheck:frontend
npm run test:backend
npm run test:chatbot
npm run test:security
npm run check
```

Para flujos visuales, usar Playwright contra `http://localhost:5173`.

## Avance Junio 2026

Completado:

- Separación de `actionExecutor.ts` en ejecutores de biblioteca, episodios, estados y sincronización.
- Payloads de acciones documentados mediante `ChatbotActionPayloadMap`.
- Búsqueda por rangos estrictos, décadas, estado de emisión, duración, staff y ordenamiento.
- Exclusiones por franquicia y obras relacionadas.
- Acciones protegidas para calificar, pausar, quitar de la lista y limpiar la lista personal.
- Resolución por recencia de preferencias explícitas contradictorias.
- Suite de estrés semántico con 103 pruebas nuevas.
- Suite backend completa: 284 pruebas aprobadas.

Siguiente prioridad:

1. Implementar preferencias temporales de sesión con TTL sin contaminar el perfil permanente.
2. Agregar exportación JSON del perfil y catálogo mediante una acción protegida.
3. Añadir tablas normalizadas para staff, etiquetas y origen; actualmente algunos filtros dependen de texto en sinopsis o proveedor online.
4. Implementar relaciones de franquicia por IDs externos en vez de depender solo de raíces textuales.
5. Eliminar los `any` restantes en la frontera dinámica de `actionExecutor.ts`; los ejecutores de dominio ya usan payloads específicos.
