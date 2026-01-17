import * as vscode from 'vscode';
import { GraphGenerator } from './graphGenerator';
import { GraphPanel } from './graphPanel';
import { CacheManager } from './cacheManager';
import { Logger } from './utils/logger';

export async function activate(context: vscode.ExtensionContext) {
  Logger.info('Atlasic extension is now active!');

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage('Atlasic: No workspace folder found');
    return;
  }

  // Initialize components
  const graphGenerator = new GraphGenerator(workspaceRoot);
  const cacheManager = new CacheManager(workspaceRoot);

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
}

export function deactivate() {
  // Cleanup
}
