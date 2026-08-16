export type MangaProviderId = 'mangadex' | 'zonatmo' | 'shademanga';

export type MangaProviderStatus = 'active';

export interface MangaProviderDescriptor {
  id: MangaProviderId;
  label: string;
  baseUrl: string;
  languages: string[];
  status: MangaProviderStatus;
  enabled: boolean;
  notes: string;
}

const MANGA_PROVIDER_DESCRIPTORS: readonly MangaProviderDescriptor[] = [
  {
    id: 'mangadex',
    label: 'MangaDex',
    baseUrl: 'https://api.mangadex.org',
    languages: ['es', 'en'],
    status: 'active',
    enabled: true,
    notes: 'Proveedor principal mediante API pública; capítulos bajo demanda.'
  },
  {
    id: 'zonatmo',
    label: 'ZonaTMO',
    baseUrl: 'https://zonatmo.org',
    languages: ['es'],
    status: 'active',
    enabled: true,
    notes: 'Catálogo público en español con extracción limitada y ordenamiento local de capítulos.'
  },
  {
    id: 'shademanga',
    label: 'ShadeManga',
    baseUrl: 'https://shademanga.com/api',
    languages: ['es'],
    status: 'active',
    enabled: true,
    notes: 'Catálogo en español mediante los endpoints JSON públicos usados por su aplicación web.'
  }
];

const MANGA_PROVIDER_BY_ID = new Map(
  MANGA_PROVIDER_DESCRIPTORS.map(provider => [provider.id, provider])
);

export function getMangaProviderDescriptors(): MangaProviderDescriptor[] {
  return MANGA_PROVIDER_DESCRIPTORS.map(provider => ({
    ...provider,
    languages: [...provider.languages]
  }));
}

export function getMangaProvider(id: string | undefined): MangaProviderDescriptor | null {
  if (!id) return MANGA_PROVIDER_BY_ID.get('mangadex') || null;
  return MANGA_PROVIDER_BY_ID.get(id as MangaProviderId) || null;
}

export function isMangaProviderEnabled(id: string | undefined): boolean {
  return Boolean(getMangaProvider(id)?.enabled);
}
