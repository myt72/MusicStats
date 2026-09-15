import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { API_BASE_URL } from "./config";
const numberFormatter = new Intl.NumberFormat();
const PHONE_MEDIA_QUERY = "(max-width: 700px)";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const DEFAULT_OUTPUTS_STORAGE_KEY = "musicstats.defaultOutputs";
const BUILT_IN_OUTPUT_ID = "";

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

function sortAlbumTracks(tracks) {
  return [...tracks].sort((left, right) => {
    if ((left.discNumber || 0) !== (right.discNumber || 0)) {
      return (left.discNumber || 0) - (right.discNumber || 0);
    }

    if ((left.trackNumber || 0) !== (right.trackNumber || 0)) {
      return (left.trackNumber || 0) - (right.trackNumber || 0);
    }

    return left.title.localeCompare(right.title);
  });
}

function getArtistJumpKey(value) {
  const trimmedValue = String(value || "").trim().toUpperCase();
  const match = trimmedValue.match(/[A-Z]/);
  return match ? match[0] : null;
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
  const audioRef = useRef(null);
  const browserListRef = useRef(null);
  const artistItemRefs = useRef(new Map());
  const artistItemRefCallbacks = useRef(new Map());
  const artistJumpPickerRef = useRef(null);
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
  const [artistViewMode, setArtistViewMode] = useState("albums");
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [playbackQueue, setPlaybackQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const playbackQueueRef = useRef([]);
  const libraryTracksRef = useRef([]);
  const [availableOutputs, setAvailableOutputs] = useState([]);
  const outputSelectionSupported =
    typeof HTMLMediaElement !== "undefined" && typeof HTMLMediaElement.prototype.setSinkId === "function";
  const [remotePlaybackPromptSupported, setRemotePlaybackPromptSupported] = useState(false);
  const [defaultOutputIds, setDefaultOutputIds] = useState(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const parsed = JSON.parse(window.localStorage.getItem(DEFAULT_OUTPUTS_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(value => typeof value === "string") : [];
    } catch {
      return [];
    }
  });
  const [outputError, setOutputError] = useState(null);
  const [remotePlaybackError, setRemotePlaybackError] = useState(null);
  const [uiMode, setUiMode] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return "default";
    }

    return window.matchMedia(PHONE_MEDIA_QUERY).matches ? "phone" : "default";
  });
  const [showPhoneStats, setShowPhoneStats] = useState(false);

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

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
      return;
    }

    window.localStorage.setItem(DEFAULT_OUTPUTS_STORAGE_KEY, JSON.stringify(defaultOutputIds));
  }, [defaultOutputIds]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    try {
      const audioProbe = document.createElement("audio");
      setRemotePlaybackPromptSupported(typeof audioProbe.remote?.prompt === "function");
    } catch {
      setRemotePlaybackPromptSupported(false);
    }
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !outputSelectionSupported || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    let cancelled = false;
    const refreshOutputs = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          const audioOutputs = devices.filter(device => device.kind === "audiooutput");
          setAvailableOutputs(
            audioOutputs.map((device, index) => ({
              id: device.deviceId,
              label: device.label || `Speaker output ${index + 1} (${device.deviceId || "default"})`
            }))
          );
        }
      } catch (err) {
        if (!cancelled) {
          setOutputError(err.message || "Unable to list output devices.");
        }
      }
    };

    refreshOutputs();
    navigator.mediaDevices.addEventListener?.("devicechange", refreshOutputs);

    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", refreshOutputs);
    };
  }, [outputSelectionSupported]);

  useEffect(() => {
    playbackQueueRef.current = playbackQueue;
  }, [playbackQueue]);

  useEffect(() => {
    libraryTracksRef.current = library.tracks;
  }, [library.tracks]);

  const browserOutputTargets = useMemo(() => {
    if (!outputSelectionSupported) {
      return [];
    }

    const hasBuiltInTarget = availableOutputs.some(output => output.id === BUILT_IN_OUTPUT_ID);
    if (hasBuiltInTarget) {
      return availableOutputs;
    }

    return [{ id: BUILT_IN_OUTPUT_ID, label: "This device (built-in/default speaker)" }, ...availableOutputs];
  }, [availableOutputs, outputSelectionSupported]);

  function applyPreferredOutput(audioNode) {
    if (!audioNode || !outputSelectionSupported) {
      return;
    }

    const selectedOutput = defaultOutputIds.find(outputId =>
      browserOutputTargets.some(output => output.id === outputId)
    );

    audioNode
      .setSinkId(selectedOutput || "")
      .then(() => setOutputError(null))
      .catch(err => setOutputError(err.message || "Unable to set output device."));
  }

  function handleAudioRef(node) {
    audioRef.current = node;
    if (node) {
      applyPreferredOutput(node);
    }
  }

  useEffect(() => {
    if (!selectedTrack || !audioRef.current) {
      return;
    }

    applyPreferredOutput(audioRef.current);
  }, [selectedTrack, browserOutputTargets, defaultOutputIds, outputSelectionSupported]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(PHONE_MEDIA_QUERY);
    const syncMode = event => setUiMode(event.matches ? "phone" : "default");

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncMode);
      return () => mediaQuery.removeEventListener("change", syncMode);
    }

    mediaQuery.addListener(syncMode);
    return () => mediaQuery.removeListener(syncMode);
  }, []);

  function playTrack(track) {
    setSelectedTrack(track);
    setPlaybackQueue([]);
    setQueueIndex(-1);
  }

  function playAlbumTracks(tracks) {
    const orderedTracks = sortAlbumTracks(tracks);
    if (!orderedTracks.length) {
      return;
    }

    setPlaybackQueue(orderedTracks.map(track => track.id));
    setQueueIndex(0);
    setSelectedTrack(orderedTracks[0]);
  }

  function handleAudioEnded() {
    const activeQueue = playbackQueueRef.current;
    const allTracks = libraryTracksRef.current;

    setQueueIndex(currentIndex => {
      const nextIndex = currentIndex + 1;
      if (currentIndex < 0 || nextIndex >= activeQueue.length) {
        setPlaybackQueue([]);
        return -1;
      }

      const nextTrack = allTracks.find(track => track.id === activeQueue[nextIndex]);
      if (!nextTrack) {
        setPlaybackQueue([]);
        return -1;
      }

      setSelectedTrack(nextTrack);
      return nextIndex;
    });
  }

  function moveDefaultOutput(outputId, direction) {
    setDefaultOutputIds(current => {
      const fromIndex = current.indexOf(outputId);
      const toIndex = fromIndex + direction;
      if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) {
        return current;
      }

      const nextOrder = [...current];
      [nextOrder[fromIndex], nextOrder[toIndex]] = [nextOrder[toIndex], nextOrder[fromIndex]];
      return nextOrder;
    });
  }

  function openPlaybackTargetPicker() {
    setRemotePlaybackError(null);
    const activeAudioNode = audioRef.current;
    if (!activeAudioNode) {
      setRemotePlaybackError("Start playback to open the player target picker.");
      return;
    }

    let remotePlayback;
    try {
      remotePlayback = activeAudioNode.remote;
    } catch {
      setRemotePlaybackError("This browser does not expose a programmable cast/output picker.");
      return;
    }

    const prompt = remotePlayback?.prompt;
    if (typeof prompt !== "function") {
      setRemotePlaybackError("This browser does not expose a programmable cast/output picker.");
      return;
    }

    prompt.call(remotePlayback).catch(err => {
      const message = err?.name === "NotAllowedError" ? "Output picker was dismissed." : err?.message;
      setRemotePlaybackError(message || "Unable to open the playback target picker.");
    });
  }

  const browseItems = useMemo(() => {
    return library.browse[browseMode] || [];
  }, [browseMode, library]);

  const browseQuery = searchQuery.trim().toLowerCase();

  const filteredBrowseItems = useMemo(() => {
    const nextItems = !browseQuery
      ? browseItems
      : browseItems.filter(item => getBrowseValue(item, browseMode).toLowerCase().includes(browseQuery));

    return browseMode === "artists" ? nextItems : nextItems.slice(0, 250);
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
  const isPhoneMode = uiMode === "phone";
  const showArtistJumpPicker = isPhoneMode && browseMode === "artists" && filteredBrowseItems.length > 0;
  const artistJumpTargets = useMemo(() => {
    if (!showArtistJumpPicker) {
      return {};
    }

    const artistLabels = filteredBrowseItems
      .map(item => item.artist)
      .filter(artist => typeof artist === "string" && artist.trim());
    const nextTargets = {};

    for (const artist of artistLabels) {
      const artistKey = getArtistJumpKey(artist);
      if (artistKey && !nextTargets[artistKey]) {
        nextTargets[artistKey] = artist;
      }
    }

    return nextTargets;
  }, [filteredBrowseItems, showArtistJumpPicker]);
  const selectedArtistAlbums = useMemo(() => {
    if (selectedFilter?.type !== "artist") {
      return [];
    }

    const artistTracks = library.tracks.filter(track => track.artist === selectedFilter.value);
    const albumMap = new Map();
    for (const track of artistTracks) {
      const albumKey = track.album;
      if (!albumMap.has(albumKey)) {
        albumMap.set(albumKey, {
          album: track.album,
          artist: track.artist,
          trackCount: 0,
          artTrackId: track.albumArtTrackId || track.id,
          tracks: []
        });
      }

      const albumEntry = albumMap.get(albumKey);
      albumEntry.trackCount += 1;
      albumEntry.tracks.push(track);
    }

    return [...albumMap.values()]
      .map(album => ({ ...album, tracks: sortAlbumTracks(album.tracks) }))
      .sort((left, right) => left.album.localeCompare(right.album));
  }, [library.tracks, selectedFilter]);
  const selectedAlbumTracks = useMemo(() => {
    if (selectedFilter?.type !== "album") {
      return [];
    }

    return library.tracks.filter(
      track => track.album === selectedFilter.value.album && track.artist === selectedFilter.value.artist
    );
  }, [library.tracks, selectedFilter]);

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

  useEffect(() => {
    if (browseMode !== "artists") {
      artistItemRefs.current.clear();
      artistItemRefCallbacks.current.clear();
      return;
    }

    const visibleArtists = new Set(filteredBrowseItems.map(item => item.artist));
    for (const artist of artistItemRefs.current.keys()) {
      if (!visibleArtists.has(artist)) {
        artistItemRefs.current.delete(artist);
      }
    }

    for (const artist of artistItemRefCallbacks.current.keys()) {
      if (!visibleArtists.has(artist)) {
        artistItemRefCallbacks.current.delete(artist);
      }
    }
  }, [browseMode, filteredBrowseItems]);

  function getArtistItemRefCallback(artist) {
    if (!artistItemRefCallbacks.current.has(artist)) {
      artistItemRefCallbacks.current.set(artist, node => {
        if (node) {
          artistItemRefs.current.set(artist, node);
          return;
        }

        artistItemRefs.current.delete(artist);
      });
    }

    return artistItemRefCallbacks.current.get(artist);
  }

  function jumpToArtistLetter(letter) {
    const targetArtist = artistJumpTargets[letter];
    if (!targetArtist) {
      return;
    }

    const listNode = browserListRef.current;
    const targetNode = artistItemRefs.current.get(targetArtist);
    if (!listNode || !targetNode) {
      return;
    }

    const scrollTop =
      targetNode.getBoundingClientRect().top - listNode.getBoundingClientRect().top + listNode.scrollTop;
    listNode.scrollTo({ top: Math.max(0, scrollTop - 8), behavior: "smooth" });
  }

  function handleArtistJumpPickerKeyDown(event) {
    if (!artistJumpPickerRef.current) {
      return;
    }

    const supportedKeys = ["ArrowUp", "ArrowDown", "Home", "End"];
    if (!supportedKeys.includes(event.key)) {
      return;
    }

    const enabledButtons = Array.from(artistJumpPickerRef.current.querySelectorAll("button:not(:disabled)"));
    if (!enabledButtons.length) {
      return;
    }

    event.preventDefault();
    const currentIndex = enabledButtons.indexOf(event.currentTarget);
    if (event.key === "Home") {
      enabledButtons[0].focus();
      return;
    }

    if (event.key === "End") {
      enabledButtons[enabledButtons.length - 1].focus();
      return;
    }

    const direction = event.key === "ArrowUp" ? -1 : 1;
    const fallbackIndex = direction > 0 ? 0 : enabledButtons.length - 1;
    const nextIndex = currentIndex >= 0 ? currentIndex + direction : fallbackIndex;
    const boundedIndex = Math.min(enabledButtons.length - 1, Math.max(0, nextIndex));
    enabledButtons[boundedIndex].focus();
  }

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
    <div className={isPhoneMode ? "app phone-mode" : "app"}>
      <header className="header">
        <div>
          <h1>Music Library Stats</h1>
          <p className="subhead">Browse, search, chart, and play tracks from the scanned library cache.</p>
        </div>
        <div className="header-actions">
          <button onClick={rescan}>Refresh from directory</button>
          <button
            aria-pressed={isPhoneMode}
            onClick={() => setUiMode(current => (current === "phone" ? "default" : "phone"))}
          >
            {isPhoneMode ? "Desktop view" : "Phone view"}
          </button>
          {isPhoneMode && (
            <button aria-pressed={showPhoneStats} onClick={() => setShowPhoneStats(current => !current)}>
              {showPhoneStats ? "Hide stats" : "Show stats"}
            </button>
          )}
        </div>
      </header>

      {(!isPhoneMode || showPhoneStats) && (
        <>
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
        </>
      )}

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
          <div className={showArtistJumpPicker ? "browser-list-shell" : undefined}>
            <div className="browser-list" ref={browserListRef}>
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
                      (browseMode === "genres" &&
                        selectedFilter.type === "genre" &&
                        selectedFilter.value === item.genre) ||
                      (browseMode === "years" && selectedFilter.type === "year" && selectedFilter.value === item.year));

                  return (
                    <li key={`${browseMode}-${label}`}>
                      <button
                        ref={browseMode === "artists" ? getArtistItemRefCallback(item.artist) : undefined}
                        className={isSelected ? "browse-item active" : "browse-item"}
                        onClick={() => {
                          if (browseMode === "artists") {
                            setSelectedFilter({ type: "artist", value: item.artist });
                            setArtistViewMode("albums");
                          } else if (browseMode === "albums") {
                            setSelectedFilter({ type: "album", value: { album: item.album, artist: item.artist } });
                            setArtistViewMode("tracks");
                          } else if (browseMode === "genres") {
                            setSelectedFilter({ type: "genre", value: item.genre });
                            setArtistViewMode("tracks");
                          } else {
                            setSelectedFilter({ type: "year", value: item.year });
                            setArtistViewMode("tracks");
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
            {showArtistJumpPicker && (
              <nav className="artist-jump-picker" aria-label="Jump to artist letter" ref={artistJumpPickerRef}>
                {ALPHABET.map(letter => (
                  <button
                    key={letter}
                    type="button"
                    className="artist-jump-button"
                    onClick={() => jumpToArtistLetter(letter)}
                    onKeyDown={handleArtistJumpPickerKeyDown}
                    disabled={!artistJumpTargets[letter]}
                    aria-label={`Jump to artists starting with ${letter}`}
                  >
                    {letter}
                  </button>
                ))}
              </nav>
            )}
          </div>

          <div className="track-panel">
            <div className="track-panel-header">
              <div>
                <h3>Tracks</h3>
                <p className="panel-note">Showing {formatCount(filteredTracks.length)} tracks from the current browse/search view.</p>
                {selectedFilter?.type === "artist" && (
                  <div className="browser-tabs browser-subtabs">
                    <button
                      className={artistViewMode === "albums" ? "tab active" : "tab"}
                      onClick={() => setArtistViewMode("albums")}
                    >
                      Albums
                    </button>
                    <button
                      className={artistViewMode === "tracks" ? "tab active" : "tab"}
                      onClick={() => setArtistViewMode("tracks")}
                    >
                      Tracks
                    </button>
                  </div>
                )}
                {selectedFilter?.type === "album" && (
                  <button className="tab" onClick={() => playAlbumTracks(selectedAlbumTracks)}>
                    Play album ({formatCount(selectedAlbumTracks.length)})
                  </button>
                )}
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
                ref={handleAudioRef}
                className="audio-player"
                controls
                autoPlay
                onLoadedMetadata={event => applyPreferredOutput(event.currentTarget)}
                onEnded={handleAudioEnded}
                src={`${API_BASE_URL}/tracks/${selectedTrack.id}/stream`}
              />
            ) : (
              <p className="panel-note">Select a track to play.</p>
            )}

            <div className="track-list-grid">
              {selectedFilter?.type === "artist" && artistViewMode === "albums" ? (
                <ul className="artist-album-list">
                  {selectedArtistAlbums.map(album => {
                    return (
                      <li key={`${album.artist}-${album.album}`} className="artist-album-row">
                        <button
                          type="button"
                          className="browse-item"
                          onClick={() => {
                            setSelectedFilter({ type: "album", value: { album: album.album, artist: album.artist } });
                            setArtistViewMode("tracks");
                          }}
                        >
                          <span>{album.album}</span>
                          <span className="browse-meta">{formatCount(album.trackCount)} tracks</span>
                        </button>
                        <button
                          type="button"
                          className="track-play-button"
                          aria-label={`Play album ${album.album} by ${album.artist}`}
                          onClick={() => playAlbumTracks(album.tracks)}
                        >
                          ▶
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <>
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
                          onClick={() => playTrack(track)}
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
                            playTrack(track);
                          }}
                          aria-label={`Play ${track.title} by ${track.artist}`}
                        >
                          ▶
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {(!isPhoneMode || showPhoneStats) && <section className="grid">
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
      </section>}
    </div>
  );
}

export default App;
