let clientId = null;

function setClientId(id) {
    clientId = id;
}

function formatTrack(item) {
    if (!item?.permalink_url) return null;
    if (item.streamable === false) return null;
    const secs = Math.floor((item.duration ?? 0) / 1000);
    return {
        title: item.title ?? 'Unknown',
        author: item.user?.username ?? 'Unknown',
        url: item.permalink_url,
        duration: `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`,
        thumbnail: item.artwork_url ?? item.user?.avatar_url ?? null,
        source: 'SoundCloud',
    };
}

async function searchTracks(query, { limit = 3, genreTag = null } = {}) {
    if (!clientId) throw new Error('SoundCloud not initialized');
    const params = new URLSearchParams({ q: query, limit: String(limit), client_id: clientId });
    if (genreTag) params.set('filter.genre_or_tag', genreTag.toLowerCase().trim());
    const res = await fetch(`https://api-v2.soundcloud.com/search/tracks?${params}`);
    if (!res.ok) throw new Error(`SoundCloud search failed: ${res.status}`);
    const data = await res.json();
    return (data.collection ?? []).map(formatTrack).filter(Boolean);
}

async function getTrending(genre = 'all-music', limit = 5) {
    if (!clientId) throw new Error('SoundCloud not initialized');
    const genreId = `soundcloud:genres:${genre.toLowerCase().replace(/\s+/g, '')}`;
    const params = new URLSearchParams({ kind: 'trending', genre: genreId, limit: String(limit), client_id: clientId });
    const res = await fetch(`https://api-v2.soundcloud.com/charts?${params}`);
    if (!res.ok) throw new Error(`SoundCloud trending failed: ${res.status}`);
    const data = await res.json();
    return (data.collection ?? []).map(item => formatTrack(item.track)).filter(Boolean);
}

function getClientId() { return clientId; }

module.exports = { setClientId, getClientId, searchTracks, getTrending };
