# Persistence Architecture: VORIXA

Persistent player data, discovered planetary seeds, and settings are stored locally using browser **IndexedDB** with schema migrations.

## 1. Storage Layout
* `player_profiles`: Character level, unlocked suits, permanent resonance upgrades.
* `planetary_archives`: Discovered world seeds, coordinates of scanned monoliths, charted anomalies.
* `user_settings`: Graphics quality tier, keybindings, volume preferences, FOV, sensitivity.

## 2. Integrity & Versioning
* Each record contains a schema version number and payload CRC32 checksum.
* Upgrades run non-destructive migration scripts, backing up previous save data to prevent corruption.
