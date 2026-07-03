import type { FC } from 'react';
import mapleLoadingMascot from '../../assets/maple-assistant-loading.png';

interface AssistantLoadingIndicatorProps {
  label?: string;
  compact?: boolean;
}

export const AssistantLoadingIndicator: FC<AssistantLoadingIndicatorProps> = ({
  label = 'Procesando y verificando tu solicitud...',
  compact = false
}) => (
  <div
    role="status"
    aria-live="polite"
    className={`maple-assistant-loading flex min-w-0 items-center ${
      compact ? 'gap-2 py-1' : 'gap-3 px-1 py-2'
    }`}
  >
    <div
      className={`maple-assistant-loading-visual relative grid shrink-0 place-items-center ${
        compact ? 'h-9 w-9' : 'h-12 w-12'
      }`}
      aria-hidden="true"
    >
      <span className="maple-assistant-loading-ring absolute inset-0 rounded-full border border-dashed border-[var(--accent-primary)]/70" />
      <img
        src={mapleLoadingMascot}
        alt=""
        draggable={false}
        className={`maple-assistant-loading-mascot object-contain ${
          compact ? 'h-7 w-7' : 'h-10 w-10'
        }`}
      />
    </div>
    <div className="min-w-0">
      <p className={`${compact ? 'text-[10px]' : 'text-xs'} truncate font-semibold text-[var(--text-main)]`}>
        Maple Assistant
      </p>
      <p className={`${compact ? 'text-[9px]' : 'text-[11px]'} leading-snug text-[var(--text-dim)]`}>
        {label}
      </p>
    </div>
  </div>
);
