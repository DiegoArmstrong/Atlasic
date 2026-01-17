import * as fs from 'fs';
import * as path from 'path';
import { GraphNode, GraphLink, CodebaseGraph } from './types';
import { Logger } from './utils/logger';
import { DEFAULT_IGNORE_PATTERNS, SUPPORTED_EXTENSIONS, DEFAULT_MAX_DEPTH, PATH_ALIAS_LOCATIONS } from './utils/constants';

export class GraphGenerator {
  private workspaceRoot: string;
  private pathAliases: Map<string, string>;
  private ignorePatterns: string[];
  private maxDepth: number;
  private supportedExtensions: string[];

  constructor(
    workspaceRoot: string,
    ignorePatterns: string[] = DEFAULT_IGNORE_PATTERNS,
    maxDepth: number = DEFAULT_MAX_DEPTH,
    supportedExtensions: string[] = SUPPORTED_EXTENSIONS
  ) {
    this.workspaceRoot = workspaceRoot;
    this.pathAliases = new Map();
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
  private parseJsonWithComments(content: string): string {
    let result = '';
    let inString = false;
    let stringChar = '';
    let i = 0;

    while (i < content.length) {
      const char = content[i];
      const nextChar = content[i + 1];

      // Handle string boundaries - track when we're inside a string
      if ((char === '"' || char === "'") && (i === 0 || content[i - 1] !== '\\')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        result += char;
        i++;
      }
      // Only process comments when NOT inside a string
      else if (!inString && char === '/' && nextChar === '/') {
        // Skip single-line comments
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
        result += '\n';
        i++;
      }
      else if (!inString && char === '/' && nextChar === '*') {
        // Skip block comments
        i += 2;
        while (i < content.length - 1 && !(content[i] === '*' && content[i + 1] === '/')) {
          i++;
        }
        i += 2;
      }
      else {
        result += char;
        i++;
      }
    }

    // Remove trailing commas for valid JSON
    return result.replace(/,(\s*[}\]])/g, '$1');
  }

  private loadPathAliases(): void {
    try {
      const possibleLocations = PATH_ALIAS_LOCATIONS.map(loc => 
        path.join(this.workspaceRoot, loc)
      );

      let configPath: string | null = null;
      for (const location of possibleLocations) {
        if (fs.existsSync(location)) {
          configPath = location;
          break;
        }
      }

      if (!configPath) return;

      const content = fs.readFileSync(configPath, 'utf8');
      const jsonContent = this.parseJsonWithComments(content);

      const tsconfig = JSON.parse(jsonContent);

      if (tsconfig.compilerOptions?.paths) {
        const configDir = path.dirname(configPath);
        for (const [alias, paths] of Object.entries(tsconfig.compilerOptions.paths)) {
          const cleanAlias = alias.replace('/*', '');
          let cleanPath = (paths as string[])[0].replace('/*', '');
          const resolvedPath = path.isAbsolute(cleanPath)
            ? cleanPath
            : path.join(configDir, cleanPath);
          this.pathAliases.set(cleanAlias, resolvedPath);
        }
      }
    } catch (error) {
      Logger.warn('Error loading path aliases', error as Error);
    }
  }

  async generateGraph(): Promise<CodebaseGraph> {
    const nodes: Map<string, GraphNode> = new Map();
    const links: GraphLink[] = [];
    const files = this.discoverFiles(this.workspaceRoot);

    // Extract all dependencies from discovered files
    for (const filePath of files) {
      if (!nodes.has(filePath)) {
        nodes.set(filePath, this.createNode(filePath));
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const fileLinks = this.extractDependencies(filePath, content);

      for (const link of fileLinks) {
        const targetPath = link.target as string;
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

  private discoverFiles(startPath: string, depth: number = 0): string[] {
    const files: string[] = [];

    if (depth > this.maxDepth) {
      return files;
    }

    try {
      const entries = fs.readdirSync(startPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(startPath, entry.name);

        // Check ignore patterns
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
      Logger.warn(`Error reading directory ${startPath}`, error as Error);
    }

    return files;
  }

  private shouldIgnore(filePath: string): boolean {
    const relativePath = path.relative(this.workspaceRoot, filePath).toLowerCase();
    return this.ignorePatterns.some(pattern => relativePath.includes(pattern.toLowerCase()));
  }

  private createNode(filePath: string): GraphNode {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath);

    return {
      id: filePath,
      label: fileName,
      category: this.categorizeFile(filePath),
      language: ext.slice(1) // Remove leading dot
    };
  }

  private categorizeFile(filePath: string): string {
    const fileName = path.basename(filePath).toLowerCase();
    const dirName = path.dirname(filePath).toLowerCase();

    if (fileName.includes('.test.') || fileName.includes('.spec.') || dirName.includes('test')) {
      return 'test';
    }
    if (fileName.includes('config') || fileName.endsWith('.config.ts') || fileName.endsWith('.config.js')) {
      return 'config';
    }
    if (dirName.includes('component') || fileName.includes('component')) {
      return 'component';
    }
    if (dirName.includes('api') || dirName.includes('service')) {
      return 'api';
    }
    if (dirName.includes('util') || dirName.includes('helper')) {
      return 'utility';
    }
    if (dirName.includes('model') || dirName.includes('type')) {
      return 'model';
    }

    return 'other';
  }

  private extractDependencies(filePath: string, content: string): GraphLink[] {
    const ext = path.extname(filePath);

    switch (ext) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
        return this.extractJavaScriptDependencies(filePath, content);
      case '.py':
        return this.extractPythonDependencies(filePath, content);
      case '.java':
        return this.extractJavaDependencies(filePath, content);
      case '.go':
        return this.extractGoDependencies(filePath, content);
      default:
        return [];
    }
  }

  private extractJavaScriptDependencies(filePath: string, content: string): GraphLink[] {
    const links: GraphLink[] = [];

    // Match import statements
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

      // Skip node_modules and external packages
      if (!importPath.startsWith('.') && !importPath.startsWith('/') && !importPath.startsWith('@/')) {
        continue;
      }

      const resolvedPath = this.resolveImportPath(filePath, importPath);
      if (resolvedPath) {
        links.push({
          source: filePath,
          target: resolvedPath,
          type: 'dependency'
        });
      }
    }

    return links;
  }

  private extractPythonDependencies(filePath: string, content: string): GraphLink[] {
    const links: GraphLink[] = [];

    // Match Python imports
    const importRegex = /^(?:from\s+([\w.]+)\s+)?import\s+([\w,\s*]+)/gm;

    for (const match of content.matchAll(importRegex)) {
      const fromModule = match[1];

      // Handle relative imports
      if (fromModule && fromModule.startsWith('.')) {
        const resolvedPath = this.resolveRelativePythonImport(filePath, fromModule);
        if (resolvedPath) {
          links.push({
            source: filePath,
            target: resolvedPath,
            type: 'dependency'
          });
        }
      }
      // Handle absolute imports within project
      else if (fromModule && !this.isExternalModule(fromModule)) {
        const resolvedPath = this.resolveAbsolutePythonImport(fromModule);
        if (resolvedPath) {
          links.push({
            source: filePath,
            target: resolvedPath,
            type: 'dependency'
          });
        }
      }
    }

    return links;
  }

  private extractJavaDependencies(filePath: string, content: string): GraphLink[] {
    const links: GraphLink[] = [];

    // Match Java imports
    const importRegex = /import\s+([a-zA-Z0-9_.]+)(?:\s*\.\*)?;/g;

    for (const match of content.matchAll(importRegex)) {
      const importPath = match[1];

      // Skip standard library imports
      if (importPath.startsWith('java.') || importPath.startsWith('javax.')) {
        continue;
      }

      // Only process project-level imports
      if (!importPath.startsWith('.')) {
        const resolvedPath = this.resolveJavaImport(importPath);
        if (resolvedPath) {
          links.push({
            source: filePath,
            target: resolvedPath,
            type: 'dependency'
          });
        }
      }
    }

    return links;
  }

  private extractGoDependencies(filePath: string, content: string): GraphLink[] {
    const links: GraphLink[] = [];

    // Match Go imports
    const importRegex = /import\s+(?:\(([^)]+)\)|"([^"]+)")/g;
    const singleImportRegex = /"([^"]+)"/g;

    for (const match of content.matchAll(importRegex)) {
      const importBlock = match[1];
      
      if (importBlock) {
        for (const singleMatch of importBlock.matchAll(singleImportRegex)) {
          const importPath = singleMatch[1];

          // Skip standard library
          if (!importPath.includes('/')) {
            continue;
          }

          const resolvedPath = this.resolveGoImport(importPath);
          if (resolvedPath) {
            links.push({
              source: filePath,
              target: resolvedPath,
              type: 'dependency'
            });
          }
        }
      }
    }

    return links;
  }

  private resolveImportPath(fromFile: string, importPath: string): string | null {
    const fromDir = path.dirname(fromFile);

    // Handle path aliases
    for (const [alias, aliasPath] of this.pathAliases.entries()) {
      if (importPath.startsWith(alias)) {
        const relativePath = importPath.slice(alias.length);
        const resolvedBase = path.join(aliasPath, relativePath);

        const extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue'];
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

    // Handle relative imports
    if (importPath.startsWith('.')) {
      const resolvedBase = path.resolve(fromDir, importPath);
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.py'];

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

  private resolveRelativePythonImport(filePath: string, fromModule: string): string | null {
    const fromDir = path.dirname(filePath);
    const parts = fromModule.split('.');
    let targetDir = fromDir;

    // Count leading dots to determine directory level
    const leadingDots = fromModule.match(/^\./g)?.length || 0;
    for (let i = 0; i < leadingDots; i++) {
      targetDir = path.dirname(targetDir);
    }

    // Build the module path
    const moduleName = parts.filter(p => p).join(path.sep);
    const targetPath = path.join(targetDir, moduleName);

    // Try with .py extension or as package (directory with __init__.py)
    if (fs.existsSync(targetPath + '.py')) {
      return targetPath + '.py';
    }
    if (fs.existsSync(path.join(targetPath, '__init__.py'))) {
      return path.join(targetPath, '__init__.py');
    }

    return null;
  }

  private resolveAbsolutePythonImport(moduleName: string): string | null {
    const parts = moduleName.split('.');
    const targetPath = path.join(this.workspaceRoot, ...parts);

    if (fs.existsSync(targetPath + '.py')) {
      return targetPath + '.py';
    }
    if (fs.existsSync(path.join(targetPath, '__init__.py'))) {
      return path.join(targetPath, '__init__.py');
    }

    return null;
  }

  private isExternalModule(moduleName: string): boolean {
    // Check if it's a standard library or third-party module
    const standardModules = ['os', 'sys', 'json', 're', 'collections', 'itertools'];
    return standardModules.includes(moduleName.split('.')[0]);
  }

  private resolveJavaImport(importPath: string): string | null {
    const parts = importPath.split('.');
    const targetPath = path.join(this.workspaceRoot, ...parts);

    if (fs.existsSync(targetPath + '.java')) {
      return targetPath + '.java';
    }

    return null;
  }

  private resolveGoImport(importPath: string): string | null {
    const targetPath = path.join(this.workspaceRoot, importPath);

    if (fs.existsSync(targetPath)) {
      const files = fs.readdirSync(targetPath);
      const goFile = files.find(f => f.endsWith('.go'));
      if (goFile) {
        return path.join(targetPath, goFile);
      }
    }

    return null;
  }
}
