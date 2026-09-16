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
  const sortedArtists = [...artists].sort((left, right) => left.artist.localeCompare(right.artist));

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
