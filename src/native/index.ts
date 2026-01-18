/* eslint-disable @typescript-eslint/no-var-requires */

let native: { discover_files: (root: string, ignore: string[], maxDepth: number, exts: string[]) => string[] } | null = null;

export function loadNative() {
  if (native) return native;

  // During dev, you can point directly at the built .node
  // but easiest is to copy it into dist/native/atlasic_native.node at build time.
  try {
    native = require('../../dist/native/atlasic_native.node');
    return native;
  } catch (_) {
    // fallback: no native available
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

