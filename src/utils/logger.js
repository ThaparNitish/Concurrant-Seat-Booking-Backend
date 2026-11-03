/**
 * Structured JSON Logger utility for scale auditing
 */
class Logger {
  info(message, meta = {}) {
    this._log('info', message, meta);
  }

  warn(message, meta = {}) {
    this._log('warn', message, meta);
  }

  error(message, meta = {}) {
    this._log('error', message, meta);
  }

  _log(level, message, meta = {}) {
    const logObj = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };
    
    if (level === 'error') {
      console.error(JSON.stringify(logObj));
    } else {
      console.log(JSON.stringify(logObj));
    }
  }
}

export default new Logger();