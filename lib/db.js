const app = require("./app");

const config = require("./config");

const pg = require("pg");

const parseBigIntArray = pg.types.getTypeParser(1016);
pg.types.setTypeParser(1016, (a) => parseBigIntArray(a).map((v) => (v === null ? v : BigInt(v))));
pg.types.setTypeParser(20, BigInt);

const submit = pg.Query.prototype.submit;

pg.Query.prototype.submit = function () {
  if (this.text != "ROLLBACK" && this.text != "SELECT pg_backend_pid()") {
    app.lastQuery = {
      text: this.text,
      values: this.values,
    };
  }
  submit.apply(this, arguments);
};

module.exports = new pg.Pool(config.db);
