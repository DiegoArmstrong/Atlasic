# Atlasic - Quick Reference

## Installation & Setup (2 minutes)

```bash
npm install
npm run compile
```

Press F5 to launch Extension Development Host.

## Core Commands

| Command | Shortcut | Purpose |
|---------|----------|---------|
| Generate Codebase Map | — | Analyze workspace, create graph |
| Open Codebase Visualizer | — | Display interactive graph |
| Refresh Graph | — | Regenerate with latest code |
| Clear Cache | — | Remove cached graph data |

## File Structure

```
src/
├── extension.ts          Main entry point
├── graphGenerator.ts     ⭐ Core engine with JSON parser fix
├── graphPanel.ts         D3.js visualization
├── cacheManager.ts       Graph persistence
├── types.ts              TypeScript interfaces
└── utils/
    ├── logger.ts         Minimal logging
    └── constants.ts      Configuration
```

## Supported Languages

| Language | Patterns | Example |
|----------|----------|---------|
| TypeScript | import, require, dynamic import | `import X from '@/module'` |
| JavaScript | ES6, CommonJS | `require('./file')` |
| Python | relative, absolute imports | `from . import utils` |
| Java | package imports | `import com.example.*` |
| Go | module imports | `import "local/package"` |

## Key Features

### Path Alias Resolution
- ✅ Automatic `@/` alias detection
- ✅ Supports glob patterns (`@/*`)
- ✅ Searches multiple tsconfig locations
- ✅ Extension fallback (`.ts`, `.tsx`, `.js`, `.jsx`)

## Configuration (settings.json)

```json
{
  "atlasic.ignorePatterns": [
    "node_modules", "dist", "build", ".git"
  ],
  "atlasic.maxDepth": 10,
  "atlasic.supportedLanguages": [
    ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go"
  ]
}
```

## Common Tasks

### Generate graph for first time
```
Cmd/Ctrl+Shift+P → "Atlasic: Generate Dependency Map" → Enter
```

### View the graph
```
Cmd/Ctrl+Shift+P → "Atlasic: Open Dependency Visualizer" → Enter
```

### Refresh after code changes
```
Cmd/Ctrl+Shift+P → "Atlasic: Refresh Graph" → Enter
```

### Debug path aliases
1. Verify `tsconfig.json` exists in workspace root
2. Check `compilerOptions.paths` format
3. Run Generate and inspect `.atlasic/graph-cache.json`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No nodes appear | Add `.ts`/`.js` files; check ignorePatterns |
| Path aliases don't work | Verify tsconfig.json location/format |
| Graph slow | Increase maxDepth; add ignore patterns |
| Empty project | Extension warns; shows empty graph |

## Build & Publish

```bash
npm run compile          # Build once
npm run watch           # Watch mode
npm run vscode:prepublish  # Optimize build

# Create VSIX package
npm install -g vsce
vsce package            # Creates atlasic-1.0.0.vsix
vsce publish            # Publish to marketplace
```

## File System Structure

```
workspace/
├── src/
│   ├── components/     ← Cyan nodes
│   ├── utils/          ← Gold nodes
│   ├── services/       ← Red nodes
│   └── types/          ← Purple nodes
├── tests/              ← Teal nodes
├── config/             ← Gray nodes
├── tsconfig.json       ← Path aliases loaded here
└── .atlasic/           ← Cache stored here
    └── graph-cache.json
```

## Extension Lifecycle

```
1. Activate (onStartupFinished)
   ↓
2. Create status bar & register commands
   ↓
3. User runs command
   ↓
4. GraphGenerator scans files
   ↓
5. Extract dependencies per language
   ↓
6. CacheManager saves to disk
   ↓
7. GraphPanel displays D3.js webview
   ↓
8. User interacts (zoom/pan/drag/click)
```

## Related Files

- 📖 [README.md](README.md) - User documentation
- ✅ [TESTING.md](TESTING.md) - Testing procedures


