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
