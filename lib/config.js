const app = require("./app");

let config = {
  epochProtocol: {
    mainnet: {
      shelley: 208, // pools
      mary: 251, // tokens
      alonzo: 290, // plutus scripts
      chang: 507, // governance
    },
    preprod: {
      shelley: 4, // pools
      mary: 28, // tokens
      alonzo: 28, // plutus scripts
      chang: 163, // governance
    },
    preview: {
      shelley: 0, // pools
      mary: 8, // tokens
      alonzo: 8, // plutus scripts
      chang: 646, // governance
    },
  },
  pointerAddressMaxLength: 100,
  ignoreBlockCount: 3,
  jCli: "/path/to/jcli",
  cardanoCli: "/path/to/cardano-cli",
  db: {
    host: "localhost",
    port: 5432,
    database: "DB name",
    user: "DB user",
    password: "DB password",
  },
  dbBackup: {
    folder: app.PATH_ROOT + "/db_backup",
    count: 5,
  },
  logFolder: app.PATH_ROOT + "/log",
  metaFolder: app.PATH_ROOT + "/metadata",
  txType: {
    stake_registration: 1,
    delegation: 2,
    stake_deregistration: 4,
    pool_update: 8,
    pool_retire: 16,
    withdrawal: 32,
    reserve: 64,
    treasury: 128,
    metadata: 256,
    token_mint: 512,
    redeemer: 1024,
  },
};

// you can redefine any properties in your config.private.js
try {
  let configPrivate = require("./config.private");
  Object.assign(config, configPrivate);
} catch (e) {
  //
}

module.exports = config;
