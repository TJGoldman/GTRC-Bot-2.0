const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueue } = require('../player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing track'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        if (!queue?.current) {
            return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
        }

        const track = queue.current;
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x1db954)
                    .setTitle('Now Playing')
                    .setDescription(`**${track.title}** by ${track.author}`)
                    .setThumbnail(track.thumbnail)
                    .addFields(
                        { name: 'Duration', value: track.duration, inline: true },
                        { name: 'Source', value: track.source, inline: true },
                        { name: 'Requested by', value: track.requestedBy ?? 'Unknown', inline: true },
                    ),
            ],
        });
    },
};
