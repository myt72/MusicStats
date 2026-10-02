import fs from "fs";
import path from "path";

function normalizePathKey(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}

function isAbsoluteEntry(entry) {
  return /^[a-zA-Z]:[\\/]/.test(entry) || entry.startsWith("/") || entry.startsWith("\\\\");
}

// Returns the track paths listed in an M3U/M3U8 playlist; comments and #EXT directives are ignored.
export function parseM3U(text, baseDir = "") {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => (isAbsoluteEntry(line) || !baseDir ? line : `${baseDir}/${line}`));
}

// Resolves playlist entries to library tracks and groups them by album.
// Album rule: an album appears when at least one of its tracks is in the playlist; only the
// listed tracks are playable and `partial` flags albums with tracks missing from the playlist.
export function buildJukeboxCollection(entries, libraryTracks) {
  const tracks = Array.isArray(libraryTracks) ? libraryTracks : [];
  const byPath = new Map();
  const albumTotals = new Map();
  for (const track of tracks) {
    byPath.set(normalizePathKey(track.file), track);
    albumTotals.set(track.albumKey, (albumTotals.get(track.albumKey) || 0) + 1);
  }

  const included = new Set();
  const unmatched = [];
  for (const entry of entries) {
    const track = byPath.get(normalizePathKey(entry));
    if (track) {
      included.add(track.id);
    } else {
      unmatched.push(entry);
    }
  }

  const albumCounts = new Map();
  for (const track of tracks) {
    if (included.has(track.id)) {
      albumCounts.set(track.albumKey, (albumCounts.get(track.albumKey) || 0) + 1);
    }
  }

  const albums = [...albumCounts].map(([albumKey, trackCountIncluded]) => {
    const trackCountTotal = albumTotals.get(albumKey) || trackCountIncluded;
    return { albumKey, trackCountIncluded, trackCountTotal, partial: trackCountIncluded < trackCountTotal };
  });

  return { trackIds: [...included], albums, unmatched, entryCount: entries.length };
}

export function createJukeboxCollectionManager(config, configDir) {
  let cached = null;

  function getLibrarySignature(stats) {
    const list = Array.isArray(stats.tracks) ? stats.tracks : [];
    return `${list.length}|${list[0]?.file}|${list[list.length - 1]?.file}`;
  }

  function resolvePlaylistPath() {
    const configured = config.jukeboxPlaylist;
    if (!configured || typeof configured !== "string") {
      return null;
    }
    return path.isAbsolute(configured) || isAbsoluteEntry(configured)
      ? configured
      : path.join(configDir, configured);
  }

  // Rebuilds when forced, when the playlist file changed on disk, or when the library was rescanned.
  function getCollection(stats, { forceRefresh = false } = {}) {
    const playlistPath = resolvePlaylistPath();
    if (!playlistPath) {
      return { configured: false, available: false, trackIds: [], albums: [] };
    }

    let modifiedMs;
    try {
      modifiedMs = fs.statSync(playlistPath).mtimeMs;
    } catch (err) {
      cached = null;
      return {
        configured: true,
        available: false,
        source: { path: playlistPath },
        error: `Playlist not found: ${playlistPath}`,
        trackIds: [],
        albums: []
      };
    }

    if (!forceRefresh && cached && cached.modifiedMs === modifiedMs && cached.signature === getLibrarySignature(stats)) {
      return cached.result;
    }

    const text = fs.readFileSync(playlistPath, "utf-8");
    const entries = parseM3U(text, path.dirname(playlistPath));
    const collection = buildJukeboxCollection(entries, stats.tracks);
    const result = {
      configured: true,
      available: true,
      source: {
        type: "m3u",
        path: playlistPath,
        sourceModifiedAt: new Date(modifiedMs).toISOString(),
        lastImportedAt: new Date().toISOString(),
        entryCount: collection.entryCount,
        matchedCount: collection.trackIds.length,
        unmatchedCount: collection.unmatched.length
      },
      trackIds: collection.trackIds,
      albums: collection.albums
    };
    cached = { modifiedMs, signature: getLibrarySignature(stats), result };
    return result;
  }

  return { getCollection };
}
