import * as vscode from 'vscode';
import * as path from 'path';
import { OpenRouterClient, ChatMessage } from '../services/openRouterClient';
import { DebugContextCollector } from '../services/debugContextCollector';
import { FileContextHandler, FileContext } from '../services/fileContextHandler';
import { JiraClient, JiraTicket } from '../services/jiraClient';
import { GraphChangeDetector, ChangedNode } from '../services/graphChangeDetector';
import { CacheManager } from '../cacheManager';
import { CodebaseGraph } from '../types';
import { Logger } from '../utils/logger';

export class DebugChatPanel {
  public static currentPanel: DebugChatPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private chatHistory: ChatMessage[] = [];
  private uploadedFiles: FileContext[] = [];
  private jiraTicket: JiraTicket | undefined;
  private jiraClient: JiraClient | undefined;
  private sessionId: string;

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri,
    private apiClient: OpenRouterClient,
    private debugCollector: DebugContextCollector,
    private cacheManager: CacheManager
  ) {
    this._panel = panel;
    this._disposables = [];
    this.chatHistory = [];
    this.uploadedFiles = [];
    this.jiraTicket = undefined;
    this.sessionId = Date.now().toString();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getWebviewContent();
    this._setWebviewMessageListener();
    this._loadChatSession();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    apiClient: OpenRouterClient,
    debugCollector: DebugContextCollector,
    cacheManager: CacheManager
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DebugChatPanel.currentPanel) {
      DebugChatPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'atlasicDebugChat',
      'Atlasic Debug Assistant',
      column || vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    DebugChatPanel.currentPanel = new DebugChatPanel(
      panel,
      extensionUri,
      apiClient,
      debugCollector,
      cacheManager
    );
  }

  private _setWebviewMessageListener() {
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'sendMessage':
            await this._handleUserMessage(message.text);
            break;
          case 'clearChat':
            this.chatHistory = [];
            this.uploadedFiles = [];
            this.jiraTicket = undefined;
            await this.cacheManager.clearChatSession(this.sessionId);
            this._panel.webview.postMessage({ command: 'clearChat' });
            break;
          case 'requestFileSelection':
            await this._handleFileSelection();
            break;
          case 'linkJiraTicket':
            await this._handleJiraLinking(message.ticketUrl);
            break;
          case 'configureJira':
            await this._handleJiraConfiguration();
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async _handleUserMessage(userMessage: string) {
    try {
      // Add user message to chat
      this.chatHistory.push({ role: 'user', content: userMessage });
      this._panel.webview.postMessage({
        command: 'addMessage',
        role: 'user',
        content: this._markdownToHtml(userMessage)
      });

      // Show loading state
      this._panel.webview.postMessage({ command: 'showLoading' });

      // Collect debug context
      const debugContext = await this.debugCollector.collectContext();

      // Load graph if available for change detection
      let graph: CodebaseGraph | undefined;
      try {
        const loadedGraph = await this.cacheManager.loadGraph();
        if (loadedGraph) {
          graph = loadedGraph;
        }
      } catch {
        // Graph not available, continue without it
      }

      // Build system prompt with context
      const systemPrompt = this._buildSystemPrompt(debugContext, graph);
      
      // Prepare messages for API
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this.chatHistory
      ];

      // Stream response from API
      let assistantMessage = '';
      const messageId = Date.now().toString();
      
      this._panel.webview.postMessage({
        command: 'startAssistantMessage',
        messageId: messageId
      });

      await this.apiClient.streamChatCompletion(
        messages,
        (token: string) => {
          assistantMessage += token;
          this._panel.webview.postMessage({
            command: 'updateAssistantMessage',
            messageId: messageId,
            content: this._markdownToHtml(assistantMessage)
          });
        },
        { temperature: 0.7, maxTokens: 4096 }
      );

      // Add assistant response to history
      this.chatHistory.push({ role: 'assistant', content: assistantMessage });

      this._panel.webview.postMessage({
        command: 'finishAssistantMessage',
        messageId: messageId
      });

    } catch (error) {
      Logger.error('Debug chat error', error as Error);
      this._panel.webview.postMessage({
        command: 'error',
        message: this._markdownToHtml(`Error: ${(error as Error).message}`)
      });
    }
  }

  private _markdownToHtml(markdown: string): string {
    let html = markdown;
    
    // Escape HTML special chars
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Code blocks (triple backticks)
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Headers
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    
    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Blockquotes
    html = html.replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>');
    
    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  private async _loadChatSession() {
    try {
      const sessionData = await this.cacheManager.loadChatSession(this.sessionId);
      if (sessionData) {
        // Reload file contexts
        for (const filePath of sessionData.uploadedFiles) {
          const fileContext = await FileContextHandler.readFileContent(filePath);
          if (fileContext) {
            this.uploadedFiles.push(fileContext);
            // Notify webview of restored file
            this._panel.webview.postMessage({
              command: 'fileUploaded',
              file: {
                filename: fileContext.filename,
                size: fileContext.size,
                language: fileContext.language
              }
            });
          }
        }
        // Note: Jira ticket data isn't persisted since it can become stale
      }
    } catch (error) {
      Logger.error('Failed to load chat session', error as Error);
    }
  }

  private async _handleFileSelection() {
    try {
      // Use VS Code's native file picker
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        filters: {
          'Code Files': ['ts', 'js', 'py', 'json', 'md'],
          'All Files': ['*']
        },
        title: 'Select files to upload for context'
      });

      if (!uris || uris.length === 0) {
        return; // User cancelled
      }

      // Process selected files
      const filePaths = uris.map(uri => uri.fsPath);
      await this._handleFileUpload(filePaths);
    } catch (error) {
      Logger.error('File selection error', error as Error);
      this._panel.webview.postMessage({
        command: 'error',
        message: `File selection failed: ${(error as Error).message}`
      });
    }
  }

  private async _saveChatSession() {
    try {
      await this.cacheManager.saveChatSession(this.sessionId, {
        uploadedFiles: this.uploadedFiles.map(f => f.path),
        jiraTicket: this.jiraTicket
      });
    } catch (error) {
      Logger.error('Failed to save chat session', error as Error);
    }
  }

  private async _handleFileUpload(filePaths: string[]) {
    try {
      if (this.uploadedFiles.length >= 10) {
        this._panel.webview.postMessage({
          command: 'error',
          message: 'Maximum 10 files allowed'
        });
        return;
      }

      const failedFiles: string[] = [];
      const successfulFiles: string[] = [];

      for (const filePath of filePaths) {
        if (this.uploadedFiles.length >= 10) {
          failedFiles.push(path.basename(filePath));
          continue;
        }

        // Check if already uploaded
        if (this.uploadedFiles.some(f => f.path === filePath)) {
          this._panel.webview.postMessage({
            command: 'error',
            message: `${path.basename(filePath)} already uploaded`
          });
          continue;
        }
        
        const fileContext = await FileContextHandler.readFileContent(filePath);
        if (fileContext) {
          this.uploadedFiles.push(fileContext);
          successfulFiles.push(fileContext.filename);
          this._panel.webview.postMessage({
            command: 'fileUploaded',
            file: {
              filename: fileContext.filename,
              size: fileContext.size,
              language: fileContext.language
            }
          });
        } else {
          failedFiles.push(path.basename(filePath));
        }
      }

      // Provide summary
      if (failedFiles.length > 0) {
        this._panel.webview.postMessage({
          command: 'error',
          message: `Failed to upload: ${failedFiles.join(', ')} (Check file type/size)`
        });
      }

      if (successfulFiles.length > 0) {
        await this._saveChatSession();
      }
    } catch (error) {
      Logger.error('File upload error', error as Error);
      this._panel.webview.postMessage({
        command: 'error',
        message: `Upload failed: ${(error as Error).message}`
      });
    }
  }

  private async _handleJiraLinking(ticketUrl: string) {
    try {
      // Extract ticket key from URL (e.g., "https://workspace.atlassian.net/browse/PROJ-123")
      const match = ticketUrl.match(/browse\/([A-Z]+-\d+)/);
      if (!match) {
        this._panel.webview.postMessage({
          command: 'error',
          message: 'Invalid Jira ticket URL'
        });
        return;
      }

      const ticketKey = match[1];

      if (!this.jiraClient) {
        this._panel.webview.postMessage({
          command: 'error',
          message: 'Jira not configured. Please configure first.'
        });
        return;
      }

      const ticket = await this.jiraClient.getTicket(ticketKey);
      this.jiraTicket = ticket;

      this._panel.webview.postMessage({
        command: 'jiraLinked',
        ticket: {
          key: ticket.key,
          summary: ticket.summary,
          status: ticket.status,
          issueType: ticket.issueType
        }
      });

      await this._saveChatSession();
    } catch (error) {
      Logger.error('Jira linking error', error as Error);
      this._panel.webview.postMessage({
        command: 'error',
        message: `Jira error: ${(error as Error).message}`
      });
    }
  }

  private async _handleJiraConfiguration() {
    try {
      const workspaceUrl = await vscode.window.showInputBox({
        prompt: 'Enter your Jira Cloud workspace URL (e.g., https://yourname.atlassian.net)',
        placeHolder: 'https://yourname.atlassian.net'
      });

      if (!workspaceUrl) return;

      const userEmail = await vscode.window.showInputBox({
        prompt: 'Enter your Jira email address',
        placeHolder: 'user@example.com'
      });

      if (!userEmail) return;

      const accessToken = await vscode.window.showInputBox({
        prompt: 'Enter your Jira API token',
        password: true,
        placeHolder: 'Your API token from Jira account settings'
      });

      if (!accessToken) return;

      this.jiraClient = new JiraClient({
        workspaceUrl,
        accessToken,
        userEmail
      });

      const isValid = await this.jiraClient.validateConnection();
      if (!isValid) {
        this._panel.webview.postMessage({
          command: 'error',
          message: 'Jira authentication failed'
        });
        this.jiraClient = undefined;
        return;
      }

      this._panel.webview.postMessage({
        command: 'jiraConfigured'
      });
    } catch (error) {
      Logger.error('Jira configuration error', error as Error);
      this._panel.webview.postMessage({
        command: 'error',
        message: `Configuration failed: ${(error as Error).message}`
      });
    }
  }

  private _buildSystemPrompt(debugContext: any, graph?: CodebaseGraph): string {
    let prompt = `You are an expert debugging assistant integrated into VS Code. You help developers understand and fix issues in their code by analyzing debug context, stack traces, variables, and code structure.

Your capabilities:
- Analyze runtime state including variables, call stacks, and environment
- Explain errors and exceptions
- Suggest fixes and debugging strategies
- Identify common patterns and anti-patterns
- Provide code examples when helpful

Be concise but thorough. Focus on actionable insights.`;

    // Add uploaded files context
    if (this.uploadedFiles.length > 0) {
      prompt += `\n\n## Uploaded Files for Analysis:\n`;
      this.uploadedFiles.forEach(file => {
        prompt += `\n### ${file.filename} (${file.language})\n`;
        prompt += '```\n';
        prompt += file.content;
        prompt += '\n```\n';
      });
    }

    // Add Jira ticket context
    if (this.jiraTicket) {
      prompt += `\n\n## Related Jira Ticket:\n`;
      prompt += `**Key:** ${this.jiraTicket.key}\n`;
      prompt += `**Type:** ${this.jiraTicket.issueType}\n`;
      prompt += `**Status:** ${this.jiraTicket.status}\n`;
      prompt += `**Summary:** ${this.jiraTicket.summary}\n`;
      prompt += `**Description:** ${this.jiraTicket.description}\n`;
      if (this.jiraTicket.assignee) {
        prompt += `**Assignee:** ${this.jiraTicket.assignee}\n`;
      }
    }

    // Add graph change detection if graph is available
    if (graph && this.uploadedFiles.length > 0) {
      const changedNodes = GraphChangeDetector.detectChangedNodes(
        graph,
        this.uploadedFiles.map(f => f.path)
      );

      if (changedNodes.length > 0) {
        prompt += `\n\n## Likely Affected Graph Nodes:\n`;
        changedNodes.slice(0, 20).forEach(changed => {
          const levelLabel = changed.level === 0 ? '(directly)' : 
                           changed.level === 1 ? '(dependents)' : '(dependencies)';
          prompt += `- **${changed.node.label}** ${levelLabel}: ${changed.reason}\n`;
        });
      }
    }

    if (!debugContext) {
      prompt += `\n\nNote: No active debug session detected. I can still help with general debugging questions and code analysis.`;
      return prompt;
    }

    prompt += `\n\n## Current Debug Context:\n`;

    // Session info
    if (debugContext.sessionInfo) {
      prompt += `\n**Debug Session:**\n`;
      prompt += `- Type: ${debugContext.sessionInfo.type}\n`;
      prompt += `- Name: ${debugContext.sessionInfo.name}\n`;
      if (debugContext.sessionInfo.workspaceFolder) {
        prompt += `- Workspace: ${debugContext.sessionInfo.workspaceFolder}\n`;
      }
    }

    // Call stack
    if (debugContext.callStack?.length > 0) {
      prompt += `\n**Call Stack:**\n`;
      debugContext.callStack.slice(0, 10).forEach((frame: any, i: number) => {
        prompt += `${i + 1}. ${frame.name}`;
        if (frame.file && frame.line) {
          prompt += ` (${frame.file}:${frame.line})`;
        }
        prompt += `\n`;
      });
    }

    // Local variables
    if (debugContext.variables?.local && Object.keys(debugContext.variables.local).length > 0) {
      prompt += `\n**Local Variables:**\n`;
      const localVars = Object.entries(debugContext.variables.local).slice(0, 20);
      localVars.forEach(([key, value]) => {
        prompt += `- ${key} = ${value}\n`;
      });
    }

    // Environment variables
    if (debugContext.variables?.environment && Object.keys(debugContext.variables.environment).length > 0) {
      prompt += `\n**Environment Variables:**\n`;
      const envVars = Object.entries(debugContext.variables.environment).slice(0, 15);
      envVars.forEach(([key, value]) => {
        prompt += `- ${key} = ${value}\n`;
      });
    }

    // Recent console output
    if (debugContext.recentOutput?.length > 0) {
      prompt += `\n**Recent Console Output:**\n`;
      prompt += '```\n';
      prompt += debugContext.recentOutput.slice(-10).join('');
      prompt += '\n```\n';
    }

    // Active file
    if (debugContext.activeFile) {
      prompt += `\n**Active File:** ${debugContext.activeFile.path}`;
      if (debugContext.activeFile.lineNumber) {
        prompt += ` (line ${debugContext.activeFile.lineNumber})`;
      }
      prompt += `\n`;
      
      // Include relevant portion of file content
      if (debugContext.activeFile.content) {
        const lines = debugContext.activeFile.content.split('\n');
        const currentLine = debugContext.activeFile.lineNumber || 1;
        const start = Math.max(0, currentLine - 20);
        const end = Math.min(lines.length, currentLine + 20);
        const snippet = lines.slice(start, end).join('\n');
        
        prompt += `\n**Code Context (lines ${start + 1}-${end}):**\n`;
        prompt += '```\n';
        prompt += snippet;
        prompt += '\n```\n';
      }
    }

    return prompt;
  }

  private _getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Debug Assistant</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    #header {
      padding: 12px 16px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    #header h2 {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    
    #clearBtn {
      padding: 4px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }
    
    #clearBtn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    #uploadFilesBtn, #jiraBtn {
      padding: 4px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }
    
    #uploadFilesBtn:hover, #jiraBtn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    #fileInput {
      display: none;
    }

    .file-badge, .jira-badge {
      display: inline-block;
      padding: 4px 8px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 3px;
      font-size: 11px;
      margin-right: 8px;
      margin-bottom: 8px;
    }

    .file-badge::before {
      content: '📄 ';
    }

    .jira-badge::before {
      content: '🎫 ';
    }

    #contextDisplay {
      padding: 8px 16px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 12px;
      min-height: 20px;
    }
    
    #chatContainer {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    
    .message {
      margin-bottom: 16px;
      padding: 12px;
      border-radius: 6px;
      max-width: 85%;
      word-wrap: break-word;
    }
    
    .message.user {
      background: var(--vscode-input-background);
      margin-left: auto;
      border: 1px solid var(--vscode-input-border);
    }
    
    .message.assistant {
      background: var(--vscode-editor-inactiveSelectionBackground);
      margin-right: auto;
    }
    
    .message.error {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
    }
    
    .message pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
    }
    
    .message code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }

    .message h1, .message h2, .message h3, .message h4 {
      margin: 12px 0 8px 0;
      color: var(--vscode-textLink-foreground);
      font-weight: 600;
    }

    .message h1 { font-size: 1.5em; }
    .message h2 { font-size: 1.3em; }
    .message h3 { font-size: 1.1em; }
    .message h4 { font-size: 1em; }

    .message ul, .message ol {
      margin: 8px 0;
      padding-left: 24px;
    }

    .message li {
      margin: 4px 0;
      line-height: 1.6;
    }

    .message strong {
      color: var(--vscode-textLink-foreground);
      font-weight: 700;
    }

    .message em {
      font-style: italic;
      color: var(--vscode-descriptionForeground);
    }

    .message blockquote {
      border-left: 3px solid var(--vscode-textLink-foreground);
      padding-left: 12px;
      margin: 8px 0;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    .message hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 12px 0;
    }

    .message table {
      border-collapse: collapse;
      margin: 8px 0;
      width: 100%;
    }

    .message table th,
    .message table td {
      border: 1px solid var(--vscode-panel-border);
      padding: 8px 12px;
      text-align: left;
    }

    .message table th {
      background: var(--vscode-editor-inactiveSelectionBackground);
      font-weight: 600;
    }
    
    .loading {
      display: flex;
      gap: 4px;
      padding: 12px;
    }
    
    .loading span {
      width: 8px;
      height: 8px;
      background: var(--vscode-foreground);
      border-radius: 50%;
      opacity: 0.4;
      animation: pulse 1.4s ease-in-out infinite;
    }
    
    .loading span:nth-child(2) { animation-delay: 0.2s; }
    .loading span:nth-child(3) { animation-delay: 0.4s; }
    
    @keyframes pulse {
      0%, 80%, 100% { opacity: 0.4; }
      40% { opacity: 1; }
    }
    
    #inputContainer {
      padding: 16px;
      background: var(--vscode-sideBar-background);
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 8px;
    }
    
    #messageInput {
      flex: 1;
      padding: 8px 12px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      resize: none;
      min-height: 60px;
    }
    
    #messageInput:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    
    #sendBtn {
      padding: 8px 20px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      align-self: flex-end;
    }
    
    #sendBtn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    #sendBtn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div id="header">
    <h2>🤖 Debug Assistant</h2>
    <div style="display: flex; gap: 8px;">
      <button id="uploadFilesBtn" title="Upload context files">📁 Upload</button>
      <button id="jiraBtn" title="Link Jira ticket">🔗 Jira</button>
      <button id="clearBtn">Clear Chat</button>
    </div>
  </div>

  <div id="contextDisplay"></div>
  
  <div id="chatContainer"></div>
  
  <div id="inputContainer">
    <textarea id="messageInput" placeholder="Ask about the current debug session, errors, or code behavior..."></textarea>
    <button id="sendBtn">Send</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const chatContainer = document.getElementById('chatContainer');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const uploadFilesBtn = document.getElementById('uploadFilesBtn');
    const jiraBtn = document.getElementById('jiraBtn');
    const contextDisplay = document.getElementById('contextDisplay');
    
    let isProcessing = false;
    let jiraConfigured = false;

    // File upload handling via VS Code file picker
    uploadFilesBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'requestFileSelection' });
    });

    // Jira handling
    jiraBtn.addEventListener('click', () => {
      if (!jiraConfigured) {
        vscode.postMessage({ command: 'configureJira' });
      } else {
        const url = prompt('Enter Jira ticket URL (e.g., https://workspace.atlassian.net/browse/PROJ-123):');
        if (url) {
          vscode.postMessage({
            command: 'linkJiraTicket',
            ticketUrl: url
          });
        }
      }
    });
    
    function addMessage(role, content) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message ' + role;
      messageDiv.innerHTML = content;
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    function showLoading() {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading';
      loadingDiv.id = 'loadingIndicator';
      loadingDiv.innerHTML = '<span></span><span></span><span></span>';
      chatContainer.appendChild(loadingDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    function hideLoading() {
      const loading = document.getElementById('loadingIndicator');
      if (loading) {
        loading.remove();
      }
    }
    
    function startAssistantMessage(messageId) {
      hideLoading();
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      messageDiv.id = 'msg-' + messageId;
      messageDiv.innerHTML = '';
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    function updateAssistantMessage(messageId, content) {
      const messageDiv = document.getElementById('msg-' + messageId);
      if (messageDiv) {
        messageDiv.innerHTML = content;
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }
    
    function sendMessage() {
      const text = messageInput.value.trim();
      if (!text || isProcessing) return;
      
      isProcessing = true;
      sendBtn.disabled = true;
      
      vscode.postMessage({
        command: 'sendMessage',
        text: text
      });
      
      messageInput.value = '';
    }
    
    sendBtn.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    
    clearBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'clearChat' });
    });
    
    window.addEventListener('message', (event) => {
      const message = event.data;
      
      switch (message.command) {
        case 'addMessage':
          addMessage(message.role, message.content);
          break;
        case 'showLoading':
          showLoading();
          break;
        case 'startAssistantMessage':
          startAssistantMessage(message.messageId);
          break;
        case 'updateAssistantMessage':
          updateAssistantMessage(message.messageId, message.content);
          break;
        case 'finishAssistantMessage':
          isProcessing = false;
          sendBtn.disabled = false;
          messageInput.focus();
          break;
        case 'error':
          hideLoading();
          addMessage('error', message.message);
          isProcessing = false;
          sendBtn.disabled = false;
          break;
        case 'clearChat':
          chatContainer.innerHTML = '';
          contextDisplay.innerHTML = '';
          break;
        case 'fileUploaded':
          const fileBadge = document.createElement('span');
          fileBadge.className = 'file-badge';
          fileBadge.textContent = message.file.filename;
          contextDisplay.appendChild(fileBadge);
          break;
        case 'jiraLinked':
          const jiraBadge = document.createElement('span');
          jiraBadge.className = 'jira-badge';
          jiraBadge.textContent = message.ticket.key + ': ' + message.ticket.summary;
          contextDisplay.appendChild(jiraBadge);
          break;
        case 'jiraConfigured':
          jiraConfigured = true;
          break;
      }
    });
    
    // Focus input on load
    messageInput.focus();
  </script>
</body>
</html>`;
  }

  public dispose() {
    DebugChatPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
