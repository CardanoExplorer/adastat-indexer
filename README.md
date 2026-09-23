# 💎 AdaStat.net Cardano Blockchain Explorer - DB Indexer

A Node.js service that runs alongside [Cardano DB Sync](https://github.com/IntersectMBO/cardano-db-sync) and maintains a set of enriched, pre-aggregated tables in PostgreSQL for fast analytics queries. It tracks accounts, addresses, staking pools, multi-assets, delegations, epochs, metadata, etc — covering all eras from Byron through Voltaire (governance).

## 🛠 Requirements

- **Node.js** 22.19.0+
- **PostgreSQL** 16+ (tested on 18)
- **cardano-db-sync** synced to the target network
- **cardano-cli** binary for Pool Metadata verification ([Cardano Node](https://github.com/IntersectMBO/cardano-node))
- **jcli** binary for ITN ticker verification ([Jormungandr](https://github.com/input-output-hk/jormungandr))
- **pg_cardano** ([PostgreSQL extension](https://github.com/cardano-community/pg_cardano) providing a suite of Cardano-related tools, including cryptographic functions, address encoding/decoding, and blockchain data processing)

## ⚙️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/CardanoExplorer/adastat-indexer
cd adastat-indexer
```

### 2. Install Node.js dependencies

```bash
pnpm install
```

### 3. Set up the database

The service requires two SQL scripts applied to your cardano-db-sync PostgreSQL database.

**Apply extensions, functions, triggers, and additional indexes to the db-sync database:**

```bash
psql --username cardano --dbname YOUR_DB_NAME --file ./schema/db-sync.pgsql
```

This script installs:

- `pg_cardano` extension
- Helper functions: `blake2b_hash`, `ed25519_verify_signature`, `convert_asset_name`, `convert_pool_meta`, `json_hex_str_to_bytea`
- A trigger on the `block` table that fires `insert_block_event` notifications (used for real-time processing) and captures orphaned blocks
- Performance indexes on `tx`, `block`, `tx_out`, `tx_in`, `tx_metadata`, `multi_asset`, `reward`, `delegation`, and governance tables

**Create the adastat schema tables:**

```bash
psql --username cardano --dbname YOUR_DB_NAME --file ./schema/adastat.pgsql
```

This creates all `adastat_*` tables, sequences, constraints, and indexes. The tables **must live in the same database** as cardano-db-sync — the trigger installed by `db-sync_update.pgsql` directly inserts into `adastat_block_orphan` and cannot cross database boundaries.

### 4. Configure the service

Copy or create `config.private.js` in the project root. This file overrides any values from `config.js` and **must not be committed to version control**.

```js
// config.private.js
module.exports = {
  db: {
    host: "localhost",
    port: 5432,
    database: "your_db_name",
    user: "cardano",
    password: "your_password",
  },
};
```

> **Important:** Add `config.private.js` to your `.gitignore` to avoid leaking credentials.

For custom networks, add a new block to `epochProtocol` in `config.private.js`. The key must exactly match the `network_name` value from cardano-db-sync's `meta` table:

```js
module.exports = {
  epochProtocol: {
    my_custom_network: {
      shelley: 0,
      mary: 0,
      alonzo: 0,
      chang: 0,
    },
  },
};
```

### 5. Configure binary paths

Point to `cardano-cli` and `jcli` in `config.private.js`:

```js
module.exports = {
  // ...
  cardanoCli: "/path/to/cardano-cli",
  jCli: "/path/to/jcli",
  // ...
};
```

## 🏃Running

```bash
# Development (with verbose logging)
LOG_LEVEL=DEBUG MODE=development node app.js

# Production
LOG_LEVEL=INFO node app.js
```

Available log levels: `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`, `OFF`.

## 🏗 Database Schema Overview

All AdaStat-managed tables use the `adastat_` prefix and are designed to be read alongside cardano-db-sync's native tables.

| Table                                 | Description                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `adastat_account`                     | Stake accounts with balances, rewards, delegation, and token counts         |
| `adastat_address`                     | Shelley payment addresses linked to stake accounts                          |
| `adastat_address_byron`               | Byron-era addresses tracked separately                                      |
| `adastat_pool`                        | Stake pools with metadata, cluster info, and ITN verification status        |
| `adastat_pool_cluster`                | Multi-pool operator cluster definitions                                     |
| `adastat_pool_itn`                    | ITN ticker ownership records                                                |
| `adastat_epoch`                       | Per-epoch aggregates: supply, stake, rewards, token counts, blockchain size |
| `adastat_epoch_pool`                  | Per-epoch per-pool stats: blocks, stake, delegators, ROS, rewards           |
| `adastat_delegation`                  | Delegation events with previous pool reference                              |
| `adastat_stake_deregistration`        | Stake key deregistrations                                                   |
| `adastat_tx`                          | Transaction-level enrichment: type bitmask, amount, token flag              |
| `adastat_tx_address`                  | Mapping of transactions to addresses and accounts                           |
| `adastat_utxo`                        | Current unspent outputs per address                                         |
| `adastat_multi_asset`                 | Native tokens with supply, holder count, and metadata reference             |
| `adastat_ma_policy`                   | Token policies with aggregated holder and transaction stats                 |
| `adastat_ma_holder`                   | Per-holder per-asset balances                                               |
| `adastat_block`                       | Block-level aggregates: fees, output sums, transaction amounts              |
| `adastat_block_orphan`                | Blocks removed during chain rollbacks                                       |
| `adastat_account_voting_registration` | CIP-36 voting key registrations                                             |
| `adastat_currency_price`              | Current ADA exchange rates                                                  |
| `adastat_price_history`               | Historical daily price snapshots                                            |

### Transaction type bitmask

The `adastat_tx.type` column is a bitmask — a transaction can have multiple types simultaneously:

| Flag                   | Value | Meaning                               |
| ---------------------- | ----- | ------------------------------------- |
| `stake_registration`   | 1     | Stake key registration                |
| `delegation`           | 2     | Pool delegation                       |
| `stake_deregistration` | 4     | Stake key deregistration              |
| `pool_update`          | 8     | Pool registration or parameter update |
| `pool_retire`          | 16    | Pool retirement announcement          |
| `withdrawal`           | 32    | Reward withdrawal                     |
| `reserve`              | 64    | Reserve pot transfer                  |
| `treasury`             | 128   | Treasury pot transfer                 |
| `metadata`             | 256   | Contains on-chain metadata            |
| `token_mint`           | 512   | Native token mint or burn             |
| `redeemer`             | 1024  | Contains a Plutus redeemer            |

## 🌐 Network Configuration

`config.js` includes preconfigured era epoch numbers for mainnet, preprod, and preview. The era key in the table matches the `network_name` value from cardano-db-sync's `meta` table, which is how the service identifies the active network automatically.

| Era                | mainnet | preprod | preview |
| ------------------ | ------- | ------- | ------- |
| Shelley (pools)    | 208     | 4       | 0       |
| Mary (tokens)      | 251     | 28      | 8       |
| Alonzo (Plutus)    | 290     | 28      | 8       |
| Chang (governance) | 507     | 163     | 646     |

For any other network, add a matching block to `epochProtocol` in `config.private.js`. The key must exactly match the `network_name` value from the `meta` table:

```js
module.exports = {
  epochProtocol: {
    my_custom_network: {
      shelley: 0,
      mary: 0,
      alonzo: 0,
      chang: 0,
    },
  },
};
```

## 🛡️ Security Notes

- `config.private.js` must never be committed — add it to `.gitignore`
- Metadata URLs are fetched with SSRF protection: all private, link-local, loopback, and reserved IP ranges are blocked before any HTTP request is made
- SSL certificate verification for metadata endpoints is intentionally disabled (`rejectUnauthorized: false`) to accommodate stake pool operators using self-signed certificates

## 📜 License & Author

- **License**: Apache-2.0.
- **Author**: AdaStat Team ([adastat.net](https://adastat.net)).
