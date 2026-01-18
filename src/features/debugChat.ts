import * as vscode from 'vscode';
import { OpenRouterClient, ChatMessage } from '../services/openRouterClient';
import { DebugContextCollector } from '../services/debugContextCollector';
import { Logger } from '../utils/logger';

export class DebugChatPanel {
  public static currentPanel: DebugChatPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private chatHistory: ChatMessage[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri,
    private apiClient: OpenRouterClient,
    private debugCollector: DebugContextCollector
  ) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getWebviewContent();
    this._setWebviewMessageListener();
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    apiClient: OpenRouterClient,
    debugCollector: DebugContextCollector
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
      debugCollector
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
            this._panel.webview.postMessage({ command: 'clearChat' });
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
        content: userMessage
      });

      // Show loading state
      this._panel.webview.postMessage({ command: 'showLoading' });

      // Collect debug context
      const debugContext = await this.debugCollector.collectContext();
      
      // Build system prompt with context
      const systemPrompt = this._buildSystemPrompt(debugContext);
      
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
            command: 'appendToken',
            messageId: messageId,
            token: token
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
        message: `Error: ${(error as Error).message}`
      });
    }
  }

  private _buildSystemPrompt(debugContext: any): string {
    let prompt = `You are an expert debugging assistant integrated into VS Code. You help developers understand and fix issues in their code by analyzing debug context, stack traces, variables, and code structure.

Your capabilities:
- Analyze runtime state including variables, call stacks, and environment
- Explain errors and exceptions
- Suggest fixes and debugging strategies
- Identify common patterns and anti-patterns
- Provide code examples when helpful

Be concise but thorough. Focus on actionable insights.`;

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
    <button id="clearBtn">Clear Chat</button>
  </div>
  
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
    
    let isProcessing = false;
    
    function addMessage(role, content) {
      const messageDiv = document.createElement('div');
      messageDiv.className = \`message \${role}\`;
      messageDiv.textContent = content;
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
      messageDiv.id = \`msg-\${messageId}\`;
      messageDiv.textContent = '';
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    function appendToken(messageId, token) {
      const messageDiv = document.getElementById(\`msg-\${messageId}\`);
      if (messageDiv) {
        messageDiv.textContent += token;
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
        case 'appendToken':
          appendToken(message.messageId, message.token);
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
