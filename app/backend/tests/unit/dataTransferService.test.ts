import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedAnime } from '../../src/scraping/scraper';
import {
  exportUserData,
  importUserData
} from '../../src/routes/dataTransferService';

const queryAllMock = vi.fn<(sql: string, params?: any[]) => Promise<any[]>>();
const queryRunMock = vi.fn<(sql: string, params?: any[]) => Promise<unknown>>();
const saveAnimeToLocalMock = vi.fn<(anime: NormalizedAnime) => Promise<number>>();

const queryClient = {
  all: queryAllMock,
  run: queryRunMock
};

describe('dataTransferService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryAllMock.mockResolvedValue([]);
    queryRunMock.mockResolvedValue({ changes: 1 });
    saveAnimeToLocalMock.mockResolvedValue(1001);
  });

  it('exporta anime con generos normalizados y lista del usuario', async () => {
    queryAllMock.mockImplementation(async sql => {
      if (sql.includes('FROM anime')) {
        return [
          {
            id: 1,
            title: 'Serial Experiments Lain',
            genres_joined: 'Sci-Fi,Psychological'
          }
        ];
      }

      if (sql.includes('FROM user_list')) {
        return [{ anime_id: 1, watch_status: 'completed' }];
      }

      return [];
    });

    await expect(exportUserData(queryClient)).resolves.toEqual(expect.objectContaining({
      version: '1.0.0',
      exportedAt: expect.any(String),
      animes: [
        expect.objectContaining({
          title: 'Serial Experiments Lain',
          genres: ['Sci-Fi', 'Psychological']
        })
      ],
      userList: [
        expect.objectContaining({
          anime_id: 1,
          watch_status: 'completed'
        })
      ]
    }));
  });

  it('importa animes validos y restaura elementos de lista asociados', async () => {
    const result = await importUserData(
      {
        animes: [
          {
            id: 77,
            external_id: 999,
            source: 'Import',
            title: 'Maple Test',
            year: 2024,
            season: 'spring',
            type: 'tv',
            status: 'finished',
            episodes: 12,
            score: 8.2,
            genres: ['Comedy', 'Romance']
          },
          {
            id: 78,
            title: ''
          }
        ],
        userList: [
          {
            anime_id: 77,
            watch_status: 'completed',
            favorite: 1,
            user_score: 9,
            episodes_watched: 12,
            notes: 'Importado',
            started_at: null,
            completed_at: null
          }
        ]
      },
      queryClient,
      saveAnimeToLocalMock
    );

    expect(result).toEqual({
      importedAnimes: 1,
      importedUserItems: 1
    });
    expect(saveAnimeToLocalMock).toHaveBeenCalledWith(expect.objectContaining({
      external_id: 999,
      title: 'Maple Test',
      genres: ['Comedy', 'Romance']
    }));
    expect(queryRunMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_list'), [
      1001,
      'completed',
      1,
      9,
      12,
      'Importado',
      null,
      null
    ]);
  });

  it('omite elementos de lista invalidos sin detener la importacion de anime', async () => {
    const result = await importUserData(
      {
        animes: [
          {
            id: 77,
            title: 'Maple Test',
            year: 2024,
            season: 'spring',
            type: 'tv',
            status: 'finished',
            genres: []
          }
        ],
        userList: [
          {
            anime_id: 77,
            watch_status: 'estado-invalido'
          }
        ]
      },
      queryClient,
      saveAnimeToLocalMock
    );

    expect(result).toEqual({
      importedAnimes: 1,
      importedUserItems: 0
    });
    expect(queryRunMock).not.toHaveBeenCalled();
  });
});
