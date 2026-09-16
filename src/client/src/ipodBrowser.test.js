import assert from "assert";
import test from "node:test";
import { buildIpodView, getIpodSelectionPath, getNextIpodSelectionIndex } from "./ipodBrowser.js";

const artists = [
  { artist: "Zulu", albumCount: 1, trackCount: 1 },
  { artist: "Alpha", albumCount: 2, trackCount: 3 },
  { artist: "Alpha", albumCount: 3, trackCount: 4 }
];

const tracks = [
  {
    id: "1",
    title: "Second Song",
    artist: "Alpha",
    album: "Second Album",
    durationSeconds: 180,
    trackNumber: 2,
    discNumber: 1
  },
  {
    id: "2",
    title: "First Song",
    artist: "Alpha",
    album: "First Album",
    durationSeconds: 150,
    trackNumber: 1,
    discNumber: 1
  },
  {
    id: "3",
    title: "Album Opener",
    artist: "Alpha",
    album: "Second Album",
    durationSeconds: 120,
    trackNumber: 1,
    discNumber: 1
  }
];

test("buildIpodView sorts artists and creates stable unique row keys", () => {
  const view = buildIpodView(artists, tracks, null, null);

  assert.deepStrictEqual(
    view.items.map(item => item.artist),
    ["Alpha", "Alpha", "Zulu"]
  );
  assert.strictEqual(new Set(view.items.map(item => item.key)).size, view.items.length);
});

test("iPod selection resets when moving from artists to albums to songs", () => {
  const artistPath = getIpodSelectionPath(null, null);
  const albumPath = getIpodSelectionPath("Alpha", null);
  const songPath = getIpodSelectionPath("Alpha", "Second Album");

  const albumView = buildIpodView(artists, tracks, "Alpha", null);
  const songView = buildIpodView(artists, tracks, "Alpha", "Second Album");

  assert.strictEqual(getNextIpodSelectionIndex(2, albumView.items.length, artistPath, albumPath), 0);
  assert.strictEqual(getNextIpodSelectionIndex(1, songView.items.length, albumPath, songPath), 0);
  assert.deepStrictEqual(
    songView.items.map(item => item.title),
    ["Album Opener", "Second Song"]
  );
});
