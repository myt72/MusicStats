export function sortAlbumTracks(tracks) {
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

export function groupAlbumsForArtist(tracks, artist) {
  const artistTracks = tracks.filter(track => track.artist === artist);
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
}

export function buildIpodView(artists, tracks, ipodArtist, ipodAlbum) {
  const normalizedArtists = Array.from(
    artists.reduce((artistMap, item) => {
      const existing = artistMap.get(item.artist);
      if (
        !existing ||
        (item.albumCount || 0) > (existing.albumCount || 0) ||
        ((item.albumCount || 0) === (existing.albumCount || 0) && item.trackCount > existing.trackCount)
      ) {
        artistMap.set(item.artist, item);
      }
      return artistMap;
    }, new Map()).values()
  );
  const sortedArtists = normalizedArtists.sort((left, right) => left.artist.localeCompare(right.artist));

  if (!ipodArtist) {
    return {
      title: "Artists",
      breadcrumb: "Music",
      items: sortedArtists.map((item, index) => ({
        ...item,
        key: `artist-${item.artist}-${index}`
      }))
    };
  }

  const artistAlbums = groupAlbumsForArtist(tracks, ipodArtist);
  if (!ipodAlbum) {
    return {
      title: "Albums",
      breadcrumb: ipodArtist,
      items: artistAlbums.map((item, index) => ({
        ...item,
        key: `album-${item.artist}-${item.album}-${index}`
      }))
    };
  }

  const songs = sortAlbumTracks(tracks.filter(track => track.artist === ipodArtist && track.album === ipodAlbum));
  return {
    title: "Songs",
    breadcrumb: `${ipodArtist} • ${ipodAlbum}`,
    items: songs.map((item, index) => ({
      ...item,
      key: `song-${item.id}-${index}`
    }))
  };
}

export function getIpodSelectionPath(ipodArtist, ipodAlbum) {
  return `${ipodArtist || ""}\u0000${ipodAlbum || ""}`;
}

export function getNextIpodSelectionIndex(currentIndex, itemCount, previousPath, nextPath) {
  if (!itemCount) {
    return 0;
  }

  if (previousPath !== nextPath) {
    return 0;
  }

  return Math.max(0, Math.min(currentIndex, itemCount - 1));
}

export function getMovedIpodSelectionIndex(currentIndex, itemCount, movement) {
  if (!itemCount) {
    return 0;
  }

  return Math.max(0, Math.min(currentIndex + movement, itemCount - 1));
}

export function getWheelAngle(clientX, clientY, rect) {
  if (!rect || typeof clientX !== "number" || typeof clientY !== "number") {
    return null;
  }

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return Math.atan2(clientY - centerY, clientX - centerX);
}

export function getWheelMove(remainingAngle, previousAngle, nextAngle, anglePerStep = Math.PI / 10) {
  if (
    typeof remainingAngle !== "number" ||
    typeof previousAngle !== "number" ||
    typeof nextAngle !== "number" ||
    typeof anglePerStep !== "number" ||
    anglePerStep <= 0
  ) {
    return { movement: 0, remainingAngle: 0 };
  }

  let angleDelta = nextAngle - previousAngle;
  if (angleDelta > Math.PI) {
    angleDelta -= Math.PI * 2;
  } else if (angleDelta < -Math.PI) {
    angleDelta += Math.PI * 2;
  }

  const totalAngle = remainingAngle + angleDelta;
  const movement = totalAngle > 0 ? Math.floor(totalAngle / anglePerStep) : Math.ceil(totalAngle / anglePerStep);
  return {
    movement,
    remainingAngle: totalAngle - movement * anglePerStep
  };
}

export function createPlaybackQueue(tracks, selectedTrackId = tracks[0]?.id) {
  const orderedTracks = sortAlbumTracks(tracks);
  if (!orderedTracks.length) {
    return { queue: [], queueIndex: -1, selectedTrack: null };
  }

  const selectedIndex = orderedTracks.findIndex(track => track.id === selectedTrackId);
  const queueIndex = selectedIndex >= 0 ? selectedIndex : 0;
  return {
    queue: orderedTracks.map(track => track.id),
    queueIndex,
    selectedTrack: orderedTracks[queueIndex]
  };
}

export function getQueueTransportIndex(currentIndex, queueLength, direction) {
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= queueLength) {
    return -1;
  }

  return nextIndex;
}
