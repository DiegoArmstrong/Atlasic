# Atlasic Extension Development Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Extension
```bash
npm run compile
```

### 3. Launch Development Host
Press `F5` in VS Code to launch the Extension Development Host

### 4. Test Commands
Open Command Palette (Ctrl+Shift+P) and run:
- `Atlasic: Generate Codebase Map`
- `Atlasic: Open Codebase Visualizer`

## File Structure & Responsibilities

### Core Files

#### `src/extension.ts`
- Extension activation/deactivation lifecycle
- Command registration
- Status bar management
- Progress indicators

#### `src/graphGenerator.ts`
- **CRITICAL**: Character-by-character JSON parser
- File discovery with configurable depth
- Multi-language dependency extraction
- Path alias resolution from tsconfig.json
- File categorization logic

#### `src/graphPanel.ts`
- Webview creation and management
- D3.js force-directed graph rendering
- Interactive node behaviors
- Tooltip and legend management
- File opening integration

#### `src/cacheManager.ts`
- Graph serialization to disk
- Cache loading and validation
- Cleanup operations

#### `src/types.ts`
- TypeScript interfaces for type safety
- GraphNode, GraphLink, CodebaseGraph definitions

#### `src/utils/logger.ts`
- Centralized logging (minimal output philosophy)
- Error tracking

#### `src/utils/constants.ts`
- Default configurations
- Ignore patterns
- Supported file extensions

## Key Implementation Details

### Path Alias Resolution Strategy

1. Search for tsconfig.json in multiple locations:
   - `{root}/tsconfig.json`
   - `{root}/frontend/tsconfig.json`
   - `{root}/src/frontend/tsconfig.json`

2. Parse JSON safely with character-by-character parser
   - Respects string boundaries
   - Handles comments without breaking glob patterns

3. Resolve aliases with file extension fallback:
   - `.ts`, `.tsx`, `.js`, `.jsx`, `.vue`
   - Check for `index.{ext}` in directories

### Dependency Extraction by Language

**JavaScript/TypeScript:**
- ES6: `import X from 'path'`
- CommonJS: `require('path')`
- Dynamic: `import('path')`

**Python:**
- Relative: `from . import x`, `from .. import y`
- Absolute: `from package import module`

**Java:**
- Package imports: `import com.example.Package`
- Filters out java.* and javax.* standard library

**Go:**
- Module imports from import blocks

### File Categorization

Priority order in `categorizeFile()`:
1. Test files (*.test.*, *.spec.*, in test/)
2. Config files (config, .config.*)
3. Components (in component/)
4. API/Services (in api/, service/)
5. Utilities (in util/, helper/)
6. Models (in model/, type/)
7. Other

### Graph Visualization

D3.js v7 force simulation with:
- **Charge Force**: Repels nodes (-400 strength)
- **Link Force**: Attracts connected nodes (80 distance)
- **Collision Force**: Prevents node overlap (35px radius)
- **Center Force**: Keeps graph centered
- **Zoom**: 0.1x to 10x scale

## Debugging

### Enable Verbose Logging

1. Open `src/utils/logger.ts`
2. Modify Logger class to output all info() calls:

```typescript
static info(message: string): void {
  console.log(`${this.PREFIX} ${message}`);  // Add back
}
```

3. Check Extension Output panel (View > Output > Atlasic)

### Inspect Graph Data

In GraphPanel webview console:
```javascript
console.log(graphData);  // Full graph object
console.log(graphData.nodes);  // All nodes
console.log(graphData.links);  // All dependencies
```

## Extension API Usage

### Key VS Code APIs

```typescript
// Create webview
vscode.window.createWebviewPanel(...)

// Show progress
vscode.window.withProgress(...)

// Send messages from webview
this.panel.webview.onDidReceiveMessage(...)

// Register commands
vscode.commands.registerCommand(...)

// Status bar
vscode.window.createStatusBarItem(...)
```

## Build Output

After running `npm run compile`:
- `dist/extension.js` - Bundled extension code
- `dist/extension.js.map` - Source map for debugging

## Troubleshooting Build

### TypeScript errors
```bash
npm run lint
```

### Clear and rebuild
```bash
rm -rf dist node_modules
npm install
npm run compile
```

### esbuild issues
- Check `esbuild.js` external dependencies
- Verify `vscode` is marked as external (not bundled)