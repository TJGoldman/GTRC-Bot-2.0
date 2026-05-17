const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');

async function selectTrack(interaction, tracks, color) {
    if (tracks.length <= 1) return tracks[0] ?? null;

    const shown = tracks.slice(0, 3);

    const buttons = shown.map((_, i) =>
        new ButtonBuilder()
            .setCustomId(`select_${i}`)
            .setLabel(String(i + 1))
            .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder().addComponents(buttons);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('Choose a track')
        .setDescription(shown.map((t, i) => `**${i + 1}.** ${t.title} — ${t.author} \`${t.duration}\``).join('\n'))
        .setFooter({ text: 'Select a number • Auto-plays #1 after 30s' });

    const msg = await interaction.followUp({ embeds: [embed], components: [row] });

    const disabledRow = new ActionRowBuilder().addComponents(
        buttons.map(b => ButtonBuilder.from(b).setDisabled(true))
    );

    try {
        const btn = await msg.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id,
            time: 30_000,
        });
        await btn.deferUpdate();
        await msg.edit({ components: [disabledRow] });
        return shown[parseInt(btn.customId.split('_')[1])];
    } catch {
        await msg.edit({ components: [disabledRow] }).catch(() => {});
        return shown[0];
    }
}

function queueFields(queue, track) {
    const fields = [];
    const pos = queue.tracks.findIndex(t => t === track);

    if (pos !== -1) {
        fields.push({ name: 'Queue Position', value: `${pos + 1} of ${queue.tracks.length}`, inline: true });
    }

    const next = pos > 0 ? queue.tracks[0] : queue.tracks[pos === -1 ? 0 : 1];
    if (next) {
        fields.push({ name: 'Next Up', value: `${next.title} — ${next.author}`, inline: false });
    }

    return fields;
}

module.exports = { selectTrack, queueFields };
