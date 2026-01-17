const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['./dist/extension.js'],
  bundle: true,
  outfile: './dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: false,
  allowOverwrite: true
}).catch(() => process.exit(1));
