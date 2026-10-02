import { buildMobileAlbumList } from "./mobileBrowse.js";

export const JUKEBOX_SCOPES = ["all", "artist", "album"];
export const JUKEBOX_SOURCES = ["library", "collection"];
export const JUKEBOX_SORTS = ["artist", "album"];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export function getJukeboxLetter(value) {
  const first = String(value || "").trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

export function buildJukeboxAlbums(tracks, sortBy = "artist") {
  const field = sortBy === "album" ? "album" : "artist";
  const other = field === "artist" ? "album" : "artist";
  return buildMobileAlbumList(tracks).sort(
    (left, right) =>
      left[field].localeCompare(right[field], undefined, { sensitivity: "base" }) ||
      left[other].localeCompare(right[other], undefined, { sensitivity: "base" })
  );
}

export function filterJukeboxAlbums(albums, query, scope = "all") {
  const normalizedQuery = normalizeText(query);
  const list = Array.isArray(albums) ? albums : [];
  if (!normalizedQuery) {
    return list;
  }

  return list.filter(album => {
    const artistMatch = normalizeText(album.artist).includes(normalizedQuery);
    const albumMatch = normalizeText(album.album).includes(normalizedQuery);
    if (scope === "artist") {
      return artistMatch;
    }
    if (scope === "album") {
      return albumMatch;
    }
    return artistMatch || albumMatch;
  });
}

// Maps each letter to the index of the first album under it, so the A-Z rail can jump there.
export function buildJukeboxLetterIndex(albums, sortBy = "artist") {
  const field = sortBy === "album" ? "album" : "artist";
  const index = new Map();
  (Array.isArray(albums) ? albums : []).forEach((album, position) => {
    const letter = getJukeboxLetter(album[field]);
    if (!index.has(letter)) {
      index.set(letter, position);
    }
  });
  return index;
}

export function wrapJukeboxIndex(index, length) {
  if (!length) {
    return 0;
  }
  return ((index % length) + length) % length;
}

// Restricts the library to the M3U-derived tracks. An album is shown when at least one of its
// tracks is in the playlist; only those tracks are queued, and `partial` marks missing tracks.
export function buildJukeboxSourceAlbums(tracks, source, collection, sortBy = "artist") {
  const allAlbums = buildJukeboxAlbums(tracks, sortBy);
  if (source !== "collection") {
    return allAlbums;
  }

  const included = new Set((collection?.trackIds || []).map(String));
  const subset = (Array.isArray(tracks) ? tracks : []).filter(track => included.has(String(track.id)));
  const totals = new Map(allAlbums.map(album => [album.id, album.trackCount]));
  return buildJukeboxAlbums(subset, sortBy).map(album => {
    const totalTrackCount = totals.get(album.id) || album.trackCount;
    return { ...album, totalTrackCount, partial: album.trackCount < totalTrackCount };
  });
}
