"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// dist/utils/logger.js
var require_logger = __commonJS({
  "dist/utils/logger.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Logger = void 0;
    var Logger = class {
      static info(message) {
        console.log(`${this.PREFIX} ${message}`);
      }
      static warn(message, error) {
        if (error) {
          console.warn(`${this.PREFIX} ${message}:`, error);
        } else {
          console.warn(`${this.PREFIX} ${message}`);
        }
      }
      static error(message, error) {
        if (error) {
          console.error(`${this.PREFIX} ${message}:`, error);
        } else {
          console.error(`${this.PREFIX} ${message}`);
        }
      }
    };
    exports2.Logger = Logger;
    Logger.PREFIX = "[Atlasic]";
  }
});

// dist/utils/constants.js
var require_constants = __commonJS({
  "dist/utils/constants.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.PATH_ALIAS_LOCATIONS = exports2.DEFAULT_MAX_DEPTH = exports2.SUPPORTED_EXTENSIONS = exports2.DEFAULT_IGNORE_PATTERNS = void 0;
    exports2.DEFAULT_IGNORE_PATTERNS = [
      "node_modules",
      "dist",
      "build",
      ".git",
      "__pycache__",
      ".venv",
      ".next",
      "out",
      "coverage",
      ".vscode",
      ".idea",
      ".cache"
    ];
    exports2.SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go"];
    exports2.DEFAULT_MAX_DEPTH = 10;
    exports2.PATH_ALIAS_LOCATIONS = [
      "tsconfig.json",
      "frontend/tsconfig.json",
      "src/frontend/tsconfig.json"
    ];
  }
});

