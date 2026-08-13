# Thendrask Relay

A small Express service that powers the Thendrask Launcher friends list and keeps the project's CurseForge API key out of the distributed desktop app. Presence is held in memory and expires after 90 seconds.

## API

- `PUT /presence/:code` registers presence. It requires `Authorization: Bearer <64-character-secret>`; the first write claims a code until it expires.
- `GET /presence/:code` reads current presence or returns `{ "online": false }`.
- `GET /health` returns service health and the current peer count.
- `/curseforge/v1/...` forwards only the CurseForge API operations used by the launcher. The server injects the API key; clients never receive it.

Requests are rate-limited, JSON bodies are capped at 4 KB, presence fields are sanitized, and the relay holds at most 10,000 active peers.

## Run locally

```bash
cd relay
npm install
npm start
```

The default port is `3001`. Set `PORT` to override it and set `CURSEFORGE_API_KEY` to the approved project key. Place the service behind HTTPS in production, then set its URL under **Settings → Connections → Combined Relay URL**.

Do not place `CURSEFORGE_API_KEY` in this repository or in the launcher build. Add it using your hosting provider's secret/environment-variable settings.
