import * as fs from 'fs';
import * as path from 'path';
import { CodebaseGraph } from './types';
import { Logger } from './utils/logger';

export class CacheManager {
  private cacheDir: string;

  constructor(workspaceRoot: string) {
    this.cacheDir = path.join(workspaceRoot, '.atlasic');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  async saveGraph(graph: CodebaseGraph): Promise<void> {
    try {
      const cachePath = path.join(this.cacheDir, 'graph-cache.json');
      fs.writeFileSync(cachePath, JSON.stringify(graph, null, 2));
    } catch (error) {
      Logger.warn('Failed to save graph cache', error as Error);
    }
  }

  async loadGraph(): Promise<CodebaseGraph | null> {
    try {
      const cachePath = path.join(this.cacheDir, 'graph-cache.json');
      if (!fs.existsSync(cachePath)) {
        return null;
      }
      
      const content = fs.readFileSync(cachePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      Logger.warn('Failed to load graph cache', error as Error);
      return null;
    }
  }

  async clearCache(): Promise<void> {
    try {
      const cachePath = path.join(this.cacheDir, 'graph-cache.json');
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } catch (error) {
      Logger.warn('Failed to clear cache', error as Error);
    }
  }
}
