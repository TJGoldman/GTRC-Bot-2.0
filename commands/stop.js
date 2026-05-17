const { SlashCommandBuilder } = require('discord.js');
const { getQueue, stop } = require('../player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playback and clear the queue'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        if (!queue?.current && !queue?.tracks.length) {
            return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
        }
        stop(interaction.guildId);
        await interaction.reply('Stopped playback and cleared the queue.');
    },
};