// dist/graphGenerator.js
var require_graphGenerator = __commonJS({
  "dist/graphGenerator.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || /* @__PURE__ */ function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2)
            if (Object.prototype.hasOwnProperty.call(o2, k))
              ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule)
          return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++)
            if (k[i] !== "default")
              __createBinding2(result, mod, k[i]);
        }
        __setModuleDefault2(result, mod);
        return result;
      };
    }();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.GraphGenerator = void 0;
    var fs = __importStar2(require("fs"));
    var path = __importStar2(require("path"));
    var logger_12 = require_logger();
    var constants_1 = require_constants();
    var GraphGenerator = class {
      constructor(workspaceRoot, ignorePatterns = constants_1.DEFAULT_IGNORE_PATTERNS, maxDepth = constants_1.DEFAULT_MAX_DEPTH, supportedExtensions = constants_1.SUPPORTED_EXTENSIONS) {
        this.workspaceRoot = workspaceRoot;
        this.pathAliases = /* @__PURE__ */ new Map();
        this.ignorePatterns = ignorePatterns;
        this.maxDepth = maxDepth;
        this.supportedExtensions = supportedExtensions;
        this.loadPathAliases();
      }
      /**
       * CRITICAL: Character-by-character JSON parser that respects string boundaries.
       * This prevents the bug where regex patterns like \/\*[\s\S]*?\*\/ match glob patterns
       * like "/**\/*.ts" inside JSON strings, corrupting the path alias configuration.
       */
      parseJsonWithComments(content) {
        let result = "";
        let inString = false;
        let stringChar = "";
        let i = 0;
        while (i < content.length) {
          const char = content[i];
          const nextChar = content[i + 1];
          if ((char === '"' || char === "'") && (i === 0 || content[i - 1] !== "\\")) {
            if (!inString) {
              inString = true;
              stringChar = char;
            } else if (char === stringChar) {
              inString = false;
            }
            result += char;
            i++;
          } else if (!inString && char === "/" && nextChar === "/") {
            while (i < content.length && content[i] !== "\n") {
              i++;
            }
            result += "\n";
            i++;
          } else if (!inString && char === "/" && nextChar === "*") {
            i += 2;
            while (i < content.length - 1 && !(content[i] === "*" && content[i + 1] === "/")) {
              i++;
            }
            i += 2;
          } else {
            result += char;
            i++;
          }
        }
        return result.replace(/,(\s*[}\]])/g, "$1");
      }
      loadPathAliases() {
        try {
          const possibleLocations = constants_1.PATH_ALIAS_LOCATIONS.map((loc) => path.join(this.workspaceRoot, loc));
          let configPath = null;
          for (const location of possibleLocations) {
            if (fs.existsSync(location)) {
              configPath = location;
              break;
            }
          }
          if (!configPath)
            return;
          const content = fs.readFileSync(configPath, "utf8");
          const jsonContent = this.parseJsonWithComments(content);
          const tsconfig = JSON.parse(jsonContent);
          if (tsconfig.compilerOptions?.paths) {
            const configDir = path.dirname(configPath);
            for (const [alias, paths] of Object.entries(tsconfig.compilerOptions.paths)) {
              const cleanAlias = alias.replace("/*", "");
              let cleanPath = paths[0].replace("/*", "");
              const resolvedPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(configDir, cleanPath);
              this.pathAliases.set(cleanAlias, resolvedPath);
            }
          }
        } catch (error) {
          logger_12.Logger.warn("Error loading path aliases", error);
        }
      }
      async generateGraph() {
        const nodes = /* @__PURE__ */ new Map();
        const links = [];
        const files = this.discoverFiles(this.workspaceRoot);
        for (const filePath of files) {
          if (!nodes.has(filePath)) {
            nodes.set(filePath, this.createNode(filePath));
          }
          const content = fs.readFileSync(filePath, "utf8");
          const fileLinks = this.extractDependencies(filePath, content);
          for (const link of fileLinks) {
            const targetPath = link.target;
            if (!nodes.has(targetPath)) {
              nodes.set(targetPath, this.createNode(targetPath));
            }
            links.push(link);
          }
        }
        return {
          nodes: Array.from(nodes.values()),
          links,
          timestamp: Date.now()
        };
      }
      discoverFiles(startPath, depth = 0) {
        const files = [];
        if (depth > this.maxDepth) {
          return files;
        }
        try {
          const entries = fs.readdirSync(startPath, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(startPath, entry.name);
            if (this.shouldIgnore(fullPath)) {
              continue;
            }
            if (entry.isDirectory()) {
              files.push(...this.discoverFiles(fullPath, depth + 1));
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name);
              if (this.supportedExtensions.includes(ext)) {
                files.push(fullPath);
              }
            }
          }
        } catch (error) {
          logger_12.Logger.warn(`Error reading directory ${startPath}`, error);
        }
        return files;
      }
      shouldIgnore(filePath) {
        const relativePath = path.relative(this.workspaceRoot, filePath).toLowerCase();
        return this.ignorePatterns.some((pattern) => relativePath.includes(pattern.toLowerCase()));
      }
      createNode(filePath) {
        const fileName = path.basename(filePath);
        const ext = path.extname(filePath);
        return {
          id: filePath,
          label: fileName,
          category: this.categorizeFile(filePath),
          language: ext.slice(1)
          // Remove leading dot
        };
      }
      categorizeFile(filePath) {
        const fileName = path.basename(filePath).toLowerCase();
        const dirName = path.dirname(filePath).toLowerCase();
        if (fileName.includes(".test.") || fileName.includes(".spec.") || dirName.includes("test")) {
          return "test";
        }
        if (fileName.includes("config") || fileName.endsWith(".config.ts") || fileName.endsWith(".config.js")) {
          return "config";
        }
        if (dirName.includes("component") || fileName.includes("component")) {
          return "component";
        }
        if (dirName.includes("api") || dirName.includes("service")) {
          return "api";
        }
        if (dirName.includes("util") || dirName.includes("helper")) {
          return "utility";
        }
        if (dirName.includes("model") || dirName.includes("type")) {
          return "model";
        }
        return "other";
      }
      extractDependencies(filePath, content) {
        const ext = path.extname(filePath);
        switch (ext) {
          case ".ts":
          case ".tsx":
          case ".js":
          case ".jsx":
            return this.extractJavaScriptDependencies(filePath, content);
          case ".py":
            return this.extractPythonDependencies(filePath, content);
          case ".java":
            return this.extractJavaDependencies(filePath, content);
          case ".go":
            return this.extractGoDependencies(filePath, content);
          default:
            return [];
        }
      }
      extractJavaScriptDependencies(filePath, content) {
        const links = [];
        const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
        const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
        const dynamicImportRegex = /import\s*\(['"]([^'"]+)['"]\)/g;
        const matches = [
          ...content.matchAll(importRegex),
          ...content.matchAll(requireRegex),
          ...content.matchAll(dynamicImportRegex)
        ];
        for (const match of matches) {
          const importPath = match[1];
          if (!importPath.startsWith(".") && !importPath.startsWith("/") && !importPath.startsWith("@/")) {
            continue;
          }
          const resolvedPath = this.resolveImportPath(filePath, importPath);
          if (resolvedPath) {
            links.push({
              source: filePath,
              target: resolvedPath,
              type: "dependency"
            });
          }
        }
        return links;
      }
      extractPythonDependencies(filePath, content) {
        const links = [];
        const importRegex = /^(?:from\s+([\w.]+)\s+)?import\s+([\w,\s*]+)/gm;
        for (const match of content.matchAll(importRegex)) {
          const fromModule = match[1];
          if (fromModule && fromModule.startsWith(".")) {
            const resolvedPath = this.resolveRelativePythonImport(filePath, fromModule);
            if (resolvedPath) {
              links.push({
                source: filePath,
                target: resolvedPath,
                type: "dependency"
              });
            }
          } else if (fromModule && !this.isExternalModule(fromModule)) {
            const resolvedPath = this.resolveAbsolutePythonImport(fromModule);
            if (resolvedPath) {
              links.push({
                source: filePath,
                target: resolvedPath,
                type: "dependency"
              });
            }
          }
        }
        return links;
      }
      extractJavaDependencies(filePath, content) {
        const links = [];
        const importRegex = /import\s+([a-zA-Z0-9_.]+)(?:\s*\.\*)?;/g;
        for (const match of content.matchAll(importRegex)) {
          const importPath = match[1];
          if (importPath.startsWith("java.") || importPath.startsWith("javax.")) {
            continue;
          }
          if (!importPath.startsWith(".")) {
            const resolvedPath = this.resolveJavaImport(importPath);
            if (resolvedPath) {
              links.push({
                source: filePath,
                target: resolvedPath,
                type: "dependency"
              });
            }
          }
        }
        return links;
      }
      extractGoDependencies(filePath, content) {
        const links = [];
        const importRegex = /import\s+(?:\(([^)]+)\)|"([^"]+)")/g;
        const singleImportRegex = /"([^"]+)"/g;
        for (const match of content.matchAll(importRegex)) {
          const importBlock = match[1];
          if (importBlock) {
            for (const singleMatch of importBlock.matchAll(singleImportRegex)) {
              const importPath = singleMatch[1];
              if (!importPath.includes("/")) {
                continue;
              }
              const resolvedPath = this.resolveGoImport(importPath);
              if (resolvedPath) {
                links.push({
                  source: filePath,
                  target: resolvedPath,
                  type: "dependency"
                });
              }
            }
          }
        }
        return links;
      }
      resolveImportPath(fromFile, importPath) {
        const fromDir = path.dirname(fromFile);
        for (const [alias, aliasPath] of this.pathAliases.entries()) {
          if (importPath.startsWith(alias)) {
            const relativePath = importPath.slice(alias.length);
            const resolvedBase = path.join(aliasPath, relativePath);
            const extensions = [".ts", ".tsx", ".js", ".jsx", ".vue"];
            for (const ext of extensions) {
              const withExt = resolvedBase + ext;
              if (fs.existsSync(withExt)) {
                return withExt;
              }
              const indexPath = path.join(resolvedBase, `index${ext}`);
              if (fs.existsSync(indexPath)) {
                return indexPath;
              }
            }
          }
        }
        if (importPath.startsWith(".")) {
          const resolvedBase = path.resolve(fromDir, importPath);
          const extensions = [".ts", ".tsx", ".js", ".jsx", ".vue", ".py"];
          for (const ext of extensions) {
            const withExt = resolvedBase + ext;
            if (fs.existsSync(withExt)) {
              return withExt;
            }
            const indexPath = path.join(resolvedBase, `index${ext}`);
            if (fs.existsSync(indexPath)) {
              return indexPath;
            }
          }
        }
        return null;
      }
      resolveRelativePythonImport(filePath, fromModule) {
        const fromDir = path.dirname(filePath);
        const parts = fromModule.split(".");
        let targetDir = fromDir;
        const leadingDots = fromModule.match(/^\./g)?.length || 0;
        for (let i = 0; i < leadingDots; i++) {
          targetDir = path.dirname(targetDir);
        }
        const moduleName = parts.filter((p) => p).join(path.sep);
        const targetPath = path.join(targetDir, moduleName);
        if (fs.existsSync(targetPath + ".py")) {
          return targetPath + ".py";
        }
        if (fs.existsSync(path.join(targetPath, "__init__.py"))) {
          return path.join(targetPath, "__init__.py");
        }
        return null;
      }
      resolveAbsolutePythonImport(moduleName) {
        const parts = moduleName.split(".");
        const targetPath = path.join(this.workspaceRoot, ...parts);
        if (fs.existsSync(targetPath + ".py")) {
          return targetPath + ".py";
        }
        if (fs.existsSync(path.join(targetPath, "__init__.py"))) {
          return path.join(targetPath, "__init__.py");
        }
        return null;
      }
      isExternalModule(moduleName) {
        const standardModules = ["os", "sys", "json", "re", "collections", "itertools"];
        return standardModules.includes(moduleName.split(".")[0]);
      }
      resolveJavaImport(importPath) {
        const parts = importPath.split(".");
        const targetPath = path.join(this.workspaceRoot, ...parts);
        if (fs.existsSync(targetPath + ".java")) {
          return targetPath + ".java";
        }
        return null;
      }
      resolveGoImport(importPath) {
        const targetPath = path.join(this.workspaceRoot, importPath);
        if (fs.existsSync(targetPath)) {
          const files = fs.readdirSync(targetPath);
          const goFile = files.find((f) => f.endsWith(".go"));
          if (goFile) {
            return path.join(targetPath, goFile);
          }
        }
        return null;
      }
    };
    exports2.GraphGenerator = GraphGenerator;
  }
});

