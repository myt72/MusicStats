import fs from "fs";
import path from "path";
import { parseFile } from "music-metadata";

async function readMetadata(filePath) {
  try {
    const meta = await parseFile(filePath, { skipCovers: true });
    return {
      title: meta.common.title || path.basename(filePath, path.extname(filePath)),
      artist: meta.common.artist || null,
      album: meta.common.album || null,
      genre: meta.common.genre || [],
      year: meta.common.year || null,
      duration: meta.format.duration || 0,
      bitrate: meta.format.bitrate || 0,
      trackNumber: meta.common.track?.no || null
    };
  } catch {
    return {
      title: path.basename(filePath, path.extname(filePath)),
      artist: null,
      album: null,
      genre: [],
      year: null,
      duration: 0,
      bitrate: 0,
      trackNumber: null
    };
  }
}

function listDirs(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort((a, b) => a.localeCompare(b));
}

function listMp3(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(f => f.isFile() && f.name.toLowerCase().endsWith(".mp3"))
    .map(f => path.join(root, f.name))
    .sort((a, b) => a.localeCompare(b));
}

async function scanNormalRoot(root, skippedFolderPaths = new Set()) {
  const artists = listDirs(root).filter(artist => {
    const artistPath = path.resolve(path.join(root, artist));
    return !skippedFolderPaths.has(artistPath);
  });
  const tracks = [];

  for (const artist of artists) {
    const artistPath = path.join(root, artist);
    const albums = listDirs(artistPath);

    for (const album of albums) {
      const albumPath = path.join(artistPath, album);
      const files = listMp3(albumPath);

      for (const file of files) {
        const meta = await readMetadata(file);
        tracks.push({
          file,
          artistFolder: artist,
          albumFolder: album,
          ...meta
        });
      }
    }
  }

  return tracks;
}

async function scanSoundtracks(folderConfig) {
  const root = folderConfig.path;
  const albums = listDirs(root);
  const tracks = [];

  for (const album of albums) {
    const albumPath = path.join(root, album);
    const files = listMp3(albumPath);

    for (const file of files) {
      const meta = await readMetadata(file);
      tracks.push({
        file,
        artistFolder: "Soundtrack",
        albumFolder: album,
        ...meta
      });
    }
  }

  return tracks;
}

async function scanVariousArtists(folderConfig) {
  const root = folderConfig.path;
  const albums = listDirs(root);
  const tracks = [];

  for (const album of albums) {
    const albumPath = path.join(root, album);
    const files = listMp3(albumPath);

    for (const file of files) {
      const meta = await readMetadata(file);
      tracks.push({
        file,
        artistFolder: meta.artist || "Various Artists",
        albumFolder: album,
        ...meta
      });
    }
  }

  return tracks;
}

export async function scanLibrary(config) {
  const allTracks = [];
  const specialFolders = Array.isArray(config.specialFolders) ? config.specialFolders : [];
  const skippedFolderPaths = new Set(specialFolders.map(folder => path.resolve(folder.path)));

  allTracks.push(...(await scanNormalRoot(config.musicRoot, skippedFolderPaths)));

  for (const sf of specialFolders) {
    if (sf.mode === "album-centric") {
      allTracks.push(...(await scanSoundtracks(sf)));
    } else if (sf.mode === "compilation") {
      allTracks.push(...(await scanVariousArtists(sf)));
    }
  }

  return allTracks;
}
