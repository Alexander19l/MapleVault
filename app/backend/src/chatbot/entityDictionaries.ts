import { escapeRegExp, normalizeEntityText } from './nlpText';

export interface EntityDefinition {
  value: string;
  aliases: readonly string[];
}

export const ANIME_GENRE_DEFINITIONS = [
  { value: 'action', aliases: ['accion', 'action', 'peleas', 'combates', 'batallas'] },
  { value: 'romance', aliases: ['romance', 'romantico', 'romantica', 'romantic'] },
  { value: 'comedy', aliases: ['comedia', 'comedy', 'humor', 'divertido', 'divertida'] },
  { value: 'drama', aliases: ['drama', 'dramatico', 'dramatica'] },
  { value: 'psychological', aliases: ['psicologico', 'psicologica', 'psychological'] },
  { value: 'sci-fi', aliases: ['sci-fi', 'sci fi', 'ciencia ficcion', 'science fiction'] },
  { value: 'adventure', aliases: ['aventura', 'aventuras', 'adventure'] },
  { value: 'ecchi', aliases: ['ecchi'] },
  { value: 'fantasy', aliases: ['fantasia', 'fantasy'] },
  { value: 'mahou shoujo', aliases: ['mahou shoujo', 'magical girl', 'chicas magicas', 'chica magica'] },
  { value: 'mecha', aliases: ['mecha', 'mechas', 'robots gigantes'] },
  { value: 'music', aliases: ['musica', 'musical', 'music'] },
  { value: 'mystery', aliases: ['misterio', 'mystery'] },
  { value: 'slice of life', aliases: ['slice of life', 'vida cotidiana', 'cotidiano', 'cotidiana'] },
  { value: 'sports', aliases: ['spokon', 'deportes', 'sports'] },
  { value: 'supernatural', aliases: ['sobrenatural', 'supernatural'] },
  { value: 'thriller', aliases: ['thriller', 'suspenso'] },
  { value: 'boys love', aliases: ['boys love', 'bl', 'yaoi'] },
  { value: 'girls love', aliases: ['girls love', 'gl', 'yuri'] },
  { value: 'gourmet', aliases: ['gourmet', 'cocina', 'comida'] },
  { value: 'award winning', aliases: ['premiado', 'premiada', 'award winning'] },
  { value: 'suspense', aliases: ['suspense', 'suspenso'] },
  { value: 'shounen', aliases: ['shounen', 'shonen'] },
  { value: 'seinen', aliases: ['seinen'] },
  { value: 'shoujo', aliases: ['shoujo', 'shojo'] },
  { value: 'horror', aliases: ['terror', 'horror'] },
  { value: 'josei', aliases: ['josei'] },
  { value: 'kids', aliases: ['kids', 'infantil', 'para ninos'] },
  { value: 'harem', aliases: ['harem'] },
  { value: 'martial arts', aliases: ['artes marciales', 'martial arts'] },
  { value: 'isekai', aliases: ['isekai'] },
  { value: 'dark fantasy', aliases: ['fantasia oscura', 'dark fantasy'] },
  { value: 'historical', aliases: ['historico', 'historica', 'historical'] }
] as const satisfies readonly EntityDefinition[];

