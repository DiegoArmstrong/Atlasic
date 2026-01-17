"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("./utils/logger");
class CacheManager {
    constructor(workspaceRoot) {
        this.cacheDir = path.join(workspaceRoot, '.atlasic');
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }
    async saveGraph(graph) {
        try {
            const cachePath = path.join(this.cacheDir, 'graph-cache.json');
            fs.writeFileSync(cachePath, JSON.stringify(graph, null, 2));
        }
        catch (error) {
            logger_1.Logger.warn('Failed to save graph cache', error);
        }
    }
    async loadGraph() {
        try {
            const cachePath = path.join(this.cacheDir, 'graph-cache.json');
            if (!fs.existsSync(cachePath)) {
                return null;
            }
            const content = fs.readFileSync(cachePath, 'utf8');
            return JSON.parse(content);
        }
        catch (error) {
            logger_1.Logger.warn('Failed to load graph cache', error);
            return null;
        }
    }
    async clearCache() {
        try {
            const cachePath = path.join(this.cacheDir, 'graph-cache.json');
            if (fs.existsSync(cachePath)) {
                fs.unlinkSync(cachePath);
            }
        }
        catch (error) {
            logger_1.Logger.warn('Failed to clear cache', error);
        }
    }
}
exports.CacheManager = CacheManager;
//# sourceMappingURL=cacheManager.js.map