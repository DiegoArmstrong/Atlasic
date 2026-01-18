// src/extension.ts
import * as vscode from 'vscode';
import { GraphGenerator } from './graphGenerator';
import { GraphPanel } from './graphPanel';
import { CacheManager } from './cacheManager';
import { Logger } from './utils/logger';
import { OpenRouterClient } from './services/openRouterClient';
import { DebugContextCollector } from './services/debugContextCollector';
import { DebugChatPanel } from './features/debugChat';
import { GitAnalyzer } from './features/gitAnalyzer';

// NEW: git-heat (your streaming git heat service from steps 1-4)
import { GitHeatService } from './gitHeat';

// Global state for AI services
let apiClient: OpenRouterClient | undefined;
let debugCollector: DebugContextCollector | undefined;
let gitAnalyzer: GitAnalyzer | undefined;
let workspaceRoot: string;

type GitHeatCache = {
  head: string;
  windowDays: number;
  metric: 'touches';
  scoresByAbsPath: Record<string, number>;
  maxScore: number;
};

async function initializeAIServices(
  config: vscode.WorkspaceConfiguration,
  updateUI: (
    client: OpenRouterClient | undefined,
    collector: DebugContextCollector | undefined,
    analyzer: GitAnalyzer | undefined
  ) => void
) {
  const aiEnabled = config.get<boolean>('enableAIFeatures', true);

  if (!aiEnabled) {
    apiClient = undefined;
    debugCollector = undefined;
    gitAnalyzer = undefined;
    updateUI(undefined, undefined, undefined);
    return;
  }

  const apiKey = config.get<string>('apiKey', '');

  if (!apiKey) {
    apiClient = undefined;
    debugCollector = undefined;
    gitAnalyzer = undefined;
    updateUI(undefined, undefined, undefined);
    vscode.window.showWarningMessage(
      'Atlasic: API Key not configured. AI features will be disabled.',
      'Configure Settings'
    ).then(action => {
      if (action === 'Configure Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'atlasic.apiKey');
      }
    });
    return;
  }

  try {
    apiClient = new OpenRouterClient(apiKey);
    debugCollector = new DebugContextCollector();
    gitAnalyzer = new GitAnalyzer(workspaceRoot, apiClient);
    Logger.info('AI features initialized successfully');
    updateUI(apiClient, debugCollector, gitAnalyzer);
  } catch (error) {
    Logger.error('Failed to initialize AI features', error as Error);
    apiClient = undefined;
    debugCollector = undefined;
    gitAnalyzer = undefined;
    updateUI(undefined, undefined, undefined);
    vscode.window.showErrorMessage('Atlasic: Failed to initialize AI features');
  }
}

/**
 * NEW: fire-and-forget git heat computation + caching + webview postMessage
 * Safe to call after GraphPanel.createOrShow(...).
 */
