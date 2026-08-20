/**
 * playerProtection.ts — Motor principal de protección del reproductor MapleVault
 * Integra Ghostery, reglas personalizadas, logging y configuración
 */
import { session, BrowserWindow, app, WebContents, ipcMain } from 'electron';
import fetch from 'cross-fetch';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import {
  AD_DOMAIN_BLACKLIST,
  AD_URL_PATTERNS,
  DEFAULT_WHITELIST,
  BLOCKED_RESOURCE_TYPES,
  SAFE_RESOURCE_TYPES,
} from './filterRules';
import {
  logBlockedEvent,
  getBlockedCount,
  getSessionLog,
  resetSessionStats,
  type BlockEventType,
} from './adblockLogger';

// ====== Estado global ======
let protectionEnabled = true;
let mainWindowRef: BrowserWindow | null = null;

export const PLAYER_SESSION_PARTITION = 'maplevault-player';

interface PlayerRequestContext {
  targetUrl: string;
  referer: string;
}

let playerRequestContext: PlayerRequestContext | null = null;
let playerRequestHeadersInstalled = false;
let playerSessionSafeguardsInstalled = false;

// Caches de dominios para búsqueda rápida O(1)
const blacklistSet = new Set(AD_DOMAIN_BLACKLIST);
const whitelistSet = new Set(DEFAULT_WHITELIST);

// ====== Utilidades de matching ======

/**
 * Comprueba si un hostname coincide con un dominio de la blacklist
 * Soporta subdominios: "ads.example.com" coincide con "example.com"
 */
function isBlacklistedDomain(hostname: string): boolean {
  if (blacklistSet.has(hostname)) return true;
  // Verificar subdominios
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (blacklistSet.has(parent)) return true;
  }
  return false;
}

/**
 * Comprueba si un hostname está en la whitelist
 */
function isWhitelistedDomain(hostname: string): boolean {
  if (whitelistSet.has(hostname)) return true;
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (whitelistSet.has(parent)) return true;
  }
  return false;
}

/**
 * Comprueba si una URL coincide con patrones publicitarios
 */
