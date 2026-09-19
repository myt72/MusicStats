import assert from "assert";
import test from "node:test";
import { getPreferredBrowserOutputId, hasPlaybackOutputControls, prioritizeBrowserOutput } from "./outputDevices.js";

test("preferred browser output falls back to built-in when saved targets are unavailable", () => {
  const browserOutputTargets = [
    { id: "", label: "This device" },
    { id: "speaker-1", label: "Desk speaker" }
  ];

  assert.strictEqual(getPreferredBrowserOutputId(["missing", "speaker-1"], browserOutputTargets, ""), "speaker-1");
  assert.strictEqual(getPreferredBrowserOutputId(["missing"], browserOutputTargets, ""), "");
});

test("prioritizing a browser output moves it to the front and drops invalid targets", () => {
  const browserOutputTargets = [
    { id: "", label: "This device" },
    { id: "speaker-1", label: "Desk speaker" },
    { id: "speaker-2", label: "Living room" }
  ];

  assert.deepStrictEqual(
    prioritizeBrowserOutput("speaker-2", ["missing", "speaker-1", ""], browserOutputTargets),
    ["speaker-2", "speaker-1", ""]
  );
  assert.deepStrictEqual(prioritizeBrowserOutput("missing", ["speaker-1", "missing"], browserOutputTargets), ["speaker-1"]);
});

test("playback output controls stay available when browser outputs or remote picker are supported", () => {
  assert.strictEqual(hasPlaybackOutputControls(false, false, []), false);
  assert.strictEqual(hasPlaybackOutputControls(true, false, [{ id: "", label: "This device" }]), true);
  assert.strictEqual(hasPlaybackOutputControls(false, true, []), true);
});
