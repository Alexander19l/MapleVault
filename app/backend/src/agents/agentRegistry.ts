export type AgentRiskLevel = 'low' | 'medium' | 'high';

export interface SubagentProfile {
  id: string;
  label: string;
  purpose: string;
  scope: string[];
  riskLevel: AgentRiskLevel;
  tokenStrategy: string[];
  guardrails: string[];
}

export interface AgentSystemProfile {
  product: 'MapleVault';
  mode: 'local-development-support';
  leadAgent: {
    id: string;
    label: string;
    purpose: string;
  };
  tokenReductionPolicy: string[];
  subagents: SubagentProfile[];
}

export const MAPLEVAULT_AGENT_SYSTEM: AgentSystemProfile = {
  product: 'MapleVault',
  mode: 'local-development-support',
  leadAgent: {
    id: 'maplevault-architect',
    label: 'Arquitecto de MapleVault',
    purpose: 'Coordina decisiones, valida riesgos y fusiona resultados de subagentes sin romper contratos existentes.'
  },
  tokenReductionPolicy: [
    'Delegar tareas laterales y acotadas; mantener local el trabajo bloqueante.',
    'Compartir rutas y hallazgos concretos en lugar de volcar archivos completos.',
    'Usar snapshots de capacidades, diagnósticos y resultados de pruebas antes que logs extensos.',
    'Limitar cada subagente a rutas explícitas y salidas accionables.',
    'Evitar dependencias nuevas salvo que reduzcan complejidad real y tengan mantenimiento aceptable.'
  ],
  subagents: [
    {
      id: 'security-reviewer',
      label: 'Subagente de seguridad',
      purpose: 'Revisar sanitización, IPC, CORS, confirmaciones del chatbot, rutas y dependencias.',
      scope: ['app/backend/src/security', 'app/backend/src/routes', 'app/desktop/electron'],
      riskLevel: 'high',
      tokenStrategy: ['Buscar por superficies de entrada', 'Reportar archivo y línea', 'Evitar dumps de logs'],
      guardrails: ['No revelar secretos', 'No ejecutar cambios destructivos', 'No relajar confirmaciones de acciones']
    },
    {
      id: 'code-optimizer',
      label: 'Subagente de optimización',
      purpose: 'Detectar duplicación, consultas costosas, estados grandes y limpieza segura.',
      scope: ['app/backend/src', 'app/frontend/src'],
      riskLevel: 'medium',
      tokenStrategy: ['Priorizar hot paths', 'Medir antes de optimizar', 'Separar hallazgo de parche'],
      guardrails: ['No cambiar contratos públicos', 'No eliminar código dudoso', 'No agregar abstracciones innecesarias']
    },
    {
      id: 'scraping-analyst',
      label: 'Subagente de scraping avanzado',
      purpose: 'Validar proveedores, rate limits, identidad de episodios y degradación ante fallos externos.',
      scope: ['app/backend/src/scraping', 'app/backend/src/routes/episodeRoutes.ts', 'app/backend/src/routes/scrapingSyncService.ts'],
      riskLevel: 'high',
      tokenStrategy: ['Usar matrices de proveedor', 'Conservar muestras mínimas', 'Registrar razones de rechazo'],
      guardrails: ['No bypass de DRM', 'No scraping agresivo', 'Fail-closed cuando la identidad no esté verificada']
    },
    {
      id: 'chatbot-evaluator',
      label: 'Subagente de Maple Assistant',
      purpose: 'Fortalecer intents, memoria, capacidades, confirmaciones y pruebas semánticas.',
      scope: ['app/backend/src/chatbot', 'app/backend/src/chatbot/__tests__'],
      riskLevel: 'medium',
      tokenStrategy: ['Usar fixtures compactas', 'Agrupar falsos positivos', 'Citar intención y entidades esperadas'],
      guardrails: ['El parser no ejecuta acciones', 'Ollama no inventa datos', 'Toda escritura requiere token']
    },
    {
      id: 'manga-planner',
      label: 'Subagente de manga',
      purpose: 'Preparar el dominio manga sin mezclarlo con anime ni activar proveedores no revisados.',
      scope: ['app/backend/src/manga', 'app/backend/src/routes/mangaRoutes.ts', 'app/frontend/src/pages/Manga.tsx'],
      riskLevel: 'medium',
      tokenStrategy: ['Separar contrato de scraping', 'Reutilizar patrones de biblioteca', 'Mantener endpoints vacíos seguros'],
      guardrails: ['No ejecutar scraping hasta definir fuentes', 'No mezclar tablas anime/manga', 'No guardar páginas de capítulos sin validar fuente']
    },
    {
      id: 'test-runner',
      label: 'Subagente de verificación',
      purpose: 'Ejecutar typecheck, lint, pruebas y build con resultados reproducibles.',
      scope: ['package.json', 'app/backend/package.json', 'app/frontend/package.json', 'tests'],
      riskLevel: 'low',
      tokenStrategy: ['Reportar comandos y resumen', 'Incluir solo errores relevantes', 'No repetir salidas exitosas completas'],
      guardrails: ['No modificar archivos de producto', 'No limpiar artefactos fuera del workspace', 'No ocultar fallos']
    }
  ]
};

export function getMapleVaultAgentSystem(): AgentSystemProfile {
  return MAPLEVAULT_AGENT_SYSTEM;
}
