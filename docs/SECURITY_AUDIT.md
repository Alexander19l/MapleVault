# MapleVault Local - Auditoria de Seguridad

## Estado

La aplicacion es local-first y no expone un backend publico por defecto. Aun asi, debe tratar el renderer, datos importados, scraping y archivos locales como limites de confianza.

## Controles Implementados

- CORS restringido a origenes locales esperados.
- Limite de payload en Express.
- Rate limiting general y especifico para chat.
- Validacion de IDs, filtros, payloads, anime y lista de usuario.
- Sanitizacion de contenido externo y mensajes del chatbot.
- Logs del chatbot con datos sensibles enmascarados.
- Acciones de escritura del asistente protegidas por `confirmToken`.
- Backups SQLite con `VACUUM INTO`.
- Validacion de rutas para streaming de descargas y backups.
- Electron con `contextIsolation`, `sandbox` y `nodeIntegration` desactivado en la ventana principal.

## Riesgos Residuales

- El scraping depende de sitios externos y HTML cambiante.
- Los iframes de reproductores externos siguen siendo superficie de riesgo; deben mantenerse aislados y con adblock activo.
- `server.ts` aun mezcla responsabilidades y dificulta revisar permisos por modulo.
- La restauracion de backups requiere reinicio manual para garantizar estado limpio de SQLite.

## Recomendaciones

1. Separar backend en routes/services/repositories.
2. Definir contratos compartidos de API con schemas.
3. Agregar tests de contrato para acciones del chatbot.
4. Mantener builds, instaladores, SQLite, logs y backups fuera del repositorio.
5. Revisar periodicamente dependencias con `npm audit`.
