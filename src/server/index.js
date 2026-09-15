import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scanLibrary } from "./scanner.js";
import { computeStats } from "./stats.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, "..", "..", "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = express();
const PORT = 3001;

app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// Normalize cache path (absolute or relative)
function getCachePath() {
  if (!config.cacheFile) return null;

  // If absolute path, use it directly
  if (path.isAbsolute(config.cacheFile)) {
    return config.cacheFile;
  }

  // Otherwise resolve relative to project root
  return path.join(__dirname, "..", "..", config.cacheFile);
}

// Load cache.json safely
function loadCache() {
  try {
    const cachePath = getCachePath();
    if (!cachePath) return null;

    if (!fs.existsSync(cachePath)) return null;

    const raw = fs.readFileSync(cachePath, "utf-8").trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.totals) return null;

    return parsed;
  } catch (err) {
    console.error("Cache load error:", err);
    return null;
  }
}

// Save cache.json safely
function saveCache(stats) {
  try {
    const cachePath = getCachePath();
    if (!cachePath) return;

    fs.writeFileSync(cachePath, JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error("Cache save error:", err);
  }
}

// GET /api/stats — load cache first, fallback to scan
app.get("/api/stats", async (req, res) => {
  try {
    const cached = loadCache();
    if (cached) {
      return res.json(cached);
    }

    // No cache ? scan library
    const library = await scanLibrary(config);
    const stats = computeStats(library);
    saveCache(stats);

    return res.json(stats);
  } catch (err) {
    console.error("Error in /api/stats:", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// GET /api/rescan — force full rescan
app.get("/api/rescan", async (req, res) => {
  try {
    const library = await scanLibrary(config);
    const stats = computeStats(library);
    saveCache(stats);

    res.json({ status: "rescanned" });
  } catch (err) {
    console.error("Rescan error:", err);
    res.status(500).json({ error: "Rescan failed" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Music stats server running on http://0.0.0.0:${PORT}`);
});
