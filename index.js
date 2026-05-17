require('dotenv').config();
const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const playdl = require('play-dl');
const { setClientId: scSetClientId } = require('./soundcloud');
const { getRecommendations, findSpotifyId } = require('./spotify');
const { addTrack } = require('./player');
const { getSeed } = require('./stationSeeds');

process.env.FFMPEG_PATH = require('ffmpeg-static');

playdl.getFreeClientID()
    .then(id => {
        playdl.setToken({ soundcloud: { client_id: id } });
        scSetClientId(id);
        console.log('SoundCloud client ID initialized');
    })
    .catch(err => console.error('SoundCloud init failed:', err.message));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
    ],
});

client.commands = new Collection();

const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(path.join(__dirname, 'commands', file));
    client.commands.set(command.data.name, command);
}

client.once('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Guilds cached: ${client.guilds.cache.size}`);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(err);
            const msg = { content: 'Something went wrong.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(msg);
            } else {
                await interaction.reply(msg);
            }
        }
        return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('station_')) {
        const seedId = interaction.customId.slice('station_'.length);
        const seed = getSeed(seedId);

        if (!seed) {
            return interaction.reply({ content: 'Station data expired — play the song again and try once more.', ephemeral: true });
        }

        const voiceChannel = interaction.guild.members.cache.get(interaction.user.id)?.voice?.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'You need to be in a voice channel first.', ephemeral: true });
        }

        if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
            return interaction.reply({ content: 'Spotify credentials are required for Start Station.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            let spotifyId = seed.spotifyId;
            if (!spotifyId) spotifyId = await findSpotifyId(seed.title, seed.author);
            if (!spotifyId) {
                return interaction.followUp({ content: `Couldn't match **${seed.title}** on Spotify to start a station.`, ephemeral: true });
            }

            const recommendations = await getRecommendations(spotifyId, 10);
            if (!recommendations.length) {
                return interaction.followUp({ content: 'No recommendations found for this track.', ephemeral: true });
            }

            let added = 0;
            for (const rec of recommendations) {
                try {
                    const results = await playdl.search(`${rec.title} ${rec.author}`, { source: { youtube: 'video' }, limit: 1 });
                    if (!results[0]) continue;
                    await addTrack(voiceChannel, interaction.channel, {
                        title: rec.title,
                        author: rec.author,
                        url: results[0].url,
                        duration: rec.duration,
                        thumbnail: rec.thumbnail,
                        source: 'Spotify',
                        requestedBy: interaction.member?.displayName ?? interaction.user.username,
                    });
                    added++;
                } catch {}
            }

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x1db954)
                        .setTitle('📻 Station Started')
                        .setDescription(`Added **${added}** tracks based on **${seed.title}** by ${seed.author}`),
                ],
            });

            await interaction.message.edit({ components: [
                new ActionRowBuilder().addComponents(
                    ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true)
                ),
            ]}).catch(() => {});
        } catch (err) {
            console.error('Station error:', err.message);
            await interaction.followUp({ content: `Could not start station: ${err.message}`, ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
