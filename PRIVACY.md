# Privacy

Virelia Prism is designed around local media libraries. File paths, playback state, generated thumbnails, cached artwork, and settings are stored locally on the user's machine.

## Local Data

The app may store:

- Library folders and indexed media metadata.
- Playback progress, queue/history, playlists, and favorites.
- Cached posters, backdrops, screenshots, thumbnails, and subtitle files.
- User settings, including online metadata preferences.

## Network Requests

When online metadata or discovery is enabled, the app may contact:

- Prism Metadata Gateway (`metadata.prism.virelia.app`) for catalog/search metadata.
- AniList and Jikan for anime metadata fallback.
- Image hosts referenced by metadata providers for artwork caching.
- YouTube/Dailymotion thumbnail or trailer URLs when trailers are shown.
- Optional user-configured services for translation or local recognition features.

Only title/search metadata needed for lookup should be sent. Local media files are not uploaded by the core library scanner.

## Offline Mode

Users can disable online metadata/discovery in Settings. When disabled, Virelia Prism should continue to work as a local library and player, with online artwork/catalog features unavailable.

## User Responsibility

If you configure custom API endpoints or local recognition/translation backends, review those services' privacy policies separately.

