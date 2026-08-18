---
tags: [deuda, repositorio, prioridad-media]
prioridad: media
esfuerzo: alto
actualizado: 2026-08-17
---

# DEUDA · El repositorio pesa 1.1 GB

## Medición

| Qué | Tamaño |
|---|---:|
| `.git` completo | **1.1 GB** |
| `.git/objects` | 572 MB en 3 packfiles (405 + 109 + 54 MB) |
| Blob alcanzable más pesado | 3.8 MB (`maple-mascot-full.png`) |

## La discrepancia

Los objetos **alcanzables** desde cualquier rama no explican el tamaño: el mayor apenas llega a
3.8 MB y la suma de todos queda muy lejos de 572 MB. El peso está en objetos que ya no son
alcanzables pero siguen en los packfiles.

## Pista

Cinco commits añadieron instaladores al repositorio: `51223ab7` (*Publish Windows installer in
repository root*), `1628cfbd`, `bc9343a7`, `8c6d74ad` y `68456166`, cubriendo las versiones
1.0.14 a 1.0.18.

`.gitignore:16` incluye `*.exe`, pero una regla de ignorado **no afecta a archivos ya
rastreados**, así que se siguieron versionando.

Hoy hay además un `MapleVault-Setup-1.0.19-x64.exe` de 113 MB sin rastrear en la raíz.

## Antes de actuar

**Confirmar la causa exacta.** Reescribir historia (`filter-repo`, `gc --prune`) es destructivo e
irreversible sin copia, invalida todos los clones y no debe hacerse por corazonada.

Primer paso barato y seguro: `git count-objects -vH` y comprobar cuánto es *garbage* frente a
*in-pack*.

## Regla que ya está escrita en el proyecto

El instalador debe publicarse por **GitHub Release**, no en el árbol del repositorio. Para
archivos de más de 100 MiB, Release assets o Git LFS.

## Enlaces

- [[empaquetado-distribucion]]
