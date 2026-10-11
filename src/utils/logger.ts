export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  SUCCESS = 2,
  WARN = 3,
  ERROR = 4,
}

export class Logger {
  private static colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
  };

  private static minLevel: LogLevel = LogLevel.DEBUG;
  private static prefix: string = '';
  private static timestampFormatter: () => string = () => new Date().toLocaleString();

  static setMinLevel(level: LogLevel) {
    this.minLevel = level;
  }

  static setPrefix(prefix: string) {
    this.prefix = prefix;
  }

  static setTimestampFormatter(formatter: () => string) {
    this.timestampFormatter = formatter;
  }

  private static getColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return this.colors.cyan;
      case LogLevel.INFO:
        return this.colors.blue;
      case LogLevel.SUCCESS:
        return this.colors.green;
      case LogLevel.WARN:
        return this.colors.yellow;
      case LogLevel.ERROR:
        return this.colors.red;
      default:
        return this.colors.reset;
    }
  }

  private static getLevelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'DEBUG';
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.SUCCESS:
        return 'SUCCESS';
      case LogLevel.WARN:
        return 'WARN';
      case LogLevel.ERROR:
        return 'ERROR';
      default:
        return 'UNKNOWN';
    }
  }

  private static log(level: LogLevel, message: string) {
    if (level < this.minLevel) return;
    const timestamp = this.timestampFormatter();
    const color = this.getColor(level);
    const levelName = this.getLevelName(level);
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    console.log(`${timestamp} ${prefix}${color}[${levelName}] ${message}${this.colors.reset}`);
  }

  static debug(message: string) {
    this.log(LogLevel.DEBUG, message);
  }

  static info(message: string) {
    this.log(LogLevel.INFO, message);
  }

  static success(message: string) {
    this.log(LogLevel.SUCCESS, message);
  }

  static warn(message: string) {
    this.log(LogLevel.WARN, message);
  }

  static error(message: string) {
    this.log(LogLevel.ERROR, message);
  }
}