// dist/graphPanel.js
var require_graphPanel = __commonJS({
  "dist/graphPanel.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || /* @__PURE__ */ function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2)
            if (Object.prototype.hasOwnProperty.call(o2, k))
              ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule)
          return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++)
            if (k[i] !== "default")
              __createBinding2(result, mod, k[i]);
        }
        __setModuleDefault2(result, mod);
        return result;
      };
    }();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.GraphPanel = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var GraphPanel = class _GraphPanel {
      static createOrShow(extensionUri, graph) {
        if (_GraphPanel.currentPanel) {
          _GraphPanel.currentPanel.graph = graph;
          _GraphPanel.currentPanel.panel.reveal();
          _GraphPanel.currentPanel.update();
          return;
        }
        const panel = vscode2.window.createWebviewPanel("atlasicVisualizer", "Atlasic - Dependency Graph", vscode2.ViewColumn.One, {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [extensionUri]
        });
        _GraphPanel.currentPanel = new _GraphPanel(panel, extensionUri, graph);
      }
      static refresh(graph) {
        if (_GraphPanel.currentPanel) {
          _GraphPanel.currentPanel.graph = graph;
          _GraphPanel.currentPanel.update();
        }
      }
      constructor(panel, extensionUri, graph) {
        this.panel = panel;
        this.graph = graph;
        this.update();
        this.panel.onDidDispose(() => {
          _GraphPanel.currentPanel = void 0;
        });
        this.panel.webview.onDidReceiveMessage((message) => {
          switch (message.command) {
            case "openFile":
              this.openFile(message.path);
              break;
          }
        });
      }
      update() {
        this.panel.webview.html = this.getHtmlContent();
      }
      openFile(filePath) {
        vscode2.window.showTextDocument(vscode2.Uri.file(filePath));
      }
      getHtmlContent() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atlasic</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      overflow: hidden;
      background: #1e1e1e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    #graph {
      width: 100vw;
      height: 100vh;
      display: block;
    }
    
    .node {
      cursor: pointer;
    }
    
    .node circle {
      stroke: #fff;
      stroke-width: 1.5px;
      transition: r 0.2s, filter 0.2s;
    }
    
    .node circle:hover {
      r: 12;
      filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.5));
    }
    
    .node.highlighted circle {
      r: 12;
      filter: drop-shadow(0 0 12px rgba(97, 218, 251, 0.8));
      stroke-width: 3px;
      stroke: #61dafb;
    }
    
    .link {
      stroke: #999;
      stroke-opacity: 0.6;
      transition: stroke 0.2s, stroke-opacity 0.2s;
    }
    
    .link.highlighted {
      stroke: #61dafb;
      stroke-opacity: 1;
      stroke-width: 3px;
    }
    
    .node text {
      font: 10px sans-serif;
      fill: #fff;
      pointer-events: none;
      text-anchor: middle;
    }
    
    .tooltip {
      position: absolute;
      padding: 12px;
      background: rgba(0, 0, 0, 0.95);
      color: #fff;
      border-radius: 6px;
      border: 1px solid #444;
      pointer-events: none;
      display: none;
      font-size: 12px;
      z-index: 1000;
    }
    
    .tooltip-title {
      font-weight: bold;
      margin-bottom: 6px;
      color: #61dafb;
    }
    
    .tooltip-line {
      margin: 2px 0;
    }
    
    .tooltip-label {
      color: #aaa;
      display: inline-block;
      width: 80px;
    }
    
    .search-container {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #444;
      border-radius: 6px;
      padding: 12px;
      color: #fff;
      font-size: 12px;
      z-index: 200;
      width: 280px;
    }
    
    .search-title {
      font-weight: bold;
      margin-bottom: 8px;
      color: #61dafb;
    }
    
    .search-box {
      position: relative;
      width: 100%;
    }
    
    .search-input {
      width: 100%;
      padding: 8px;
      background: #2d2d2d;
      border: 1px solid #555;
      border-radius: 4px;
      color: #fff;
      font-size: 12px;
    }
    
    .search-input:focus {
      outline: none;
      border-color: #61dafb;
      box-shadow: 0 0 8px rgba(97, 218, 251, 0.3);
    }
    
    .search-suggestions {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #2d2d2d;
      border: 1px solid #555;
      border-top: none;
      border-radius: 0 0 4px 4px;
      max-height: 200px;
      overflow-y: auto;
      display: none;
      z-index: 201;
    }
    
    .search-suggestions.active {
      display: block;
    }
    
    .suggestion-item {
      padding: 8px;
      cursor: pointer;
      border-bottom: 1px solid #444;
      font-size: 11px;
      transition: background 0.2s;
    }
    
    .suggestion-item:hover {
      background: #444;
    }
    
    .suggestion-item.selected {
      background: #61dafb;
      color: #1e1e1e;
    }
    
    .search-hint {
      font-size: 10px;
      color: #999;
      margin-top: 6px;
    }
    
    .controls {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #444;
      border-radius: 6px;
      padding: 15px;
      color: #fff;
      font-size: 12px;
      z-index: 100;
    }
    
    .control-title {
      font-weight: bold;
      margin-bottom: 10px;
      color: #61dafb;
    }
    
    .stat-line {
      margin: 4px 0;
    }
    
    .legend {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #444;
      border-radius: 6px;
      padding: 15px;
      color: #fff;
      font-size: 11px;
      z-index: 100;
    }
    
    .legend-title {
      font-weight: bold;
      margin-bottom: 10px;
      color: #61dafb;
    }
    
    .legend-item {
      display: flex;
      align-items: center;
      margin: 4px 0;
    }
    
    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 8px;
    }
  </style>
