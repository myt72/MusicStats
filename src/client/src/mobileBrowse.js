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
