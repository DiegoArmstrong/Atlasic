export class Logger {
  private static readonly PREFIX = '[Atlasic]';

  static info(message: string): void {
    console.log(`${this.PREFIX} ${message}`);
  }

  static warn(message: string, error?: Error): void {
    if (error) {
      console.warn(`${this.PREFIX} ${message}:`, error);
    } else {
      console.warn(`${this.PREFIX} ${message}`);
    }
  }

  static error(message: string, error?: Error): void {
    if (error) {
      console.error(`${this.PREFIX} ${message}:`, error);
    } else {
      console.error(`${this.PREFIX} ${message}`);
    }
  }
}