</head>
<body>
  <div id="graph"></div>
  <div class="tooltip" id="tooltip"></div>
  
  <div class="search-container">
    <div class="search-title">\u{1F50D} Search Files</div>
    <div class="search-box">
      <input 
        type="text" 
        class="search-input" 
        id="searchInput" 
        placeholder="Type to search..."
        autocomplete="off"
      />
      <div class="search-suggestions" id="searchSuggestions"></div>
    </div>
    <div class="search-hint">Click suggestion or press Enter</div>
  </div>
  
  <div class="controls">
    <div class="control-title">\u{1F4CA} Graph Stats</div>
    <div class="stat-line">Nodes: <strong id="nodeCount">0</strong></div>
    <div class="stat-line">Links: <strong id="linkCount">0</strong></div>
  </div>
  <div class="legend">
    <div class="legend-title">\u{1F4C1} File Categories</div>
    <div class="legend-item">
      <div class="legend-color" style="background: #61dafb;"></div>
      <span>Component</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #ffd700;"></div>
      <span>Utility</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #ff6b6b;"></div>
      <span>API/Service</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #4ecdc4;"></div>
      <span>Test</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #95a5a6;"></div>
      <span>Config</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #9b59b6;"></div>
      <span>Model</span>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const graphData = ${JSON.stringify(this.graph)};
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Update stats
    document.getElementById('nodeCount').textContent = graphData.nodes.length;
    document.getElementById('linkCount').textContent = graphData.links.length;
    
    const svg = d3.select('#graph')
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    const g = svg.append('g');
    
    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);
    
    // Color scale by category
    const color = d3.scaleOrdinal()
      .domain(['component', 'utility', 'api', 'test', 'config', 'model', 'other'])
      .range(['#61dafb', '#ffd700', '#ff6b6b', '#4ecdc4', '#95a5a6', '#9b59b6', '#95a5a6']);
    
    // Create simulation with improved forces
    const simulation = d3.forceSimulation(graphData.nodes)
      .force('link', d3.forceLink(graphData.links)
        .id(d => d.id)
        .distance(80)
        .strength(0.5))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(35))
      .alpha(1)
      .alphaDecay(0.03);
    
    // Create links
    const link = g.append('g')
      .selectAll('line')
      .data(graphData.links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke-width', 1);
    
    // Create nodes
    const node = g.append('g')
      .selectAll('g')
      .data(graphData.nodes)
      .enter().append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    
    node.append('circle')
      .attr('r', 8)
      .attr('fill', d => color(d.category));
    
    node.append('text')
      .attr('dy', 22)
      .text(d => d.label);
    
    // Tooltips
    const tooltip = d3.select('#tooltip');
    
    // Store highlighted state
    let highlightedNode = null;
    
    // Clear highlights function
    function clearHighlights() {
      node.classed('highlighted', false);
      link.classed('highlighted', false);
      highlightedNode = null;
    }
    
    // Highlight node and its links function
    function highlightNode(d) {
      clearHighlights();
      
      node.classed('highlighted', n => n.id === d.id);
      
      link.classed('highlighted', l => 
        l.source.id === d.id || l.target.id === d.id
      );
      
      highlightedNode = d;
    }
    
    // Zoom to node function
    function zoomToNode(d) {
      const scale = 2;
      const x = d.x * scale - width / 2;
      const y = d.y * scale - height / 2;
      
      svg.transition()
        .duration(750)
        .call(
          zoom.transform,
          d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-d.x, -d.y)
        );
    }
    
    // Click counter for double click detection
    let clickTimer;
    let clickCount = 0;
    
    node.on('mouseover', (event, d) => {
      tooltip
        .style('display', 'block')
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY + 10) + 'px')
        .html(\`
          <div class="tooltip-title">\${d.label}</div>
          <div class="tooltip-line">
            <span class="tooltip-label">Path:</span><span>\${d.id}</span>
          </div>
          <div class="tooltip-line">
            <span class="tooltip-label">Category:</span><span>\${d.category}</span>
          </div>
          \${d.language ? '<div class="tooltip-line"><span class="tooltip-label">Language:</span><span>' + d.language + '</span></div>' : ''}
        \`);
    })
    .on('mouseout', () => {
      tooltip.style('display', 'none');
    })
    .on('click', (event, d) => {
      clickCount++;
      
      if (clickCount === 1) {
        // Single click - highlight node and links, zoom to it
        highlightNode(d);
        zoomToNode(d);
        
        clickTimer = setTimeout(() => {
          clickCount = 0;
        }, 350);
      } else if (clickCount === 2) {
        // Double click - open file
        clearTimeout(clickTimer);
        clickCount = 0;
        vscode.postMessage({
          command: 'openFile',
          path: d.id
        });
      }
    });
    
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    const searchSuggestions = document.getElementById('searchSuggestions');
    let selectedSuggestionIndex = -1;
    
    function updateSuggestions(query) {
      selectedSuggestionIndex = -1;
      
      if (!query.trim()) {
        searchSuggestions.classList.remove('active');
        return;
      }
      
      const lowerQuery = query.toLowerCase();
      const matches = graphData.nodes.filter(node => 
        node.label.toLowerCase().includes(lowerQuery) ||
        node.id.toLowerCase().includes(lowerQuery)
      ).slice(0, 10);
      
      if (matches.length === 0) {
        searchSuggestions.classList.remove('active');
        return;
      }
      
      searchSuggestions.innerHTML = matches.map((match, index) => \`
        <div class="suggestion-item" data-index="\${index}" data-id="\${match.id}">
          <strong>\${match.label}</strong>
          <div style="font-size: 10px; color: #999; margin-top: 2px;">\${match.id}</div>
        </div>
      \`).join('');
      
      searchSuggestions.classList.add('active');
      
      // Add click handlers to suggestions
      document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const nodeId = item.getAttribute('data-id');
          const selectedNode = graphData.nodes.find(n => n.id === nodeId);
          if (selectedNode) {
            searchInput.value = selectedNode.label;
            searchSuggestions.classList.remove('active');
            highlightNode(selectedNode);
            zoomToNode(selectedNode);
          }
        });
      });
    }
    
    searchInput.addEventListener('input', (e) => {
      updateSuggestions(e.target.value);
    });
    
    searchInput.addEventListener('keydown', (e) => {
      const items = document.querySelectorAll('.suggestion-item');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
        updateSuggestionSelection(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        updateSuggestionSelection(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedSuggestionIndex >= 0 && items[selectedSuggestionIndex]) {
          items[selectedSuggestionIndex].click();
        } else if (searchInput.value.trim()) {
          // Search by typing exact name
          const query = searchInput.value.toLowerCase();
          const match = graphData.nodes.find(n => 
            n.label.toLowerCase() === query || n.id.toLowerCase() === query
          );
          if (match) {
            searchSuggestions.classList.remove('active');
            highlightNode(match);
            zoomToNode(match);
          }
        }
      }
    });
    
    function updateSuggestionSelection(items) {
      items.forEach((item, index) => {
        if (index === selectedSuggestionIndex) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });
    }
    
    // Close search suggestions when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        searchSuggestions.classList.remove('active');
      }
    });
    
    // Update positions
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
    });
    
    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  </script>
</body>
</html>`;
      }
    };
    exports2.GraphPanel = GraphPanel;
  }
});

