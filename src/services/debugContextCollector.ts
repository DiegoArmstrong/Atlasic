import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface DebugContext {
  sessionInfo: {
    name: string;
    type: string;
    workspaceFolder?: string;
  };
  callStack: Array<{
    name: string;
    file?: string;
    line?: number;
  }>;
  variables: {
    local: Record<string, string>;
    environment: Record<string, string>;
  };
  recentOutput: string[];
  activeFile?: {
    path: string;
    content: string;
    lineNumber?: number;
  };
}

export class DebugContextCollector {
  private outputBuffer: string[] = [];
  private maxOutputLines = 50;

  constructor() {
    // Listen to debug console output
    vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
      if (event.event === 'output') {
        this.captureOutput(event.body?.output);
      }
    });
  }

  private captureOutput(output: string) {
    if (output) {
      this.outputBuffer.push(output);
      if (this.outputBuffer.length > this.maxOutputLines) {
        this.outputBuffer.shift();
      }
    }
  }

  async collectContext(): Promise<DebugContext | null> {
    const session = vscode.debug.activeDebugSession;
    
    if (!session) {
      Logger.warn('No active debug session');
      return null;
    }

    const context: DebugContext = {
      sessionInfo: {
        name: session.name,
        type: session.type,
        workspaceFolder: session.workspaceFolder?.uri.fsPath
      },
      callStack: [],
      variables: {
        local: {},
        environment: {}
      },
      recentOutput: [...this.outputBuffer],
      activeFile: undefined
    };

    // Get active stack item (current breakpoint location)
    const activeStackItem = vscode.debug.activeStackItem;
    if (activeStackItem) {
      // Get call stack
      try {
        const stackTrace = await this.getStackTrace(session);
        context.callStack = stackTrace;
      } catch (error) {
        Logger.warn('Failed to get stack trace', error as Error);
      }

      // Get variables from current scope
      try {
        const variables = await this.getVariables(session);
        context.variables = variables;
      } catch (error) {
        Logger.warn('Failed to get variables', error as Error);
      }
    }

    // Get active editor file
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      context.activeFile = {
        path: editor.document.uri.fsPath,
        content: editor.document.getText(),
        lineNumber: editor.selection.active.line + 1
      };
    }

    return context;
  }

  private async getStackTrace(session: vscode.DebugSession): Promise<Array<{ name: string; file?: string; line?: number }>> {
    try {
      // Get thread information
      const threadsResponse = await session.customRequest('threads');
      if (!threadsResponse?.threads?.length) {
        return [];
      }

      const threadId = threadsResponse.threads[0].id;

      // Get stack trace for the thread
      const stackTraceResponse = await session.customRequest('stackTrace', {
        threadId: threadId,
        startFrame: 0,
        levels: 20
      });

      if (!stackTraceResponse?.stackFrames) {
        return [];
      }

      return stackTraceResponse.stackFrames.map((frame: any) => ({
        name: frame.name || 'Unknown',
        file: frame.source?.path,
        line: frame.line
      }));
    } catch (error) {
      Logger.warn('Error getting stack trace', error as Error);
      return [];
    }
  }

  private async getVariables(session: vscode.DebugSession): Promise<{ local: Record<string, string>; environment: Record<string, string> }> {
    const result = {
      local: {} as Record<string, string>,
      environment: {} as Record<string, string>
    };

    try {
      // Get threads
      const threadsResponse = await session.customRequest('threads');
      if (!threadsResponse?.threads?.length) {
        return result;
      }

      const threadId = threadsResponse.threads[0].id;

      // Get stack frames
      const stackTraceResponse = await session.customRequest('stackTrace', {
        threadId: threadId,
        startFrame: 0,
        levels: 1
      });

      if (!stackTraceResponse?.stackFrames?.length) {
        return result;
      }

      const frameId = stackTraceResponse.stackFrames[0].id;

      // Get scopes (local, global, etc.)
      const scopesResponse = await session.customRequest('scopes', {
        frameId: frameId
      });

      if (!scopesResponse?.scopes) {
        return result;
      }

      // Iterate through scopes
      for (const scope of scopesResponse.scopes) {
        const variablesResponse = await session.customRequest('variables', {
          variablesReference: scope.variablesReference
        });

        if (!variablesResponse?.variables) {
          continue;
        }

        const scopeName = scope.name.toLowerCase();
        const isLocal = scopeName.includes('local') || scopeName.includes('variables');
        const isEnv = scopeName.includes('env') || scopeName === 'global';

        for (const variable of variablesResponse.variables) {
          const key = variable.name;
          const value = variable.value || String(variable.value);

          // Limit value length
          const truncatedValue = value.length > 200 ? value.substring(0, 200) + '...' : value;

          if (isEnv || key.toUpperCase() === key) {
            result.environment[key] = truncatedValue;
          } else if (isLocal) {
            result.local[key] = truncatedValue;
          }
        }
      }
    } catch (error) {
      Logger.warn('Error getting variables', error as Error);
    }

    return result;
  }

  clearOutputBuffer(): void {
    this.outputBuffer = [];
  }

  hasActiveSession(): boolean {
    return vscode.debug.activeDebugSession !== undefined;
  }
}
