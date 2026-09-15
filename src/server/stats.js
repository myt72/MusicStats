const DEFAULT_EXCLUSIONS = {
  topArtists: ["Various Artists"],
  topAlbums: ["Greatest Hits"]
};
const DEFAULT_BROWSE_EXCLUSIONS = {
  browseArtists: ["_mp3"],
  browseAlbums: ["_incoming"]
};

function toNonEmptyString(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function toNumberOrNull(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeExclusionSet(values, defaults) {
  const list = Array.isArray(values) ? values : defaults;
  return new Set(list.map(value => String(value).trim().toLowerCase()).filter(Boolean));
}

function sortByTrackCountDesc(items, key) {
  return [...items].sort((left, right) => {
    if (right.trackCount !== left.trackCount) {
      return right.trackCount - left.trackCount;
    }

    return String(left[key]).localeCompare(String(right[key]));
  });
}

export function computeStats(tracks, config = {}) {
  const exclusions = config.exclusions || {};
  const excludedArtists = normalizeExclusionSet(exclusions.topArtists, DEFAULT_EXCLUSIONS.topArtists);
  const excludedAlbums = normalizeExclusionSet(exclusions.topAlbums, DEFAULT_EXCLUSIONS.topAlbums);
  const excludedBrowseArtists = normalizeExclusionSet(
    exclusions.browseArtists,
    DEFAULT_BROWSE_EXCLUSIONS.browseArtists
  );
  const excludedBrowseAlbums = normalizeExclusionSet(
    exclusions.browseAlbums,
    DEFAULT_BROWSE_EXCLUSIONS.browseAlbums
  );

  const normalizedTracks = tracks.map((track, index) => {
    const artist = toNonEmptyString(track.artist || track.artistFolder, "Unknown Artist");
    const album = toNonEmptyString(track.album || track.albumFolder, "Unknown Album");
    const genres = Array.isArray(track.genre)
      ? track.genre.map(value => String(value).trim()).filter(Boolean)
      : [];
    const year = toNumberOrNull(track.year);
    const durationSeconds = Number(track.duration) || 0;
    const bitrate = Number(track.bitrate) || 0;
    const trackNumber = toNumberOrNull(track.trackNumber);
    const discNumber = toNumberOrNull(track.discNumber);
    const albumKey = `${artist}\u0000${album}`;

    return {
      id: String(index + 1),
      title: toNonEmptyString(track.title, "Unknown Track"),
      artist,
      album,
      genres,
      year,
      durationSeconds,
      bitrate,
      trackNumber,
      discNumber,
      file: track.file,
      albumKey
    };
  });

  const totalDuration = normalizedTracks.reduce((sum, track) => sum + track.durationSeconds, 0);
  const totalBitrate = normalizedTracks.reduce((sum, track) => sum + track.bitrate, 0);

  const artistMap = new Map();
  const albumMap = new Map();
  const genreMap = new Map();
  const yearMap = new Map();

  for (const track of normalizedTracks) {
    if (!artistMap.has(track.artist)) {
      artistMap.set(track.artist, {
        artist: track.artist,
        trackCount: 0,
        albumSet: new Set(),
        artTrackId: track.id
      });
    }

    const artistEntry = artistMap.get(track.artist);
    artistEntry.trackCount += 1;
    artistEntry.albumSet.add(track.albumKey);

    if (!albumMap.has(track.albumKey)) {
      albumMap.set(track.albumKey, {
        album: track.album,
        artist: track.artist,
        trackCount: 0,
        artTrackId: track.id
      });
    }

    albumMap.get(track.albumKey).trackCount += 1;

    for (const genre of track.genres) {
      if (!genreMap.has(genre)) {
        genreMap.set(genre, { genre, trackCount: 0 });
      }

      genreMap.get(genre).trackCount += 1;
    }

    if (track.year !== null) {
      if (!yearMap.has(track.year)) {
        yearMap.set(track.year, { year: track.year, trackCount: 0 });
      }

      yearMap.get(track.year).trackCount += 1;
    }
  }

  const browseArtists = Array.from(artistMap.values())
    .map(entry => ({
      artist: entry.artist,
      trackCount: entry.trackCount,
      albumCount: entry.albumSet.size,
      artTrackId: entry.artTrackId
    }))
    .sort((left, right) => left.artist.localeCompare(right.artist));

  const browseAlbums = Array.from(albumMap.values()).sort((left, right) => {
    const albumComparison = left.album.localeCompare(right.album);
    if (albumComparison !== 0) {
      return albumComparison;
    }

    return left.artist.localeCompare(right.artist);
  });
  const visibleBrowseArtists = browseArtists.filter(
    artist => !excludedBrowseArtists.has(artist.artist.toLowerCase())
  );
  const visibleBrowseAlbums = browseAlbums.filter(album => !excludedBrowseAlbums.has(album.album.toLowerCase()));

  const genreStats = Array.from(genreMap.values());
  const yearStats = Array.from(yearMap.values()).sort((left, right) => left.year - right.year);

  const albumArtLookup = new Map(browseAlbums.map(album => [album.artist + "\u0000" + album.album, album.artTrackId]));
  const libraryTracks = normalizedTracks
    .map(({ albumKey, ...track }) => ({
      ...track,
      albumArtTrackId: albumArtLookup.get(albumKey) || track.id
    }))
    .sort((left, right) => {
      const artistComparison = left.artist.localeCompare(right.artist);
      if (artistComparison !== 0) {
        return artistComparison;
      }

      const albumComparison = left.album.localeCompare(right.album);
      if (albumComparison !== 0) {
        return albumComparison;
      }

      if ((left.discNumber || 0) !== (right.discNumber || 0)) {
        return (left.discNumber || 0) - (right.discNumber || 0);
      }

      if ((left.trackNumber || 0) !== (right.trackNumber || 0)) {
        return (left.trackNumber || 0) - (right.trackNumber || 0);
      }

      return left.title.localeCompare(right.title);
    });

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    totals: {
      tracks: normalizedTracks.length,
      artists: browseArtists.length,
      albums: browseAlbums.length,
      durationSeconds: totalDuration,
      durationHours: totalDuration / 3600,
      avgBitrate: normalizedTracks.length ? Math.round(totalBitrate / normalizedTracks.length) : 0
    },
    artists: sortByTrackCountDesc(
      browseArtists.filter(artist => !excludedArtists.has(artist.artist.toLowerCase())),
      "artist"
    ),
    albums: sortByTrackCountDesc(
      browseAlbums.filter(album => !excludedAlbums.has(album.album.toLowerCase())),
      "album"
    ),
    genres: sortByTrackCountDesc(genreStats, "genre"),
    years: yearStats,
    browse: {
      artists: visibleBrowseArtists,
      albums: visibleBrowseAlbums,
      genres: [...genreStats].sort((left, right) => left.genre.localeCompare(right.genre)),
      years: yearStats
    },
    tracks: libraryTracks
  };
}
