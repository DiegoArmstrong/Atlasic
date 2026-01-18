import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface FileContext {
  path: string;
  filename: string;
  content: string;
  language: string;
  size: number;
}

const ALLOWED_EXTENSIONS = ['.ts', '.js', '.py', '.json', '.md'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 10;

export class FileContextHandler {
  static validateFileType(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
  }

  static validateFileSize(filePath: string): boolean {
    try {
      const stats = fs.statSync(filePath);
      return stats.size <= MAX_FILE_SIZE;
    } catch {
      return false;
    }
  }

  static async readFileContent(filePath: string): Promise<FileContext | null> {
    try {
      if (!this.validateFileType(filePath)) {
        Logger.warn(`File type not allowed: ${filePath}`);
        return null;
      }

      if (!this.validateFileSize(filePath)) {
        Logger.warn(`File too large: ${filePath}`);
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const ext = path.extname(filePath).toLowerCase();
      const stats = fs.statSync(filePath);

      return {
        path: filePath,
        filename: path.basename(filePath),
        content,
        language: ext.substring(1),
        size: stats.size
      };
    } catch (error) {
      Logger.error(`Failed to read file: ${filePath}`, error as Error);
      return null;
    }
  }

  static async getFilesFromDirectory(
    dirPath: string,
    recursive: boolean = false
  ): Promise<FileContext[]> {
    const files: FileContext[] = [];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= MAX_FILES) break;

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isFile()) {
          const fileContext = await this.readFileContent(fullPath);
          if (fileContext) {
            files.push(fileContext);
          }
        } else if (recursive && entry.isDirectory()) {
          const subFiles = await this.getFilesFromDirectory(fullPath, true);
          files.push(...subFiles.slice(0, MAX_FILES - files.length));
        }
      }
    } catch (error) {
      Logger.error(`Failed to read directory: ${dirPath}`, error as Error);
    }

    return files;
  }
}