export const ANIME_TAG_DEFINITIONS = [
  { value: 'cyberpunk', aliases: ['cyberpunk', 'distopia tecnologica', 'distopia cyberpunk'] },
  { value: 'technology', aliases: ['tecnologia', 'computadoras', 'ordenadores', 'terminales', 'terminal', 'informatica', 'technology'] },
  { value: 'hacking', aliases: ['hackers', 'hacker', 'hacking', 'hackeo', 'hackear'] },
  { value: 'vampire', aliases: ['vampiro', 'vampiros', 'vampire'] },
  { value: 'gore', aliases: ['gore', 'sangriento', 'sangre', 'violencia explicita'] },
  { value: 'dark fantasy', aliases: ['fantasia oscura', 'dark fantasy'] },
  { value: 'family', aliases: ['familiar', 'familia', 'family'] },
  { value: 'kids', aliases: ['kids', 'infantil', 'para ninos'] },
  { value: 'school', aliases: ['escuela', 'escolar', 'colegio', 'school'] },
  { value: 'samurai', aliases: ['samurai', 'samurais'] },
  { value: 'military', aliases: ['militar', 'militares', 'military'] },
  { value: 'historical', aliases: ['historico', 'historica', 'historical'] },
  { value: 'detective', aliases: ['detective', 'detectives', 'investigacion'] },
  { value: 'time travel', aliases: ['viajes en el tiempo', 'viaje en el tiempo', 'time travel'] },
  { value: 'space', aliases: ['espacio', 'space'] },
  { value: 'survival', aliases: ['supervivencia', 'survival'] },
  { value: 'organized crime', aliases: ['mafia', 'yakuza', 'crimen organizado', 'organized crime'] },
  { value: 'video game', aliases: ['videojuego', 'videojuegos', 'video game'] },
  { value: 'reincarnation', aliases: ['reencarnacion', 'reincarnation'] },
  { value: 'super power', aliases: ['superpoderes', 'super poderes', 'super power'] },
  { value: 'high stakes game', aliases: ['juego mortal', 'juegos mortales', 'high stakes game'] },
  { value: 'workplace', aliases: ['trabajo', 'oficina', 'workplace'] },
  { value: 'iyashikei', aliases: ['iyashikei', 'sanador', 'sanadora', 'relajante'] },
  { value: 'otaku culture', aliases: ['cultura otaku', 'otaku culture'] },
  { value: 'parody', aliases: ['parodia', 'parody'] },
  { value: 'racing', aliases: ['carreras', 'racing'] },
  { value: 'medical', aliases: ['medico', 'medica', 'hospital', 'medical'] },
  { value: 'idols', aliases: ['idol', 'idols'] },
  { value: 'pets', aliases: ['mascotas', 'pets'] },
  { value: 'mythology', aliases: ['mitologia', 'mythology'] },
  { value: 'intense action', aliases: ['mucha accion', 'harta accion', 'full accion', 'accion intensa'] },
  { value: 'highly rated', aliases: ['bravazo', 'bravo', 'epico', 'epica', 'joya', 'buenazo', 'chido', 'piola', 'mola', 'mole', 'mogollon'] },
  { value: 'no filler', aliases: ['sin relleno', 'sin nada de relleno', 'no filler'] },
  { value: 'elves', aliases: ['elfos', 'elfas', 'elves'] },
  { value: 'swords', aliases: ['espadas', 'swords'] },
  { value: 'tearjerker', aliases: ['hacer llorar', 'haga llorar', 'para llorar', 'tearjerker'] },
  { value: 'villain protagonist', aliases: ['protagonista sea un villano', 'villain protagonist'] },
  { value: 'cultivation', aliases: ['cultivo espiritual', 'cultivation'] },
  { value: 'edo period', aliases: ['periodo edo', 'edo period'] },
  { value: 'space western', aliases: ['space western', 'western espacial'] },
  { value: 'tournament arc', aliases: ['arco de torneo', 'tournament arc'] },
  { value: 'post apocalyptic', aliases: ['post apocaliptico', 'post apocalyptic'] },
  { value: 'gothic', aliases: ['gotico', 'gotica', 'gothic'] },
  { value: 'manga creation', aliases: ['hacer manga', 'creacion de manga', 'making manga', 'manga creation'] },
  { value: 'non humanoid protagonist', aliases: ['protagonista no humano', 'non humanoid mc', 'non humanoid protagonist'] },
  { value: 'battle', aliases: ['battle shonen', 'battle shounen'] },
  { value: 'serious', aliases: ['serio', 'seria', 'serious'] },
  { value: 'sword play', aliases: ['combates de espada', 'peleas de espada', 'sword fight', 'sword play'] },
  { value: 'reverse harem', aliases: ['harem invertido', 'reverse harem'] },
  { value: 'baseball', aliases: ['baseball', 'beisbol'] },
  { value: 'magic', aliases: ['magic', 'magia'] }
] as const satisfies readonly EntityDefinition[];

export function findDefinitionValues(
  normalized: string,
  definitions: ReadonlyArray<EntityDefinition>
): string[] {
  return definitions
    .filter(definition => definition.aliases.some(alias => {
      const normalizedAlias = normalizeEntityText(alias);
      return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedAlias)}([^a-z0-9]|$)`).test(normalized);
    }))
    .map(definition => definition.value);
}
