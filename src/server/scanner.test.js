import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import test from "node:test";
import { scanLibrary } from "./scanner.js";

test("scanLibrary includes _mp3/_incoming tracks without using folder names as artist/album", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "musicstats-scan-"));

  try {
    const standardAlbumPath = path.join(tempRoot, "Artist A", "Album A");
    const specialMp3Path = path.join(tempRoot, "_mp3", "Loose Files");
    const specialIncomingPath = path.join(tempRoot, "_incoming");

    fs.mkdirSync(standardAlbumPath, { recursive: true });
    fs.mkdirSync(specialMp3Path, { recursive: true });
    fs.mkdirSync(specialIncomingPath, { recursive: true });

    fs.writeFileSync(path.join(standardAlbumPath, "track-a.mp3"), "");
    fs.writeFileSync(path.join(specialMp3Path, "track-b.mp3"), "");
    fs.writeFileSync(path.join(specialIncomingPath, "track-c.mp3"), "");

    const tracks = await scanLibrary({ musicRoot: tempRoot, specialFolders: [] });

    assert.strictEqual(tracks.length, 3);

    const standardTrack = tracks.find(track => track.file.endsWith("track-a.mp3"));
    assert.strictEqual(standardTrack?.artistFolder, "Artist A");
    assert.strictEqual(standardTrack?.albumFolder, "Album A");

    const specialTracks = tracks.filter(
      track =>
        track.file.includes(`${path.sep}_mp3${path.sep}`) || track.file.includes(`${path.sep}_incoming${path.sep}`)
    );

    assert.strictEqual(specialTracks.length, 2);
    assert.ok(specialTracks.every(track => track.artistFolder === null));
    assert.ok(specialTracks.every(track => track.albumFolder === null));
    assert.ok(tracks.every(track => track.artistFolder !== "_mp3" && track.artistFolder !== "_incoming"));
    assert.ok(tracks.every(track => track.albumFolder !== "Loose Files"));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
