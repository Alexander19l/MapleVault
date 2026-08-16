import React from 'react';

export type EpisodeProviderId =
  | 'animeav1'
  | 'tioanime'
  | 'jkanime'
  | 'animeflv'
  | 'gogoanime'
  | 'animepahe'
  | 'aniwaves'
  | 'aniwatch';

export interface EpisodeProviderOption {
  id: EpisodeProviderId;
  label: string;
  language: 'es' | 'en';
  beta?: boolean;
}

export const EPISODE_PROVIDERS: EpisodeProviderOption[] = [
  { id: 'animeav1', label: 'AnimeAV1', language: 'es' },
  { id: 'tioanime', label: 'TioAnime', language: 'es' },
  { id: 'jkanime', label: 'JKAnime', language: 'es' },
  { id: 'animeflv', label: 'AnimeFLV', language: 'es' },
  { id: 'gogoanime', label: 'Gogoanime', language: 'en', beta: true },
  { id: 'animepahe', label: 'Animepahe', language: 'en', beta: true },
  { id: 'aniwaves', label: 'Aniwaves', language: 'en', beta: true },
  { id: 'aniwatch', label: 'Aniwatch', language: 'en', beta: true }
];

export function getEpisodeProvider(providerId: EpisodeProviderId): EpisodeProviderOption {
  return EPISODE_PROVIDERS.find(provider => provider.id === providerId) || EPISODE_PROVIDERS[0];
}

export const EpisodeLanguageFlag: React.FC<{
  language: 'es' | 'en';
  className?: string;
}> = ({ language, className = '' }) => (
  <span
    aria-label={language === 'es' ? 'Fuente en español' : 'Fuente en inglés'}
    role="img"
    className={`maple-source-flag maple-source-flag-${language} ${className}`.trim()}
  />
);

interface EpisodeProviderSelectProps {
  value: EpisodeProviderId;
  onChange: (provider: EpisodeProviderId) => void;
  actionLabel?: 'Fuente' | 'Buscar en' | 'Cambiar a';
  className?: string;
}

export const EpisodeProviderSelect: React.FC<EpisodeProviderSelectProps> = ({
  value,
  onChange,
  actionLabel = 'Fuente',
  className = ''
}) => {
  const selected = getEpisodeProvider(value);
  const renderOptions = (language: 'es' | 'en') => EPISODE_PROVIDERS
    .filter(provider => provider.language === language)
    .map(provider => (
      <option key={provider.id} value={provider.id}>
        {actionLabel}: {provider.label}{provider.beta ? ' (beta)' : ''}
      </option>
    ));

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`.trim()}>
      <EpisodeLanguageFlag language={selected.language} className="shrink-0" />
      <span className="w-5 shrink-0 text-[9px] font-black text-[var(--text-dim)]">
        {selected.language.toUpperCase()}
      </span>
      <select
        value={value}
        onChange={event => onChange(event.target.value as EpisodeProviderId)}
        aria-label="Fuente de episodios"
        className="min-w-0 flex-1 cursor-pointer rounded-lg border border-[var(--border-medium)] bg-[var(--bg-elevated)] px-2 py-2 text-[10px] font-bold text-[var(--text-main)] focus:border-[var(--accent-primary)] focus:outline-none"
      >
        <optgroup label="Fuentes en español">
          {renderOptions('es')}
        </optgroup>
        <optgroup label="Fuentes en inglés">
          {renderOptions('en')}
        </optgroup>
      </select>
    </div>
  );
};
