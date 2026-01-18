export interface GraphNode {
  id: string;              // File path
  label: string;           // File name
  category: string;        // component, utility, api, test, config, model, other
  dependencies?: number;   // Number of dependencies
  loc?: number;           // Lines of code
  language?: string;      // File language
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;           // dependency, import, etc.
}

export interface CodebaseGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  timestamp: number;
  language?: string;
}

// AI Feature Types

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

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

export interface GitChangeAnalysis {
  commitMessage: string;
  documentationImpact: string[];
  breakingChanges: string[];
  testingRecommendations: string[];
  codeQualityConcerns: string[];
}
