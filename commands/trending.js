const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { addTrack, verifyTrack } = require('../player');
const { storeSeed } = require('../stationSeeds');
const { getTrending } = require('../soundcloud');
const { selectTrack, queueFields } = require('../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trending')
        .setDescription('Browse and play trending tracks on SoundCloud')
        .addStringOption(opt =>
            opt.setName('genre')
                .setDescription('Genre to browse (e.g. rock, electronic, hiphoprap, all-music)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const genre = interaction.options.getString('genre') ?? 'all-music';

        const voiceChannel = interaction.guild.members.cache.get(interaction.user.id)?.voice?.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'You need to be in a voice channel first.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const tracks = await getTrending(genre, 5);
            if (!tracks.length) return interaction.followUp({ content: `No trending tracks found for "${genre}".`, ephemeral: true });

            const track = await selectTrack(interaction, tracks, 0xff5500);
            if (!track) return;
            if (!await verifyTrack(track.url, 'SoundCloud')) {
                return interaction.followUp({ content: `**${track.title}** isn't available for streaming.`, ephemeral: true });
            }

            track.requestedBy = interaction.member?.displayName ?? interaction.user.username;

            const queue = await addTrack(voiceChannel, interaction.channel, track);
            const isQueued = queue.current?.url !== track.url;

            const seedId = storeSeed({ title: track.title, author: track.author, spotifyId: null });

            await interaction.followUp({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xff5500)
                        .setTitle(isQueued ? 'Added to Queue' : 'Now Playing')
                        .setDescription(`**${track.title}** by ${track.author}`)
                        .setThumbnail(track.thumbnail)
                        .addFields(
                            { name: 'Duration', value: track.duration, inline: true },
                            { name: 'Source', value: genre !== 'all-music' ? `SC Trending • ${genre}` : 'SC Trending', inline: true },
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
            await interaction.followUp({ content: `Could not fetch trending: ${err.message}`, ephemeral: true });
        }
    },
};
