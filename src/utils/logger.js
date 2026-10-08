/**
 * Simple standardized console logger with timestamps and levels
 */
const logger = {
  getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  },

  info(message, ...args) {
    console.log(`[\x1b[90m${this.getTimestamp()}\x1b[0m] [\x1b[36mINFO\x1b[0m] ${message}`, ...args);
  },

  success(message, ...args) {
    console.log(`[\x1b[90m${this.getTimestamp()}\x1b[0m] [\x1b[32mSUCCESS\x1b[0m] ${message}`, ...args);
  },

  warn(message, ...args) {
    console.warn(`[\x1b[90m${this.getTimestamp()}\x1b[0m] [\x1b[33mWARN\x1b[0m] ${message}`, ...args);
  },

  error(message, ...args) {
    console.error(`[\x1b[90m${this.getTimestamp()}\x1b[0m] [\x1b[31mERROR\x1b[0m] ${message}`, ...args);
  },

  debug(message, ...args) {
    if (process.env.DEBUG === 'true') {
      console.debug(`[\x1b[90m${this.getTimestamp()}\x1b[0m] [\x1b[35mDEBUG\x1b[0m] ${message}`, ...args);
    }
  }
};

module.exports = logger;
