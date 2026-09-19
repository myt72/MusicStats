import { groupAlbumsForArtist, sortAlbumTracks } from "./ipodBrowser.js";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function buildMobileArtistOptions(artists) {
  if (!Array.isArray(artists)) {
    return [];
  }

  const artistMap = new Map();
  for (const item of artists) {
    const artist = String(item?.artist || "").trim();
    if (!artist) {
      continue;
    }

    const existing = artistMap.get(artist);
    if (!existing || (item?.trackCount || 0) > existing.trackCount) {
      artistMap.set(artist, {
        value: artist,
        label: artist,
        trackCount: item?.trackCount || 0,
        searchText: normalizeText(artist)
      });
    }
  }

  return [...artistMap.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function buildMobileAlbumOptions(tracks, artist) {
  if (!artist) {
    return [];
  }

  return groupAlbumsForArtist(Array.isArray(tracks) ? tracks : [], artist).map(album => ({
    value: album.album,
    label: album.album,
    artist: album.artist,
    trackCount: album.trackCount || 0,
    searchText: normalizeText(`${album.album} ${album.artist}`)
  }));
}

export function buildMobileSongOptions(tracks, artist, album) {
  if (!artist || !album) {
    return [];
  }

  return sortAlbumTracks(
    (Array.isArray(tracks) ? tracks : []).filter(track => track.artist === artist && track.album === album)
  ).map((track, index) => ({
    value: track.id,
    label: `${index + 1}. ${track.title}`,
    searchText: normalizeText(`${track.title} ${track.artist} ${track.album}`)
  }));
}

export function filterMobileOptions(options, inputValue, limit = 60) {
  const cappedLimit = Math.max(1, Number(limit) || 1);
  const query = normalizeText(inputValue);
  const normalizedOptions = Array.isArray(options) ? options : [];
  const filteredOptions = query
    ? normalizedOptions.filter(option => normalizeText(option.searchText || option.label).includes(query))
    : normalizedOptions;
  return filteredOptions.slice(0, cappedLimit);
}

export function loadMobileOptions(options, inputValue, { delayMs = 140, limit = 60 } = {}) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(filterMobileOptions(options, inputValue, limit));
    }, Math.max(0, Number(delayMs) || 0));
  });
}

export function buildMobileArtistList(artists) {
  return buildMobileArtistOptions(artists).map(option => ({
    id: option.value,
    artist: option.value,
    label: option.label,
    trackCount: option.trackCount
  }));
}

export function buildMobileAlbumList(tracks, artist = null) {
  if (!Array.isArray(tracks)) {
    return [];
  }

  if (artist) {
    return groupAlbumsForArtist(tracks, artist).map(album => ({
      id: `${album.artist}\u0000${album.album}`,
      artist: album.artist,
      album: album.album,
      label: album.album,
      trackCount: album.trackCount,
      albumArtTrackId: album.artTrackId,
      tracks: album.tracks
    }));
  }

  const albumMap = new Map();
  for (const track of tracks) {
    const artistName = String(track?.artist || "").trim();
    const albumName = String(track?.album || "").trim();
    if (!artistName || !albumName) {
      continue;
    }

    const albumKey = `${artistName}\u0000${albumName}`;
    if (!albumMap.has(albumKey)) {
      albumMap.set(albumKey, {
        id: albumKey,
        artist: artistName,
        album: albumName,
        label: albumName,
        trackCount: 0,
        albumArtTrackId: track.albumArtTrackId || track.id,
        tracks: []
      });
    }

    const albumEntry = albumMap.get(albumKey);
    albumEntry.trackCount += 1;
    albumEntry.tracks.push(track);
  }

  return [...albumMap.values()]
    .map(album => ({ ...album, tracks: sortAlbumTracks(album.tracks) }))
    .sort((left, right) => left.album.localeCompare(right.album) || left.artist.localeCompare(right.artist));
}

export function buildMobileTrackList(tracks, { artist = null, album = null, query = "" } = {}) {
  const normalizedTracks = Array.isArray(tracks) ? tracks : [];
  const normalizedQuery = normalizeText(query);
  const filteredTracks = normalizedTracks.filter(track => {
    if (artist && track.artist !== artist) {
      return false;
    }

    if (album && track.album !== album) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = normalizeText(
      [track.title, track.artist, track.album, ...(track.genres || []), track.year].filter(Boolean).join(" ")
    );
    return haystack.includes(normalizedQuery);
  });

  return [...filteredTracks].sort((left, right) => {
    const artistDiff = String(left.artist || "").localeCompare(String(right.artist || ""));
    if (artistDiff) {
      return artistDiff;
    }

    const albumDiff = String(left.album || "").localeCompare(String(right.album || ""));
    if (albumDiff) {
      return albumDiff;
    }

    if ((left.discNumber || 0) !== (right.discNumber || 0)) {
      return (left.discNumber || 0) - (right.discNumber || 0);
    }

    if ((left.trackNumber || 0) !== (right.trackNumber || 0)) {
      return (left.trackNumber || 0) - (right.trackNumber || 0);
    }

    return String(left.title || "").localeCompare(String(right.title || ""));
  });
}

export function searchMobileLibrary(tracks, query, { artistLimit = 10, albumLimit = 12, trackLimit = 24 } = {}) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return { artists: [], albums: [], tracks: [] };
  }

  const matchedTracks = buildMobileTrackList(tracks, { query: normalizedQuery });
  const trackResults = matchedTracks.slice(0, Math.max(1, trackLimit));
  const albumResults = buildMobileAlbumList(tracks).filter(album =>
    normalizeText(`${album.album} ${album.artist}`).includes(normalizedQuery)
  );
  const artistMap = new Map();
  for (const track of matchedTracks) {
    const artistName = String(track?.artist || "").trim();
    if (!artistName) {
      continue;
    }

    const artistEntry = artistMap.get(artistName) || { artist: artistName, trackCount: 0 };
    artistEntry.trackCount += 1;
    artistMap.set(artistName, artistEntry);
  }
  const artistResults = buildMobileArtistList([...artistMap.values()]);

  return {
    artists: artistResults.slice(0, Math.max(1, artistLimit)),
    albums: albumResults.slice(0, Math.max(1, albumLimit)),
    tracks: trackResults
  };
}
