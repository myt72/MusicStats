import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { buildChartData } from "./chartData";
import { API_BASE_URL } from "./config";
import {
  buildIpodFastScrollTargets,
  buildIpodView,
  createPlaybackQueue,
  getIpodFastScrollLetter,
  getNearestIpodFastScrollTarget,
  getMovedIpodSelectionIndex,
  getIpodSelectionPath,
  getNextIpodSelectionIndex,
  getQueueTransportIndex,
  getWheelAngle,
  getWheelAngleDelta,
  getWheelMove,
  groupAlbumsForArtist
} from "./ipodBrowser";
import {
  buildMobileAlbumList,
  buildMobileArtistList,
  buildMobileTrackList,
  searchMobileLibrary
} from "./mobileBrowse";
import { getPreferredBrowserOutputId, hasPlaybackOutputControls, prioritizeBrowserOutput } from "./outputDevices";
const numberFormatter = new Intl.NumberFormat();
const PHONE_MEDIA_QUERY = "(max-width: 700px)";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const DEFAULT_OUTPUTS_STORAGE_KEY = "musicstats.defaultOutputs";
const BUILT_IN_OUTPUT_ID = "";
const IPOD_FAST_SCROLL_LETTERS = [...ALPHABET, "#"];
const IPOD_FAST_SCROLL_ENTER_SPEED = 0.008;
const IPOD_FAST_SCROLL_EXIT_SPEED = 0.005;
const IPOD_FAST_SCROLL_OVERLAY_TIMEOUT_MS = 420;
const IPOD_FAST_SCROLL_ANGLE_PER_LETTER = Math.PI / 6;
const MOBILE_SEARCH_TRACK_LIMIT = 40;

