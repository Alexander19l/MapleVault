import { toneTagLabel } from '../recommendations/toneTags';
import { uniqueToneTags } from './animeResultUtils';
import type { ChatResponse } from './chatResponse';
import {
  addDislikedAnimeFeedback,
  addDislikedEpisodeLength,
  addDislikedFormat,
  addDislikedGenre,
  addDislikedStudio,
  addDislikedToneTag,
  addFavoriteFormat,
  addFavoriteGenre,
  addFavoriteStudio,
  addFavoriteToneTag,
  addLikedAnimeFeedback,
  getRecommendationMemoryPreferences,
  setPreferredEpisodeLength,
  setPreferredEraPreference
} from './memory';
import { resolveReferenceOrTitle } from './referenceResolver';
import type { NLPResult } from './types';

export async function handleRememberPreference(entities: NLPResult['entities']): Promise<ChatResponse> {
  const notes: string[] = [];
  const animeReference = entities.refIndexOrTitle || entities.animeTitle || entities.query;

  if (animeReference) {
    const target = await resolveReferenceOrTitle(animeReference);
    if (target) {
      const stored = await addLikedAnimeFeedback(target);
      notes.push(`serie ${stored?.title || target.title}`);
    } else if (!entities.genre && !entities.studio && !entities.format && !entities.durationPreference && !entities.toneTags?.length && !entities.dislikedToneTags?.length) {
      return { text: 'No pude resolver esa serie. Busca primero y luego dime "me gustó el 1", o escribe un título más específico.' };
    }
  }

  if (entities.genre) {
    await addFavoriteGenre(entities.genre);
    notes.push(`género ${entities.genre}`);
  }
  if (entities.studio) {
    await addFavoriteStudio(entities.studio);
    notes.push(`estudio ${entities.studio}`);
  }
  if (entities.format) {
    await addFavoriteFormat(entities.format);
    notes.push(`formato ${entities.format}`);
  }
  if (entities.durationPreference) {
    await setPreferredEpisodeLength(entities.durationPreference);
    notes.push(`duración ${entities.durationPreference}`);
  }
  if (entities.year_from && entities.year_to) {
    await setPreferredEraPreference(entities.year_from, entities.year_to, 1);
    notes.push(`época ${entities.year_from}-${entities.year_to}`);
  }

  const preferredToneTags = uniqueToneTags(entities.toneTags);
  for (const tag of preferredToneTags) {
    await addFavoriteToneTag(tag);
    notes.push(`tono ${toneTagLabel(tag)}`);
  }

  if (notes.length > 0) {
    return { text: `Anotado. Voy a priorizar ${notes.join(', ')} en futuras recomendaciones.` };
  }

  return {
    text: 'Puedo recordar preferencias si me mencionas un género, estudio, formato, duración o tono. Por ejemplo: "prefiero series cortas" o "me gusta algo oscuro".'
  };
}

export async function handleRememberDislike(entities: NLPResult['entities']): Promise<ChatResponse> {
  const notes: string[] = [];
  const animeReference = entities.refIndexOrTitle || entities.animeTitle || entities.query;

  if (animeReference) {
    const target = await resolveReferenceOrTitle(animeReference);
    if (target) {
      const stored = await addDislikedAnimeFeedback(target);
      notes.push(`serie ${stored?.title || target.title}`);
    } else if (!entities.genre && !entities.studio && !entities.format && !entities.durationPreference && !entities.toneTags?.length && !entities.dislikedToneTags?.length) {
      return { text: 'No pude resolver esa serie. Busca primero y luego dime "no me recomiendes el 1", o escribe un título más específico.' };
    }
  }

  if (entities.genre) {
    await addDislikedGenre(entities.genre);
    notes.push(`género ${entities.genre}`);
  }
  if (entities.studio) {
    await addDislikedStudio(entities.studio);
    notes.push(`estudio ${entities.studio}`);
  }
  if (entities.format) {
    await addDislikedFormat(entities.format);
    notes.push(`formato ${entities.format}`);
  }
  if (entities.durationPreference) {
    await addDislikedEpisodeLength(entities.durationPreference);
    notes.push(`duración ${entities.durationPreference}`);
  }

  const dislikedToneTags = uniqueToneTags([...(entities.dislikedToneTags || []), ...(entities.toneTags || [])]);
  for (const tag of dislikedToneTags) {
    await addDislikedToneTag(tag);
    notes.push(`tono ${toneTagLabel(tag)}`);
  }

  if (notes.length > 0) {
    return { text: `Entendido. Voy a evitar ${notes.join(', ')} cuando haya alternativas.` };
  }

  return {
    text: 'Dime qué quieres evitar: género, estudio, formato, duración o tono. Por ejemplo: "no me recomiendes mecha" o "no quiero romance".'
  };
}

export async function handleRecallPreference(): Promise<ChatResponse> {
  const prefs = await getRecommendationMemoryPreferences();
  const preferredEraLabels = Object.entries((prefs as any).preferredEras || {})
    .map(([era, value]: [string, any]) => `${era} (${value.year_from}-${value.year_to})`);
  const parts = [
    prefs.favoriteGenres.length > 0 ? `géneros: **${prefs.favoriteGenres.join(', ')}**` : '',
    prefs.favoriteStudios.length > 0 ? `estudios: **${prefs.favoriteStudios.join(', ')}**` : '',
    prefs.favoriteFormats.length > 0 ? `formatos: **${prefs.favoriteFormats.join(', ')}**` : '',
    prefs.favoriteToneTags.length > 0 ? `tonos: **${prefs.favoriteToneTags.map(toneTagLabel).join(', ')}**` : '',
    prefs.dislikedToneTags.length > 0 ? `tonos a evitar: **${prefs.dislikedToneTags.map(toneTagLabel).join(', ')}**` : '',
    prefs.preferredEpisodeLength !== 'desconocido' ? `duración: **${prefs.preferredEpisodeLength}**` : '',
    preferredEraLabels.length > 0 ? `épocas: **${preferredEraLabels.join(', ')}**` : ''
  ].filter(Boolean);

  if (parts.length > 0) {
    return { text: `Recuerdo estas preferencias: ${parts.join('; ')}.` };
  }

  return {
    text: 'Aún no me has dicho preferencias concretas. Puedes decir: "prefiero series cortas", "me gusta el estudio madhouse" o "quiero algo oscuro".'
  };
}
