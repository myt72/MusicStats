import React, { useEffect, useState } from "react";

function App() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadStats() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("http://localhost:3001/api/stats");
      const data = await res.json();

      if (!data || !data.totals) {
        setError("No cached stats found.");
        setStats(null);
      } else {
        setStats(data);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load stats.");
    } finally {
      setLoading(false);
    }
  }

  async function rescan() {
    try {
      setLoading(true);
      setError(null);

      await fetch("http://localhost:3001/api/rescan");
      await loadStats();
    } catch (err) {
      console.error(err);
      setError("Rescan failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  if (loading) {
    return <div className="app">Loading…</div>;
  }

  if (error || !stats) {
    return (
      <div className="app">
        <h2>{error || "No stats available."}</h2>
        <button onClick={rescan}>Scan Library</button>
      </div>
    );
  }

  const { totals, artists, albums, genres, years } = stats;

  return (
    <div className="app">
      <header className="header">
        <h1>Music Library Stats</h1>
        <button onClick={rescan}>Refresh from directory</button>
      </header>

      <section className="cards">
        <div className="card">
          <h2>Total Tracks</h2>
          <p>{totals.tracks}</p>
        </div>
        <div className="card">
          <h2>Total Hours</h2>
          <p>{totals.durationHours.toFixed(1)}</p>
        </div>
        <div className="card">
          <h2>Average Bitrate</h2>
          <p>{totals.avgBitrate} kbps</p>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Top Artists</h2>
          <ul>
            {artists.slice(0, 15).map(a => (
              <li key={a.artist}>
                <strong>{a.artist}</strong> — {a.trackCount} tracks, {a.albumCount} albums
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Top Albums</h2>
          <ul>
            {albums.slice(0, 15).map(al => (
              <li key={al.album}>
                <strong>{al.album}</strong> — {al.trackCount} tracks ({al.artist})
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Genres</h2>
          <ul>
            {genres.map(g => (
              <li key={g.genre}>
                <strong>{g.genre}</strong> — {g.trackCount} tracks
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Years</h2>
          <ul>
            {years.map(y => (
              <li key={y.year}>
                <strong>{y.year}</strong> — {y.trackCount} tracks
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

export default App;
