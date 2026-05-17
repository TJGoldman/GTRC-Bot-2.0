let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            Authorization: 'Basic ' + Buffer.from(
                `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
            ).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });

    if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);
    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
}

async function searchTrack(query, limit = 3) {
    const token = await getToken();
    const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Spotify search failed: ${res.status}`);
    const data = await res.json();
    return (data.tracks?.items ?? []).filter(t => t?.id).map(formatTrack);
}

function formatTrack(item) {
    const mins = Math.floor(item.duration_ms / 60000);
    const secs = Math.floor((item.duration_ms % 60000) / 1000).toString().padStart(2, '0');
    return {
        title: item.name,
        author: item.artists.map(a => a.name).join(', '),
        duration: `${mins}:${secs}`,
        thumbnail: item.album.images[0]?.url ?? null,
        spotifyUrl: item.external_urls.spotify,
        spotifyId: item.id,
    };
}

async function getRecommendations(seedTrackId, limit = 10) {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };

    // Get the seed track's primary artist
    const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${seedTrackId}`, { headers });
    if (!trackRes.ok) throw new Error(`Could not fetch track info: ${trackRes.status}`);
    const trackData = await trackRes.json();
    const primaryArtist = trackData.artists?.[0];
    if (!primaryArtist) throw new Error('No artist found for this track');

    // Get related artists, fall back to search if endpoint unavailable
    let artistPool = [];
    const relatedRes = await fetch(`https://api.spotify.com/v1/artists/${primaryArtist.id}/related-artists`, { headers });
    if (relatedRes.ok) {
        artistPool = (await relatedRes.json()).artists ?? [];
    }
    if (!artistPool.length) {
        const fallbackRes = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(primaryArtist.name)}&type=artist&limit=10`,
            { headers }
        );
        if (fallbackRes.ok) {
            artistPool = ((await fallbackRes.json()).artists?.items ?? []).filter(a => a.id !== primaryArtist.id);
        }
    }
    if (!artistPool.length) throw new Error('Could not find related artists for this track');

    // Pull tracks from a random selection of related artists
    const selected = artistPool.sort(() => Math.random() - 0.5).slice(0, 5);
    const perArtist = Math.ceil(limit / selected.length);
    const tracks = [];

    for (const artist of selected) {
        const res = await fetch(
            `https://api.spotify.com/v1/search?q=artist:${encodeURIComponent(artist.name)}&type=track&limit=${perArtist * 3}`,
            { headers }
        );
        if (!res.ok) continue;
        const items = ((await res.json()).tracks?.items ?? []).filter(t => t?.id);
        tracks.push(...items.sort(() => Math.random() - 0.5).slice(0, perArtist));
    }

    return tracks.slice(0, limit).map(formatTrack);
}

async function findSpotifyId(title, artist) {
    const tracks = await searchTrack(`${title} ${artist}`, 1);
    return tracks[0]?.spotifyId ?? null;
}

async function searchByGenre(genre, limit = 3) {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };

    const genreSlug = genre.toLowerCase().trim();
    const arOffset = Math.floor(Math.random() * 10);

    async function getArtists(q) {
        const r = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=artist&limit=10&offset=${arOffset}`,
            { headers }
        );
        if (!r.ok) return [];
        return ((await r.json()).artists?.items ?? []).filter(a => a?.id);
    }

    let artists = await getArtists(`genre:"${genreSlug}"`);
    if (!artists.length) artists = await getArtists(genreSlug);

    if (artists.length) {
        const artist = artists[Math.floor(Math.random() * artists.length)];
        const trRes = await fetch(
            `https://api.spotify.com/v1/search?q=artist:${encodeURIComponent(artist.name)}&type=track&limit=10`,
            { headers }
        );
        if (trRes.ok) {
            const tracks = (await trRes.json()).tracks?.items?.filter(t => t?.id) ?? [];
            if (tracks.length) {
                const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                return shuffled.slice(0, limit).map(formatTrack);
            }
        }
    }

    return searchTrack(genre, limit);
}

module.exports = { searchTrack, searchByGenre, getRecommendations, findSpotifyId };
