const util = require("util");

const levels = {
  OFF: {
    code: 0,
    color: "\x1b[0m",
  },
  FATAL: {
    code: 1,
    color: "\x1b[0;31m",
  },
  ERROR: {
    code: 2,
    color: "\x1b[0;31m",
  },
  WARN: {
    code: 3,
    color: "\x1b[0;33m",
  },
  INFO: {
    code: 4,
    color: "\x1b[0;32m",
  },
  DEBUG: {
    code: 5,
    color: "\x1b[1;34m",
  },
  TRACE: {
    code: 6,
    color: "\x1b[0;36m",
  },
};

class logger {
  constructor(options) {
    let opt = Object.assign(
      {
        level: process.env.LOG_LEVEL ? process.env.LOG_LEVEL.toUpperCase() : "ERROR",
        color: process.env.MODE == "development",
      },
      options || {},
    );
    this.level = opt.level && opt.level in levels ? levels[opt.level].code : levels.ERROR.code;
    this.options = {
      colors: opt.color,
    };
  }
}

Object.keys(levels).forEach((key) => {
  if (levels[key].code) {
    logger.prototype[key.toLowerCase()] = function (...args) {
      if (this.level < levels[key].code) {
        return;
      }

      let level = " [" + key + "] ",
        msg = util.formatWithOptions(this.options, ...args),
        date = new Date(),
        time = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23).replace("T", " ");

      if (this.options.colors) {
        level = levels[key].color + level + levels.OFF.color;
      }

      console.log(time + level + msg);
    };
  }
});

logger.prototype.log = logger.prototype.info;

module.exports = (options) => {
  return new logger(options);
};
