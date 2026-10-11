# Thendrask Relay

A small Express service that powers the Thendrask Launcher friends list and keeps the project's CurseForge API key out of the distributed desktop app. Presence is held in memory and expires after 90 seconds.

## API

- `PUT /presence/:code` registers presence. It requires `Authorization: Bearer <64-character-secret>`; the first write claims a code permanently using a hashed credential stored on disk. Offline presence expires without releasing code ownership.
- `GET /presence/:code` reads current presence or returns `{ "online": false }`.
- `GET /health` returns service health and the current peer count.
- `/curseforge/v1/...` forwards only the CurseForge API operations used by the launcher. The server injects the API key; clients never receive it.
- `GET /curseforge/v1/categories?gameId=432&classId=6` supplies mod categories; class `12` supplies texture pack categories and `6552` supplies shader categories. Deploy the updated `curseforge.js` allowlist and restart the relay to enable this endpoint.

Requests are rate-limited, JSON bodies are capped at 4 KB, presence fields are sanitized, and the relay holds at most 10,000 active peers.
CurseForge API responses are forwarded without being cached and are returned with `Cache-Control: no-store`.

## Run locally

```bash
cd relay
npm install
npm start
```

The default port is `3001`. Set `PORT` to override it and set `CURSEFORGE_API_KEY` to the approved project key. Place the service behind HTTPS in production, then set its URL under **Settings → Connections → Combined Relay URL**.

Do not place `CURSEFORGE_API_KEY` in this repository or in the launcher build. Add it using your hosting provider's secret/environment-variable settings.

Set `CLAIMS_DIR` to a persistent volume (default: `relay/data/claims`). Back up this directory and preserve it across deployments so friend codes cannot be reclaimed after a restart. The 10,000-peer limit applies to active presence, not lifetime registrations. Existing in-memory claims cannot survive the first restart when upgrading from older relay versions; clients register them again.