function formatCount(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

function formatHours(value) {
  return numberFormatter.format(Math.round(Number(value) || 0));
}

function formatUnitCount(value, singular, plural = `${singular}s`) {
  const count = Math.round(Number(value) || 0);
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
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

function ChartCard({ title, items, labelForItem, valueForItem = item => item.trackCount, valueLabel = formatCount }) {
  const maxValue = valueForItem(items[0] || {}) || 1;

  return (
    <div className="panel chart-panel">
      <h2>{title}</h2>
      <div className="chart">
        {items.map(item => {
          const label = labelForItem(item);
          const value = valueForItem(item);
          const width = Math.max((value / maxValue) * 100, 8);

          return (
            <div className="chart-row" key={`${title}-${label}`}>
              <div className="chart-label" title={label}>
                {label}
              </div>
              <div className="chart-bar-wrap">
                <div className="chart-bar" style={{ width: `${width}%` }} />
                <span className="chart-value">{valueLabel(value)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IpodBrowser({
  title,
  breadcrumb,
  items,
  selectedIndex,
  onSelectIndex,
  onActivate,
  onBack,
  onMove,
  onTransport,
  selectedTrack,
  canPlayPrevious,
  canPlayNext
}) {
  const listRef = useRef(null);
  const wheelRef = useRef(null);
  const wheelPointerStateRef = useRef({ pointerId: null, lastAngle: null, lastTimestamp: 0, remainingAngle: 0 });
  const fastScrollStateRef = useRef({ active: false, remainingAngle: 0 });
  const fastScrollOverlayTimeoutRef = useRef(null);
  const fastScrollLetterRef = useRef(null);
  const [fastScrollLetter, setFastScrollLetter] = useState(null);
  const isArtistList = title === "Artists";
  const artistFastScrollTargets = useMemo(() => {
    if (!isArtistList) {
      return new Map();
    }

    return buildIpodFastScrollTargets(items);
  }, [isArtistList, items]);
  const wheelInteractiveSelector =
    "button, [href], input, select, textarea, [role='button'], [tabindex]:not([tabindex='-1'])";

  function clearFastScrollOverlayTimer() {
    if (fastScrollOverlayTimeoutRef.current) {
      clearTimeout(fastScrollOverlayTimeoutRef.current);
      fastScrollOverlayTimeoutRef.current = null;
    }
  }

  function setFastScrollOverlayLetter(nextLetter) {
    fastScrollLetterRef.current = nextLetter;
    setFastScrollLetter(nextLetter);
  }

  function dismissFastScrollOverlay() {
    clearFastScrollOverlayTimer();
    fastScrollOverlayTimeoutRef.current = setTimeout(() => {
      fastScrollStateRef.current = { active: false, remainingAngle: 0 };
      setFastScrollOverlayLetter(null);
      fastScrollOverlayTimeoutRef.current = null;
    }, IPOD_FAST_SCROLL_OVERLAY_TIMEOUT_MS);
  }

  function focusItem(index) {
    const nextNode = listRef.current?.querySelector(`[data-ipod-index="${index}"]`);
    nextNode?.focus();
  }

  useEffect(() => {
    const selectedNode = listRef.current?.querySelector(`[data-ipod-index="${selectedIndex}"]`);
    selectedNode?.scrollIntoView({ block: "nearest" });
  }, [items, selectedIndex]);

  useEffect(() => {
    fastScrollLetterRef.current = fastScrollLetter;
  }, [fastScrollLetter]);

  useEffect(() => {
    return () => {
      clearFastScrollOverlayTimer();
    };
  }, []);

  useEffect(() => {
    if (isArtistList) {
      return;
    }

    fastScrollStateRef.current = { active: false, remainingAngle: 0 };
    setFastScrollOverlayLetter(null);
    clearFastScrollOverlayTimer();
  }, [isArtistList]);

  useEffect(() => {
    if (!isArtistList || !items.length || selectedIndex < 0 || selectedIndex >= items.length) {
      return;
    }

    if (!fastScrollStateRef.current.active) {
      return;
    }

    const selectedLetter = getIpodFastScrollLetter(items[selectedIndex].artist);
    setFastScrollOverlayLetter(selectedLetter);
  }, [isArtistList, items, selectedIndex]);

  function clearWheelPointerState(pointerId) {
    if (pointerId !== undefined && wheelRef.current?.hasPointerCapture?.(pointerId)) {
      wheelRef.current.releasePointerCapture(pointerId);
    }

    wheelPointerStateRef.current = { pointerId: null, lastAngle: null, lastTimestamp: 0, remainingAngle: 0 };
    fastScrollStateRef.current = { active: false, remainingAngle: 0 };
    if (fastScrollLetterRef.current) {
      dismissFastScrollOverlay();
    }
  }

  function handleWheelPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    const interactiveTarget = event.target.closest(wheelInteractiveSelector);
    if (interactiveTarget && interactiveTarget !== wheelRef.current) {
      return;
    }

    const angle = getWheelAngle(event.clientX, event.clientY, wheelRef.current?.getBoundingClientRect());
    if (angle === null) {
      return;
    }

    event.preventDefault();
    wheelRef.current?.setPointerCapture?.(event.pointerId);
    wheelPointerStateRef.current = {
      pointerId: event.pointerId,
      lastAngle: angle,
      lastTimestamp: event.timeStamp || 0,
      remainingAngle: 0
    };
    fastScrollStateRef.current = { active: false, remainingAngle: 0 };
  }

  function handleWheelPointerMove(event) {
    const pointerState = wheelPointerStateRef.current;
    if (pointerState.pointerId !== event.pointerId) {
      return;
    }

    const nextAngle = getWheelAngle(event.clientX, event.clientY, wheelRef.current?.getBoundingClientRect());
    if (nextAngle === null || pointerState.lastAngle === null) {
      return;
    }

    event.preventDefault();
    const deltaMs = Math.max(1, (event.timeStamp || 0) - (pointerState.lastTimestamp || 0));
    const angleDelta = getWheelAngleDelta(pointerState.lastAngle, nextAngle);
    const speed = Math.abs(angleDelta) / deltaMs;
    const fastScrollState = fastScrollStateRef.current;
    const canUseFastScroll = isArtistList && items.length > 0;
    const shouldFastScroll = canUseFastScroll
      ? fastScrollState.active
        ? speed >= IPOD_FAST_SCROLL_EXIT_SPEED
        : speed >= IPOD_FAST_SCROLL_ENTER_SPEED
      : false;

    let nextRemainingAngle = pointerState.remainingAngle;
    if (shouldFastScroll) {
      if (!fastScrollState.active) {
        const currentArtist = items[Math.min(Math.max(selectedIndex, 0), items.length - 1)];
        setFastScrollOverlayLetter(getIpodFastScrollLetter(currentArtist?.artist));
      }

      dismissFastScrollOverlay();
      fastScrollState.active = true;
      const fastMove = getWheelMove(
        fastScrollState.remainingAngle,
        pointerState.lastAngle,
        nextAngle,
        IPOD_FAST_SCROLL_ANGLE_PER_LETTER
      );
      fastScrollState.remainingAngle = fastMove.remainingAngle;
      nextRemainingAngle = 0;

      if (fastMove.movement) {
        const currentLetter = fastScrollLetterRef.current || getIpodFastScrollLetter(items[selectedIndex]?.artist);
        const currentLetterIndex = Math.max(0, IPOD_FAST_SCROLL_LETTERS.indexOf(currentLetter));
        const nextLetterIndex = Math.min(
          IPOD_FAST_SCROLL_LETTERS.length - 1,
          Math.max(0, currentLetterIndex + fastMove.movement)
        );
        const requestedLetter = IPOD_FAST_SCROLL_LETTERS[nextLetterIndex];
        const target = getNearestIpodFastScrollTarget(requestedLetter, artistFastScrollTargets);
        if (target) {
          setFastScrollOverlayLetter(target.letter);
          onSelectIndex(target.index);
        }
      }
    } else {
      if (fastScrollState.active) {
        fastScrollStateRef.current = { active: false, remainingAngle: 0 };
        dismissFastScrollOverlay();
      }

      const nextMove = getWheelMove(pointerState.remainingAngle, pointerState.lastAngle, nextAngle);
      nextRemainingAngle = nextMove.remainingAngle;
      if (nextMove.movement) {
        onMove(nextMove.movement);
      }
    }

    wheelPointerStateRef.current = {
      pointerId: pointerState.pointerId,
      lastAngle: nextAngle,
      lastTimestamp: event.timeStamp || 0,
      remainingAngle: nextRemainingAngle
    };
  }

  return (
    <section className="browser panel ipod-browser">
      <div className="ipod-shell">
        <div className="ipod-screen">
          {fastScrollLetter && (
            <div className="ipod-fast-scroll-overlay" role="status" aria-live="polite" aria-atomic="true">
              <span>Jump</span>
              <strong>{fastScrollLetter}</strong>
            </div>
          )}
          <div className="ipod-screen-header">
            <span>{breadcrumb}</span>
            <strong>{title}</strong>
          </div>
          <ul className="ipod-list" ref={listRef} aria-label={title}>
            {items.map((item, index) => (
              <li key={item.key}>
                <button
                  type="button"
                  data-ipod-index={index}
                  className={index === selectedIndex ? "ipod-list-item active" : "ipod-list-item"}
                  tabIndex={index === selectedIndex ? 0 : -1}
                  onFocus={() => onSelectIndex(index)}
                  onKeyDown={event => {
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      const nextIndex = Math.max(index - 1, 0);
                      onSelectIndex(nextIndex);
                      focusItem(nextIndex);
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      const nextIndex = Math.min(index + 1, items.length - 1);
                      onSelectIndex(nextIndex);
                      focusItem(nextIndex);
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      onSelectIndex(0);
                      focusItem(0);
                    } else if (event.key === "End") {
                      event.preventDefault();
                      const nextIndex = Math.max(items.length - 1, 0);
                      onSelectIndex(nextIndex);
                      focusItem(nextIndex);
                    } else if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onActivate(index);
                    } else if (event.key === "Backspace" || event.key === "Escape") {
                      event.preventDefault();
                      onBack();
                    }
                  }}
                  onClick={() => {
                    onSelectIndex(index);
                  }}
                >
                  <span className="ipod-item-label">{item.label}</span>
                  <span className="ipod-item-meta">{item.meta}</span>
                </button>
              </li>
            ))}
            {!items.length && <li className="ipod-empty">No items available.</li>}
          </ul>
          {selectedTrack && (
            <div className="ipod-now-playing">
              <span>Now playing</span>
              <strong>{selectedTrack.title}</strong>
              <span>{selectedTrack.artist}</span>
            </div>
          )}
        </div>
        <div
          className="ipod-wheel"
          aria-label="iPod-style navigation wheel"
          ref={wheelRef}
          onPointerDown={handleWheelPointerDown}
          onPointerMove={handleWheelPointerMove}
          onPointerUp={event => clearWheelPointerState(event.pointerId)}
          onPointerCancel={event => clearWheelPointerState(event.pointerId)}
          onLostPointerCapture={event => clearWheelPointerState(event.pointerId)}
        >
          <button
            type="button"
            className="ipod-wheel-button ipod-wheel-menu"
            onClick={onBack}
          >
            Menu
          </button>
          <button
            type="button"
            className="ipod-wheel-button ipod-wheel-left"
            onClick={() => onTransport(-1)}
            aria-label="Previous song"
            disabled={!canPlayPrevious}
          >
            <span aria-hidden="true">◀◀</span>
            <span className="sr-only">Previous song</span>
          </button>
          <button
            type="button"
            className="ipod-wheel-button ipod-wheel-right"
            onClick={() => onTransport(1)}
            aria-label="Next song"
            disabled={!canPlayNext}
          >
            <span aria-hidden="true">▶▶</span>
            <span className="sr-only">Next song</span>
          </button>
          <button
            type="button"
            className="ipod-wheel-button ipod-wheel-down"
            onClick={() => onMove(1)}
            aria-label="Scroll list down"
          >
            Scroll
          </button>
          <button
            type="button"
            className="ipod-wheel-center"
            onClick={() => onActivate(selectedIndex)}
            aria-label="Select highlighted item"
          >
            Select
          </button>
        </div>
      </div>
    </section>
  );
}

function PlaybackOutputPanel({
  compact = false,
  selectId,
  selectedTrack,
  outputSelectionSupported,
  remotePlaybackPromptSupported,
  browserOutputTargets,
  selectedOutputId,
  onOutputChange,
  onOpenPlaybackTargetPicker,
  outputError,
  remotePlaybackError
}) {
  const canRenderExplicitOutputPicker = outputSelectionSupported && browserOutputTargets.length > 0;
  if (!hasPlaybackOutputControls(outputSelectionSupported, remotePlaybackPromptSupported, browserOutputTargets)) {
    return null;
  }

  const onlyBuiltInOutputAvailable =
    canRenderExplicitOutputPicker &&
    browserOutputTargets.length === 1 &&
    browserOutputTargets[0]?.id === BUILT_IN_OUTPUT_ID;

  return (
    <section className={compact ? "output-panel output-panel-compact" : "output-panel"} aria-label="Playback output">
      <div className="output-panel-header">
        <div>
          <h3>{compact ? "Playback output" : "Playback outputs"}</h3>
          <p className="panel-note">
            {canRenderExplicitOutputPicker
              ? "Send browser playback to this device or another exposed speaker."
              : "Use the browser playback picker when it is available for this device."}
          </p>
        </div>
        {remotePlaybackPromptSupported && (
          <button
            type="button"
            className="tab output-picker-button"
            onClick={onOpenPlaybackTargetPicker}
            disabled={!selectedTrack}
          >
            More devices
          </button>
        )}
      </div>
      {canRenderExplicitOutputPicker && (
        <div className="output-select-row">
          <label className="browser-search-label output-select-label" htmlFor={selectId}>
            Playback device
          </label>
          <select id={selectId} className="output-select" value={selectedOutputId} onChange={onOutputChange}>
            {browserOutputTargets.map(output => (
              <option key={output.id || "built-in"} value={output.id}>
                {output.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {onlyBuiltInOutputAvailable && (
        <p className="panel-note">No alternate browser outputs are currently exposed, so playback stays on this device.</p>
      )}
      {remotePlaybackPromptSupported && !selectedTrack && (
        <p className="panel-note">Start a song to open the browser playback picker.</p>
      )}
      {(outputError || remotePlaybackError) && (
        <p className="output-status" role="status">
          {outputError || remotePlaybackError}
        </p>
      )}
    </section>
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
  const [isPhoneViewport, setIsPhoneViewport] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }

    return window.matchMedia(PHONE_MEDIA_QUERY).matches;
  });
  const [showPhoneStats, setShowPhoneStats] = useState(false);
  const [mobilePage, setMobilePage] = useState("library");
  const [mobileArtist, setMobileArtist] = useState(null);
  const [mobileAlbum, setMobileAlbum] = useState(null);
  const [mobileBrowseQuery, setMobileBrowseQuery] = useState("");
  const [mobileSearchQuery, setMobileSearchQuery] = useState("");
  const [ipodArtist, setIpodArtist] = useState(null);
  const [ipodAlbum, setIpodAlbum] = useState(null);
  const [ipodSelectionIndex, setIpodSelectionIndex] = useState(0);
  const previousIpodPathRef = useRef(getIpodSelectionPath(null, null));

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

    const selectedOutput = getPreferredBrowserOutputId(defaultOutputIds, browserOutputTargets, BUILT_IN_OUTPUT_ID);

    audioNode
      .setSinkId(selectedOutput)
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
    const syncMode = event => {
      setIsPhoneViewport(event.matches);
      setUiMode(event.matches ? "phone" : "default");
    };

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

  function playQueueTracks(tracks, selectedTrackId) {
    const nextPlayback = createPlaybackQueue(tracks, selectedTrackId);
    if (!nextPlayback.selectedTrack) {
      return;
    }

    setPlaybackQueue(nextPlayback.queue);
    setQueueIndex(nextPlayback.queueIndex);
    setSelectedTrack(nextPlayback.selectedTrack);
  }

  function playAlbumTracks(tracks) {
    playQueueTracks(tracks);
  }

  function handleAudioEnded() {
    const activeQueue = playbackQueueRef.current;
    const allTracks = libraryTracksRef.current;

    setQueueIndex(currentIndex => {
      const nextIndex = getQueueTransportIndex(currentIndex, activeQueue.length, 1);
      if (nextIndex < 0) {
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

  function transportPlaybackQueue(direction) {
    const activeQueue = playbackQueueRef.current;
    const allTracks = libraryTracksRef.current;

    setQueueIndex(currentIndex => {
      const nextIndex = getQueueTransportIndex(currentIndex, activeQueue.length, direction);
      if (nextIndex < 0) {
        return currentIndex;
      }

      const nextTrack = allTracks.find(track => track.id === activeQueue[nextIndex]);
      if (!nextTrack) {
        return currentIndex;
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

  function showArtistFilter(artist) {
    setSelectedFilter({ type: "artist", value: artist });
    setArtistViewMode("albums");
  }

  function showAlbumFilter(album, artist) {
    setSelectedFilter({ type: "album", value: { album, artist } });
    setArtistViewMode("tracks");
  }

  function showGenreFilter(genre) {
    setSelectedFilter({ type: "genre", value: genre });
    setArtistViewMode("tracks");
  }

  function showYearFilter(year) {
    setSelectedFilter({ type: "year", value: year });
    setArtistViewMode("tracks");
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
  const showArtistJumpPicker = isPhoneViewport && browseMode === "artists" && filteredBrowseItems.length > 0;
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

    return groupAlbumsForArtist(library.tracks, selectedFilter.value);
  }, [library.tracks, selectedFilter]);
  const selectedAlbumTracks = useMemo(() => {
    if (selectedFilter?.type !== "album") {
      return [];
    }

    return library.tracks.filter(
      track => track.album === selectedFilter.value.album && track.artist === selectedFilter.value.artist
    );
  }, [library.tracks, selectedFilter]);
  const mobileArtists = useMemo(() => buildMobileArtistList(library.browse.artists), [library.browse.artists]);
  const mobileAlbumsForArtist = useMemo(() => {
    if (!mobileArtist) {
      return [];
    }

    return buildMobileAlbumList(library.tracks, mobileArtist);
  }, [library.tracks, mobileArtist]);
  const mobileAlbumTracks = useMemo(
    () => buildMobileTrackList(library.tracks, { artist: mobileArtist, album: mobileAlbum, query: mobileBrowseQuery }),
    [library.tracks, mobileArtist, mobileAlbum, mobileBrowseQuery]
  );
  const mobileBrowseArtists = useMemo(() => {
    const normalizedQuery = mobileBrowseQuery.trim().toLowerCase();
    if (!normalizedQuery || mobileArtist) {
      return mobileArtists;
    }

    return mobileArtists.filter(item => item.label.toLowerCase().includes(normalizedQuery));
  }, [mobileArtist, mobileArtists, mobileBrowseQuery]);
  const mobileBrowseAlbums = useMemo(() => {
    if (!mobileArtist) {
      return [];
    }

    const normalizedQuery = mobileBrowseQuery.trim().toLowerCase();
    if (!normalizedQuery || mobileAlbum) {
      return mobileAlbumsForArtist;
    }

    return mobileAlbumsForArtist.filter(item => `${item.album} ${item.artist}`.toLowerCase().includes(normalizedQuery));
  }, [mobileAlbum, mobileAlbumsForArtist, mobileArtist, mobileBrowseQuery]);
  const mobileSearchResults = useMemo(
    () => searchMobileLibrary(library.tracks, mobileSearchQuery, { trackLimit: MOBILE_SEARCH_TRACK_LIMIT }),
    [library.tracks, mobileSearchQuery]
  );
  const selectedMobileAlbumTracks = useMemo(
    () => buildMobileTrackList(library.tracks, { artist: mobileArtist, album: mobileAlbum }),
    [library.tracks, mobileArtist, mobileAlbum]
  );
  const canPlayPrevious = getQueueTransportIndex(queueIndex, playbackQueue.length, -1) >= 0;
  const canPlayNext = getQueueTransportIndex(queueIndex, playbackQueue.length, 1) >= 0;
  const isMobileBrowseEmpty = mobileAlbum
    ? mobileAlbumTracks.length === 0
    : mobileArtist
      ? mobileBrowseAlbums.length === 0
      : mobileBrowseArtists.length === 0;
  const mobileOutputControlsAvailable = hasPlaybackOutputControls(
    outputSelectionSupported,
    remotePlaybackPromptSupported,
    browserOutputTargets
  );
  const mobileTabs = [
    ["library", "Library"],
    ["search", "Search"],
    ["now-playing", "Now Playing"],
    ...(mobileOutputControlsAvailable ? [["output", "Output"]] : [])
  ];
  const selectedBrowserOutputId = useMemo(
    () => getPreferredBrowserOutputId(defaultOutputIds, browserOutputTargets, BUILT_IN_OUTPUT_ID),
    [browserOutputTargets, defaultOutputIds]
  );

  useEffect(() => {
    if (mobilePage === "output" && !mobileOutputControlsAvailable) {
      setMobilePage("now-playing");
    }
  }, [mobileOutputControlsAvailable, mobilePage]);

  function openMobileArtist(artist) {
    setMobileArtist(artist);
    setMobileAlbum(null);
    setMobileBrowseQuery("");
    setMobilePage("library");
  }

  function openMobileAlbum(album, artist = mobileArtist) {
    setMobileArtist(artist);
    setMobileAlbum(album);
    setMobileBrowseQuery("");
    setMobilePage("library");
  }

  function stepBackMobileBrowse() {
    if (mobileAlbum) {
      setMobileAlbum(null);
      setMobileBrowseQuery("");
      return;
    }

    if (mobileArtist) {
      setMobileArtist(null);
      setMobileBrowseQuery("");
    }
  }

  function playMobileAlbum(trackId = null) {
    if (!selectedMobileAlbumTracks.length) {
      return;
    }

    playQueueTracks(selectedMobileAlbumTracks, trackId);
    setMobilePage("now-playing");
  }

  function playMobileTrack(track) {
    const albumTracks = buildMobileTrackList(library.tracks, { artist: track.artist, album: track.album });
    playQueueTracks(albumTracks, track.id);
    setMobileArtist(track.artist);
    setMobileAlbum(track.album);
    setMobilePage("now-playing");
  }

  function handleBrowserOutputChange(event) {
    const nextOutputId = event.target.value;
    setOutputError(null);
    setDefaultOutputIds(current => prioritizeBrowserOutput(nextOutputId, current, browserOutputTargets));
  }

  const chartData = useMemo(() => {
    return buildChartData(stats);
  }, [stats]);
  const ipodView = useMemo(() => {
    const nextView = buildIpodView(library.browse.artists, library.tracks, ipodArtist, ipodAlbum);
    return {
      ...nextView,
      items: nextView.items.map((item, index) => ({
        ...item,
        label:
          nextView.title === "Artists"
            ? item.artist
            : nextView.title === "Albums"
              ? item.album
              : `${formatCount(index + 1)}. ${item.title}`,
        meta:
          nextView.title === "Artists"
            ? formatUnitCount(item.albumCount || 0, "album")
            : nextView.title === "Albums"
              ? formatUnitCount(item.trackCount || 0, "track")
              : formatDuration(item.durationSeconds)
      }))
    };
  }, [ipodAlbum, ipodArtist, library.browse.artists, library.tracks]);

  useEffect(() => {
    const nextPath = getIpodSelectionPath(ipodArtist, ipodAlbum);
    setIpodSelectionIndex(currentIndex =>
      getNextIpodSelectionIndex(currentIndex, ipodView.items.length, previousIpodPathRef.current, nextPath)
    );
    previousIpodPathRef.current = nextPath;
  }, [ipodAlbum, ipodArtist, ipodView.items.length]);

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

  function moveIpodSelection(direction) {
    setIpodSelectionIndex(currentIndex => getMovedIpodSelectionIndex(currentIndex, ipodView.items.length, direction));
  }

  function activateIpodItem(index = ipodSelectionIndex) {
    if (!ipodView.items.length) {
      return;
    }

    const targetIndex = Math.min(Math.max(index, 0), ipodView.items.length - 1);
    const selectedIpodItem = ipodView.items[targetIndex];
    if (!selectedIpodItem) {
      return;
    }

    if (!ipodArtist) {
      setIpodArtist(selectedIpodItem.artist);
      setIpodAlbum(null);
      setIpodSelectionIndex(0);
      showArtistFilter(selectedIpodItem.artist);
      return;
    }

    if (!ipodAlbum) {
      setIpodAlbum(selectedIpodItem.album);
      setIpodSelectionIndex(0);
      showAlbumFilter(selectedIpodItem.album, selectedIpodItem.artist);
      return;
    }

    playQueueTracks(
      library.tracks.filter(track => track.artist === ipodArtist && track.album === ipodAlbum),
      selectedIpodItem.id
    );
  }

  function goBackIpodLevel() {
    if (ipodAlbum) {
      setIpodAlbum(null);
      setIpodSelectionIndex(0);
      showArtistFilter(ipodArtist);
      return;
    }

    if (ipodArtist) {
      setIpodArtist(null);
      setIpodSelectionIndex(0);
      setSelectedFilter(null);
      return;
    }

    setIpodArtist(null);
    setIpodAlbum(null);
    setIpodSelectionIndex(0);
    setSelectedFilter(null);
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

  const { totals } = stats;

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
              title="Most Albums Per Artist"
              items={chartData.artistsByAlbumCount}
              labelForItem={item => item.artist}
              valueForItem={item => item.albumCount || 0}
              valueLabel={value => formatUnitCount(value, "album")}
            />
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
            <h2>{isPhoneMode ? "Mobile Music Browser" : "Music Browser"}</h2>
            <p className="panel-note">
              {isPhoneMode
                ? "Browse artists, drill into albums, search the library, and jump between the library and now playing."
                : "Search across tracks, artists, albums, genres, and years, then play directly in the browser."}
            </p>
          </div>
          {isPhoneMode ? (
            <div className="mobile-library-browser">
              <div className="mobile-browser-tabs" role="tablist" aria-label="Phone music views">
                {mobileTabs.map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={mobilePage === mode}
                    className={mobilePage === mode ? "tab active" : "tab"}
                    onClick={() => setMobilePage(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mobilePage === "library" ? (
                <div className="mobile-library-pane">
                  <div className="mobile-library-header">
                    <div>
                      <h3>{mobileAlbum ? mobileAlbum : mobileArtist || "Artists"}</h3>
                      <p className="panel-note">
                        {mobileAlbum
                          ? "Browse tracks in this album or start the full album queue."
                          : mobileArtist
                            ? "Browse albums for this artist with quick touch targets."
                            : "Browse your artists list with a touch-first library flow."}
                      </p>
                    </div>
                    {(mobileArtist || mobileAlbum) && (
                      <button type="button" className="tab" onClick={stepBackMobileBrowse}>
                        Back
                      </button>
                    )}
                  </div>
                  <label className="browser-search-label" htmlFor="mobile-browse-search">
                    {mobileAlbum ? "Filter tracks" : mobileArtist ? "Filter albums" : "Filter artists"}
                  </label>
                  <input
                    id="mobile-browse-search"
                    className="search-input search-input-prominent"
                    type="search"
                    value={mobileBrowseQuery}
                    onChange={event => setMobileBrowseQuery(event.target.value)}
                    placeholder={mobileAlbum ? "Track title" : mobileArtist ? "Album title" : "Artist name"}
                  />
                  {mobileAlbum ? (
                    <>
                      <div className="mobile-action-row">
                        <button type="button" className="tab active" onClick={() => playMobileAlbum()}>
                          Play album ({formatCount(selectedMobileAlbumTracks.length)})
                        </button>
                      </div>
                      <ul className="mobile-library-list">
                        {mobileAlbumTracks.map((track, index) => (
                          <li key={track.id} className={track.id === selectedTrack?.id ? "mobile-list-row active" : "mobile-list-row"}>
                            <button
                              type="button"
                              className="mobile-list-button"
                              onClick={() => playMobileAlbum(track.id)}
                              aria-label={`Play ${track.title} by ${track.artist}`}
                            >
                              <span className="mobile-list-leading">{formatCount(index + 1)}</span>
                              <span className="mobile-list-body">
                                <span className="mobile-list-title">{track.title}</span>
                                <span className="mobile-list-meta">
                                  {track.artist}
                                  <span className="sep">•</span>
                                  {formatDuration(track.durationSeconds)}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : mobileArtist ? (
                    <ul className="mobile-library-list">
                      {mobileBrowseAlbums.map(album => (
                        <li key={album.id} className="mobile-list-row">
                          <button type="button" className="mobile-list-button" onClick={() => openMobileAlbum(album.album, album.artist)}>
                            <AlbumArt trackId={album.albumArtTrackId} size="medium" />
                            <span className="mobile-list-body">
                              <span className="mobile-list-title">{album.album}</span>
                              <span className="mobile-list-meta">{formatCount(album.trackCount)} tracks</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="track-play-button"
                            aria-label={`Play album ${album.album} by ${album.artist}`}
                            onClick={() => {
                              openMobileAlbum(album.album, album.artist);
                              playQueueTracks(album.tracks);
                              setMobilePage("now-playing");
                            }}
                          >
                            ▶
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="mobile-library-list">
                      {mobileBrowseArtists.map(artist => (
                        <li key={artist.id} className="mobile-list-row">
                          <button type="button" className="mobile-list-button" onClick={() => openMobileArtist(artist.artist)}>
                            <span className="mobile-list-body">
                              <span className="mobile-list-title">{artist.label}</span>
                              <span className="mobile-list-meta">{formatCount(artist.trackCount)} tracks</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {isMobileBrowseEmpty && <p className="panel-note">No items match this library filter yet.</p>}
                </div>
              ) : mobilePage === "search" ? (
                <div className="mobile-library-pane">
                  <h3>Search the library</h3>
                  <p className="panel-note">Find artists, albums, and songs, then jump into playback or browsing.</p>
                  <label className="browser-search-label" htmlFor="mobile-global-search">
                    Search
                  </label>
                  <input
                    id="mobile-global-search"
                    className="search-input search-input-prominent"
                    type="search"
                    value={mobileSearchQuery}
                    onChange={event => setMobileSearchQuery(event.target.value)}
                    placeholder="Artist, album, song, genre, or year"
                  />
                  {!mobileSearchQuery.trim() ? (
                    <p className="panel-note">Start typing to search across the full library.</p>
                  ) : (
                    <div className="mobile-search-results">
                      {mobileSearchResults.artists.length > 0 && (
                        <section className="mobile-search-section">
                          <h4>Artists</h4>
                          <ul className="mobile-library-list">
                            {mobileSearchResults.artists.map(artist => (
                              <li key={artist.id} className="mobile-list-row">
                                <button
                                  type="button"
                                  className="mobile-list-button"
                                  onClick={() => {
                                    openMobileArtist(artist.artist);
                                    setMobilePage("library");
                                  }}
                                >
                                  <span className="mobile-list-body">
                                    <span className="mobile-list-title">{artist.label}</span>
                                    <span className="mobile-list-meta">{formatCount(artist.trackCount)} matching tracks</span>
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {mobileSearchResults.albums.length > 0 && (
                        <section className="mobile-search-section">
                          <h4>Albums</h4>
                          <ul className="mobile-library-list">
                            {mobileSearchResults.albums.map(album => (
                              <li key={album.id} className="mobile-list-row">
                                <button
                                  type="button"
                                  className="mobile-list-button"
                                  onClick={() => {
                                    openMobileAlbum(album.album, album.artist);
                                    setMobilePage("library");
                                  }}
                                >
                                  <AlbumArt trackId={album.albumArtTrackId} size="medium" />
                                  <span className="mobile-list-body">
                                    <span className="mobile-list-title">{album.album}</span>
                                    <span className="mobile-list-meta">
                                      {album.artist}
                                      <span className="sep">•</span>
                                      {formatCount(album.trackCount)} tracks
                                    </span>
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {mobileSearchResults.tracks.length > 0 && (
                        <section className="mobile-search-section">
                          <h4>Tracks</h4>
                          <ul className="mobile-library-list">
                            {mobileSearchResults.tracks.map(track => (
                              <li key={track.id} className={track.id === selectedTrack?.id ? "mobile-list-row active" : "mobile-list-row"}>
                                <button type="button" className="mobile-list-button" onClick={() => playMobileTrack(track)}>
                                  <AlbumArt trackId={track.albumArtTrackId || track.id} size="medium" />
                                  <span className="mobile-list-body">
                                    <span className="mobile-list-title">{track.title}</span>
                                    <span className="mobile-list-meta">
                                      {track.artist}
                                      <span className="sep">•</span>
                                      {track.album}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {!mobileSearchResults.artists.length &&
                        !mobileSearchResults.albums.length &&
                        !mobileSearchResults.tracks.length && <p className="panel-note">No results matched that search.</p>}
                    </div>
                  )}
                </div>
              ) : mobilePage === "output" ? (
                <div className="mobile-output-pane">
                  <div className="mobile-library-header">
                    <div>
                      <h3>Choose playback output</h3>
                      <p className="panel-note">Keep browsing on your phone while switching which speaker or device gets the stream.</p>
                    </div>
                    {selectedTrack && (
                      <button type="button" className="tab" onClick={() => setMobilePage("now-playing")}>
                        Now Playing
                      </button>
                    )}
                  </div>
                  {selectedTrack && (
                    <div className="mobile-output-summary">
                      <strong>{selectedTrack.title}</strong>
                      <span className="mobile-list-meta">{selectedTrack.artist}</span>
                    </div>
                  )}
                  <PlaybackOutputPanel
                    compact
                    selectId="mobile-playback-output"
                    selectedTrack={selectedTrack}
                    outputSelectionSupported={outputSelectionSupported}
                    remotePlaybackPromptSupported={remotePlaybackPromptSupported}
                    browserOutputTargets={browserOutputTargets}
                    selectedOutputId={selectedBrowserOutputId}
                    onOutputChange={handleBrowserOutputChange}
                    onOpenPlaybackTargetPicker={openPlaybackTargetPicker}
                    outputError={outputError}
                    remotePlaybackError={remotePlaybackError}
                  />
                </div>
              ) : (
                <div className="mobile-now-playing-panel">
                  <h3>Now playing</h3>
                  {selectedTrack ? (
                    <>
                      <div className="mobile-now-playing-hero">
                        <AlbumArt trackId={selectedTrack.albumArtTrackId || selectedTrack.id} size="large" />
                        <div>
                          <strong>{selectedTrack.title}</strong>
                          <div>{selectedTrack.artist}</div>
                          <div className="panel-note">{selectedTrack.album}</div>
                          {playbackQueue.length > 0 && (
                            <div className="panel-note">
                              Queue {formatCount(queueIndex + 1)} of {formatCount(playbackQueue.length)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mobile-action-row">
                        <button type="button" className="tab" onClick={() => transportPlaybackQueue(-1)} disabled={!canPlayPrevious}>
                          Previous
                        </button>
                        <button type="button" className="tab" onClick={() => transportPlaybackQueue(1)} disabled={!canPlayNext}>
                          Next
                        </button>
                        {mobileOutputControlsAvailable && (
                          <button type="button" className="tab" onClick={() => setMobilePage("output")}>
                            Output
                          </button>
                        )}
                        {mobileArtist && mobileAlbum && (
                          <button type="button" className="tab" onClick={() => setMobilePage("library")}>
                            Back to album
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="panel-note">Pick a track from the library or search tab to start playback.</p>
                  )}
                </div>
              )}
              {selectedTrack ? (
                <div className="mobile-player-dock">
                  <button type="button" className="mobile-player-summary" onClick={() => setMobilePage("now-playing")}>
                    <AlbumArt trackId={selectedTrack.albumArtTrackId || selectedTrack.id} size="medium" />
                    <span className="mobile-list-body">
                      <span className="mobile-list-title">{selectedTrack.title}</span>
                      <span className="mobile-list-meta">{selectedTrack.artist}</span>
                    </span>
                  </button>
                  <div className="mobile-action-row mobile-player-actions">
                    {mobileOutputControlsAvailable && (
                      <button type="button" className="tab" onClick={() => setMobilePage("output")}>
                        Output
                      </button>
                    )}
                    <button type="button" className="tab" onClick={() => transportPlaybackQueue(-1)} disabled={!canPlayPrevious}>
                      ◀◀
                    </button>
                    <button type="button" className="tab" onClick={() => transportPlaybackQueue(1)} disabled={!canPlayNext}>
                      ▶▶
                    </button>
                  </div>
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
                </div>
              ) : (
                <p className="panel-note">Select a track to play.</p>
              )}
            </div>
          ) : (
            <div className="browser-search browser-search-prominent">
              <label className="browser-search-label" htmlFor="library-search">
                Search your library
              </label>
              <p className="panel-note">Jump straight to tracks, artists, albums, genres, or years from one spot.</p>
              <input
                id="library-search"
                className="search-input search-input-prominent"
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Artist, album, song, genre, or year"
              />
            </div>
          )}
        </div>

        {!isPhoneMode && (
          <>
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
                                showArtistFilter(item.artist);
                              } else if (browseMode === "albums") {
                                showAlbumFilter(item.album, item.artist);
                              } else if (browseMode === "genres") {
                                showGenreFilter(item.genre);
                              } else {
                                showYearFilter(item.year);
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
                <PlaybackOutputPanel
                  selectId="desktop-playback-output"
                  selectedTrack={selectedTrack}
                  outputSelectionSupported={outputSelectionSupported}
                  remotePlaybackPromptSupported={remotePlaybackPromptSupported}
                  browserOutputTargets={browserOutputTargets}
                  selectedOutputId={selectedBrowserOutputId}
                  onOutputChange={handleBrowserOutputChange}
                  onOpenPlaybackTargetPicker={openPlaybackTargetPicker}
                  outputError={outputError}
                  remotePlaybackError={remotePlaybackError}
                />

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
                                showAlbumFilter(album.album, album.artist);
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
          </>
        )}
      </section>

    </div>
  );
}

export default App;
