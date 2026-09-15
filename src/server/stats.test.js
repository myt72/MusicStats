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
