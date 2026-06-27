# Traducción De Metadatos A Español

MapleVault integra una capa de traducción cacheada para mostrar sinopsis y metadatos auxiliares en español cuando las fuentes externas entregan información en inglés. La solución no reemplaza el texto original: conserva la metadata fuente y expone campos derivados para la UI.

## Objetivo

Mostrar descripciones en español latino neutro sin perder el texto original ni depender siempre de internet.

## Implementación Actual

El servicio se encuentra en `app/backend/src/translation/translationService.ts` y usa LibreTranslate mediante `POST /translate`.

```text
anime.synopsis original
  -> si ya parece español, no traducir
  -> si no es español, traducir con LibreTranslate
  -> guardar en anime_translations
  -> UI muestra synopsis_es si existe; si no, muestra synopsis original
```

La tabla `anime_translations` guarda `entity_key`, `field`, `source_hash`, `source_text`, `translated_text`, `provider`, `status` y timestamps. Esto permite regenerar traducciones si cambia el proveedor o la sinopsis original.

## Proveedores Sugeridos

### Opción Local Recomendada: LibreTranslate

LibreTranslate expone una API HTTP de traducción y puede ejecutarse self-hosted. Es la mejor opción para MapleVault si se quiere mantener la filosofía local-first.

Ventajas:

- Puede ejecutarse localmente.
- Encaja bien con un backend Express.
- Usa Argos Translate como motor.
- Permite cachear resultados en SQLite.

Desventajas:

- La calidad puede ser inferior a servicios pagos en textos complejos.
- Requiere instalar y mantener un servicio adicional.

### Opción Embebida/Offline: Argos Translate

Argos Translate es una librería offline basada en Python. Es útil si se quiere traducción sin servicio HTTP externo, pero aumenta la complejidad porque MapleVault es TypeScript/Electron.

Ventajas:

- Offline.
- Sin dependencia de API externa.

Desventajas:

- Integración más compleja desde Node/Electron.
- Requiere gestionar paquetes de idioma.

### Opción De Alta Calidad: DeepL API

DeepL suele dar mejores traducciones, pero requiere API externa y credenciales.

Ventajas:

- Mejor calidad general.
- API documentada y estable.

Desventajas:

- No es local-first.
- Tiene costo/limites.
- Requiere gestionar clave API de forma segura.

## Configuracion

En Ajustes > Traducción de Metadata se puede configurar:

```text
Activar traducción con LibreTranslate
Iniciar LibreTranslate automáticamente junto con MapleVault
URL de LibreTranslate
API key opcional
Timeout
Cache SQLite
Traducir sinopsis
Traducir géneros
Traducir estados
```

Por defecto MapleVault usa `http://localhost:5001` para no chocar con el backend local, que corre en `http://localhost:5000`.

También se puede configurar por entorno:

```text
LIBRETRANSLATE_URL=http://localhost:5001
LIBRETRANSLATE_API_KEY=
LIBRETRANSLATE_TIMEOUT_MS=5000
LIBRETRANSLATE_ENABLED=true
LIBRETRANSLATE_AUTOSTART_COMMAND=
```

## Ejecución Recomendada De LibreTranslate

LibreTranslate es opcional porque Python, el servicio y los modelos pueden ocupar varios cientos de MB. En Windows se puede preparar de dos formas:

1. Marcar **Instalar LibreTranslate junto con MapleVault** durante la instalación.
2. Abrir **Ajustes > Traducción de metadata** y pulsar **Instalar LibreTranslate**.

Ambas rutas usan el mismo script y guardan el runtime por usuario en:

```text
%LOCALAPPDATA%\MapleVault\libretranslate\.venv
```

La instalación desde Ajustes se ejecuta en segundo plano y expone progreso mediante:

```text
POST /translation/install
GET  /translation/install/status
GET  /translation/status
```

El proceso solo se considera correcto después de iniciar LibreTranslate y comprobar que `GET /languages` incluye un modelo con destino `es`. Un fallo del componente opcional no bloquea la instalación ni el uso del resto de MapleVault.

En desarrollo se conserva la ruta compatible:

```text
app/data/libretranslate/.venv
```

Para prepararla, abre `MapleVault.bat` y selecciona `[5] Preparar LibreTranslate`. MapleVault busca ambas ubicaciones y luego intenta el comando `libretranslate` disponible en `PATH`. Si se quiere forzar un comando propio, usar `LIBRETRANSLATE_AUTOSTART_COMMAND`.

Si aparece un error HTTP 400 con el mensaje `es is not supported`, el servicio está iniciado pero no tiene instalado el modelo hacia español. Reintenta la instalación desde Ajustes para instalar `translate-en_es`.

Si prefieres Docker, puedes ejecutar manualmente:

```bash
docker run -it --rm -p 5001:5000 libretranslate/libretranslate
```

## Superficies Cubiertas

- Catálogo local: `GET /anime`.
- Detalle de serie: `GET /anime/:id`.
- Mi lista: `GET /user-list`.
- Búsqueda online: `GET /search`.
- Recomendaciones: `GET /recommendations`.
- Resultados visuales y comando `info` de Maple Assistant.

## Regla De Calidad

Nunca borrar ni sobrescribir la sinopsis original. La traducción debe ser una vista cacheada, no la fuente primaria de datos.
