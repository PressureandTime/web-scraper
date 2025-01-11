const fs = require('fs').promises;
const path = require('path');
const { format } = require('date-fns');

class Logger {
  constructor(logDir = 'logs') {
    this.logDir = path.join(__dirname, logDir);
    this.logLevels = {
      INFO: 'INFO',
      WARN: 'WARN',
      ERROR: 'ERROR',
    };
  }

  async init() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create logs directory:', error);
    }
  }

  getCurrentLogFile() {
    const date = format(new Date(), 'yyyy-MM-dd');
    return path.join(this.logDir, `scraper_${date}.log`);
  }

  async log(level, message, error = null) {
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
    const logMessage = `[${timestamp}] [${level}] ${message}`;

    // Always log to console
    if (level === this.logLevels.ERROR) {
      console.error(logMessage);
      if (error) {
        console.error(error);
      }
    } else {
      console.log(logMessage);
    }

    // Log to file
    try {
      await fs.appendFile(
        this.getCurrentLogFile(),
        `${logMessage}\n${error ? error.stack || error : ''}\n`
      );
    } catch (fileError) {
      console.error('Failed to write to log file:', fileError);
    }
  }

  async info(message) {
    await this.log(this.logLevels.INFO, message);
  }

  async warn(message) {
    await this.log(this.logLevels.WARN, message);
  }

  async error(message, error = null) {
    await this.log(this.logLevels.ERROR, message, error);
  }
}

module.exports = Logger;
