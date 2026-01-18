import { CodebaseGraph, GraphNode } from '../types';
import path from 'path';

export interface ChangedNode {
  node: GraphNode;
  reason: string;
  level: number; // 0 = directly affected, 1 = depends on affected, 2 = dependents
}

export class GraphChangeDetector {
  static detectChangedNodes(
    graph: CodebaseGraph,
    changedFilePaths: string[]
  ): ChangedNode[] {
    if (!graph || !graph.nodes || !graph.links) {
      return [];
    }

    const normalizedChangedPaths = changedFilePaths.map(p => this.normalizePath(p));
    const changedNodeIds = new Set<string>();
    const affectedNodes = new Map<string, ChangedNode>();

    // Level 0: Directly changed files
    graph.nodes.forEach(node => {
      const normalizedNodeId = this.normalizePath(node.id);
      if (normalizedChangedPaths.some(p => this.pathMatches(normalizedNodeId, p))) {
        changedNodeIds.add(node.id);
        affectedNodes.set(node.id, {
          node,
          reason: 'Directly modified',
          level: 0
        });
      }
    });

    // Level 1: Nodes that depend on changed nodes
    const level1Nodes = new Set<string>();
    graph.links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;

      if (changedNodeIds.has(targetId) && !affectedNodes.has(sourceId)) {
        level1Nodes.add(sourceId);
      }
    });

    level1Nodes.forEach(nodeId => {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (node && !affectedNodes.has(nodeId)) {
        affectedNodes.set(nodeId, {
          node,
          reason: 'Depends on modified file',
          level: 1
        });
      }
    });

    // Level 2: Nodes that are depended on by changed/level1 nodes
    const level2Nodes = new Set<string>();
    graph.links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;

      if ((changedNodeIds.has(sourceId) || level1Nodes.has(sourceId)) && !affectedNodes.has(targetId)) {
        level2Nodes.add(targetId);
      }
    });

    level2Nodes.forEach(nodeId => {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (node && !affectedNodes.has(nodeId)) {
        affectedNodes.set(nodeId, {
          node,
          reason: 'Is depended on by modified file',
          level: 2
        });
      }
    });

    return Array.from(affectedNodes.values());
  }

  private static normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').toLowerCase();
  }

  private static pathMatches(nodePath: string, changedPath: string): boolean {
    // Match by full path or by filename if it's a relative path
    if (nodePath.endsWith(changedPath)) {
      return true;
    }
    if (changedPath.endsWith(path.basename(nodePath))) {
      return true;
    }
    return nodePath === changedPath;
  }
}
