---
tags: [bug, desktop, datos, prioridad-media]
prioridad: media
esfuerzo: bajo
actualizado: 2026-08-17
---

# BUG · La ruta de datos depende del layout de ejecución

## Síntoma

Existen **tres** árboles de datos en el repositorio:

| Ruta | Tamaño | Última modificación |
|---|---:|---|
| `app/data/` | 2 523 136 B | 2026-08-16 (vivo) |
| `app/app/data/` | 1 093 632 B | 2026-06-20 (congelado) |
| `data/` | solo `settings.json` | 2026-06-20 |

`app/app/data/` contiene además `settings.json`, `user_soul.json`, `bot_actions.log` y 4 backups
`.sqlite`: **datos personales reales abandonados**.

## Causa raíz, verificada

`app/desktop/electron/launcher.ts:51`:

```
dbDir = path.resolve(__dirname, '../../app/data');
```

El literal está escrito para el layout **compilado** y se rompe en el layout **fuente**:

| Ejecución | `__dirname` | Resultado |
|---|---|---|
| Compilada | `<repo>/dist/desktop` | `<repo>/app/data` — correcto |
| Desde fuente | `<repo>/app/desktop/electron` | `<repo>/app/app/data` — huérfano |

Y `launcher.ts:63-64` hace `fs.mkdirSync(dbDir, { recursive: true })`, así que el directorio
equivocado se crea solo.

El backend no tiene este problema: `database/db.ts:7` resuelve `app/data` correctamente en ambos
layouts porque su conteo de saltos cuadra desde `src/database` y desde `dist/database`. Son dos
resoluciones relativas independientes que discrepan según cómo se arranque.

## Nota

Los tres árboles están correctamente ignorados por git (`.gitignore:26,32`), así que **no hay
fuga de datos al repositorio**.

`app/app/data/` está congelado desde junio, así que probablemente corresponde a un layout de
arranque anterior. Conviene confirmar si aún se reproduce antes de dar el arreglo por cerrado.

## Corrección

Resolver la ruta de forma independiente del layout, por ejemplo desde `app.getAppPath()` o
buscando hacia arriba un marcador conocido, en vez de contar saltos relativos.

**No borrar `app/app/data/` sin revisar antes su contenido**: son datos reales del usuario.

## Enlaces

- [[desktop-electron]] · [[backend-base-de-datos]]
