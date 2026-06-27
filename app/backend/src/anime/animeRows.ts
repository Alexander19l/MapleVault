export function attachJoinedGenres(rows: any[]): any[] {
  return rows.map(row => {
    const genres = String(row.genres_joined || '')
      .split(',')
      .map(genre => genre.trim())
      .filter(Boolean);
    const { genres_joined: _genresJoined, ...rest } = row;
    return { ...rest, genres };
  });
}
