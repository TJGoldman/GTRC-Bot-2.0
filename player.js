const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    StreamType,
    VoiceConnectionStatus,
    entersState,
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const ffmpegPath = 'ffmpeg';
const { exec: ytdlExec } = require('youtube-dl-exec');
const { getClientId: scClientId } = require('./soundcloud');

const queues = new Map();

function getQueue(guildId) {
    return queues.get(guildId) ?? null;
}

function killProcesses(queue) {
    try { queue.ffmpegProcess?.kill('SIGKILL'); } catch {}
    try { queue.ytdlpProcess?.kill('SIGKILL'); } catch {}
    queue.ffmpegProcess = null;
    queue.ytdlpProcess = null;
}

async function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return;

    killProcesses(queue);

    if (queue.tracks.length === 0) {
        queue.current = null;
        setTimeout(() => {
            const q = queues.get(guildId);
            if (q && q.tracks.length === 0 && !q.current) {
                q.connection.destroy();
                queues.delete(guildId);
            }
        }, 30000);
        return;
    }

    const track = queue.tracks.shift();
    queue.current = track;
    const sessionId = Date.now();
    queue.sessionId = sessionId;

    try {
        console.log(`[audio] "${track.title}" — source: ${track.source}, loudnorm active`);

        const ffmpeg = spawn(ffmpegPath, [
            '-i', 'pipe:0',
            '-loglevel', 'info',
            '-filter:a', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
            '-c:a', 'pcm_s16le',
            '-ar', '48000',
            '-ac', '2',
            '-f', 's16le',
            'pipe:1',
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        queue.ffmpegProcess = ffmpeg;

        let ffmpegStderr = '';
        ffmpeg.stderr.on('data', chunk => { ffmpegStderr += chunk.toString(); });
        ffmpeg.stderr.on('end', () => {
            const jsonMatch = ffmpegStderr.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
                try {
                    const s = JSON.parse(jsonMatch[0]);
                    console.log(`[audio] loudnorm: input=${s.input_i} LUFS, peak=${s.input_tp} dBTP → normalized to -16 LUFS`);
                } catch {}
            }
        });

        const format = track.source === 'SoundCloud'
            ? 'bestaudio[protocol=https]/bestaudio[protocol=http]/bestaudio[protocol!=m3u8][protocol!=m3u8_native]'
            : 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio';

        const ytdlpOpts = {
            format,
            output: '-',
            bufferSize: '16M',
            httpChunkSize: '10M',
        };
        if (track.source === 'SoundCloud') {
            const cid = scClientId();
            if (cid) ytdlpOpts.extractorArgs = `soundcloud:client_id=${cid}`;
        }

        const ytdlp = ytdlExec(track.url, ytdlpOpts, { stdio: ['ignore', 'pipe', 'pipe'] });
        queue.ytdlpProcess = ytdlp;

        let ytdlpStderr = '';
        ytdlp.stderr.on('data', chunk => { ytdlpStderr += chunk.toString(); });
        ytdlp.stderr.on('end', () => {
            if (ytdlpStderr.includes('ERROR')) console.error(`[yt-dlp] ${ytdlpStderr.match(/ERROR.*/)?.[0] ?? 'unknown error'}`);
            const match = ytdlpStderr.match(/Downloading 1 format\(s\): (\S+)/i)
                ?? ytdlpStderr.match(/\[(soundcloud|youtube)\] .*(http|hls|mp3|webm|m4a)/i);
            if (match) console.log(`[audio] yt-dlp selected format: ${match[1] ?? match[0]}`);
        });

        ytdlp.catch(() => {
            if (queue.sessionId !== sessionId) return;
            queue.textChannel?.send(`Could not stream **${track.title}** — skipping.`).catch(() => {});
            queue.player.stop();
        });

        ytdlp.stdout.pipe(ffmpeg.stdin);
        ytdlp.stdout.on('error', () => {});
        ffmpeg.stdin.on('error', () => {});

        // buffer ~5s of PCM audio (48kHz stereo s16le = 192KB/s, so 960KB ≈ 5s)
        const pcmBuffer = new PassThrough({ highWaterMark: 960 * 1024 });
        ffmpeg.stdout.pipe(pcmBuffer);

        const resource = createAudioResource(pcmBuffer, {
            inputType: StreamType.Raw,
            inlineVolume: true,
        });
        resource.volume.setVolume(queue.volume);
        queue.resource = resource;

        queue.player.play(resource);
    } catch (err) {
        console.error('Stream error:', err.message);
        queue.current = null;
        playNext(guildId);
    }
}

async function getOrCreateQueue(voiceChannel, textChannel) {
    const guildId = voiceChannel.guild.id;
    if (queues.has(guildId)) return queues.get(guildId);

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
        connection.destroy();
        throw new Error('Could not connect to voice channel.');
    }

    const player = createAudioPlayer();
    connection.subscribe(player);

    const queue = {
        connection,
        player,
        tracks: [],
        current: null,
        resource: null,
        volume: 0.8,
        textChannel,
        sessionId: 0,
        ffmpegProcess: null,
        ytdlpProcess: null,
    };
    queues.set(guildId, queue);

    player.on(AudioPlayerStatus.Idle, () => {
        queue.sessionId = 0;
        queue.current = null;
        queue.resource = null;
        playNext(guildId);
    });

    player.on('error', (err) => {
        console.error('Player error:', err.message);
        queue.sessionId = 0;
        queue.current = null;
        queue.resource = null;
        playNext(guildId);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch {
            connection.destroy();
            queues.delete(guildId);
        }
    });

    return queue;
}

async function addTrack(voiceChannel, textChannel, track) {
    const queue = await getOrCreateQueue(voiceChannel, textChannel);
    const wasIdle = !queue.current && queue.tracks.length === 0;
    queue.tracks.push(track);
    if (wasIdle) await playNext(voiceChannel.guild.id);
    return queue;
}

function skip(guildId) {
    const queue = queues.get(guildId);
    if (!queue?.current) return false;
    queue.player.stop();
    return true;
}

function stop(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return false;
    killProcesses(queue);
    queue.tracks = [];
    queue.current = null;
    queue.player.stop();
    queue.connection.destroy();
    queues.delete(guildId);
    return true;
}

function setVolume(guildId, percent) {
    const queue = queues.get(guildId);
    if (!queue) return false;
    queue.volume = percent / 100;
    queue.resource?.volume?.setVolume(queue.volume);
    return true;
}

async function verifyTrack(url, source) {
    const format = source === 'SoundCloud'
        ? 'bestaudio[protocol=https]/bestaudio[protocol=http]/bestaudio[protocol!=m3u8][protocol!=m3u8_native]'
        : 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio';
    const opts = { simulate: true, quiet: true, format };
    if (source === 'SoundCloud') {
        const cid = scClientId();
        if (cid) opts.extractorArgs = `soundcloud:client_id=${cid}`;
    }
    try {
        await ytdlExec(url, opts);
        return true;
    } catch {
        return false;
    }
}

module.exports = { getQueue, addTrack, skip, stop, setVolume, verifyTrack };
