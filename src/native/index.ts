/* eslint-disable @typescript-eslint/no-var-requires */

import type { CodebaseGraph } from '../types';

type NativeModule = {
  // existing
  discover_files: (root: string, ignore: string[], maxDepth: number, exts: string[]) => string[];

  // new: Rust precompute (JSON in/out)
  precompute_graph_meta: (graphJson: string) => string;
};

let native: NativeModule | null = null;

export function loadNative(): NativeModule | null {
  if (native) return native;

  try {
    native = require('../../dist/native/atlasic_native.node');
    return native;
  } catch (_) {
    native = null;
    return null;
  }
}

export function discoverFilesNative(
  root: string,
  ignore: string[],
  maxDepth: number,
  exts: string[]
): string[] | null {
  const n = loadNative();
  if (!n) return null;
  return n.discover_files(root, ignore, maxDepth, exts);
}

export function precomputeGraphMetaNative(
  graph: CodebaseGraph
): {
  graph: CodebaseGraph;
  maxInDegree: number;
  searchIndex: Array<{ id: string; labelLower: string; pathLower: string }>;
} | null {
  const n = loadNative();
  if (!n) return null;

  const outJson = n.precompute_graph_meta(JSON.stringify(graph));
  return JSON.parse(outJson);
}

