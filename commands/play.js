const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const playdl = require('play-dl');
const { addTrack, verifyTrack } = require('../player');
const { storeSeed } = require('../stationSeeds');
const { searchTrack: spotifySearch, searchByGenre: spotifyGenre } = require('../spotify');
const { searchTracks: scSearch } = require('../soundcloud');
const { selectTrack, queueFields } = require('../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music from various sources')
        .addStringOption(opt =>
            opt.setName('source')
                .setDescription('Where to search for music')
                .setRequired(true)
                .addChoices(
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'SoundCloud', value: 'soundcloud' },
                    { name: 'Spotify', value: 'spotify' },
                )
        )
        .addStringOption(opt =>
            opt.setName('type')
                .setDescription('How to search — Tag only applies to SoundCloud')
                .setRequired(true)
                .addChoices(
                    { name: 'Song', value: 'song' },
                    { name: 'Genre', value: 'genre' },
                    { name: 'SoundCloud Tag', value: 'tag' },
                )
        )
        .addStringOption(opt =>
            opt.setName('query')
                .setDescription('Song name, artist, genre, or tag')
                .setRequired(true)
        ),

    async execute(interaction) {
        const source = interaction.options.getString('source');
        const type = interaction.options.getString('type');
        const query = interaction.options.getString('query');

        const voiceChannel = interaction.guild.members.cache.get(interaction.user.id)?.voice?.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'You need to be in a voice channel first.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            let track;
            const color = source === 'spotify' ? 0x1db954 : source === 'soundcloud' ? 0xff5500 : 0xff0000;

            if (source === 'youtube') {
                const searchQuery = type !== 'song' ? `${query} music mix` : query;
                const results = await playdl.search(searchQuery, { source: { youtube: 'video' }, limit: 3 });
                if (!results.length) return interaction.followUp({ content: 'No results found on YouTube.', ephemeral: true });

                const ytTracks = results.map(v => ({
                    title: v.title ?? 'Unknown',
                    author: v.channel?.name ?? 'Unknown',
                    url: v.url,
                    duration: v.durationRaw ?? '?:??',
                    thumbnail: v.thumbnails?.[0]?.url ?? null,
                    source: 'YouTube',
                }));
                track = await selectTrack(interaction, ytTracks, color);

            } else if (source === 'soundcloud') {
                const tracks = type !== 'song'
                    ? await scSearch(query, { limit: 3, genreTag: query })
                    : await scSearch(query, { limit: 3 });
                if (!tracks.length) return interaction.followUp({ content: 'No results found on SoundCloud.', ephemeral: true });
                track = await selectTrack(interaction, tracks, color);
                if (track && !await verifyTrack(track.url, 'SoundCloud')) {
                    return interaction.followUp({ content: `**${track.title}** isn't available for streaming.`, ephemeral: true });
                }

            } else if (source === 'spotify') {
                if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
                    return interaction.followUp({ content: 'Spotify credentials are not configured in `.env`.', ephemeral: true });
                }

                const spotifyTracks = type !== 'song'
                    ? await spotifyGenre(query, 3)
                    : await spotifySearch(query, 3);
                if (!spotifyTracks.length) return interaction.followUp({ content: 'No results found on Spotify.', ephemeral: true });

                const selected = await selectTrack(interaction, spotifyTracks, color);

                const ytResults = await playdl.search(
                    `${selected.title} ${selected.author}`,
                    { source: { youtube: 'video' }, limit: 1 }
                );
                if (!ytResults[0]) return interaction.followUp({ content: `Found "${selected.title}" on Spotify but couldn't find it on YouTube to stream.`, ephemeral: true });

                track = {
                    title: selected.title,
                    author: selected.author,
                    url: ytResults[0].url,
                    duration: selected.duration,
                    thumbnail: selected.thumbnail,
                    source: 'Spotify',
                };
            }

            track.requestedBy = interaction.member?.displayName ?? interaction.user.username;

            const queue = await addTrack(voiceChannel, interaction.channel, track);
            const isQueued = queue.current?.url !== track.url;

            const seedId = storeSeed({ title: track.title, author: track.author, spotifyId: track.spotifyId ?? null });

            await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setColor(color)
                        .setTitle(isQueued ? 'Added to Queue' : 'Now Playing')
                        .setDescription(`**${track.title}** by ${track.author}`)
                        .setThumbnail(track.thumbnail)
                        .addFields(
                            { name: 'Duration', value: track.duration, inline: true },
                            { name: 'Source', value: track.source, inline: true },
                            { name: 'Requested by', value: track.requestedBy, inline: true },
                            ...queueFields(queue, track)
                        ),
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`station_${seedId}`)
                            .setLabel('Start Station')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('📻')
                    ),
                ],
            });
        } catch (err) {
            console.error(err);
            await interaction.followUp({ content: `Could not play: ${err.message}`, ephemeral: true });
        }
    },
};
