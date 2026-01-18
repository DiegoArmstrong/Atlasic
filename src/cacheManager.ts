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

  // -----------------------
  // Existing graph cache
  // -----------------------
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
      if (!fs.existsSync(cachePath)) return null;

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
      if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
    } catch (error) {
      Logger.warn('Failed to clear cache', error as Error);
    }
  }

  // -----------------------
  // NEW: generic JSON cache helpers (used by git heat)
  // -----------------------
  async saveJson<T>(fileName: string, data: T): Promise<void> {
    try {
      const cachePath = path.join(this.cacheDir, fileName);
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
    } catch (error) {
      Logger.warn(`Failed to save JSON cache: ${fileName}`, error as Error);
    }
  }

  async loadJson<T>(fileName: string): Promise<T | null> {
    try {
      const cachePath = path.join(this.cacheDir, fileName);
      if (!fs.existsSync(cachePath)) return null;

      const content = fs.readFileSync(cachePath, 'utf8');
      return JSON.parse(content) as T;
    } catch (error) {
      Logger.warn(`Failed to load JSON cache: ${fileName}`, error as Error);
      return null;
    }
  }

  // -----------------------
  // Chat session cache
  // -----------------------
  async saveChatSession(sessionId: string, data: {
    uploadedFiles: string[];
    jiraTicket?: any;
  }): Promise<void> {
    await this.saveJson(`chat-session-${sessionId}.json`, data);
  }

  async loadChatSession(sessionId: string): Promise<{
    uploadedFiles: string[];
    jiraTicket?: any;
  } | null> {
    return this.loadJson(`chat-session-${sessionId}.json`);
  }

  async clearChatSession(sessionId: string): Promise<void> {
    try {
      const cachePath = path.join(this.cacheDir, `chat-session-${sessionId}.json`);
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } catch (error) {
      Logger.warn(`Failed to clear chat session ${sessionId}`, error as Error);
    }
  }
}