function matchesAdPattern(url: string): boolean {
  for (const pattern of AD_URL_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  return false;
}

/**
 * Determina si una solicitud debe ser bloqueada
 */
function shouldBlockRequest(url: string, resourceType?: string): boolean {
  return false; // Delegado a Ghostery
}

// ====== CSS para ocultar overlays y ads visuales ======
const ADBLOCK_CSS = `
  /* === MapleVault AdBlock CSS === */
  /* Overlays transparentes de captura de clics */
  /* :not(:has(...)) protege al reproductor: estas reglas son estructurales (solo miran
     z-index/position), así que sin el guardia ocultaban también la capa de controles de
     players legítimos y dejaban el video en negro. */
  div[style*="z-index: 2147483647"]:not(:has(video, iframe, canvas, object, embed)),
  div[style*="z-index: 999999"]:not(:has(video, iframe, canvas, object, embed)),
  div[style*="z-index: 99999"]:not(:has(video, iframe, canvas, object, embed)),
  div[style*="z-index: 9999"][style*="position: fixed"]:not(:has(video, iframe, canvas, object, embed)),
  div[style*="z-index: 9999"][style*="position: absolute"]:not(:has(video, iframe, canvas, object, embed)) {
    display: none !important;
    pointer-events: none !important;
  }
  /* iframes publicitarios vacíos o about:blank */
  iframe[src="about:blank"],
  iframe[src=""],
  iframe[width="0"],
  iframe[height="0"],
  iframe[style*="display: none"],
  iframe[style*="visibility: hidden"] {
    display: none !important;
  }
  /* Selectores comunes de publicidad */
  .popunder, .popup, #pop-up, .pop-up,
  .ad-overlay, .ad_overlay, #ad-overlay,
  .ad-container, .ad_container,
  .ads-container, .ads_container,
  [class*="popunder"], [class*="popup-ad"],
  [id*="popunder"], [id*="popup-ad"],
  [class*="ad-banner"], [class*="ad_banner"],
  [class*="overlay-ad"], [class*="overlay_ad"],
  div[class*="-ads-"], div[class*="_ads_"],
  div[id*="-ads-"], div[id*="_ads_"],
  .banner-ad, #banner-ad,
  /* Botones falsos de play */
  a[href*="/ads/"], a[href*="/adserver/"],
  a[onclick*="popunder"], a[onclick*="popup"],
  a[target="_blank"][rel*="nofollow"][style*="z-index"],
  /* Capas transparentes encima del video (nunca las que contienen el reproductor) */
  div[style*="opacity: 0"][style*="position: absolute"][style*="z-index"]:not(:has(video, iframe, canvas, object, embed)),
  div[style*="background: transparent"][style*="position: absolute"][style*="cursor: pointer"]:not(:has(video, iframe, canvas, object, embed)),
  a[style*="position: absolute"][style*="z-index"][style*="width: 100%"][style*="height: 100%"] {
    display: none !important;
    pointer-events: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    width: 0 !important;
    height: 0 !important;
  }
`;

// ====== JavaScript de limpieza inyectado ======
const ADBLOCK_JS = `
  (function() {
    // Bloquear window.open
    const originalOpen = window.open;
    window.open = function() {
      console.log('[MapleVault AdBlock] window.open bloqueado');
      return null;
    };

    // Interceptar document.createElement para bloquear iframes publicitarios dinámicos
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = function(tag) {
      const el = originalCreateElement(tag);
      if (tag.toLowerCase() === 'iframe') {
        const originalSetAttribute = el.setAttribute.bind(el);
        el.setAttribute = function(name, value) {
          if (name === 'src' && typeof value === 'string') {
            const blocked = ['doubleclick', 'googlesyndication', 'adservice',
              'popunder', 'popads', 'popcash', 'adsterra', 'exoclick',
              'trafficjunky', 'juicyads', 'propellerads'];
            const lower = value.toLowerCase();
            if (blocked.some(b => lower.includes(b))) {
              console.log('[MapleVault AdBlock] iframe bloqueado:', value.slice(0, 80));
              return;
            }
          }
          return originalSetAttribute(name, value);
        };
      }
      return el;
    };

    // Eliminar overlays sospechosos periódicamente.
    // IMPORTANTE: un contenedor de reproductor es un div posicionado y SIN texto (dentro
    // lleva un <video>, no palabras). Por eso "no tiene texto" no puede usarse como prueba
    // de que algo es publicidad: hacerlo borraba el reproductor cada 2 segundos y el
    // capitulo se quedaba congelado tras el primer fotograma. Ahora se exige una senal real
    // de capa transparente de clickjacking y nunca se toca nada que contenga o este dentro
    // de un reproductor.
    const MEDIA_SELECTOR = 'video, audio, iframe, canvas, object, embed';

    function holdsMedia(element) {
      return Boolean(element.querySelector(MEDIA_SELECTOR) || element.closest(MEDIA_SELECTOR));
    }

    function cleanOverlays() {
      const allDivs = document.querySelectorAll('div[style]');
      allDivs.forEach(div => {
        const style = div.getAttribute('style') || '';
        const isOverlay = style.includes('z-index') &&
          (style.includes('position: fixed') || style.includes('position: absolute')) &&
          (style.includes('width: 100%') || style.includes('inset: 0') || style.includes('top: 0'));
        const isTransparent = style.includes('opacity: 0') || style.includes('background: transparent');
        if (isOverlay && isTransparent && !holdsMedia(div)) {
          div.remove();
        }
      });
    }
    // Ejecutar limpieza cada 2 segundos
    setInterval(cleanOverlays, 2000);
    // También al cargar
    if (document.readyState === 'complete') cleanOverlays();
    else window.addEventListener('load', cleanOverlays);
  })();
`;

// ====== Inicialización del motor ======

/**
 * Inicializa el motor completo de protección del reproductor
 */
export async function initPlayerProtection(mainWindow: BrowserWindow | null): Promise<void> {
  mainWindowRef = mainWindow;
  console.log('[PlayerProtection] Inicializando sistema de protección del reproductor...');

  // 1. Instalar Ghostery Adblocker
  installPlayerSessionSafeguards();
  await installGhosteryAdblocker();

  // 2. Restaurar el origen requerido por reproductores que validan hotlinking.
  // Se registra aunque Ghostery no haya podido inicializarse.
  installPlayerRequestHeaders();

  // 3. Registrar protección global para nuevas WebContents (pop-ups y navegaciones extras)
  installWebContentsProtection();

  // 4. Registrar canales IPC para UI
  registerIPCHandlers();

  console.log('[PlayerProtection] Sistema de protección inicializado completamente.');
}

export function setPlayerProtectionMainWindow(mainWindow: BrowserWindow | null): void {
  mainWindowRef = mainWindow;
}

export function setPlayerRequestContext(context: PlayerRequestContext | null): void {
  playerRequestContext = context;
}

async function installGhosteryAdblocker() {
  try {
    const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    
    // IMPORTANTE: Electron < 34 no soporta registerPreloadScript, que es lo que 
    // Ghostery intenta usar para el filtrado cosmético. Como usamos Electron 30.5.1,
    // debemos desactivar loadCosmeticFilters para evitar el TypeError.
    // El bloqueo de RED seguirá funcionando al 100%, y nosotros usamos nuestro propio
    // script ADBLOCK_JS y ADBLOCK_CSS para lo cosmético.
    // @ts-ignore
    blocker.config.loadCosmeticFilters = false;
    
    blocker.enableBlockingInSession(session.defaultSession);
    const playerSession = session.fromPartition(PLAYER_SESSION_PARTITION);
    blocker.enableBlockingInSession(playerSession);
    console.log('[PlayerProtection] Ghostery Adblocker inicializado correctamente.');
    
    // Podemos seguir eliminando Referer manualmente para privacidad extra si se desea
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const { requestHeaders } = details;
      if (details.url && !details.url.includes('localhost')) {
        delete requestHeaders['Referer'];
        delete requestHeaders['X-Requested-With'];
      }
      callback({ requestHeaders });
    });
  } catch (err) {
    console.error('[PlayerProtection] Fallo al inicializar Ghostery:', err);
  }
}

