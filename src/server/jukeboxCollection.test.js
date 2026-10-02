import assert from "assert";
import test from "node:test";
import { buildJukeboxCollection, parseM3U } from "./jukeboxCollection.js";

test("parseM3U skips comments and resolves relative entries", () => {
  const text = "\uFEFF#EXTM3U\r\n#EXTINF:1,x\r\nP:\\Music\\a.mp3\r\n\r\nsub/b.mp3\r\n";
  assert.deepStrictEqual(parseM3U(text, "/lists"), ["P:\\Music\\a.mp3", "/lists/sub/b.mp3"]);
});

test("buildJukeboxCollection matches tracks and flags partial albums", () => {
  const library = [
    { id: "1", file: "P:/Music/A/X/1.mp3", albumKey: "A|X" },
    { id: "2", file: "P:/Music/A/X/2.mp3", albumKey: "A|X" },
    { id: "3", file: "P:/Music/B/Y/1.mp3", albumKey: "B|Y" }
  ];
  const result = buildJukeboxCollection(
    ["p:\\music\\a\\x\\1.mp3", "P:/Music/B/Y/1.mp3", "P:/Music/missing.mp3"],
    library
  );
  assert.deepStrictEqual(result.trackIds.sort(), ["1", "3"]);
  assert.strictEqual(result.unmatched.length, 1);
  const x = result.albums.find(a => a.albumKey === "A|X");
  assert.deepStrictEqual([x.trackCountIncluded, x.trackCountTotal, x.partial], [1, 2, true]);
  assert.strictEqual(result.albums.find(a => a.albumKey === "B|Y").partial, false);
});
