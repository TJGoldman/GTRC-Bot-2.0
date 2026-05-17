const { SlashCommandBuilder } = require('discord.js');
const { getQueue, setVolume } = require('../player');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set the playback volume')
        .addIntegerOption(opt =>
            opt.setName('level')
                .setDescription('Volume level (0–100)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100)
        ),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        if (!queue?.current) {
            return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
        }
        const level = interaction.options.getInteger('level');
        setVolume(interaction.guildId, level);
        await interaction.reply(`Volume set to **${level}%**.`);
    },
};
