# Arkona Releases for Millennium

Displays Arkona releases on Steam store pages by matching the current Steam AppID against Arkona's public read-only API. It also adds an ARKONA entry to Steam's main navigation and opens a native Arkona library inside Steam.

Website: [arkona.dev](https://arkona.dev)  
Illustrated guide: [arkona.dev/tutorials/arkona-steam](https://arkona.dev/tutorials/arkona-steam)  
Ready-to-install package: [arkona-releases.star](https://arkona.dev/downloads/arkona-releases.star)

## Features

- Scene and P2P releases associated with the exact Steam AppID
- Release type, group and size
- Protected download popup with 1fichier links and temporary password reveal
- Context-aware installation guide beside single-file downloads and once per multipart release
- Integrated NFO viewer with copy support
- Localized release and download labels for every Steam language code, including regional and Steam-specific aliases
- Localized Arkona library interface in English, French and Russian
- Five-minute backend cache to respect Arkona's public API limit
- Searchable, sortable and paginated Arkona game library integrated into Steam
- Scrollable 60-game pages with cover previews and descriptions on hover
- Native Steam game-detail pages with release lists and an integrated NFO viewer

The plugin receives private 1fichier links only after the normal Arkona proof-of-work and download challenge. They remain in memory for the open popup and are never persisted. The plugin stores no credentials or admin data.

## Build

Requires Millennium 3.4+ and Bun.

```powershell
bun install
bun run test
bun run build
```

Starlight's `output_path = "auto"` installs the built plugin into the detected Millennium installation. Enable **Arkona Releases** in Steam's Millennium plugin settings, then reload the Steam UI.

## Installation

1. Install [Millennium](https://docs.steambrew.app/users/getting-started/installation).
2. Download `arkona-releases.star` from Arkona.
3. Place it in `Steam\\millennium\\plugins`.
4. Enable **Arkona Releases** in Millennium, then reload the Steam UI.

## License

Released under the MIT License. See [LICENSE](LICENSE).