// dist/cacheManager.js
var require_cacheManager = __commonJS({
  "dist/cacheManager.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || /* @__PURE__ */ function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2)
            if (Object.prototype.hasOwnProperty.call(o2, k))
              ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule)
          return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++)
            if (k[i] !== "default")
              __createBinding2(result, mod, k[i]);
        }
        __setModuleDefault2(result, mod);
        return result;
      };
    }();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CacheManager = void 0;
    var fs = __importStar2(require("fs"));
    var path = __importStar2(require("path"));
    var logger_12 = require_logger();
    var CacheManager = class {
      constructor(workspaceRoot) {
        this.cacheDir = path.join(workspaceRoot, ".atlasic");
        if (!fs.existsSync(this.cacheDir)) {
          fs.mkdirSync(this.cacheDir, { recursive: true });
        }
      }
      async saveGraph(graph) {
        try {
          const cachePath = path.join(this.cacheDir, "graph-cache.json");
          fs.writeFileSync(cachePath, JSON.stringify(graph, null, 2));
        } catch (error) {
          logger_12.Logger.warn("Failed to save graph cache", error);
        }
      }
      async loadGraph() {
        try {
          const cachePath = path.join(this.cacheDir, "graph-cache.json");
          if (!fs.existsSync(cachePath)) {
            return null;
          }
          const content = fs.readFileSync(cachePath, "utf8");
          return JSON.parse(content);
        } catch (error) {
          logger_12.Logger.warn("Failed to load graph cache", error);
          return null;
        }
      }
      async clearCache() {
        try {
          const cachePath = path.join(this.cacheDir, "graph-cache.json");
          if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
          }
        } catch (error) {
          logger_12.Logger.warn("Failed to clear cache", error);
        }
      }
    };
    exports2.CacheManager = CacheManager;
  }
});

