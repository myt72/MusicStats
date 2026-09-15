import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFile } from "music-metadata";
import { scanLibrary } from "./scanner.js";
import { computeStats } from "./stats.js";

const CACHE_VERSION = 2;
const ARTWORK_FILE_NAMES = [
  "cover.jpg",
  "cover.jpeg",
  "cover.png",
  "folder.jpg",
  "folder.jpeg",
  "folder.png",
  "front.jpg",
  "front.jpeg",
  "front.png",
  "album.jpg",
  "album.jpeg",
  "album.png"
];

const DEFAULT_EXCLUSIONS = {
  topArtists: ["Various Artists"],
  topAlbums: ["Greatest Hits"]
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, "..", "..", "config.json");
const config = normalizeConfig(JSON.parse(fs.readFileSync(configPath, "utf-8")));

const app = express();
const PORT = 3001;
const artworkCache = new Map();
let inflightStatsPromise = null;

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

function createRateLimiter({ windowMs, maxRequests }) {
  const requests = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || "unknown";
    const existing = requests.get(key);

    if (!existing || now - existing.windowStart >= windowMs) {
      requests.set(key, { count: 1, windowStart: now });
      next();
      return;
    }

    if (existing.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((windowMs - (now - existing.windowStart)) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      res.status(429).json({ error: "Too many file requests. Please try again shortly." });
      return;
    }

    existing.count += 1;
    next();
  };
}

const artworkRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 240 });
const streamRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 240 });

function normalizeConfig(rawConfig) {
  const exclusions = rawConfig.exclusions || {};

  return {
    ...rawConfig,
    exclusions: {
      topArtists: Array.isArray(exclusions.topArtists)
        ? exclusions.topArtists
        : DEFAULT_EXCLUSIONS.topArtists,
      topAlbums: Array.isArray(exclusions.topAlbums)
        ? exclusions.topAlbums
        : DEFAULT_EXCLUSIONS.topAlbums
    }
  };
}

function getCachePath() {
  if (!config.cacheFile) return null;

  if (path.isAbsolute(config.cacheFile)) {
    return config.cacheFile;
  }

  return path.join(__dirname, "..", "..", config.cacheFile);
}

function isValidCache(parsed) {
  return Boolean(
    parsed &&
      parsed.version === CACHE_VERSION &&
      parsed.totals &&
      Array.isArray(parsed.artists) &&
      Array.isArray(parsed.albums) &&
      Array.isArray(parsed.genres) &&
      Array.isArray(parsed.years) &&
      parsed.browse &&
      Array.isArray(parsed.browse.artists) &&
      Array.isArray(parsed.browse.albums) &&
      Array.isArray(parsed.browse.genres) &&
      Array.isArray(parsed.browse.years) &&
      Array.isArray(parsed.tracks)
  );
}

function loadCache() {
  try {
    const cachePath = getCachePath();
    if (!cachePath || !fs.existsSync(cachePath)) {
      return null;
    }

    const raw = fs.readFileSync(cachePath, "utf-8").trim();
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return isValidCache(parsed) ? parsed : null;
  } catch (err) {
    console.error("Cache load error:", err);
    return null;
  }
}

function saveCache(stats) {
  try {
    const cachePath = getCachePath();
    if (!cachePath) {
      return;
    }

    fs.writeFileSync(cachePath, JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error("Cache save error:", err);
  }
}

async function buildStatsPayload() {
  const library = await scanLibrary(config);
  const stats = computeStats(library, config);
  saveCache(stats);
  return stats;
}

async function getStatsPayload({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = loadCache();
    if (cached) {
      return cached;
    }
  }

  if (!inflightStatsPromise) {
    inflightStatsPromise = buildStatsPayload();
  }

  try {
    return await inflightStatsPromise;
  } finally {
    inflightStatsPromise = null;
  }
}

function toStatsResponse(stats) {
  const { tracks, browse, ...statsResponse } = stats;
  return statsResponse;
}

function toLibraryTrack(track) {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    genres: track.genres,
    year: track.year,
    durationSeconds: track.durationSeconds,
    trackNumber: track.trackNumber,
    albumArtTrackId: track.albumArtTrackId
  };
}

