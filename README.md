# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Setup

### Prerequisites

1. **Rust/Cargo** - Install via [rustup.rs](https://rustup.rs/)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Swift/Xcode Command Line Tools** - Required for macOS Swift plugin
   ```bash
   xcode-select --install
   ```
   > **Troubleshooting:** If you encounter `PackageDescription` linker errors:
   > - Update Command Line Tools: `softwareupdate --install "Command Line Tools for Xcode-16.4"`
   > - Or reset xcode-select: `sudo xcode-select --reset`
   > - If issues persist, install full Xcode from the App Store and switch to it:
   >   ```bash
   >   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   >   ```

3. **Bun** - Package manager (install via [bun.sh](https://bun.sh/))
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

### Installation

```bash
# Install dependencies
bun install

# Or use npm if preferred
npm install
```

### Development

```bash
# Start dev server
bun run tauri dev

# Or with npm
npm run tauri dev
```

The Swift plugin builds automatically during the Rust build process - no manual steps needed.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Scripts

- `npm run db:mig` - Create new database migration
- `npm run db:ver` - Print current database version
- `npm run db:inc` - Increment database version
- `npm run db:dec` - Decrement database version
- `npm run db:set <N>` - Set database version to N