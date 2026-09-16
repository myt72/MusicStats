import assert from "assert";
import test from "node:test";
import {
  buildMobileAlbumOptions,
  buildMobileArtistOptions,
  buildMobileSongOptions,
  filterMobileOptions,
  loadMobileOptions
} from "./mobileBrowse.js";

const artists = [
  { artist: "Kansas", trackCount: 3 },
  { artist: "ABBA", trackCount: 2 },
  { artist: "Kansas", trackCount: 4 }
];

const tracks = [
  { id: "1", title: "Carry On Wayward Son", artist: "Kansas", album: "Leftoverture", trackNumber: 2, discNumber: 1 },
  { id: "2", title: "Magnum Opus", artist: "Kansas", album: "Leftoverture", trackNumber: 6, discNumber: 1 },
  { id: "3", title: "The Wall", artist: "Kansas", album: "Leftoverture", trackNumber: 1, discNumber: 1 }
];

test("mobile option builders create artist, album, and song drill-down data", () => {
  const artistOptions = buildMobileArtistOptions(artists);
  const albumOptions = buildMobileAlbumOptions(tracks, "Kansas");
  const songOptions = buildMobileSongOptions(tracks, "Kansas", "Leftoverture");

  assert.deepStrictEqual(
    artistOptions.map(option => option.label),
    ["ABBA", "Kansas"]
  );
  assert.strictEqual(artistOptions.find(option => option.value === "Kansas")?.trackCount, 4);
  assert.deepStrictEqual(
    albumOptions.map(option => option.label),
    ["Leftoverture"]
  );
  assert.deepStrictEqual(
    songOptions.map(option => option.label),
    ["1. The Wall", "2. Carry On Wayward Son", "3. Magnum Opus"]
  );
});

test("mobile async filtering supports search queries and option limits", async () => {
  const options = [
    { value: "a", label: "ABBA", searchText: "abba" },
    { value: "b", label: "Beatles", searchText: "beatles" },
    { value: "c", label: "Kansas", searchText: "kansas" }
  ];

  assert.deepStrictEqual(
    filterMobileOptions(options, "a", 2).map(option => option.value),
    ["a", "b"]
  );

  const loaded = await loadMobileOptions(options, "kan", { delayMs: 0, limit: 5 });
  assert.deepStrictEqual(
    loaded.map(option => option.value),
    ["c"]
  );
});
