import assert from "assert";
import test from "node:test";
import {
  buildJukeboxAlbums,
  buildJukeboxLetterIndex,
  filterJukeboxAlbums,
  getJukeboxLetter,
  wrapJukeboxIndex
} from "./jukebox.js";

const tracks = [
  { id: "1", title: "Dancing Queen", artist: "ABBA", album: "Arrival", trackNumber: 2 },
  { id: "2", title: "Carry On", artist: "Kansas", album: "Leftoverture", trackNumber: 1 },
  { id: "3", title: "Song", artist: "Kansas", album: "Point of Know Return", trackNumber: 1 },
  { id: "4", title: "X", artist: "1975", album: "Self Titled", trackNumber: 1 }
];

test("jukebox albums sort by artist or album", () => {
  assert.deepStrictEqual(buildJukeboxAlbums(tracks).map(a => a.artist), ["1975", "ABBA", "Kansas", "Kansas"]);
  assert.deepStrictEqual(buildJukeboxAlbums(tracks, "album").map(a => a.album), [
    "Arrival",
    "Leftoverture",
    "Point of Know Return",
    "Self Titled"
  ]);
});

test("jukebox filter respects scope", () => {
  const albums = buildJukeboxAlbums(tracks);
  assert.strictEqual(filterJukeboxAlbums(albums, "kansas", "artist").length, 2);
  assert.strictEqual(filterJukeboxAlbums(albums, "kansas", "album").length, 0);
  assert.strictEqual(filterJukeboxAlbums(albums, "arrival", "all").length, 1);
  assert.strictEqual(filterJukeboxAlbums(albums, "", "all").length, 4);
});

test("jukebox letter index points at first album per letter", () => {
  const albums = buildJukeboxAlbums(tracks);
  const index = buildJukeboxLetterIndex(albums);
  assert.strictEqual(getJukeboxLetter("1975"), "#");
  assert.strictEqual(index.get("#"), 0);
  assert.strictEqual(index.get("A"), 1);
  assert.strictEqual(index.get("K"), 2);
  assert.strictEqual(index.has("Z"), false);
});

test("jukebox index wraps", () => {
  assert.strictEqual(wrapJukeboxIndex(-1, 4), 3);
  assert.strictEqual(wrapJukeboxIndex(4, 4), 0);
  assert.strictEqual(wrapJukeboxIndex(2, 0), 0);
});
