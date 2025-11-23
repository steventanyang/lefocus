# lefocus

minimalist pomodoro tracker

## Setup

Install dependencies:
```bash
bun install
```

Run the app:
```bash
bun run tauri dev
```

## Requirements

- [Rust](https://rustup.rs/)
- [Bun](https://bun.sh/)
- Xcode Command Line Tools (macOS): `xcode-select --install`

## Scripts

- `bun run db:mig` - Create new database migration
- `bun run db:ver` - Print current database version
- `bun run db:inc` - Increment database version
- `bun run db:dec` - Decrement database version
- `bun run db:set <N>` - Set database version to N