function toLibraryResponse(stats) {
  return {
    browse: stats.browse,
    tracks: stats.tracks.map(toLibraryTrack)
  };
}

function findTrack(stats, trackId) {
  return stats.tracks.find(track => track.id === String(trackId)) || null;
}

function getContentTypeForFile(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".flac":
      return "audio/flac";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

async function loadArtwork(track) {
  const cacheKey = track.file;
  if (artworkCache.has(cacheKey)) {
    return artworkCache.get(cacheKey);
  }

  try {
    const metadata = await parseFile(track.file);
    const picture = metadata.common.picture?.[0];

    if (picture?.data?.length) {
      const artwork = {
        data: picture.data,
        contentType: picture.format || "image/jpeg"
      };
      artworkCache.set(cacheKey, artwork);
      return artwork;
    }
  } catch (err) {
    console.error(`Album art metadata read failed for ${track.file}:`, err.message);
  }

  const folderPath = path.dirname(track.file);
  for (const fileName of ARTWORK_FILE_NAMES) {
    const candidatePath = path.join(folderPath, fileName);
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      const artwork = {
        data: fs.readFileSync(candidatePath),
        contentType: getContentTypeForFile(candidatePath)
      };
      artworkCache.set(cacheKey, artwork);
      return artwork;
    }
  }

  artworkCache.set(cacheKey, null);
  return null;
}

function streamFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const contentType = getContentTypeForFile(filePath);

  if (!range) {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes"
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const [startText, endText] = range.replace("bytes=", "").split("-");
  const start = Number.parseInt(startText, 10);
  const end = endText ? Number.parseInt(endText, 10) : stat.size - 1;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= stat.size || start > end) {
    res.status(416).set("Content-Range", `bytes */${stat.size}`).end();
    return;
  }

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    "Accept-Ranges": "bytes",
    "Content-Length": end - start + 1,
    "Content-Type": contentType
  });

  fs.createReadStream(filePath, { start, end }).pipe(res);
}

app.get("/api/stats", async (req, res) => {
  try {
    const stats = await getStatsPayload();
    return res.json(toStatsResponse(stats));
  } catch (err) {
    console.error("Error in /api/stats:", err);
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

app.get("/api/library", async (req, res) => {
  try {
    const stats = await getStatsPayload();
    return res.json(toLibraryResponse(stats));
  } catch (err) {
    console.error("Error in /api/library:", err);
    return res.status(500).json({ error: "Failed to load library" });
  }
});

app.get("/api/tracks/:trackId/art", artworkRateLimiter, async (req, res) => {
  try {
    const stats = await getStatsPayload();
    const requestedTrack = findTrack(stats, req.params.trackId);

    if (!requestedTrack) {
      return res.status(404).json({ error: "Track not found" });
    }

    const artTrack = findTrack(stats, requestedTrack.albumArtTrackId) || requestedTrack;
    const artwork = await loadArtwork(artTrack);

    if (!artwork) {
      return res.status(404).json({ error: "Album art not found" });
    }

    res.set("Cache-Control", "public, max-age=3600");
    return res.type(artwork.contentType).send(artwork.data);
  } catch (err) {
    console.error("Album art error:", err);
    return res.status(500).json({ error: "Failed to load album art" });
  }
});

app.get("/api/tracks/:trackId/stream", streamRateLimiter, async (req, res) => {
  try {
    const stats = await getStatsPayload();
    const track = findTrack(stats, req.params.trackId);

    if (!track || !track.file || !fs.existsSync(track.file)) {
      return res.status(404).json({ error: "Track not found" });
    }

    streamFile(req, res, track.file);
    return undefined;
  } catch (err) {
    console.error("Track stream error:", err);
    return res.status(500).json({ error: "Failed to stream track" });
  }
});

app.get("/api/rescan", async (req, res) => {
  try {
    const stats = await getStatsPayload({ forceRefresh: true });
    return res.json(toStatsResponse(stats));
  } catch (err) {
    console.error("Rescan error:", err);
    return res.status(500).json({ error: "Rescan failed" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Music stats server running on http://0.0.0.0:${PORT}`);
});
