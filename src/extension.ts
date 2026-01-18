import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { GraphGenerator } from './graphGenerator';
import { GraphPanel } from './graphPanel';
import { CacheManager } from './cacheManager';
import { Logger } from './utils/logger';
import { OpenRouterClient } from './services/openRouterClient';
import { DebugContextCollector } from './services/debugContextCollector';
import { DebugChatPanel } from './features/debugChat';
import { GitAnalyzer } from './features/gitAnalyzer';

export async function activate(context: vscode.ExtensionContext) {
  // Load environment variables from .env file
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    dotenv.config({ path: path.join(workspaceRoot, '.env') });
  }

  Logger.info('Atlasic extension is now active!');

  if (!workspaceRoot) {
    vscode.window.showWarningMessage('Atlasic: No workspace folder found');
    return;
  }

  // Initialize components
  const graphGenerator = new GraphGenerator(workspaceRoot);
  const cacheManager = new CacheManager(workspaceRoot);

  // Initialize AI services
  let apiClient: OpenRouterClient | undefined;
  let debugCollector: DebugContextCollector | undefined;
  let gitAnalyzer: GitAnalyzer | undefined;

  const config = vscode.workspace.getConfiguration('atlasic');
  const aiEnabled = config.get<boolean>('enableAIFeatures', true);

  if (aiEnabled) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    console.log(apiKey)
    
    if (!apiKey) {
      vscode.window.showWarningMessage(
        'Atlasic: OPENROUTER_API_KEY not found in .env file. AI features will be disabled.',
        'Open Settings'
      ).then(action => {
        if (action === 'Open Settings') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'atlasic');
        }
      });
    } else {
      try {
        apiClient = new OpenRouterClient(apiKey);
        debugCollector = new DebugContextCollector();
        gitAnalyzer = new GitAnalyzer(workspaceRoot, apiClient);
        Logger.info('AI features initialized successfully');
      } catch (error) {
        Logger.error('Failed to initialize AI features', error as Error);
        vscode.window.showErrorMessage('Atlasic: Failed to initialize AI features');
      }
    }
  }

  // Create status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusBar.text = '$(map) Atlasic';
  statusBar.command = 'atlasic.openVisualizer';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('atlasic.generateCodebaseMap',
      async () => {
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Atlasic: Generating codebase map...',
              cancellable: false
            },
            async () => {
              const graph = await graphGenerator.generateGraph();
              await cacheManager.saveGraph(graph);
              vscode.window.showInformationMessage('✅ Codebase map generated successfully!');
            }
          );
        } catch (error) {
          Logger.error('Error generating codebase map', error as Error);
          vscode.window.showErrorMessage('Atlasic: Error generating map');
        }
      }
    ),

    vscode.commands.registerCommand('atlasic.openVisualizer',
      async () => {
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Atlasic: Loading graph...',
              cancellable: false
            },
            async () => {
              const graph = await cacheManager.loadGraph() || await graphGenerator.generateGraph();
              GraphPanel.createOrShow(context.extensionUri, graph);
            }
          );
        } catch (error) {
          Logger.error('Error opening visualizer', error as Error);
          vscode.window.showErrorMessage('Atlasic: Error opening visualizer');
        }
      }
    ),

    vscode.commands.registerCommand('atlasic.refreshGraph',
      async () => {
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Atlasic: Refreshing graph...',
              cancellable: false
            },
            async () => {
              const graph = await graphGenerator.generateGraph();
              await cacheManager.saveGraph(graph);
              GraphPanel.refresh(graph);
              vscode.window.showInformationMessage('✅ Graph refreshed!');
            }
          );
        } catch (error) {
          Logger.error('Error refreshing graph', error as Error);
          vscode.window.showErrorMessage('Atlasic: Error refreshing graph');
        }
      }
    ),

    vscode.commands.registerCommand('atlasic.clearCache',
      async () => {
        try {
          await cacheManager.clearCache();
          vscode.window.showInformationMessage('✅ Cache cleared!');
        } catch (error) {
          Logger.error('Error clearing cache', error as Error);
          vscode.window.showErrorMessage('Atlasic: Error clearing cache');
        }
      }
    )
  );

  // Register AI-powered commands
  if (apiClient && debugCollector) {
    context.subscriptions.push(
      vscode.commands.registerCommand('atlasic.openDebugChat',
        () => {
          DebugChatPanel.createOrShow(context.extensionUri, apiClient!, debugCollector!);
        }
      )
    );
  }

  if (gitAnalyzer) {
    context.subscriptions.push(
      vscode.commands.registerCommand('atlasic.generateCommitMessage',
        async () => {
          await gitAnalyzer!.generateCommitMessage();
        }
      ),

      vscode.commands.registerCommand('atlasic.analyzeChanges',
        async () => {
          await gitAnalyzer!.analyzeChanges();
        }
      )
    );
  }
}

export function deactivate() {
  // Cleanup
}
