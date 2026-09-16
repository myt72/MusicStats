import assert from "assert";
import test from "node:test";
import { buildChartData } from "./chartData.js";

test("buildChartData ranks artists by album count with stable tie-breakers", () => {
  const chartData = buildChartData({
    artists: [
      { artist: "Zulu", albumCount: 2, trackCount: 8 },
      { artist: "Alpha", albumCount: 3, trackCount: 4 },
      { artist: "Beta", albumCount: 3, trackCount: 7 }
    ],
    albums: [],
    genres: [],
    years: []
  });

  assert.deepStrictEqual(
    chartData.artistsByAlbumCount.map(item => item.artist),
    ["Beta", "Alpha", "Zulu"]
  );
});