// dist/extension.js
var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
  if (k2 === void 0)
    k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
  if (k2 === void 0)
    k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
} : function(o, v) {
  o["default"] = v;
});
var __importStar = exports && exports.__importStar || /* @__PURE__ */ function() {
  var ownKeys = function(o) {
    ownKeys = Object.getOwnPropertyNames || function(o2) {
      var ar = [];
      for (var k in o2)
        if (Object.prototype.hasOwnProperty.call(o2, k))
          ar[ar.length] = k;
      return ar;
    };
    return ownKeys(o);
  };
  return function(mod) {
    if (mod && mod.__esModule)
      return mod;
    var result = {};
    if (mod != null) {
      for (var k = ownKeys(mod), i = 0; i < k.length; i++)
        if (k[i] !== "default")
          __createBinding(result, mod, k[i]);
    }
    __setModuleDefault(result, mod);
    return result;
  };
}();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
var vscode = __importStar(require("vscode"));
var graphGenerator_1 = require_graphGenerator();
var graphPanel_1 = require_graphPanel();
var cacheManager_1 = require_cacheManager();
var logger_1 = require_logger();
async function activate(context) {
  logger_1.Logger.info("Atlasic extension is now active!");
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage("Atlasic: No workspace folder found");
    return;
  }
  const graphGenerator = new graphGenerator_1.GraphGenerator(workspaceRoot);
  const cacheManager = new cacheManager_1.CacheManager(workspaceRoot);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusBar.text = "$(map) Atlasic";
  statusBar.command = "atlasic.openVisualizer";
  statusBar.show();
  context.subscriptions.push(statusBar);
  context.subscriptions.push(vscode.commands.registerCommand("atlasic.generateCodebaseMap", async () => {
    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Atlasic: Generating codebase map...",
        cancellable: false
      }, async () => {
        const graph = await graphGenerator.generateGraph();
        await cacheManager.saveGraph(graph);
        vscode.window.showInformationMessage("\u2705 Codebase map generated successfully!");
      });
    } catch (error) {
      logger_1.Logger.error("Error generating codebase map", error);
      vscode.window.showErrorMessage("Atlasic: Error generating map");
    }
  }), vscode.commands.registerCommand("atlasic.openVisualizer", async () => {
    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Atlasic: Loading graph...",
        cancellable: false
      }, async () => {
        const graph = await cacheManager.loadGraph() || await graphGenerator.generateGraph();
        graphPanel_1.GraphPanel.createOrShow(context.extensionUri, graph);
      });
    } catch (error) {
      logger_1.Logger.error("Error opening visualizer", error);
      vscode.window.showErrorMessage("Atlasic: Error opening visualizer");
    }
  }), vscode.commands.registerCommand("atlasic.refreshGraph", async () => {
    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Atlasic: Refreshing graph...",
        cancellable: false
      }, async () => {
        const graph = await graphGenerator.generateGraph();
        await cacheManager.saveGraph(graph);
        graphPanel_1.GraphPanel.refresh(graph);
        vscode.window.showInformationMessage("\u2705 Graph refreshed!");
      });
    } catch (error) {
      logger_1.Logger.error("Error refreshing graph", error);
      vscode.window.showErrorMessage("Atlasic: Error refreshing graph");
    }
  }), vscode.commands.registerCommand("atlasic.clearCache", async () => {
    try {
      await cacheManager.clearCache();
      vscode.window.showInformationMessage("\u2705 Cache cleared!");
    } catch (error) {
      logger_1.Logger.error("Error clearing cache", error);
      vscode.window.showErrorMessage("Atlasic: Error clearing cache");
    }
  }));
}
function deactivate() {
}
//# sourceMappingURL=extension.js.map
