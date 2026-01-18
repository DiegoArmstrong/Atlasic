import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { OpenRouterClient, ChatMessage } from '../services/openRouterClient';
import { Logger } from '../utils/logger';

interface GitDiff {
  files: Array<{
    path: string;
    status: string;
    diff: string;
  }>;
  summary: {
    additions: number;
    deletions: number;
    filesChanged: number;
  };
}

export class GitAnalyzer {
  constructor(
    private workspaceRoot: string,
    private apiClient: OpenRouterClient
  ) {}

  async analyzeChanges(): Promise<void> {
    try {
      const diff = await this.getGitDiff();
      
      if (diff.files.length === 0) {
        vscode.window.showInformationMessage('No uncommitted changes found');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Analyzing changes with AI...',
          cancellable: false
        },
        async () => {
          const analysis = await this.analyzeWithAI(diff);
          await this.showAnalysisResults(analysis, diff);
        }
      );
    } catch (error) {
      Logger.error('Error analyzing changes', error as Error);
      vscode.window.showErrorMessage(`Failed to analyze changes: ${(error as Error).message}`);
    }
  }

  async generateCommitMessage(): Promise<void> {
    try {
      const diff = await this.getGitDiff();
      
      if (diff.files.length === 0) {
        vscode.window.showInformationMessage('No uncommitted changes found');
        return;
      }

      const commitMessage = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Generating commit message...',
          cancellable: false
        },
        async () => {
          return await this.generateCommitMessageFromDiff(diff);
        }
      );

      // Show commit message with options
      const action = await vscode.window.showInformationMessage(
        'Commit message generated!',
        { modal: true, detail: commitMessage },
        'Copy to Clipboard',
        'Open Source Control'
      );

      if (action === 'Copy to Clipboard') {
        await vscode.env.clipboard.writeText(commitMessage);
        vscode.window.showInformationMessage('Commit message copied to clipboard!');
      } else if (action === 'Open Source Control') {
        // Copy and open source control view
        await vscode.env.clipboard.writeText(commitMessage);
        vscode.commands.executeCommand('workbench.view.scm');
        vscode.window.showInformationMessage('Commit message copied! Paste it in Source Control.');
      }
    } catch (error) {
      Logger.error('Error generating commit message', error as Error);
      vscode.window.showErrorMessage(`Failed to generate commit message: ${(error as Error).message}`);
    }
  }

  private async getGitDiff(): Promise<GitDiff> {
    return new Promise((resolve, reject) => {
      // Get unstaged and staged changes
      const gitCommand = 'git diff HEAD';
      
      cp.exec(gitCommand, { cwd: this.workspaceRoot, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error && !stdout) {
          reject(new Error(`Git error: ${stderr || error.message}`));
          return;
        }

        const diffOutput = stdout;
        const files: Array<{ path: string; status: string; diff: string }> = [];
        let additions = 0;
        let deletions = 0;

        // Parse diff output
        const fileDiffs = diffOutput.split('diff --git');
        
        for (const fileDiff of fileDiffs) {
          if (!fileDiff.trim()) continue;

          const lines = fileDiff.split('\n');
          const filePathMatch = lines[0]?.match(/a\/(.*?) b\//);
          
          if (!filePathMatch) continue;

          const filePath = filePathMatch[1];
          let status = 'modified';
          
          // Detect status
          if (fileDiff.includes('new file mode')) {
            status = 'added';
          } else if (fileDiff.includes('deleted file mode')) {
            status = 'deleted';
          } else if (fileDiff.includes('rename from')) {
            status = 'renamed';
          }

          // Count additions and deletions
          for (const line of lines) {
            if (line.startsWith('+') && !line.startsWith('+++')) {
              additions++;
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              deletions++;
            }
          }

          // Limit diff size per file to prevent token overflow
          const diffLines = lines.slice(0, 200);
          
          files.push({
            path: filePath,
            status: status,
            diff: diffLines.join('\n')
          });
        }

        resolve({
          files: files,
          summary: {
            additions,
            deletions,
            filesChanged: files.length
          }
        });
      });
    });
  }

  private async generateCommitMessageFromDiff(diff: GitDiff): Promise<string> {
    const prompt = this.buildCommitMessagePrompt(diff);
    
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are an expert at writing clear, concise commit messages following conventional commit conventions.' },
      { role: 'user', content: prompt }
    ];

    const response = await this.apiClient.chatCompletion(messages, {
      temperature: 0.5,
      maxTokens: 500
    });

    return response.trim();
  }

  private buildCommitMessagePrompt(diff: GitDiff): string {
    let prompt = `Generate a commit message for the following changes. Follow conventional commit format (type: description).

**Summary:**
- Files changed: ${diff.summary.filesChanged}
- Additions: +${diff.summary.additions}
- Deletions: -${diff.summary.deletions}

**Changed Files:**
`;

    diff.files.forEach(file => {
      prompt += `- ${file.status}: ${file.path}\n`;
    });

    prompt += `\n**Diff Preview:**\n`;
    
    // Include first few files' diffs
    const filesToInclude = diff.files.slice(0, 5);
    filesToInclude.forEach(file => {
      prompt += `\n### ${file.path}\n\`\`\`diff\n`;
      const diffLines = file.diff.split('\n').slice(0, 50);
      prompt += diffLines.join('\n');
      prompt += `\n\`\`\`\n`;
    });

    if (diff.files.length > 5) {
      prompt += `\n... and ${diff.files.length - 5} more files\n`;
    }

    prompt += `\nProvide a clear, concise commit message in conventional commit format. Include a body if the changes are complex. Do not include extra commentary, just the commit message.`;

    return prompt;
  }

  private async analyzeWithAI(diff: GitDiff): Promise<string> {
    const prompt = this.buildAnalysisPrompt(diff);
    
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a code review assistant that analyzes git changes and provides insights on documentation impact, potential issues, and recommendations.' },
      { role: 'user', content: prompt }
    ];

    const response = await this.apiClient.chatCompletion(messages, {
      temperature: 0.6,
      maxTokens: 2048
    });

    return response;
  }

  private buildAnalysisPrompt(diff: GitDiff): string {
    let prompt = `Analyze these code changes and provide:

1. **Documentation Impact**: What documentation should be updated?
2. **Breaking Changes**: Are there any breaking changes?
3. **Code Quality**: Any concerns or suggestions?
4. **Testing Recommendations**: What should be tested?

**Summary:**
- Files changed: ${diff.summary.filesChanged}
- Additions: +${diff.summary.additions}
- Deletions: -${diff.summary.deletions}

**Changed Files:**
`;

    diff.files.forEach(file => {
      prompt += `- ${file.status}: ${file.path}\n`;
    });

    prompt += `\n**Changes:**\n`;
    
    // Include diffs
    const filesToInclude = diff.files.slice(0, 8);
    filesToInclude.forEach(file => {
      prompt += `\n### ${file.path}\n\`\`\`diff\n`;
      const diffLines = file.diff.split('\n').slice(0, 80);
      prompt += diffLines.join('\n');
      prompt += `\n\`\`\`\n`;
    });

    if (diff.files.length > 8) {
      prompt += `\n... and ${diff.files.length - 8} more files\n`;
    }

    return prompt;
  }

  private async showAnalysisResults(analysis: string, diff: GitDiff): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'gitAnalysis',
      'Git Change Analysis',
      vscode.ViewColumn.Beside,
      { enableScripts: false }
    );

    panel.webview.html = this.getAnalysisHtml(analysis, diff);
  }

  private getAnalysisHtml(analysis: string, diff: GitDiff): string {
    // Convert markdown-style formatting to HTML
    const formattedAnalysis = analysis
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Change Analysis</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
      line-height: 1.6;
    }
    
    h1 {
      color: var(--vscode-textLink-foreground);
      border-bottom: 2px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    
    .summary {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
    }
    
    .summary-item {
      display: inline-block;
      margin-right: 20px;
      font-weight: bold;
    }
    
    .additions { color: #4ec9b0; }
    .deletions { color: #f48771; }
    
    .analysis {
      margin-top: 20px;
      padding: 20px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 5px;
    }
    
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }
    
    strong {
      color: var(--vscode-textLink-foreground);
    }
    
    .files-list {
      margin: 20px 0;
    }
    
    .file-item {
      padding: 5px 10px;
      margin: 5px 0;
      background: var(--vscode-input-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
      border-radius: 3px;
    }
    
    .file-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 0.85em;
      font-weight: bold;
      margin-right: 10px;
    }
    
    .status-added { background: #4ec9b0; color: #000; }
    .status-modified { background: #569cd6; color: #000; }
    .status-deleted { background: #f48771; color: #000; }
  </style>
</head>
<body>
  <h1>📊 Git Change Analysis</h1>
  
  <div class="summary">
    <div class="summary-item">📁 Files: ${diff.summary.filesChanged}</div>
    <div class="summary-item additions">+ ${diff.summary.additions}</div>
    <div class="summary-item deletions">- ${diff.summary.deletions}</div>
  </div>
  
  <h2>Changed Files</h2>
  <div class="files-list">
    ${diff.files.map(file => `
      <div class="file-item">
        <span class="file-status status-${file.status}">${file.status.toUpperCase()}</span>
        <code>${file.path}</code>
      </div>
    `).join('')}
  </div>
  
  <h2>AI Analysis</h2>
  <div class="analysis">
    ${formattedAnalysis}
  </div>
</body>
</html>`;
  }
}
