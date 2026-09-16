import assert from "assert";
import test from "node:test";
import { computeStats } from "./stats.js";

function baseTrack(overrides) {
  return {
    title: "Track",
    artist: "Artist",
    album: "Album",
    genre: ["Rock"],
    year: 2000,
    duration: 180,
    bitrate: 320000,
    trackNumber: 1,
    discNumber: 1,
    file: "/tmp/track.mp3",
    ...overrides
  };
}

test("computeStats hides special browse names but keeps tracks playable", () => {
  const stats = computeStats([
    baseTrack({ title: "Hidden Artist", artist: "_MP3", album: "Loose Tracks", file: "/tmp/hidden-artist.mp3" }),
    baseTrack({ title: "Hidden Album", artist: "Artist A", album: "_incoming", file: "/tmp/hidden-album.mp3" }),
    baseTrack({ title: "Visible", artist: "Artist B", album: "Album B", file: "/tmp/visible.mp3" })
  ]);

  assert.ok(!stats.browse.artists.some(item => item.artist.toLowerCase() === "_mp3"));
  assert.ok(!stats.browse.albums.some(item => item.album.toLowerCase() === "_incoming"));
  assert.ok(stats.tracks.some(track => track.artist === "_MP3"));
  assert.ok(stats.tracks.some(track => track.album === "_incoming"));
});

test("computeStats orders album tracks by disc then track number", () => {
  const stats = computeStats([
    baseTrack({ title: "Disc 2 - Track 1", artist: "Band", album: "Set", discNumber: 2, trackNumber: 1 }),
    baseTrack({ title: "Disc 1 - Track 2", artist: "Band", album: "Set", discNumber: 1, trackNumber: 2 }),
    baseTrack({ title: "Disc 1 - Track 1", artist: "Band", album: "Set", discNumber: 1, trackNumber: 1 })
  ]);

  const titles = stats.tracks
    .filter(track => track.artist === "Band" && track.album === "Set")
    .map(track => track.title);

  assert.deepStrictEqual(titles, ["Disc 1 - Track 1", "Disc 1 - Track 2", "Disc 2 - Track 1"]);
});

test("computeStats applies artist aliases across artists, albums, and tracks", () => {
  const stats = computeStats(
    [
      baseTrack({
        title: "Alias Track",
        artist: " The Smashing Pumpkins ",
        artistFolder: "Smashing Pumpkins",
        album: "Siamese Dream"
      }),
      baseTrack({
        title: "Canonical Track",
        artist: "Smashing Pumpkins",
        artistFolder: "Smashing Pumpkins",
        album: "Siamese Dream"
      })
    ],
    {
      artistAliases: {
        "the smashing pumpkins": "Smashing Pumpkins"
      }
    }
  );

  assert.ok(stats.artists.some(entry => entry.artist === "Smashing Pumpkins" && entry.trackCount === 2));
  assert.ok(!stats.artists.some(entry => entry.artist === "The Smashing Pumpkins"));
  assert.strictEqual(stats.browse.artists.filter(entry => entry.artist === "Smashing Pumpkins").length, 1);
  assert.strictEqual(
    stats.albums.filter(album => album.artist === "Smashing Pumpkins" && album.album === "Siamese Dream").length,
    1
  );
  assert.ok(stats.tracks.every(track => track.artist === "Smashing Pumpkins"));
});

test("computeStats does not remap metadata artists without explicit alias mapping", () => {
  const stats = computeStats(
    [
      baseTrack({
        title: "Split Metadata",
        artist: "Smashing Pumpkins (Live)",
        artistFolder: "Smashing Pumpkins",
        album: "Siamese Dream"
      }),
      baseTrack({
        title: "Canonical Track",
        artist: "Smashing Pumpkins",
        artistFolder: "Smashing Pumpkins",
        album: "Siamese Dream"
      })
    ],
    {
      artistAliases: {
        "The Smashing Pumpkins": "Smashing Pumpkins"
      }
    }
  );

  assert.strictEqual(stats.artists.filter(entry => entry.artist === "Smashing Pumpkins").length, 1);
  assert.strictEqual(stats.artists.filter(entry => entry.artist === "Smashing Pumpkins (Live)").length, 1);
  assert.strictEqual(stats.albums.filter(album => album.album === "Siamese Dream").length, 2);
});

test("computeStats keeps canonical metadata artist when folder name is an alias", () => {
  const stats = computeStats(
    [
      baseTrack({
        title: "Canonical Metadata",
        artist: "Smashing Pumpkins",
        artistFolder: "The Smashing Pumpkins",
        album: "Siamese Dream"
      })
    ],
    {
      artistAliases: {
        "The Smashing Pumpkins": "Smashing Pumpkins"
      }
    }
  );

  assert.strictEqual(stats.tracks[0].artist, "Smashing Pumpkins");
  assert.strictEqual(stats.artists[0].artist, "Smashing Pumpkins");
});

test("computeStats includes album counts for artist rankings", () => {
  const stats = computeStats([
    baseTrack({ title: "A1", artist: "Artist A", album: "Album 1" }),
    baseTrack({ title: "A2", artist: "Artist A", album: "Album 2" }),
    baseTrack({ title: "A3", artist: "Artist A", album: "Album 2", trackNumber: 2 }),
    baseTrack({ title: "B1", artist: "Artist B", album: "Album 3" }),
    baseTrack({ title: "B2", artist: "Artist B", album: "Album 4" }),
    baseTrack({ title: "B3", artist: "Artist B", album: "Album 5" })
  ]);

  const artistA = stats.artists.find(entry => entry.artist === "Artist A");
  const artistB = stats.artists.find(entry => entry.artist === "Artist B");

  assert.strictEqual(artistA?.albumCount, 2);
  assert.strictEqual(artistB?.albumCount, 3);
  assert.deepStrictEqual(
    [...stats.artists].sort((left, right) => (right.albumCount || 0) - (left.albumCount || 0)).map(entry => entry.artist),
    ["Artist B", "Artist A"]
  );
});
