const { SlashCommandBuilder } = require('discord.js');
const { getQueue, skip } = require('../player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current track'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        if (!queue?.current) {
            return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
        }
        const title = queue.current.title;
        skip(interaction.guildId);
        await interaction.reply(`Skipped **${title}**.`);
    },
};
