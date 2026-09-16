import assert from "assert";
import test from "node:test";
import {
  buildIpodFastScrollTargets,
  buildIpodView,
  createPlaybackQueue,
  getIpodFastScrollLetter,
  getIpodSelectionPath,
  getMovedIpodSelectionIndex,
  getNearestIpodFastScrollTarget,
  getNextIpodSelectionIndex,
  getQueueTransportIndex,
  getWheelAngle,
  getWheelAngleDelta,
  getWheelMove
} from "./ipodBrowser.js";

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

test("buildIpodView sorts artists, de-duplicates artist rows, and creates stable unique row keys", () => {
  const view = buildIpodView(artists, tracks, null, null);

  assert.deepStrictEqual(
    view.items.map(item => item.artist),
    ["Alpha", "Zulu"]
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

test("wheel movement turns rotation into bounded list movement", () => {
  const wheelRect = { left: 0, top: 0, width: 200, height: 200 };
  const topAngle = getWheelAngle(100, 0, wheelRect);
  const rightAngle = getWheelAngle(200, 100, wheelRect);
  const wrappedMove = getWheelMove(0, Math.PI * 0.95, -Math.PI * 0.95);

  assert.ok(topAngle < 0);
  assert.ok(rightAngle > topAngle);
  assert.deepStrictEqual(getWheelMove(0, topAngle, rightAngle, Math.PI / 4), {
    movement: 2,
    remainingAngle: 0
  });
  assert.ok(getWheelAngleDelta(Math.PI * 0.95, -Math.PI * 0.95) > 0);
  assert.strictEqual(wrappedMove.movement, 1);
  assert.strictEqual(getMovedIpodSelectionIndex(1, 3, 5), 2);
  assert.strictEqual(getMovedIpodSelectionIndex(1, 3, -5), 0);
});

test("fast-scroll helpers map artist names and jump to nearest available letters", () => {
  const fastTargets = buildIpodFastScrollTargets([
    { artist: "!!!" },
    { artist: "2Pac" },
    { artist: "The Beatles" },
    { artist: "Édith Piaf" },
    { artist: "Kansas" }
  ]);

  assert.strictEqual(getIpodFastScrollLetter("  Édith Piaf"), "E");
  assert.strictEqual(getIpodFastScrollLetter("3OH!3"), "O");
  assert.strictEqual(getIpodFastScrollLetter("!!!"), "#");
  assert.deepStrictEqual(getNearestIpodFastScrollTarget("K", fastTargets), { letter: "K", index: 4 });
  assert.deepStrictEqual(getNearestIpodFastScrollTarget("J", fastTargets), { letter: "K", index: 4 });
  assert.deepStrictEqual(getNearestIpodFastScrollTarget("Q", fastTargets), { letter: "P", index: 1 });
});

test("queue helpers keep song playback inside the selected album queue", () => {
  const playback = createPlaybackQueue(tracks.filter(track => track.album === "Second Album"), "1");

  assert.deepStrictEqual(playback.queue, ["3", "1"]);
  assert.strictEqual(playback.queueIndex, 1);
  assert.strictEqual(playback.selectedTrack?.title, "Second Song");
  assert.strictEqual(getQueueTransportIndex(playback.queueIndex, playback.queue.length, -1), 0);
  assert.strictEqual(getQueueTransportIndex(playback.queueIndex, playback.queue.length, 1), -1);
});
