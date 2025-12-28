# Node-RED Function Sync 🛠️

A collection of Node.js scripts to help professionalize Node-RED development by enabling local editing, testing, and synchronization of function nodes.

## Features

- **Extract to Local**: Extract internal Node-RED function nodes to local `.js` files.
- **Bi-Directional Sync**: Edit `.js` files locally and sync them back to `flows.json`.
- **Complexity Scanner**: Scan your `flows.json` to identify complex function nodes that should be externalized and tested.
- **Testability**: Automatically wraps function bodies in `module.exports = function(...)` for easy unit testing with `node --test` or `mocha`.

## Scripts

### 1. `nr-extract`
Extracts a specific function node by ID (or scans for candidates).

**Usage:**
```bash
# Scan for candidates
node bin/extract.js --scan --flows /path/to/flows.json

# Extract a specific node
node bin/extract.js <NODE_ID> --src ./src --flows ./flows.json
```

### 2. `nr-sync`
Syncs changes from local `.js` files back into `flows.json`.

**Usage:**
```bash
node bin/sync.js --src ./src --flows ./flows.json
```

### Argument Details

#### `--src <path>` (Default: `./src`)
Specifies the root directory for your local JavaScript files.
- **In `nr-extract`**: Used to look up existing files to update by ID, and to determine "EXPORTED" status during scans.
- **In `nr-sync`**: Recursively scans this directory for **any** `.js` file containing the `/* flows.json attributes ... */` metadata block.

## Installation

Install via npm:

```bash
npm install --save-dev node-red-function-sync
```

## Getting Started

1.  **Initialize your project** (if you haven't already):
    ```bash
    mkdir my-flows
    cd my-flows
    npm init -y
    ```

2.  **Scan your flows** to see what's worth extracting:
    ```bash
    npx nr-extract --scan
    ```

3.  **Extract a node**:
    Pick an ID from the scan list and extract it. The tool will automatically create a file in `src/`.
    ```bash
    npx nr-extract <NODE_ID>
    ```

4.  **Edit and Sync**:
    Modify the file in `src/` using your favorite IDE. When ready, sync back:
    ```bash
    npx nr-sync
    ```