async function maybeSendGitHeat(
  cacheManager: CacheManager,
  workspaceRoot: string
): Promise<void> {
  try {
    // If panel isn’t open yet, nothing to post to
    if (!GraphPanel.currentPanel) return;

    const git = new GitHeatService(workspaceRoot);

    const repoRoot = await git.getRepoRoot();
    if (!repoRoot) {
      Logger.warn('Atlasic: Not a git repo (no repo root found).', new Error('Not a git repo'));
      return;
    }

    const head = await git.getHead(repoRoot);
    if (!head) return;

    const windowDays = 30; // hackathon default: fast + meaningful
    const metric: GitHeatCache['metric'] = 'touches';

    const cacheFile = `git-heat-${metric}-${windowDays}d-${head}.json`;
    const cached = await cacheManager.loadJson<GitHeatCache>(cacheFile);

    if (cached && cached.head === head && cached.windowDays === windowDays) {
      GraphPanel.currentPanel?.postGitHeat({
        scoresByAbsPath: cached.scoresByAbsPath,
        maxScore: cached.maxScore
      });
      return;
    }

    // compute (stream parsing inside GitHeatService)
    const scoresByAbsPath = await git.computeTouches(repoRoot, windowDays);
    const values = Object.values(scoresByAbsPath);
    const maxScore = values.length ? Math.max(...values) : 0;

    const payload: GitHeatCache = {
      head,
      windowDays,
      metric,
      scoresByAbsPath,
      maxScore
    };

    await cacheManager.saveJson(cacheFile, payload);

    GraphPanel.currentPanel?.postGitHeat({
      scoresByAbsPath,
      maxScore
    });
  } catch (err) {
    Logger.warn('Atlasic: git heat failed', err as Error);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

  Logger.info('Atlasic extension is now active!');

  if (!workspaceRoot) {
    vscode.window.showWarningMessage('Atlasic: No workspace folder found');
    return;
  }

  // Initialize components
  const graphGenerator = new GraphGenerator(workspaceRoot);
  const cacheManager = new CacheManager(workspaceRoot);

  // Store menu items in a container so we can update them
  let statusBar: vscode.StatusBarItem;

  // Function to update menu visibility based on AI services availability
  const updateMenuVisibility = (
    client: OpenRouterClient | undefined,
    collector: DebugContextCollector | undefined,
    analyzer: GitAnalyzer | undefined
  ) => {
    // This will be called whenever AI services change
    Logger.info(`Menu updated: AI services ${client ? 'enabled' : 'disabled'}`);
  };

  // Initialize AI services
  const config = vscode.workspace.getConfiguration('atlasic');
  await initializeAIServices(config, updateMenuVisibility);

  // Create status bar
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusBar.text = '$(map) Atlasic';
  statusBar.command = 'atlasic.showMenu';
  statusBar.tooltip = 'Atlasic - Click for options';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Register menu command
  context.subscriptions.push(
    vscode.commands.registerCommand('atlasic.showMenu', async () => {
      const options: vscode.QuickPickItem[] = [
        {
          label: '$(graph) View Graph',
          description: 'Display dependency graph',
          alwaysShow: true
        },
        {
          label: '$(trash) Clear Cache',
          description: 'Clear the graph cache',
          alwaysShow: true
        },
        {
          label: '$(bug) Debug AI',
          description: 'Open Debug AI Assistant',
          alwaysShow: apiClient && debugCollector ? true : false
        },
        {
          label: '$(git-branch) Analyze Git',
          description: 'Analyze git changes with AI',
          alwaysShow: gitAnalyzer ? true : false
        }
      ];

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Atlasic - Select an option'
      });

      if (!selected) return;

      if (selected.label.includes('View Graph')) {
        vscode.commands.executeCommand('atlasic.displayGraph');
      } else if (selected.label.includes('Clear Cache')) {
        vscode.commands.executeCommand('atlasic.clearCache');
      } else if (selected.label.includes('Debug AI')) {
        vscode.commands.executeCommand('atlasic.openDebugChat');
      } else if (selected.label.includes('Analyze Git')) {
        vscode.commands.executeCommand('atlasic.analyzeChanges');
      }
    })
  );

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (
        event.affectsConfiguration('atlasic.apiKey') ||
        event.affectsConfiguration('atlasic.aiModel') ||
        event.affectsConfiguration('atlasic.enableAIFeatures')
      ) {
        Logger.info('Atlasic configuration changed, reinitializing AI services...');
        const updatedConfig = vscode.workspace.getConfiguration('atlasic');
        await initializeAIServices(updatedConfig, updateMenuVisibility);
        vscode.window.showInformationMessage('Atlasic: AI services updated');
      }
    })
  );

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

              // NEW: compute + send git heat after visualizer opens
              void maybeSendGitHeat(cacheManager, workspaceRoot);
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

              // NEW: re-send git heat (panel exists already). Uses cache if possible.
              void maybeSendGitHeat(cacheManager, workspaceRoot);

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

          // Optional: you may also want to delete git heat caches; depends on your CacheManager implementation.
          // If you add a "clearAll" method, call it here.

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
      vscode.commands.registerCommand('atlasic.analyzeChanges',
        async () => {
          await gitAnalyzer!.analyzeChanges();
        }
      )
    );
  }

  // Register displayGraph command for menu
  context.subscriptions.push(
    vscode.commands.registerCommand('atlasic.displayGraph', async () => {
      try {
        const cachedData = await cacheManager.loadGraph();

        if (cachedData) {
          GraphPanel.createOrShow(context.extensionUri, cachedData);
          // NEW: try to send git heat immediately (cached if possible)
          void maybeSendGitHeat(cacheManager, workspaceRoot);
        } else {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Generating code graph...',
              cancellable: false
            },
            async () => {
              const graphData = await graphGenerator.generateGraph();
              await cacheManager.saveGraph(graphData);
              GraphPanel.createOrShow(context.extensionUri, graphData);

              // NEW: compute + send git heat after panel is open
              void maybeSendGitHeat(cacheManager, workspaceRoot);
            }
          );
        }
      } catch (error) {
        Logger.error('Error displaying graph', error as Error);
        vscode.window.showErrorMessage(`Failed to display graph: ${(error as Error).message}`);
      }
    })
  );
}

export function deactivate() {
  // Cleanup
}

