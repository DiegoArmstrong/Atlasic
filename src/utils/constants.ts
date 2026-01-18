export const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '__pycache__',
  '.venv',
  '.next',
  'out',
  'coverage',
  '.vscode',
  '.idea',
  '.cache'
];

export const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.c', '.h', '.cpp', '.hpp', '.rs'];

export const DEFAULT_MAX_DEPTH = 10;

export const PATH_ALIAS_LOCATIONS = [
  'tsconfig.json',
  'frontend/tsconfig.json',
  'src/frontend/tsconfig.json'
];
