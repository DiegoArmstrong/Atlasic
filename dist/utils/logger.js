"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
class Logger {
    static info(message) {
        console.log(`${this.PREFIX} ${message}`);
    }
    static warn(message, error) {
        if (error) {
            console.warn(`${this.PREFIX} ${message}:`, error);
        }
        else {
            console.warn(`${this.PREFIX} ${message}`);
        }
    }
    static error(message, error) {
        if (error) {
            console.error(`${this.PREFIX} ${message}:`, error);
        }
        else {
            console.error(`${this.PREFIX} ${message}`);
        }
    }
}
exports.Logger = Logger;
Logger.PREFIX = '[Atlasic]';
//# sourceMappingURL=logger.js.map