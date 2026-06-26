# Maple Assistant v2

Maple Assistant es el asistente local de MapleVault. Su responsabilidad es ayudar a buscar, revisar, recomendar y mantener la biblioteca sin inventar datos ni ejecutar escrituras sin confirmación.

## Principio Arquitectónico

Maple Assistant separa interpretación de ejecución:

```text
mensaje
  -> sanitizeChatInput
  -> parseIntent
  -> handleLocalIntent
  -> action opcional
  -> registerPendingAction
  -> executeChatbotAction
  -> auditoría
```

El motor NLP, sea regex u Ollama, solo determina intención y entidades. Las acciones reales pasan por `chatbot.ts`, que valida lista blanca, token de confirmación y auditoría.

## Identidad

- Nombre: Maple Assistant.
- Tono: cercano, breve y preciso.
- Política de datos: no inventa títulos, scores, episodios ni sinopsis.
- Fuentes válidas: SQLite local o proveedores externos reales.
- Feedback no crítico: toasts no bloqueantes.
- Decisiones del usuario: siempre en el hilo de chat.

## Intenciones Principales

El catálogo funcional vive en `app/backend/src/chatbot/nlpEngine.ts` como `INTENTS` y se expone mediante `GET /chat/capabilities`.

- `buscar_serie`: busca local primero y luego online si hace falta.
- `agregar_serie`: prepara importación y requiere confirmación.
- `ver_info_serie`: muestra ficha con datos reales.
- `ver_catalogo`: lista catálogo local con filtros básicos.
- `eliminar_serie`: prepara eliminación y requiere confirmación.
- `recomendar_series`: recomienda por género, historial y preferencias.
- `marcar_episodio_visto`: prepara el cambio de progreso de un episodio y requiere confirmación.
- `siguiente_episodio_pendiente`: consulta el siguiente episodio de las series en progreso.
- `ayuda`: genera ayuda desde capabilities.

## Memoria

La memoria usa SQLite mediante `assistant_memory`.

- Última búsqueda: persiste hasta 30 minutos.
- Referencias: permite comandos como `info el 2` o `agrega el 2`.
- Historial reciente de intenciones: guarda las últimas decisiones para diagnóstico.
- Preferencias: géneros, estudios, formatos, duración, tonos controlados y series concretas marcadas como gustadas o rechazadas.
- Perfil de gustos: `POST /chat/memory/profile` recalcula un perfil persistente desde SQLite.
- Rastro de usuario: `user_soul_profile`, `preference_trace` y `recommendation_hints` resumen géneros, estudios, formatos y pesos usados por recomendaciones.
- Archivo local: el perfil también se guarda como `app/data/user_soul.json` para inspección y recuperación.

## Busqueda

Orden de búsqueda:

1. SQLite local.
2. AniList.
3. Jikan / MyAnimeList.

Kitsu queda documentado como siguiente proveedor recomendado. No se usa como fuente primaria hasta que tenga integración y pruebas.

Los resultados se deduplican por título normalizado y año. Las fuentes online se guardan en la memoria reciente para resolver referencias posteriores.

## Recomendaciones

El recomendador local usa `app/backend/src/recommendations/scoring.ts` para calcular un ranking pragmático:

```text
score = género_match * 35
      + estudio_match * 12
      + formato_match * 8
      + duración_match * 8
      + serie_gustada * 20
      + tono_match * 14
      + user_score
      + score_publico * 2
      + popularidad_normalizada
      + bonus_estado_usuario
      - penalización_género_rechazado
      - penalización_estudio_rechazado
      - penalización_formato_rechazado
      - penalización_duración_rechazada
      - penalización_tono_rechazado
      - penalización_serie_rechazada
      - penalización_abandonado
```

Por defecto excluye series completadas y prioriza series locales. Si no hay datos suficientes, usa búsqueda online como punto de partida.

El ranking usa tres capas de preferencia:

