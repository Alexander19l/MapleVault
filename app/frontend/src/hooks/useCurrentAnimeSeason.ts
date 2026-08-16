import { useEffect, useState } from 'react';
import {
  getAnimeSeasonSnapshot,
  getMillisecondsUntilNextLocalDay
} from '../utils/animeSeason';

export function useCurrentAnimeSeason() {
  const [currentSeason, setCurrentSeason] = useState(getAnimeSeasonSnapshot);

  useEffect(() => {
    let refreshTimer: number | undefined;

    const scheduleNextRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(
        refresh,
        getMillisecondsUntilNextLocalDay()
      );
    };

    const refresh = () => {
      const next = getAnimeSeasonSnapshot();
      setCurrentSeason(previous => (
        previous.year === next.year && previous.season === next.season
          ? previous
          : next
      ));
      scheduleNextRefresh();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) refresh();
    };

    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return currentSeason;
}
