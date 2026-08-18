---
tags: [deuda, frontend, pruebas, prioridad-media]
prioridad: media
esfuerzo: medio
actualizado: 2026-08-17
---

# DEUDA · El frontend no tiene ni un test unitario

## Contraste

| Capa | Cobertura |
|---|---|
| Backend | 84 archivos de test (vitest) |
| E2E | 7 archivos (Playwright, solo Chromium) |
| **Frontend** | **cero tests unitarios** |

Lo único que cubre el frontend es `typecheck:frontend` y `lint:frontend`: verifican que compila y
que cumple el estilo, no que funcione.

## Qué habría detectado

Los cuatro bugs encontrados en esta inspección son exactamente el tipo que un test unitario
atrapa:

- [[BUG-busqueda-superior-inerte]] — un test de que teclear filtra la lista.
- [[BUG-tokens-button-inexistentes]] — un test de render de variantes.
- [[BUG-mylist-peticion-duplicada]] — un test que cuenta llamadas al cliente mockeado.
- [[BUG-modal-sin-focus-trap]] — un test de foco al abrir y cerrar.

## Propuesta

Vitest ya está en el proyecto (backend) y Vite lo integra sin fricción. Empezar por lo que más
rinde con menos esfuerzo:

1. `components/ui/` — son 6 primitivas pequeñas y son la base de todo lo demás.
2. `services/api.ts` — con el cliente axios mockeado, verificar que cada método pega en la ruta
   correcta.
3. Los reductores de estado que salgan al dividir `Settings.tsx` →
   [[DEUDA-componentes-gigantes]].

No perseguir un porcentaje de cobertura: perseguir los sitios donde un fallo pasa inadvertido.

## Enlaces

- [[pruebas-y-verificacion]] · [[DEUDA-sin-ci]] · [[DEUDA-desktop-sin-tests]]