1. Generos, estudio, formato, duración o tono pedidos en el mensaje actual.
2. Preferencias recordadas explicitamente por el usuario.
3. Series concretas marcadas como gustadas o rechazadas.
4. Tonos controlados como oscuro, emocional, relajado, accion intensa, comedia ligera, ritmo lento o romance.
5. Generos inferidos del perfil persistente de gustos.

El perfil no inventa gustos. Solo deriva pesos desde catálogo, lista personal, favoritos, abandonos y puntuaciones disponibles.

## Seguridad

Acciones protegidas:

- agregar serie
- eliminar serie
- resolver duplicados
- actualizar estado
- marcar episodios
- sincronizar metadatos

Toda acción protegida requiere token temporal de un solo uso. Si el token falta, expira o no coincide con la acción pendiente, la ejecución se rechaza.

## Auditoria

`assistant_prompt_runs` registra:

- prompt del usuario
- intención detectada
- entidades
- motor NLP usado: `regex` u `ollama`
- herramienta seleccionada
- si requirió confirmación
- estado de ejecución
- latencia
- error si existio

`GET /chat/actions/history` expone la auditoría reciente.

## Ollama

Ollama es opcional. Si está activo:

- Puede ayudar a interpretar lenguaje ambiguo.
- Puede redactar explicaciones sobre datos ya verificados.
- No puede ejecutar acciones.
- Si falla, el sistema vuelve al motor regex.

## Comandos De Ejemplo

```text
ayuda
busca naruto
busca frieren online
mi catálogo
info el 1
agrega el 2 a pendientes
elimina death note
recomendame algo de acción
recuerda que me gusta el género romance
prefiero series cortas
quiero algo oscuro sin romance
no quiero romance
me gustó death note
no me interesa frieren
no me recomiendes el 2
que recuerdas de mis gustos
marca el episodio 3 de Naruto como visto
siguiente capitulo pendiente
```

## Evaluacion De Prompts

Los prompts criticos viven en `app/backend/src/chatbot/evaluation/fixtures.ts`. Para proponer una mejora del chatbot:

1. Agregar un fixture con `prompt`, `expectedIntent`, `expectedEntities` y, si aplica, `forbiddenEntities`.
2. Ajustar `nlpEngine.ts` o el handler correspondiente.
3. Ejecutar `npm run test:chatbot`.
4. Mantener falsos positivos explicitos, por ejemplo titulos sueltos o frases como `borra mi busqueda anterior`.

## Reglas Para Nuevas Funciones

Cada nueva función debe actualizar:

1. `INTENTS` en `nlpEngine.ts`.
2. Parser regex y, si aplica, prompt de Ollama.
3. Handler en `localCommandHandler.ts`.
4. Accion permitida en `chatbot.ts` si modifica datos.
5. `capabilities.ts`.
6. Tests en `chatbot.test.ts`.
7. Documentación funcional.

No se acepta una función nueva si modifica datos sin confirmación o si depende de una fuente externa sin manejo de error.

## Actualización De Capacidades

Maple Assistant también soporta:

- Rangos estrictos de años, puntuación, episodios y duración.
- Décadas, estados de emisión y ordenamiento por nota o fecha.
- Búsqueda por estudio, staff, material de origen y etiquetas temáticas.
- Exclusión de franquicias y obras relacionadas en recomendaciones.
- Corrección controlada de referencias conocidas, sin generar títulos inventados.
- Cambio de estado a `on_hold` (Pausado).
- Calificación personal entre 0 y 10.
- Eliminación de la lista personal sin borrar el catálogo.
- Limpieza completa de la lista personal con token de confirmación.

Las preferencias explícitas contradictorias se resuelven por recencia: la última declaración elimina el valor opuesto antes de persistirse.

La regresión semántica principal está en `app/backend/src/chatbot/__tests__/semanticStress.test.ts`. Esta suite contiene más de 100 pruebas sobre filtros combinados, español/inglés, jerga, seguridad, memoria y acciones protegidas.
