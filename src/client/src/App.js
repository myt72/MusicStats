import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

const DEFAULT_API_PORT = "3001";
const API_ORIGIN =
  process.env.REACT_APP_API_ORIGIN ||
  `${window.location.protocol}//${window.location.hostname || "localhost"}:${DEFAULT_API_PORT}`;
const API_BASE_URL = `${API_ORIGIN.replace(/\/$/, "")}/api`;
const numberFormatter = new Intl.NumberFormat();

function formatCount(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

function formatHours(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

function formatDuration(seconds) {
  const totalMinutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${formatCount(totalMinutes)} min`;
  }

  if (!minutes) {
    return `${formatCount(hours)} hr`;
  }

  return `${formatCount(hours)} hr ${formatCount(minutes)} min`;
}

function fetchJson(url) {
  return fetch(url).then(async response => {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Request failed");
    }

    return response.json();
  });
}

function getBrowseValue(item, browseMode) {
  if (browseMode === "artists") return item.artist;
  if (browseMode === "albums") return `${item.album} ${item.artist}`;
  if (browseMode === "genres") return item.genre;
  return String(item.year);
}

function AlbumArt({ trackId, size = "medium" }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [trackId]);

  if (!trackId || failed) {
    return <div className={`album-art album-art-${size} album-art-placeholder`}>♪</div>;
  }

  return (
    <img
      className={`album-art album-art-${size}`}
      src={`${API_BASE_URL}/tracks/${trackId}/art`}
      alt="Album art"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function ChartCard({ title, items, labelForItem }) {
  const maxValue = items[0]?.trackCount || 1;

  return (
    <div className="panel chart-panel">
      <h2>{title}</h2>
      <div className="chart">
        {items.map(item => {
          const label = labelForItem(item);
          const width = Math.max((item.trackCount / maxValue) * 100, 8);

          return (
            <div className="chart-row" key={`${title}-${label}`}>
              <div className="chart-label" title={label}>
                {label}
              </div>
              <div className="chart-bar-wrap">
                <div className="chart-bar" style={{ width: `${width}%` }} />
                <span className="chart-value">{formatCount(item.trackCount)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function App() {
  const [stats, setStats] = useState(null);
  const [library, setLibrary] = useState({
    browse: { artists: [], albums: [], genres: [], years: [] },
    tracks: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [browseMode, setBrowseMode] = useState("artists");
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState(null);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const [statsData, libraryData] = await Promise.all([
        fetchJson(`${API_BASE_URL}/stats`),
        fetchJson(`${API_BASE_URL}/library`)
      ]);

      if (!statsData || !statsData.totals || !libraryData || !Array.isArray(libraryData.tracks)) {
        setStats(null);
        setLibrary({ browse: { artists: [], albums: [], genres: [], years: [] }, tracks: [] });
        setError("No cached stats found.");
        return;
      }

      setStats(statsData);
      setLibrary(libraryData);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load stats.");
    } finally {
      setLoading(false);
    }
  }

  async function rescan() {
    try {
      setLoading(true);
      setError(null);
      await fetchJson(`${API_BASE_URL}/rescan`);
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message || "Rescan failed.");
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const browseItems = useMemo(() => {
    return library.browse[browseMode] || [];
  }, [browseMode, library]);

  const browseQuery = searchQuery.trim().toLowerCase();

  const filteredBrowseItems = useMemo(() => {
    if (!browseQuery) {
      return browseItems.slice(0, 250);
    }

    return browseItems
      .filter(item => getBrowseValue(item, browseMode).toLowerCase().includes(browseQuery))
      .slice(0, 250);
  }, [browseItems, browseMode, browseQuery]);

  const filteredTracks = useMemo(() => {
    let nextTracks = [...library.tracks];

    if (selectedFilter?.type === "artist") {
      nextTracks = nextTracks.filter(track => track.artist === selectedFilter.value);
    } else if (selectedFilter?.type === "album") {
      nextTracks = nextTracks.filter(
        track => track.album === selectedFilter.value.album && track.artist === selectedFilter.value.artist
      );
    } else if (selectedFilter?.type === "genre") {
      nextTracks = nextTracks.filter(track => track.genres.includes(selectedFilter.value));
    } else if (selectedFilter?.type === "year") {
      nextTracks = nextTracks.filter(track => track.year === selectedFilter.value);
    }

    if (browseQuery) {
      nextTracks = nextTracks.filter(track => {
        const haystack = [track.title, track.artist, track.album, ...(track.genres || []), track.year]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(browseQuery);
      });
    }

    return nextTracks.slice(0, 80);
  }, [library.tracks, selectedFilter, browseQuery]);

  const chartData = useMemo(() => {
    if (!stats) {
      return { artists: [], albums: [], genres: [], years: [] };
    }

    return {
      artists: stats.artists.slice(0, 10),
      albums: stats.albums.slice(0, 10),
      genres: stats.genres.slice(0, 10),
      years: [...stats.years].sort((left, right) => right.trackCount - left.trackCount).slice(0, 10)
    };
  }, [stats]);

  useEffect(() => {
    if (selectedTrack && !filteredTracks.some(track => track.id === selectedTrack.id)) {
      setSelectedTrack(null);
    }
  }, [filteredTracks, selectedTrack]);

  if (loading) {
    return <div className="app">Loading...</div>;
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
        <div>
          <h1>Music Library Stats</h1>
          <p className="subhead">Browse, search, chart, and play tracks from the scanned library cache.</p>
        </div>
        <button onClick={rescan}>Refresh from directory</button>
      </header>

      <section className="cards">
        <div className="card">
          <h2>Total Tracks</h2>
          <p>{formatCount(totals.tracks)}</p>
        </div>
        <div className="card">
          <h2>Total Hours</h2>
          <p>{formatHours(totals.durationHours)}</p>
        </div>
        <div className="card">
          <h2>Total Artists</h2>
          <p>{formatCount(totals.artists)}</p>
        </div>
        <div className="card">
          <h2>Total Albums</h2>
          <p>{formatCount(totals.albums)}</p>
        </div>
      </section>

      <section className="grid charts-grid">
        <ChartCard title="Top Artists" items={chartData.artists} labelForItem={item => item.artist} />
        <ChartCard
          title="Top Albums"
          items={chartData.albums}
          labelForItem={item => `${item.album} (${item.artist})`}
        />
        <ChartCard title="Genres" items={chartData.genres} labelForItem={item => item.genre} />
        <ChartCard title="Years" items={chartData.years} labelForItem={item => String(item.year)} />
      </section>

      <section className="browser panel">
        <div className="browser-header">
          <div>
            <h2>Music Browser</h2>
            <p className="panel-note">
              Search across tracks, artists, albums, genres, and years, then play directly in the browser.
            </p>
          </div>
          <input
            className="search-input"
            type="search"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search your library"
          />
        </div>

        <div className="browser-tabs">
          {[
            ["artists", "Artists"],
            ["albums", "Albums"],
            ["genres", "Genres"],
            ["years", "Years"]
          ].map(([mode, label]) => (
            <button
              key={mode}
              className={mode === browseMode ? "tab active" : "tab"}
              onClick={() => {
                setBrowseMode(mode);
                setSelectedFilter(null);
              }}
            >
              {label}
            </button>
          ))}
          {selectedFilter && (
            <button className="tab clear-tab" onClick={() => setSelectedFilter(null)}>
              Clear filter
            </button>
          )}
        </div>

        <div className="browser-layout">
          <div className="browser-list">
            <h3>Browse {browseMode}</h3>
            <ul>
              {filteredBrowseItems.map(item => {
                const label = getBrowseValue(item, browseMode);
                const isSelected =
                  selectedFilter &&
                  ((browseMode === "artists" && selectedFilter.type === "artist" && selectedFilter.value === item.artist) ||
                    (browseMode === "albums" &&
                      selectedFilter.type === "album" &&
                      selectedFilter.value.album === item.album &&
                      selectedFilter.value.artist === item.artist) ||
                    (browseMode === "genres" && selectedFilter.type === "genre" && selectedFilter.value === item.genre) ||
                    (browseMode === "years" && selectedFilter.type === "year" && selectedFilter.value === item.year));

                return (
                  <li key={`${browseMode}-${label}`}>
                    <button
                      className={isSelected ? "browse-item active" : "browse-item"}
                      onClick={() => {
                        if (browseMode === "artists") {
                          setSelectedFilter({ type: "artist", value: item.artist });
                        } else if (browseMode === "albums") {
                          setSelectedFilter({ type: "album", value: { album: item.album, artist: item.artist } });
                        } else if (browseMode === "genres") {
                          setSelectedFilter({ type: "genre", value: item.genre });
                        } else {
                          setSelectedFilter({ type: "year", value: item.year });
                        }
                      }}
                    >
                      <span>{label}</span>
                      <span className="browse-meta">{formatCount(item.trackCount)} tracks</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="track-panel">
            <div className="track-panel-header">
              <div>
                <h3>Tracks</h3>
                <p className="panel-note">Showing {formatCount(filteredTracks.length)} tracks from the current browse/search view.</p>
              </div>
              {selectedTrack && (
                <div className="now-playing">
                  <AlbumArt trackId={selectedTrack.albumArtTrackId || selectedTrack.id} size="large" />
                  <div>
                    <strong>{selectedTrack.title}</strong>
                    <div>{selectedTrack.artist}</div>
                    <div className="panel-note">{selectedTrack.album}</div>
                  </div>
                </div>
              )}
            </div>

            {selectedTrack ? (
              <audio
                key={selectedTrack.id}
                className="audio-player"
                controls
                autoPlay
                src={`${API_BASE_URL}/tracks/${selectedTrack.id}/stream`}
              />
            ) : (
              <p className="panel-note">Select a track to play.</p>
            )}

            <div className="track-list-grid">
              <div className="track-list-header" aria-hidden="true">
                <span aria-hidden />
                <span>Track</span>
                <span>Artist</span>
                <span className="track-album-header">Album</span>
                <span>Length</span>
              </div>
              <ul className="track-list">
                {filteredTracks.map(track => (
                  <li key={track.id} className={track.id === selectedTrack?.id ? "track-row active" : "track-row"}>
                    <button
                      type="button"
                      className="track-row-button"
                      onClick={() => setSelectedTrack(track)}
                      title={`Play ${track.title}`}
                      aria-label={`Select ${track.title} by ${track.artist}`}
                    >
                      <span>
                        <AlbumArt trackId={track.albumArtTrackId || track.id} size="small" />
                      </span>
                      <span className="track-cell track-title" title={track.title}>
                        {track.title}
                      </span>
                      <span className="track-cell" title={track.artist}>
                        {track.artist}
                      </span>
                      <span className="track-cell track-album" title={track.album}>
                        {track.album}
                      </span>
                      <span className="track-cell track-duration">
                        {formatDuration(track.durationSeconds)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="track-play-button"
                      onClick={event => {
                        event.stopPropagation();
                        setSelectedTrack(track);
                      }}
                      aria-label={`Play ${track.title} by ${track.artist}`}
                    >
                      ▶
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Top Artists</h2>
          <ul>
            {artists.slice(0, 15).map(artist => (
              <li key={artist.artist}>
                <strong>{artist.artist}</strong>
                <span className="sep">•</span>
                {formatCount(artist.trackCount)} tracks, {formatCount(artist.albumCount)} albums
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Top Albums</h2>
          <ul>
            {albums.slice(0, 15).map(album => (
              <li key={`${album.artist}-${album.album}`}>
                <strong>{album.album}</strong>
                <span className="sep">•</span>
                {formatCount(album.trackCount)} tracks ({album.artist})
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Genres</h2>
          <ul>
            {genres.slice(0, 15).map(genre => (
              <li key={genre.genre}>
                <strong>{genre.genre}</strong>
                <span className="sep">•</span>
                {formatCount(genre.trackCount)} tracks
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Years</h2>
          <ul>
            {years.slice(0, 15).map(year => (
              <li key={year.year}>
                <strong>{year.year}</strong>
                <span className="sep">•</span>
                {formatCount(year.trackCount)} tracks
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

export default App;
