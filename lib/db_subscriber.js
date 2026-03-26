const config = require("./config");

const dbSubscriber = require("pg-listen")(config.db);

dbSubscriber.events.on("error", (error) => {
  const app = require("./app");
  app.logger.fatal("Fatal dbSubscriber error:", error);
  process.exit(1);
});

module.exports = dbSubscriber;