function installPlayerRequestHeaders(): void {
  if (playerRequestHeadersInstalled) return;

  const playerSession = session.fromPartition(PLAYER_SESSION_PARTITION);
  playerSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    const context = playerRequestContext;

    // Solo la navegación inicial del iframe ('subFrame') lleva el Referer de la web de
    // anime, que es lo que esperan los reproductores con anti-hotlinking.
    // NO ampliar esto a xhr/fetch/media: esas peticiones (manifiesto y segmentos) las hace
    // el propio reproductor, y su Referer correcto es su propia página embed. Sobrescribirlo
    // con el de la web de anime hace que el CDN las rechace y el video quede en negro.
    if (context && details.resourceType === 'subFrame') {
      try {
        const requested = new URL(details.url);
        const target = new URL(context.targetUrl);
        if (requested.origin === target.origin) {
          requestHeaders.Referer = context.referer;
        }
      } catch {
        // La validación principal ya rechazó URLs malformadas.
      }
    }

    callback({ requestHeaders });
  });
  playerRequestHeadersInstalled = true;
}

function installPlayerSessionSafeguards(): void {
  if (playerSessionSafeguardsInstalled) return;

  const playerSession = session.fromPartition(PLAYER_SESSION_PARTITION);
  // 'fullscreen' es un permiso de Electron: denegarlo todo bloqueaba la pantalla completa
  // del reproductor antes incluso de que el proceso principal pudiera reaccionar. Se
  // permite solo ese, que no da acceso a datos ni hardware; el resto (cámara, micrófono,
  // geolocalización, portapapeles, USB...) sigue denegado.
  playerSession.setPermissionCheckHandler((_webContents, permission) => permission === 'fullscreen');
  playerSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'fullscreen');
  });
  playerSession.on('will-download', event => event.preventDefault());
  playerSessionSafeguardsInstalled = true;
}

/**
 * Instala interceptores a nivel de sesión (webRequest)
 */


/**
 * Instala protección para cada nuevo WebContents creado
 */
function installWebContentsProtection(): void {
  app.on('web-contents-created', (_event: Electron.Event, contents: WebContents) => {
    // Bloquear apertura de ventanas emergentes (pop-ups)
    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (!protectionEnabled) return { action: 'deny' as const };
      logBlockedEvent('BLOCKED_POPUP', url, disposition);
      return { action: 'deny' as const };
    });

    // Bloquear navegaciones fuera de la app en la ventana principal
    contents.on('will-navigate', (event, url) => {
      if (!protectionEnabled) return;
      try {
        const parsed = new URL(url);
        const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || url.startsWith('file://');

        if (contents === mainWindowRef?.webContents && !isLocal) {
          logBlockedEvent('BLOCKED_NAVIGATION', url);
          event.preventDefault();
        }
      } catch {
        event.preventDefault();
      }
    });

    // Bloquear redirecciones en cualquier WebContents
    contents.on('will-redirect', (event, url) => {
      if (!protectionEnabled) return;
      try {
        const parsed = new URL(url);
        if (isBlacklistedDomain(parsed.hostname) || matchesAdPattern(url)) {
          logBlockedEvent('BLOCKED_REDIRECT', url);
          event.preventDefault();
        }
      } catch {
        // Ignorar URLs malformadas
      }
    });

    // Inyectar CSS y JS de protección visual cuando un WebContents carga
    contents.on('dom-ready', () => {
      if (contents !== mainWindowRef?.webContents) {
        // Solo inyectar en iframes/webviews, no en la ventana principal
        contents.insertCSS(ADBLOCK_CSS).catch(() => {});
        contents.executeJavaScript(ADBLOCK_JS).catch(() => {});
      }
    });
  });
}

/**
 * Registra canales IPC para comunicación con el frontend
 */
function registerIPCHandlers(): void {
  // Toggle protección
  ipcMain.handle('adblock-toggle', (_event, enabled: boolean) => {
    protectionEnabled = enabled;
    console.log(`[PlayerProtection] Protección ${enabled ? 'ACTIVADA' : 'DESACTIVADA'}`);
    return { enabled: protectionEnabled };
  });

  // Resetear estadísticas
  ipcMain.handle('adblock-reset-stats', () => {
    resetSessionStats();
    return { success: true };
  });

  ipcMain.handle('adblock-get-stats', () => ({
    enabled: protectionEnabled,
    blockedCount: getBlockedCount(),
    blacklistDomains: blacklistSet.size,
    whitelistDomains: whitelistSet.size
  }));

  ipcMain.handle('adblock-get-log', () => getSessionLog());
}

/**
 * Verifica si la protección está activa
 */
export function isProtectionActive(): boolean {
  return protectionEnabled;
}
