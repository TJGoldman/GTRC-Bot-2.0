# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project

A Discord music bot built with Node.js. Supports playback from YouTube, SoundCloud, and Spotify (via YouTube bridge). Audio is normalized and transcoded to Ogg Opus via ffmpeg.

## Architecture

- `index.js` — Bot entry point, loads commands, initializes SoundCloud client ID
- `player.js` — Audio pipeline: yt-dlp → ffmpeg (loudnorm + libopus) → @discordjs/voice
- `spotify.js` — Spotify Web API helper (search by song/genre)
- `soundcloud.js` — SoundCloud API v2 helper (search, trending, tags)
- `utils.js` — Shared UI helpers (track selection buttons, queue embed fields)
- `deploy-commands.js` — Registers slash commands with Discord
- `commands/` — Slash command handlers (play, trending, skip, stop, queue, volume, nowplaying)

## Commands

Install dependencies:
```
npm install
```

Register slash commands (run once, or after adding/changing commands):
```
node deploy-commands.js
```

Run the bot:
```
node index.js
```

## Environment

Requires a `.env` file with:
```
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```
