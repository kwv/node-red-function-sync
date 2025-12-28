# Node-RED Function Sync 🛠️

A collection of Node.js scripts to help professionalize Node-RED development by enabling local editing, testing, and synchronization of function nodes.

## Features

- **Extract to Local**: Extract internal Node-RED function nodes to local `.js` files.
- **Bi-Directional Sync**: Edit `.js` files locally and sync them back to `flows.json`.
- **Complexity Scanner**: Scan your `flows.json` to identify complex function nodes that should be externalized and tested.
- **Testability**: Automatically wraps function bodies in a testable `module.exports = function(...)` wrapper.

## Installation

Install via npm to use the CLI tools:

```bash
npm install --save-dev node-red-function-sync
```

## Usage

### 1. Extracting Function Nodes (`nr-extract`)

Used to scan for candidates or extract a specific node by its ID.

```bash
# Scan for complex candidates in flows.json
npx nr-extract --scan

# Extract a specific node to the src directory
npx nr-extract <NODE_ID> --src ./src --flows ./flows.json
```

**Options:**
- `--flows <path>`: Path to your `flows.json` (Default: `flows.json`)
- `--src <path>`: Local directory to save scripts (Default: `src`)
- `--scan`: Analyze all function nodes and sort by complexity.

### 2. Synchronizing Changes (`nr-sync`)

Used to push local changes from your `.js` files back into the `flows.json`.

```bash
npx nr-sync --src ./src --flows ./flows.json
```

**Options:**
- `--flows <path>`: Path to your `flows.json` (Default: `flows.json`)
- `--src <path>`: Local directory to scan for changes (Default: `src`)

## Workflow Guide

1.  **Extract**: Use `npx nr-extract --scan` to find nodes, then `npx nr-extract <ID>` to pull them locally.
2.  **Edit**: Open the generated file in `src/` with your favorite IDE.
3.  **Sync**: Run `npx nr-sync` to update your Node-RED flows.
4.  **Deploy**: Restart or reload Node-RED to apply the changes.

## Development

To run the internal unit tests:

```bash
npm test
```
