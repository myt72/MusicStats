export function computeStats(tracks) {
  const totalTracks = tracks.length;
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const totalBitrate = tracks.reduce((sum, t) => sum + (t.bitrate || 0), 0);

  const artists = new Map();
  const albums = new Map();
  const genres = new Map();
  const years = new Map();

  for (const t of tracks) {
    const artistKey = t.artist || t.artistFolder || "Unknown Artist";
    const albumKey = t.album || t.albumFolder || "Unknown Album";

    // Artist stats
    if (!artists.has(artistKey)) {
      artists.set(artistKey, { artist: artistKey, trackCount: 0, albumSet: new Set() });
    }
    const a = artists.get(artistKey);
    a.trackCount += 1;
    a.albumSet.add(albumKey);

    // Album stats
    if (!albums.has(albumKey)) {
      albums.set(albumKey, { album: albumKey, artist: artistKey, trackCount: 0 });
    }
    const al = albums.get(albumKey);
    al.trackCount += 1;

    // Genre stats
    for (const g of t.genre || []) {
      const gKey = g.trim();
      if (!gKey) continue;
      if (!genres.has(gKey)) {
        genres.set(gKey, { genre: gKey, trackCount: 0 });
      }
      genres.get(gKey).trackCount += 1;
    }

    // Year stats
    if (t.year) {
      const yKey = t.year;
      if (!years.has(yKey)) {
        years.set(yKey, { year: yKey, trackCount: 0 });
      }
      years.get(yKey).trackCount += 1;
    }
  }

  const artistStats = Array.from(artists.values()).map(a => ({
    artist: a.artist,
    trackCount: a.trackCount,
    albumCount: a.albumSet.size
  }));

  const albumStats = Array.from(albums.values());
  const genreStats = Array.from(genres.values());
  const yearStats = Array.from(years.values());

  artistStats.sort((a, b) => b.trackCount - a.trackCount);
  albumStats.sort((a, b) => b.trackCount - a.trackCount);
  genreStats.sort((a, b) => b.trackCount - a.trackCount);
  yearStats.sort((a, b) => a.year - b.year);

  return {
    totals: {
      tracks: totalTracks,
      durationSeconds: totalDuration,
      durationHours: totalDuration / 3600,
      avgBitrate: totalTracks ? Math.round(totalBitrate / totalTracks) : 0
    },
    artists: artistStats,
    albums: albumStats,
    genres: genreStats,
    years: yearStats
  };
}
