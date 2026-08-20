---
tags: [decision, arquitectura, seguridad]
estado: vigente
actualizado: 2026-08-17
---

# ADR-001 · Aplicación local-first, sin backend público

## Contexto

MapleVault gestiona una biblioteca personal de anime y manga con scraping, reproducción y
asistencia conversacional. Podría haberse construido como servicio web con cuentas.

## Decisión

Es una aplicación de escritorio **local-first**. El backend Express corre en la máquina del
usuario, escucha solo en `127.0.0.1` (`server.ts:29`) y no se expone a la red. No hay cuentas,
no hay servidor remoto, y los datos viven en un SQLite local.

## Consecuencias

**A favor:** privacidad por defecto, cero coste de infraestructura, funciona sin conexión para
todo lo ya descargado, y el modelo de amenaza se reduce drásticamente.

**En contra:** el renderer, los datos importados, el scraping y los archivos locales siguen
siendo límites de confianza y hay que tratarlos como tales. La ausencia de un servidor no
elimina la necesidad de validar entrada.

**Derivadas:** no se usa `helmet` en el backend; la CSP se aplica en la capa Electron.
El rate limit no necesita discriminar por IP → [[ADR-007-rate-limit-por-ruta]].
La autenticación es un token de sesión local, no un sistema de usuarios →
[[ADR-003-puerto-dinamico-token-sesion]].

## Enlaces

- [[backend-server]] · [[desktop-electron]] · [[backend-seguridad]]
