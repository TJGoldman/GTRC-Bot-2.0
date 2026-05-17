const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueue } = require('../player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current queue'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        if (!queue?.current) {
            return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(0x1db954)
            .setTitle('Queue')
            .setDescription(`**Now Playing:** ${queue.current.title} — ${queue.current.author}`);

        if (queue.tracks.length > 0) {
            embed.addFields({
                name: 'Up Next',
                value: queue.tracks.slice(0, 10)
                    .map((t, i) => `${i + 1}. **${t.title}** — ${t.author}`)
                    .join('\n'),
            });
        } else {
            embed.addFields({ name: 'Up Next', value: 'Nothing queued.' });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
