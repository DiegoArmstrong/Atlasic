"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PATH_ALIAS_LOCATIONS = exports.DEFAULT_MAX_DEPTH = exports.SUPPORTED_EXTENSIONS = exports.DEFAULT_IGNORE_PATTERNS = void 0;
exports.DEFAULT_IGNORE_PATTERNS = [
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
exports.SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go'];
exports.DEFAULT_MAX_DEPTH = 10;
exports.PATH_ALIAS_LOCATIONS = [
    'tsconfig.json',
    'frontend/tsconfig.json',
    'src/frontend/tsconfig.json'
];
//# sourceMappingURL=constants.js.map