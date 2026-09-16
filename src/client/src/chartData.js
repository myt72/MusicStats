export function sortArtistsByAlbumCount(artists) {
  return [...artists].sort((left, right) => {
    if ((right.albumCount || 0) !== (left.albumCount || 0)) {
      return (right.albumCount || 0) - (left.albumCount || 0);
    }

    if (right.trackCount !== left.trackCount) {
      return right.trackCount - left.trackCount;
    }

    return left.artist.localeCompare(right.artist);
  });
}

export function buildChartData(stats) {
  if (!stats) {
    return { artists: [], albums: [], artistsByAlbumCount: [], genres: [], years: [] };
  }

  return {
    artists: stats.artists.slice(0, 10),
    artistsByAlbumCount: sortArtistsByAlbumCount(stats.artists).slice(0, 10),
    albums: stats.albums.slice(0, 10),
    genres: stats.genres.slice(0, 10),
    years: [...stats.years].sort((left, right) => right.trackCount - left.trackCount).slice(0, 10)
  };
}
