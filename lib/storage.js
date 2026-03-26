const app = require("./app");
const config = app.config;
const db = app.db;
const dbPool = app.dbPool;
const logger = app.logger;
const cardano = app.cardano;
const helper = app.helper;

let isParsingCurrencyPrice = false,
  currencyDate = "";

const storage = {
  lastBlockNo: 0,
  lastEpochNo: 0,
  lastParsedBlock: {
    id: 0,
    hash: "",
    epoch_no: -1,
    slot_no: -1,
    block_no: -1,
    slot_leader_id: 0,
  },
  lastParsedEpochNo: -1,
  blockInEpoch: 0,
  poolMetaUpdate: 0,
  epochPools: Object.create(null),
  adastatPool: Object.create(null),
  epochs: Object.create(null),
  accountsInOut: Object.create(null),
  poolOwner: Object.create(null),
  _poolOwner: Object.create(null),
  migratePoolData: Object.create(null),
  tokenPolicy: Object.create(null),

  poolMetaDataUpdateTimer: Object.create(null),
  poolExtendedMetaDataUpdateTimer: Object.create(null),
};

storage.init = async function () {
  logger.log("storage.init start");

  storage.lastBlockNo = 0;
  storage.lastEpochNo = 0;
  storage.lastParsedBlock = {
    id: 0,
    hash: "",
    epoch_no: -1,
    slot_no: -1,
    block_no: -1,
    slot_leader_id: 0,
  };
  storage.lastParsedEpochNo = -1;
  storage.blockInEpoch = 0;
  storage.poolMetaUpdate = 0;
  storage.epochPools = Object.create(null);
  storage.adastatPool = Object.create(null);
  storage.epochs = Object.create(null);
  storage.accountsInOut = Object.create(null);
  storage.poolOwner = Object.create(null);
  storage._poolOwner = Object.create(null);
  storage.migratePoolData = Object.create(null);
  storage.tokenPolicy = Object.create(null);

  storage.poolMetaDataUpdateTimer = Object.create(null);
  storage.poolExtendedMetaDataUpdateTimer = Object.create(null);

  storage.initTableData();
  storage.updateCurrencyPrice();

  logger.log("initTableData: [OK]");

  let res;

  res = await db.query(`
    SELECT EXTRACT(EPOCH FROM start_time)::int, network_name, pg_get_serial_sequence('adastat_ma_policy', 'id') AS ma_policy_sec, pg_get_serial_sequence('adastat_address', 'id') AS address_sec, pg_get_serial_sequence('adastat_address_byron', 'id') AS byron_sec
    FROM meta
    ORDER BY id ASC
    LIMIT 1
  `);
  if (res.rows.length) {
    storage.pgSequence = {
      ma_policy: res.rows[0].ma_policy_sec,
      address: res.rows[0].address_sec,
      byron: res.rows[0].byron_sec,
    };

    config.epochProtocol = config.epochProtocol[res.rows[0].network_name];
  }

  res = await db.query(`
    SELECT block_no, epoch_no
    FROM block
    ORDER BY id DESC
    LIMIT 1
  `);
  if (res.rows.length) {
    storage.lastBlockNo = res.rows[0].block_no;
    storage.lastEpochNo = res.rows[0].epoch_no;
  }

  res = await db.query(`
    SELECT ab.id, ENCODE(b.hash::bytea, 'hex') AS hash, b.epoch_no, b.slot_no, b.block_no, b.slot_leader_id
    FROM adastat_block AS ab
    LEFT JOIN block AS b ON b.id = ab.id
    ORDER BY ab.id DESC
    LIMIT 1
  `);
  if (res.rows.length) {
    storage.lastParsedBlock = res.rows[0];
  }
  logger.log("Init lastParsedBlock: [OK]");

  res = await db.query(
    `
    SELECT block_no
    FROM block
    WHERE epoch_no = $1
    ORDER BY block_no+0 ASC
    LIMIT 1
  `,
    [storage.lastParsedBlock.epoch_no],
  );

  if (res.rows.length) {
    storage.blockInEpoch = storage.lastParsedBlock.block_no - res.rows[0].block_no + 1;
  }
  logger.log("Init blockInEpoch: [OK]");

  try {
    res = await db.query(`
      SELECT *, ENCODE(hash::bytea, 'hex'::text) AS pool_hash
      FROM adastat_pool_migrate
    `);
    for (let migratePoolData of res.rows) {
      storage.migratePoolData[migratePoolData.pool_hash] = migratePoolData;
    }
  } catch (e) {}
  logger.log("Init migratePoolData: [OK]");

  res = await db.query(`
    SELECT *, COALESCE(pool_reward, 0) AS pool_reward, COALESCE(delegator_reward, 0) AS delegator_reward, COALESCE(reward, 0) AS reward, COALESCE(orphaned_reward, 0) AS orphaned_reward
    FROM adastat_epoch
    ORDER BY no ASC
  `);
  for (let epoch of res.rows) {
    epoch.tx_amount = BigInt(epoch.tx_amount);

    storage.epochs[epoch.no] = epoch;

    storage.lastParsedEpochNo = epoch.no;
  }
  logger.log("Init epochs: [OK]");

  if (storage.lastParsedEpochNo in storage.epochs) {
    res = await db.query(
      `
      SELECT p.id, ep.block, ep.stake, ep.delegator, ep.delegator_with_stake, ep.real_pledge, ep.update_id, p.name, p.ticker, p.description, p.homepage, p.extended, p.extended_data, p.registration_id, p.update_id AS live_update_id, p.retirement_id, p.epoch_with_block, p.valid_meta_hash, p.block AS total_block, p.itn_ticker, COALESCE(pr.retiring_epoch, 0) AS retiring_epoch, ENCODE(ph.hash_raw::bytea, 'hex') AS pool_hash, pu.margin, pu.fixed_cost, pu.pledge, pmd.id AS meta_id, pmd.url AS meta_url, ENCODE(pmd.hash::bytea, 'hex') AS meta_hash, COALESCE(ARRAY_AGG(DISTINCT po.addr_id) FILTER (WHERE po.addr_id IS NOT NULL), '{}')::bigint[] AS owner, lpu.margin AS live_margin, lpu.fixed_cost AS live_fixed_cost, lpu.pledge AS live_pledge, _ep.block AS _block, _ep.stake AS _stake, _ep.real_pledge AS _real_pledge, _pu.pledge AS _pledge, _pu.margin AS _margin, _pu.fixed_cost AS _fixed_cost, COALESCE(ARRAY_AGG(DISTINCT _po.addr_id) FILTER (WHERE _po.addr_id IS NOT NULL), '{}')::bigint[] AS _owner, __ep.stake AS __stake, __ep.real_pledge AS __real_pledge, __pu.pledge AS __pledge, __pu.margin AS __margin, __pu.fixed_cost AS __fixed_cost, ___ep.stake AS ___stake, ___ep.real_pledge AS ___real_pledge, ___pu.pledge AS ___pledge, ___pu.margin AS ___margin, ___pu.fixed_cost AS ___fixed_cost
      FROM adastat_epoch_pool AS ep
      LEFT JOIN adastat_epoch_pool AS _ep ON _ep.epoch_no = $2 AND _ep.pool_id = ep.pool_id
      LEFT JOIN pool_update AS _pu ON _pu.id = _ep.update_id
      LEFT JOIN pool_owner AS _po ON _po.pool_update_id = _pu.id
      LEFT JOIN adastat_epoch_pool AS __ep ON __ep.epoch_no = $3 AND __ep.pool_id = ep.pool_id
      LEFT JOIN pool_update AS __pu ON __pu.id = __ep.update_id
      LEFT JOIN adastat_epoch_pool AS ___ep ON ___ep.epoch_no = $4 AND ___ep.pool_id = ep.pool_id
      LEFT JOIN pool_update AS ___pu ON ___pu.id = ___ep.update_id
      LEFT JOIN adastat_pool AS p ON p.id = ep.pool_id
      LEFT JOIN pool_update AS pu ON pu.id = ep.update_id
      LEFT JOIN pool_update AS rpu ON rpu.id = p.registration_id
      LEFT JOIN pool_update AS lpu ON lpu.id = p.update_id
      LEFT JOIN pool_owner AS po ON po.pool_update_id = pu.id
      LEFT JOIN pool_metadata_ref AS pmd ON pmd.id = lpu.meta_id
      LEFT JOIN pool_hash AS ph ON ph.id = p.id
      LEFT JOIN pool_retire AS pr ON pr.id = p.retirement_id
      WHERE ep.epoch_no = $1
      GROUP BY p.id, ep.block, ep.stake, ep.delegator, ep.delegator_with_stake, ep.real_pledge, ep.update_id, p.name, p.ticker, p.description, p.homepage, p.extended, p.extended_data, p.registration_id, p.update_id, p.retirement_id, p.epoch_with_block, p.valid_meta_hash, p.block, p.itn_ticker, pr.retiring_epoch, ph.hash_raw, pu.margin, pu.fixed_cost, pu.pledge, pmd.id, pmd.url, pmd.hash, lpu.margin, lpu.fixed_cost, lpu.pledge, rpu.active_epoch_no, _ep.block, _ep.stake, _ep.real_pledge, _pu.pledge, _pu.margin, _pu.fixed_cost, __ep.stake, __ep.real_pledge, __pu.pledge, __pu.margin, __pu.fixed_cost, ___ep.stake, ___ep.real_pledge, ___pu.pledge, ___pu.margin, ___pu.fixed_cost
    `,
      [storage.lastParsedEpochNo, storage.lastParsedEpochNo - 1, storage.lastParsedEpochNo - 2, storage.lastParsedEpochNo - 3],
    );

    for (let pool of res.rows) {
      if (pool.retiring_epoch > 0 && pool.retiring_epoch + 3 < storage.lastParsedEpochNo) {
        continue;
      }

      pool.metadataTimestamp = 0;

      storage.adastatPool[pool.id] = pool;

      for (let account_id of pool._owner) {
        if (!storage._poolOwner[account_id]) {
          storage._poolOwner[account_id] = new Set();
        }
        storage._poolOwner[account_id].add(pool.id);
      }
      for (let account_id of pool.owner) {
        if (!storage.poolOwner[account_id]) {
          storage.poolOwner[account_id] = new Set();
        }
        storage.poolOwner[account_id].add(pool.id);
      }
    }
  }
  logger.log("Init pools: [OK]");

  res = await db.query(`
    SELECT id, ENCODE(policy::bytea, 'hex') AS policy
    FROM adastat_ma_policy
  `);
  for (let row of res.rows) {
    storage.tokenPolicy[row.policy] = row.id;
  }
  logger.log("Init tokenPolicy: [OK]");

  logger.log("storage.init end");
};

storage.initTableData = function () {
  storage.adastatAddressByron = Object.create(null);
  storage.adastatAddressShelley = Object.create(null);
  storage.adastatAccount = Object.create(null);
  storage.adastatMaPolicy = Object.create(null);
  storage.adastatMultiAsset = Object.create(null);
  storage.adastatBlock = Object.create(null);
  storage.adastatTx = Object.create(null);
  storage.adastatTxAddress = Object.create(null);
  storage.adastatUtxo = Object.create(null);
  storage.adastatUtxoRemove = Object.create(null);

  storage.adastatDelegation = Object.create(null);
  storage.adastatStakeDeregistration = Object.create(null);
  storage.adastatAccountRetiredPool = new Set();

  storage.accountCount = 0;
  storage.addressShelleyCount = 0;
  storage.addressByronCount = 0;
  storage.multiAssetCount = 0;
};

storage.getNextBlocks = async function () {
  logger.trace("storage.getNextBlocks start");

  let lastValidBlockNo = storage.lastBlockNo - config.ignoreBlockCount;

  let res = await db.query(
    `
    SELECT b.*, ENCODE(b.hash::bytea, 'hex') AS hash, s.pool_hash_id
    FROM block AS b
    LEFT JOIN slot_leader AS s ON (b.slot_leader_id = s.id)
    WHERE b.id >= $1 AND (b.epoch_no IS NULL OR b.block_no <= $2)
    ORDER BY b.id ASC
    LIMIT 10001
  `,
    [storage.lastParsedBlock.id, lastValidBlockNo],
  );

  logger.trace("storage.getNextBlocks end");

  return res.rows;
};

storage.addTxAddress = function (tx_id, address) {
  if (!(tx_id in storage.adastatTxAddress)) {
    storage.adastatTxAddress[tx_id] = new Set();
  }
  storage.adastatTxAddress[tx_id].add(address);
};

storage.addAccount = function (account_id, tx_id, amount, reward, pool, cert_tx_id) {
  if (!storage.adastatAccount[account_id]) {
    storage.adastatAccount[account_id] = {
      amount: 0n,
      reward: 0n,
      pool: pool,
      first_tx: tx_id,
      last_tx: tx_id,
      txs: new Set(),
      txData: [],
      token: 0,
      multi_asset: Object.create(null),
    };

    storage.accountCount++;
  }
  storage.adastatAccount[account_id].amount += amount;
  storage.adastatAccount[account_id].reward += reward;
  if (pool !== null) {
    storage.adastatAccount[account_id].pool = pool;
  }
  if (tx_id > storage.adastatAccount[account_id].last_tx) {
    storage.adastatAccount[account_id].last_tx = tx_id;
  }
  if (tx_id) {
    storage.adastatAccount[account_id].txs.add(tx_id);
  }
  storage.adastatAccount[account_id].txData.push({
    tx_id: tx_id || cert_tx_id,
    amount,
    pool,
  });
};

storage.addAddressShelley = function (address, account_id, tx_id, amount) {
  if (!storage.adastatAddressShelley[address]) {
    storage.adastatAddressShelley[address] = {
      account_id: account_id,
      amount: 0n,
      first_tx: tx_id,
      last_tx: tx_id,
      txs: new Set(),
      token: 0,
      multi_asset: Object.create(null),
    };

    storage.addressShelleyCount++;
  }
  storage.adastatAddressShelley[address].amount += amount;
  if (tx_id > storage.adastatAddressShelley[address].last_tx) {
    storage.adastatAddressShelley[address].last_tx = tx_id;
  }
  storage.adastatAddressShelley[address].txs.add(tx_id);

  storage.addTxAddress(tx_id, address);

  if (account_id > 0) {
    storage.addAccount(account_id, tx_id, amount, 0n, null);
  }
};

storage.addAddressByron = function (address, tx_id, amount) {
  if (!storage.adastatAddressByron[address]) {
    storage.adastatAddressByron[address] = {
      amount: 0n,
      first_tx: tx_id,
      last_tx: tx_id,
      txs: new Set(),
      token: 0,
      multi_asset: Object.create(null),
    };

    storage.addressByronCount++;
  }
  storage.adastatAddressByron[address].amount += amount;
  if (tx_id > storage.adastatAddressByron[address].last_tx) {
    storage.adastatAddressByron[address].last_tx = tx_id;
  }
  storage.adastatAddressByron[address].txs.add(tx_id);

  storage.addTxAddress(tx_id, address);
};

storage.addMultiAsset = function (id, policy, tx_id, supply, meta_id) {
  if (!storage.adastatMultiAsset[id]) {
    storage.adastatMultiAsset[id] = {
      policy: policy,
      supply: 0n,
      holder: 0n,
      first_tx: tx_id,
      last_tx: tx_id,
      txs: new Set(),
      meta_id: null,
    };

    storage.multiAssetCount++;
  }
  storage.adastatMultiAsset[id].supply += supply;
  if (tx_id > storage.adastatMultiAsset[id].last_tx) {
    storage.adastatMultiAsset[id].last_tx = tx_id;
  }
  storage.adastatMultiAsset[id].txs.add(tx_id);
  if (meta_id > storage.adastatMultiAsset[id].meta_id) {
    storage.adastatMultiAsset[id].meta_id = meta_id;
  }
};

storage.addMaPolicy = function (policy, tx_id, new_token) {
  if (!storage.adastatMaPolicy[policy]) {
    storage.adastatMaPolicy[policy] = {
      policy: policy,
      token: 0n,
      holder: 0n,
      first_tx: tx_id,
      last_tx: tx_id,
      txs: new Set(),
    };
  }
  if (new_token) {
    storage.adastatMaPolicy[policy].token++;
  }
  if (tx_id > storage.adastatMaPolicy[policy].last_tx) {
    storage.adastatMaPolicy[policy].last_tx = tx_id;
  }
  storage.adastatMaPolicy[policy].txs.add(tx_id);
};

storage.getTxData = async function (epoch_no) {};

storage.getBlockTxData = async function (block_id, epoch_no) {
  logger.trace("storage.getBlockTxData start", block_id);

  let res,
    withdrawalQuery = "",
    txsInOut = [],
    txsInOutMA = [],
    stakeRegistrationCert,
    delegationCert,
    stakeDeregistrationCert,
    poolUpdateCert,
    poolRetireCert,
    typeCert,
    tokenMintCert,
    tokenOutCert;

  res = await db.query(
    `
    SELECT id, out_sum, fee
    FROM tx
    WHERE block_id = $1
  `,
    [block_id],
  );

  let blockTxs = res.rows;

  if (blockTxs.length) {
    let tx_ids = blockTxs.map((tx) => tx.id);

    if (epoch_no >= config.epochProtocol.shelley) {
      withdrawalQuery = `
        UNION ALL
        (
          SELECT -withdrawal.amount AS value, '_reward_withdrawal_' AS address, withdrawal.addr_id AS account_id, withdrawal.tx_id
          FROM withdrawal
          WHERE withdrawal.tx_id = ANY($5::bigint[])
        )
      `;

      ({ stakeRegistrationCert, delegationCert, stakeDeregistrationCert, poolUpdateCert, poolRetireCert, typeCert, tokenMintCert } =
        await storage.getTxExtraData(tx_ids, epoch_no));
    }

    if (epoch_no >= config.epochProtocol.mary) {
      let [txIn, txOut] = await Promise.all([
        dbPool.query(
          `
          SELECT tx_out.id AS tx_out_id, -tx_out.value AS value, tx_out.address, tx_out.stake_address_id AS account_id, tx_in.tx_in_id AS tx_id
          FROM tx_in
          LEFT JOIN tx_out ON (tx_out.tx_id = tx_in.tx_out_id AND tx_out.index = tx_in.tx_out_index)
          WHERE tx_in.tx_in_id = ANY($1::bigint[])
        `,
          [tx_ids],
        ),
        dbPool.query(
          `
          SELECT tx_out.id AS tx_out_id, tx_out.value, tx_out.address, tx_out.stake_address_id AS account_id, tx_out.tx_id
          FROM tx_out
          WHERE tx_out.tx_id = ANY($1::bigint[])
        `,
          [tx_ids],
        ),
      ]);

      let txInOutValues = [],
        txInOutAddresses = [],
        txInOutAccountIds = [],
        txInOutTxIds = [],
        txInValuesMA = new Set(),
        txOutValuesMA = new Set(),
        txInOutValuesMA = Object.create(null);

      for (let row of txIn.rows) {
        txInOutValues.push(row.value);
        txInOutAddresses.push(row.address);
        txInOutAccountIds.push(row.account_id);
        txInOutTxIds.push(row.tx_id);

        txInValuesMA.add(row.tx_out_id);

        txInOutValuesMA[row.tx_out_id] = {
          address: row.address,
          tx_id: row.tx_id,
        };

        storage.adastatUtxoRemove[row.tx_out_id] = row.address;
      }

      for (let row of txOut.rows) {
        txInOutValues.push(row.value);
        txInOutAddresses.push(row.address);
        txInOutAccountIds.push(row.account_id);
        txInOutTxIds.push(row.tx_id);

        txOutValuesMA.add(row.tx_out_id);

        txInOutValuesMA[row.tx_out_id] = {
          address: row.address,
          tx_id: row.tx_id,
        };

        storage.adastatUtxo[row.tx_out_id] = row.address;
      }

      let [txsInOutRes, txInOutMARes] = await Promise.all([
        txInOutValues.length
          ? dbPool.query(
              `
          SELECT SUM(t.value) AS amount, t.address, t.account_id, t.tx_id::bigint
          FROM (
            (
              SELECT * FROM unnest(
                $1::bigint[],
                $2::text[],
                $3::bigint[],
                $4::bigint[]
              ) AS t (value, address, account_id, tx_id)
            )
            ${withdrawalQuery}
          ) AS t
          GROUP BY t.address, t.account_id, t.tx_id
          ORDER BY t.tx_id ASC
        `,
              [txInOutValues, txInOutAddresses, txInOutAccountIds, txInOutTxIds, ...(withdrawalQuery ? [tx_ids] : [])],
            )
          : { rows: [] },
        dbPool.query(
          `
          (
            SELECT ma_tx_out.ident AS id, -ma_tx_out.quantity AS quantity, ma_tx_out.tx_out_id, ENCODE(multi_asset.policy::bytea, 'hex') AS policy
            FROM ma_tx_out
            LEFT JOIN multi_asset ON multi_asset.id = ma_tx_out.ident
            WHERE ma_tx_out.tx_out_id = ANY($1::bigint[])
          )
          UNION ALL
          (
            SELECT ma_tx_out.ident AS id, ma_tx_out.quantity AS quantity, ma_tx_out.tx_out_id, ENCODE(multi_asset.policy::bytea, 'hex') AS policy
            FROM ma_tx_out
            LEFT JOIN multi_asset ON multi_asset.id = ma_tx_out.ident
            WHERE ma_tx_out.tx_out_id = ANY($2::bigint[])
          )
        `,
          [Array.from(txInValuesMA), Array.from(txOutValuesMA)],
        ),
      ]);

      txsInOut = txsInOutRes.rows;

      for (let row of txInOutMARes.rows) {
        txsInOutMA.push({
          id: row.id,
          policy: row.policy,
          quantity: BigInt(row.quantity),
          address: txInOutValuesMA[row.tx_out_id].address,
          tx_id: txInOutValuesMA[row.tx_out_id].tx_id,
        });
      }
    } else {
      res = await db.query(
        `
        SELECT SUM(t.value) AS amount, t.address, t.account_id, t.tx_id
        FROM (
          (
            SELECT -tx_out.value AS value, tx_out.address, tx_out.stake_address_id AS account_id, tx_in.tx_in_id AS tx_id
            FROM tx_in
            LEFT JOIN tx_out ON (tx_out.tx_id = tx_in.tx_out_id AND tx_out.index = tx_in.tx_out_index)
            WHERE tx_in.tx_in_id = ANY($1::bigint[])
          )
          UNION ALL
          (
            SELECT tx_out.value, tx_out.address, tx_out.stake_address_id AS account_id, tx_out.tx_id
            FROM tx_out
            WHERE tx_out.tx_id = ANY($1::bigint[])
          )
          ${withdrawalQuery.replace("ANY($5::bigint[])", "ANY($1::bigint[])")}
        ) AS t
        GROUP BY t.address, t.account_id, t.tx_id
        ORDER BY t.tx_id ASC
      `,
        [tx_ids],
      );

      txsInOut = res.rows;
    }
  }

  logger.trace("storage.getBlockTxData end");

  return {
    blockTxs,
    txsInOut,
    txsInOutMA,
    stakeRegistrationCert,
    delegationCert,
    stakeDeregistrationCert,
    poolUpdateCert,
    poolRetireCert,
    typeCert,
    tokenMintCert,
    tokenOutCert,
  };
};

storage.getTxExtraData = async function (tx_ids, epoch_no) {
  logger.trace("storage.getTxExtraData start", tx_ids);

  let redeemerQuery =
    epoch_no < config.epochProtocol.alonzo
      ? ""
      : `
    UNION ALL
    (
      SELECT DISTINCT 'redeemer' AS type, r.tx_id, 0 AS amount
      FROM redeemer AS r
      WHERE r.tx_id = ANY($1::bigint[])
    )
  `;

  let [stakeRegistration, delegation, stakeDeregistration, poolUpdate, poolRetire, type, tokenMint] = await Promise.all([
    dbPool.query(
      `
      SELECT 'stake_registration' AS type, r.cert_index, r.addr_id AS account_id, r.tx_id
      FROM stake_registration AS r
      WHERE r.tx_id = ANY($1::bigint[])
    `,
      [tx_ids],
    ),

    dbPool.query(
      `
      SELECT 'delegation' AS type, d.cert_index, d.pool_hash_id AS pool_id, d.addr_id AS account_id, a.amount::bigint, a.pool AS account_pool_id, a.retired_pool AS account_retired_pool_id, d.tx_id, d.id
      FROM delegation AS d
      LEFT JOIN adastat_account AS a ON (a.id = d.addr_id)
      WHERE d.tx_id = ANY($1::bigint[])
    `,
      [tx_ids],
    ),

    dbPool.query(
      `
      SELECT 'stake_deregistration' AS type, d.cert_index, d.addr_id AS account_id, a.amount::bigint, a.pool AS account_pool_id, a.retired_pool AS account_retired_pool_id, d.tx_id, d.id
      FROM stake_deregistration AS d
      LEFT JOIN adastat_account AS a ON (a.id = d.addr_id)
      WHERE d.tx_id = ANY($1::bigint[])
    `,
      [tx_ids],
    ),

    dbPool.query(
      `
      SELECT 'pool_update' AS type, u.id AS update_id, u.hash_id AS pool_id, u.cert_index, u.active_epoch_no::int, u.pledge, u.margin, u.fixed_cost, ENCODE(ph.hash_raw::bytea, 'hex') AS pool_hash, m.id AS meta_id, m.url AS meta_url, ENCODE(m.hash::bytea, 'hex') AS meta_hash, ENCODE(d.hash::bytea, 'hex') AS data_hash, COALESCE(d.json, '{}'::jsonb) AS json, COALESCE(convert_from(d.bytes, 'utf8'), '{}') AS json_data, u.registered_tx_id AS tx_id
      FROM pool_update AS u
      LEFT JOIN pool_hash AS ph ON ph.id = u.hash_id
      LEFT JOIN pool_metadata_ref AS m ON (m.id = u.meta_id)
      LEFT JOIN off_chain_pool_data AS d ON (d.pmr_id = m.id)
      WHERE u.registered_tx_id = ANY($1::bigint[])
    `,
      [tx_ids],
    ),

    dbPool.query(
      `
      SELECT 'pool_retire' AS type, r.id AS retirement_id, r.cert_index, r.retiring_epoch, r.hash_id AS pool_id, r.announced_tx_id AS tx_id
      FROM pool_retire AS r
      WHERE r.announced_tx_id = ANY($1::bigint[])
    `,
      [tx_ids],
    ),

    dbPool.query(
      `
      (
        SELECT DISTINCT 'reserve' AS type, r.tx_id, SUM(r.amount) AS amount
        FROM reserve AS r
        WHERE r.tx_id = ANY($1::bigint[])
        GROUP BY r.tx_id
      )
      UNION ALL
      (
        SELECT DISTINCT 'treasury' AS type, t.tx_id, SUM(t.amount) AS amount
        FROM treasury AS t
        WHERE t.tx_id = ANY($1::bigint[])
        GROUP BY t.tx_id
      )
      UNION ALL
      (
        SELECT DISTINCT 'metadata' AS type, m.tx_id, 0 AS amount
        FROM tx_metadata AS m
        WHERE m.tx_id = ANY($1::bigint[])
      )
      ${redeemerQuery}
    `,
      [tx_ids],
    ),

    epoch_no < config.epochProtocol.mary
      ? { rows: [] }
      : dbPool.query(
          `
      SELECT 'token_mint' AS type, m.quantity, m.ident AS token_id, m.tx_id, ENCODE(a.policy::bytea, 'hex') AS policy, ENCODE(a.name::bytea, 'hex') AS name, ENCODE(a.name, 'escape') AS escape_name, convert_asset_name(a.name) AS convert_name, ma.id AS exist_token_id, md721.id AS meta_id_721, md721.json AS meta_data_721, md20.id AS meta_id_20, md20.json AS meta_data_20, COALESCE(ma.supply, 0) AS supply
      FROM ma_tx_mint AS m
      LEFT JOIN multi_asset AS a ON a.id = m.ident
      LEFT JOIN adastat_multi_asset AS ma ON ma.id = a.id
      LEFT JOIN tx_metadata AS md721 ON md721.tx_id = m.tx_id AND md721.key = 721
      LEFT JOIN tx_metadata AS md20 ON md20.tx_id = m.tx_id AND md20.key = 20
      WHERE m.tx_id = ANY($1::bigint[])
      ORDER BY m.tx_id ASC
    `,
          [tx_ids],
        ),
  ]);

  logger.trace("storage.getTxExtraData end");

  return {
    stakeRegistrationCert: stakeRegistration.rows,
    delegationCert: delegation.rows,
    stakeDeregistrationCert: stakeDeregistration.rows,
    poolUpdateCert: poolUpdate.rows,
    poolRetireCert: poolRetire.rows,
    typeCert: type.rows,
    tokenMintCert: tokenMint.rows,
  };
};

storage.insertTableData = async function (lastParsedBlock) {
  logger.trace("storage.insertTableData start");

  await db.query("BEGIN");

  let res,
    deltaByron = 0n,
    deltaByronWithAmount = 0n;

  const _maHolderIds = [],
    _maIds = [],
    _maQuantities = [],
    _maPolicyIds = [],
    _maAccountIds = [],
    adastatMultiAssetList = Object.keys(storage.adastatMultiAsset),
    adastatMultiAssetFilter = adastatMultiAssetList.length ? "= ANY($2::bigint[])" : "IS NOT NULL",
    addressId = Object.create(null);

  try {
    logger.trace("storage.insertTableData policies start");
    const maPolicies = Object.values(storage.adastatMaPolicy),
      maPoliciesIds = [];

    if (maPolicies.length) {
      const _ids = [],
        _policies = [],
        _tokens = [],
        _holders = [],
        _firstTxs = [],
        _lastTxs = [],
        _txs = [];

      for (const data of maPolicies) {
        _ids.push(storage.tokenPolicy[data.policy] ?? null);
        _policies.push(Buffer.from(data.policy, "hex"));
        _tokens.push(data.token);
        _holders.push(0);
        _firstTxs.push(data.first_tx);
        _lastTxs.push(data.last_tx);
        _txs.push(data.txs.size);
      }

      if (_ids.length) {
        res = await db.query(
          `
          INSERT INTO adastat_ma_policy (id, policy, token, holder, first_tx, last_tx, tx)
          SELECT
            COALESCE(t.id, nextval($8::regclass)),
            t.policy,
            t.token,
            t.holder,
            t.first_tx,
            t.last_tx,
            t.tx
          FROM unnest(
            $1::bigint[],
            $2::bytea[],
            $3::bigint[],
            $4::bigint[],
            $5::bigint[],
            $6::bigint[],
            $7::bigint[]
          ) AS t(id, policy, token, holder, first_tx, last_tx, tx)
          ON CONFLICT (id) DO UPDATE
          SET token = adastat_ma_policy.token + EXCLUDED.token,
              last_tx = EXCLUDED.last_tx,
              tx = adastat_ma_policy.tx + EXCLUDED.tx
          RETURNING id, ENCODE(policy::bytea, 'hex') AS policy
        `,
          [_ids, _policies, _tokens, _holders, _firstTxs, _lastTxs, _txs, storage.pgSequence.ma_policy],
        );

        for (let row of res.rows) {
          storage.tokenPolicy[row.policy] = row.id;

          maPoliciesIds.push(row.id);
        }
      }
    }

    logger.trace("storage.insertTableData byron start");
    const addressByronList = Object.keys(storage.adastatAddressByron);
    if (addressByronList.length > 0) {
      const whereAddressIn = [];
      for (const address of addressByronList) {
        whereAddressIn.push(address);
      }

      res = await db.query(
        `
        SELECT a.id, a.address, a.amount, COALESCE(jsonb_object_agg(mh.ma_id, mh.quantity::text) FILTER (WHERE mh.ma_id ${adastatMultiAssetFilter}), '{}'::jsonb) AS multi_asset
        FROM adastat_address_byron AS a
        LEFT JOIN adastat_ma_holder AS mh ON mh.holder_id = -a.id
        WHERE a.address = ANY($1::text[])
        GROUP BY a.id, a.address, a.amount
      `,
        adastatMultiAssetList.length ? [whereAddressIn, adastatMultiAssetList] : [whereAddressIn],
      );

      const existAddress = Object.create(null);
      for (const row of res.rows) {
        existAddress[row.address] = {
          id: row.id,
          amount: row.amount,
          multi_asset: row.multi_asset,
        };
        addressId[row.address] = {
          address_id: -row.id,
          account_id: null,
        };
      }

      const adastatMultiAssetHolder = [],
        _ids = [],
        _addresses = [],
        _amounts = [],
        _firstTxs = [],
        _lastTxs = [],
        _txs = [],
        _tokens = [];

      for (const addr of addressByronList) {
        let addr_id, existMultiAsset;

        if (addr in existAddress) {
          addr_id = existAddress[addr].id;
          if (existAddress[addr].amount > 0) {
            if (existAddress[addr].amount + storage.adastatAddressByron[addr].amount <= 0) {
              deltaByronWithAmount--;
            }
          } else {
            if (existAddress[addr].amount + storage.adastatAddressByron[addr].amount > 0) {
              deltaByronWithAmount++;
            }
          }

          existMultiAsset = existAddress[addr].multi_asset;
        } else {
          addr_id = null;
          deltaByron++;
          if (storage.adastatAddressByron[addr].amount > 0) {
            deltaByronWithAmount++;
          }

          existMultiAsset = Object.create(null);
        }

        for (let token_id in storage.adastatAddressByron[addr].multi_asset) {
          if (storage.adastatAddressByron[addr].multi_asset[token_id]) {
            if (token_id in existMultiAsset) {
              if (BigInt(existMultiAsset[token_id]) + storage.adastatAddressByron[addr].multi_asset[token_id] == 0) {
                storage.adastatAddressByron[addr].token--;

                storage.adastatMultiAsset[token_id].holder--;
              }
            } else {
              storage.adastatAddressByron[addr].token++;

              storage.adastatMultiAsset[token_id].holder++;
            }

            adastatMultiAssetHolder.push({
              token_id: token_id,
              address: addr,
              quantity: storage.adastatAddressByron[addr].multi_asset[token_id],
              policy_id: storage.tokenPolicy[storage.adastatMultiAsset[token_id].policy],
              account_id: null,
            });
          }
        }

        _ids.push(addr_id);
        _addresses.push(addr);
        _amounts.push(storage.adastatAddressByron[addr].amount);
        _firstTxs.push(storage.adastatAddressByron[addr].first_tx);
        _lastTxs.push(storage.adastatAddressByron[addr].last_tx);
        _txs.push(storage.adastatAddressByron[addr].txs.size);
        _tokens.push(storage.adastatAddressByron[addr].token);
      }

      res = await db.query(
        `
        INSERT INTO adastat_address_byron (id, address, amount, first_tx, last_tx, tx, token)
        SELECT
          COALESCE(t.id, nextval($8::regclass)),
          t.address,
          t.amount,
          t.first_tx,
          t.last_tx,
          t.tx,
          t.token
        FROM unnest(
          $1::bigint[],
          $2::text[],
          $3::bigint[],
          $4::bigint[],
          $5::bigint[],
          $6::int[],
          $7::int[]
        ) AS t(id, address, amount, first_tx, last_tx, tx, token)
        ON CONFLICT (id) DO UPDATE
        SET amount = adastat_address_byron.amount + EXCLUDED.amount,
            last_tx = EXCLUDED.last_tx,
            tx = adastat_address_byron.tx + EXCLUDED.tx,
            token = adastat_address_byron.token + EXCLUDED.token
        RETURNING id, address, token
      `,
        [_ids, _addresses, _amounts, _firstTxs, _lastTxs, _txs, _tokens, storage.pgSequence.byron],
      );

      for (const row of res.rows) {
        addressId[row.address] = {
          address_id: -row.id,
          account_id: null,
        };

        const oldToken = row.token - storage.adastatAddressByron[row.address].token,
          newToken = row.token;
        if (oldToken > 0) {
          if (newToken == 0) {
            storage.epochs[storage.lastParsedEpochNo].token_holder--;
          }
        } else if (newToken > 0) {
          storage.epochs[storage.lastParsedEpochNo].token_holder++;
        }
      }

      for (const row of adastatMultiAssetHolder) {
        _maHolderIds.push(addressId[row.address].address_id);
        _maIds.push(row.token_id);
        _maQuantities.push(row.quantity);
        _maPolicyIds.push(row.policy_id);
        _maAccountIds.push(row.account_id);
      }
    }

    logger.trace("storage.insertTableData shelley start");
    const addressShelleyList = Object.keys(storage.adastatAddressShelley);
    if (addressShelleyList.length > 0) {
      const whereAddressIn = [];
      for (const address of addressShelleyList) {
        whereAddressIn.push(address);
      }

      res = await db.query(
        `
        SELECT a.id, a.address, COALESCE(jsonb_object_agg(mh.ma_id, mh.quantity::text) FILTER (WHERE mh.ma_id ${adastatMultiAssetFilter}), '{}'::jsonb) AS multi_asset
        FROM adastat_address AS a
        LEFT JOIN adastat_ma_holder AS mh ON mh.holder_id = a.id
        WHERE a.address = ANY($1::text[])
        GROUP BY a.id, a.address
      `,
        adastatMultiAssetList.length ? [whereAddressIn, adastatMultiAssetList] : [whereAddressIn],
      );

      const existAddress = Object.create(null);
      for (const row of res.rows) {
        existAddress[row.address] = {
          id: row.id,
          multi_asset: row.multi_asset,
        };
        addressId[row.address] = {
          address_id: row.id,
          account_id: storage.adastatAddressShelley[row.address].account_id,
        };
      }

      const adastatMultiAssetHolder = [],
        _ids = [],
        _addresses = [],
        _accountIds = [],
        _amounts = [],
        _firstTxs = [],
        _lastTxs = [],
        _txs = [],
        _tokens = [];

      for (const addr of addressShelleyList) {
        let addr_id, existMultiAsset;

        const account_id = storage.adastatAddressShelley[addr].account_id;

        if (addr in existAddress) {
          addr_id = existAddress[addr].id;

          existMultiAsset = existAddress[addr].multi_asset;
        } else {
          addr_id = null;

          existMultiAsset = Object.create(null);
        }

        for (let token_id in storage.adastatAddressShelley[addr].multi_asset) {
          if (storage.adastatAddressShelley[addr].multi_asset[token_id]) {
            if (account_id > 0) {
              if (token_id in storage.adastatAccount[account_id].multi_asset) {
                storage.adastatAccount[account_id].multi_asset[token_id] += storage.adastatAddressShelley[addr].multi_asset[token_id];

                if (storage.adastatAccount[account_id].multi_asset[token_id] == 0) {
                  delete storage.adastatAccount[account_id].multi_asset[token_id];
                }
              } else if (storage.adastatAddressShelley[addr].multi_asset[token_id] != 0) {
                storage.adastatAccount[account_id].multi_asset[token_id] = storage.adastatAddressShelley[addr].multi_asset[token_id];
              }
            }

            if (token_id in existMultiAsset) {
              if (BigInt(existMultiAsset[token_id]) + storage.adastatAddressShelley[addr].multi_asset[token_id] == 0) {
                storage.adastatAddressShelley[addr].token--;

                if (account_id <= 0) {
                  storage.adastatMultiAsset[token_id].holder--;
                }
              }
            } else {
              storage.adastatAddressShelley[addr].token++;

              if (account_id <= 0) {
                storage.adastatMultiAsset[token_id].holder++;
              }
            }

            adastatMultiAssetHolder.push({
              token_id: token_id,
              address: addr,
              quantity: storage.adastatAddressShelley[addr].multi_asset[token_id],
              policy_id: storage.tokenPolicy[storage.adastatMultiAsset[token_id].policy],
              account_id: account_id > 0 ? account_id : null,
            });
          }
        }

        _ids.push(addr_id);
        _addresses.push(addr);
        _accountIds.push(storage.adastatAddressShelley[addr].account_id);
        _amounts.push(storage.adastatAddressShelley[addr].amount);
        _firstTxs.push(storage.adastatAddressShelley[addr].first_tx);
        _lastTxs.push(storage.adastatAddressShelley[addr].last_tx);
        _txs.push(storage.adastatAddressShelley[addr].txs.size);
        _tokens.push(storage.adastatAddressShelley[addr].token);
      }

      res = await db.query(
        `
        INSERT INTO adastat_address (id, address, account_id, amount, first_tx, last_tx, tx, token)
        SELECT
          COALESCE(t.id, nextval($9::regclass)),
          t.address,
          t.account_id,
          t.amount,
          t.first_tx,
          t.last_tx,
          t.tx,
          t.token
        FROM unnest(
          $1::bigint[],
          $2::text[],
          $3::bigint[],
          $4::bigint[],
          $5::bigint[],
          $6::bigint[],
          $7::int[],
          $8::int[]
        ) AS t(id, address, account_id, amount, first_tx, last_tx, tx, token)
        ON CONFLICT (id) DO UPDATE
        SET account_id = COALESCE(EXCLUDED.account_id, adastat_address.account_id),
            amount = adastat_address.amount + EXCLUDED.amount,
            last_tx = EXCLUDED.last_tx,
            tx = adastat_address.tx + EXCLUDED.tx,
            token = adastat_address.token + EXCLUDED.token
        RETURNING id, address, account_id, token
      `,
        [_ids, _addresses, _accountIds, _amounts, _firstTxs, _lastTxs, _txs, _tokens, storage.pgSequence.address],
      );

      for (const row of res.rows) {
        addressId[row.address] = {
          address_id: row.id,
          account_id: storage.adastatAddressShelley[row.address].account_id,
        };

        if (!row.account_id) {
          const oldToken = row.token - storage.adastatAddressShelley[row.address].token,
            newToken = row.token;
          if (oldToken > 0) {
            if (newToken == 0) {
              storage.epochs[storage.lastParsedEpochNo].token_holder--;
            }
          } else if (newToken > 0) {
            storage.epochs[storage.lastParsedEpochNo].token_holder++;
          }
        }
      }

      for (const row of adastatMultiAssetHolder) {
        _maHolderIds.push(addressId[row.address].address_id);
        _maIds.push(row.token_id);
        _maQuantities.push(row.quantity);
        _maPolicyIds.push(row.policy_id);
        _maAccountIds.push(row.account_id);
      }
    }

    logger.trace("storage.insertTableData account start");
    const accountList = Object.keys(storage.adastatAccount);
    if (accountList.length > 0) {
      const whereAccountIn = [],
        _ids = [],
        _amounts = [],
        _rewards = [],
        _pools = [],
        _firstTxs = [],
        _lastTxs = [],
        _txs = [],
        _tokens = [],
        multiAssetAccount = Object.create(null);

      let newAccount = accountList.length,
        newDelegator = 0,
        newAccountWithStake = 0,
        newDelegatorWithStake = 0;

      for (const id of accountList) {
        for (const token_id in storage.adastatAccount[id].multi_asset) {
          if (storage.adastatAccount[id].multi_asset[token_id]) {
            multiAssetAccount[id] = Object.create(null);
            break;
          }
        }
      }
      let multiAssetAccountKeys = Object.keys(multiAssetAccount);
      if (multiAssetAccountKeys.length > 0) {
        const accountAddress = Object.create(null);

        res = await db.query(
          `
          SELECT id, account_id
          FROM adastat_address
          WHERE account_id = ANY($1::bigint[])
        `,
          [multiAssetAccountKeys],
        );

        for (let row of res.rows) {
          accountAddress[row.id] = row.account_id;
        }

        const accountAddressValues = Object.keys(accountAddress);
        if (accountAddressValues.length) {
          res = await db.query(
            `
            SELECT ma_id, holder_id, quantity
            FROM adastat_ma_holder
            WHERE holder_id = ANY($1::bigint[])
          `,
            [accountAddressValues],
          );

          for (const row of res.rows) {
            const account_id = accountAddress[row.holder_id];
            if (!multiAssetAccount[account_id][row.ma_id]) {
              multiAssetAccount[account_id][row.ma_id] = 0n;
            }
            multiAssetAccount[account_id][row.ma_id] += BigInt(row.quantity);
          }
        }

        for (const account_id of multiAssetAccountKeys) {
          for (const token_id in storage.adastatAccount[account_id].multi_asset) {
            if (storage.adastatAccount[account_id].multi_asset[token_id]) {
              if (account_id in multiAssetAccount && token_id in multiAssetAccount[account_id]) {
                if (multiAssetAccount[account_id][token_id] + storage.adastatAccount[account_id].multi_asset[token_id] == 0) {
                  storage.adastatAccount[account_id].token--;
                  storage.adastatMultiAsset[token_id].holder--;
                }
              } else {
                storage.adastatAccount[account_id].token++;
                storage.adastatMultiAsset[token_id].holder++;
              }
            }
          }
        }
      }

      for (const id of accountList) {
        whereAccountIn.push(id);

        _ids.push(id);
        _amounts.push(storage.adastatAccount[id].amount);
        _rewards.push(storage.adastatAccount[id].reward);
        _pools.push(storage.adastatAccount[id].pool);
        _firstTxs.push(storage.adastatAccount[id].first_tx);
        _lastTxs.push(storage.adastatAccount[id].last_tx);
        _txs.push(storage.adastatAccount[id].txs.size);
        _tokens.push(storage.adastatAccount[id].token);

        if (storage.adastatAccount[id].amount > 0) {
          newAccountWithStake++;
          if (storage.adastatAccount[id].pool > 0) {
            newDelegator++;
            newDelegatorWithStake++;
            storage.adastatPool[storage.adastatAccount[id].pool].delegator++;
            storage.adastatPool[storage.adastatAccount[id].pool].delegator_with_stake++;
            storage.adastatPool[storage.adastatAccount[id].pool].stake += storage.adastatAccount[id].amount;
            storage.adastatPool[storage.adastatAccount[id].pool].need_update = true;

            if (id in storage.poolOwner && storage.poolOwner[id].has(storage.adastatAccount[id].pool)) {
              storage.adastatPool[storage.adastatAccount[id].pool].real_pledge += storage.adastatAccount[id].amount;
            }
          }
        } else if (storage.adastatAccount[id].pool > 0) {
          newDelegator++;
          if (storage.adastatAccount[id].pool in storage.adastatPool) {
            storage.adastatPool[storage.adastatAccount[id].pool].delegator++;
            storage.adastatPool[storage.adastatAccount[id].pool].need_update = true;
          } else {
            logger.error("adastatAccount ID", id, storage.adastatAccount[id]);

            app.exit();
          }
        }

        if (storage.adastatAccount[id].token > 0) {
          storage.epochs[storage.lastParsedEpochNo].token_holder++;
        }
      }

      res = await db.query(
        `
        WITH upd AS (
          INSERT INTO adastat_account (id, amount, reward, pool, first_tx, last_tx, tx, token)
          SELECT
            t.id,
            t.amount,
            t.reward,
            t.pool,
            t.first_tx,
            t.last_tx,
            t.tx,
            t.token
          FROM unnest(
            $1::bigint[],
            $2::bigint[],
            $3::bigint[],
            $4::bigint[],
            $5::bigint[],
            $6::bigint[],
            $7::int[],
            $8::int[]
          ) AS t(id, amount, reward, pool, first_tx, last_tx, tx, token)
          ON CONFLICT (id) DO UPDATE
          SET amount = adastat_account.amount + EXCLUDED.amount,
              reward =  adastat_account.reward + EXCLUDED.reward,
              pool = (CASE
                WHEN EXCLUDED.pool < 0 THEN NULL
                WHEN EXCLUDED.pool = 0 THEN 0
                ELSE COALESCE(EXCLUDED.pool, adastat_account.pool)
              END),
              first_tx = COALESCE(adastat_account.first_tx, EXCLUDED.first_tx),
              last_tx = GREATEST(adastat_account.last_tx, EXCLUDED.last_tx),
              tx = adastat_account.tx + EXCLUDED.tx,
              token = adastat_account.token + EXCLUDED.token
        )
        SELECT id, amount, pool, token FROM adastat_account WHERE id = ANY($9::bigint[])
      `,
        [_ids, _amounts, _rewards, _pools, _firstTxs, _lastTxs, _txs, _tokens, whereAccountIn],
      );

      newAccount -= res.rows.length;

      for (let row of res.rows) {
        if (storage.adastatAccount[row.id].token > 0) {
          if (row.token > 0) {
            storage.epochs[storage.lastParsedEpochNo].token_holder--;
          }
        } else {
          let oldToken = row.token,
            newToken = oldToken + storage.adastatAccount[row.id].token;
          if (oldToken > 0) {
            if (newToken == 0) {
              storage.epochs[storage.lastParsedEpochNo].token_holder--;
            }
          } else if (newToken > 0) {
            storage.epochs[storage.lastParsedEpochNo].token_holder++;
          }
        }

        if (storage.adastatAccount[row.id].amount > 0) {
          newAccountWithStake--;
          if (storage.adastatAccount[row.id].pool > 0) {
            newDelegator--;
            newDelegatorWithStake--;
            storage.adastatPool[storage.adastatAccount[row.id].pool].delegator--;
            storage.adastatPool[storage.adastatAccount[row.id].pool].delegator_with_stake--;
            storage.adastatPool[storage.adastatAccount[row.id].pool].stake -= storage.adastatAccount[row.id].amount;

            if (row.id in storage.poolOwner && storage.poolOwner[row.id].has(storage.adastatAccount[row.id].pool)) {
              storage.adastatPool[storage.adastatAccount[row.id].pool].real_pledge -= storage.adastatAccount[row.id].amount;
            }
          }
        } else if (storage.adastatAccount[row.id].pool > 0) {
          newDelegator--;
          storage.adastatPool[storage.adastatAccount[row.id].pool].delegator--;
        }

        row.newAmount = row.amount + storage.adastatAccount[row.id].amount;
        if (row.amount == 0 && row.newAmount > 0) {
          newAccountWithStake++;
        } else if (row.amount > 0 && row.newAmount == 0) {
          newAccountWithStake--;
        }

        if (storage.adastatAccount[row.id].pool < 0) {
          row.newPool = null;
        } else if (storage.adastatAccount[row.id].pool == 0) {
          row.newPool = 0;
        } else {
          row.newPool = storage.adastatAccount[row.id].pool || row.pool;
        }

        if (row.pool <= 0 && row.newPool > 0) {
          newDelegator++;
          storage.adastatPool[row.newPool].delegator++;
          if (row.newAmount > 0) {
            newDelegatorWithStake++;
            storage.adastatPool[row.newPool].delegator_with_stake++;
            storage.adastatPool[row.newPool].stake += row.newAmount;
          }
          storage.adastatPool[row.newPool].need_update = true;
        } else if (row.pool > 0 && row.newPool <= 0) {
          newDelegator--;
          storage.adastatPool[row.pool].delegator--;
          if (row.amount > 0) {
            newDelegatorWithStake--;
            storage.adastatPool[row.pool].delegator_with_stake--;
            storage.adastatPool[row.pool].stake -= row.amount;
          }
          storage.adastatPool[row.pool].need_update = true;
        } else if (row.pool > 0 && row.newPool > 0) {
          if (row.amount == 0 && row.newAmount > 0) {
            newDelegatorWithStake++;
          } else if (row.amount > 0 && row.newAmount == 0) {
            newDelegatorWithStake--;
          }
          if (row.pool != row.newPool || row.amount != row.newAmount) {
            storage.adastatPool[row.pool].delegator--;
            if (row.amount > 0) {
              storage.adastatPool[row.pool].delegator_with_stake--;
              storage.adastatPool[row.pool].stake -= row.amount;
            }
            storage.adastatPool[row.pool].need_update = true;
            storage.adastatPool[row.newPool].delegator++;
            if (row.newAmount > 0) {
              storage.adastatPool[row.newPool].delegator_with_stake++;
              storage.adastatPool[row.newPool].stake += row.newAmount;
            }
            storage.adastatPool[row.newPool].need_update = true;
          }
        }

        if (row.id in storage.poolOwner) {
          if (storage.poolOwner[row.id].has(row.pool)) {
            storage.adastatPool[row.pool].real_pledge -= row.amount;
            storage.adastatPool[row.pool].need_update = true;
          }
          if (storage.poolOwner[row.id].has(row.newPool)) {
            storage.adastatPool[row.newPool].real_pledge += row.newAmount;
            storage.adastatPool[row.newPool].need_update = true;
          }
        }
      }

      storage.epochs[storage.lastParsedEpochNo].account += BigInt(newAccount);
      storage.epochs[storage.lastParsedEpochNo].delegator += BigInt(newDelegator);
      storage.epochs[storage.lastParsedEpochNo].account_with_stake += BigInt(newAccountWithStake);
      storage.epochs[storage.lastParsedEpochNo].delegator_with_stake += BigInt(newDelegatorWithStake);
    }

    if (storage.adastatAccountRetiredPool.size > 0) {
      await db.query(
        `
        UPDATE adastat_account
        SET retired_pool = NULL
        WHERE id = ANY($1::bigint[])
      `,
        [Array.from(storage.adastatAccountRetiredPool)],
      );
    }

    logger.trace("storage.insertTableData token holder start");
    while (_maHolderIds.length > 0) {
      const _maHolderIdsChunk = _maHolderIds.splice(0, 10000),
        _maIdsChunk = _maIds.splice(0, 10000),
        _maQuantitiesChunk = _maQuantities.splice(0, 10000),
        _maPolicyIdsChunk = _maPolicyIds.splice(0, 10000),
        _maAccountIdsChunk = _maAccountIds.splice(0, 10000);

      await db.query(
        `
        INSERT INTO adastat_ma_holder (holder_id, ma_id, quantity, policy_id, account_id)
        SELECT
          t.holder_id,
          t.ma_id,
          t.quantity,
          t.policy_id,
          t.account_id
        FROM unnest(
          $1::bigint[],
          $2::bigint[],
          $3::numeric[],
          $4::bigint[],
          $5::bigint[]
        ) AS t(holder_id, ma_id, quantity, policy_id, account_id)
        ON CONFLICT (holder_id, ma_id) DO UPDATE
        SET quantity = adastat_ma_holder.quantity + EXCLUDED.quantity
      `,
        [_maHolderIdsChunk, _maIdsChunk, _maQuantitiesChunk, _maPolicyIdsChunk, _maAccountIdsChunk],
      );
    }

    await db.query(`
      DELETE FROM adastat_ma_holder
      WHERE quantity = 0
    `);

    logger.trace("storage.insertTableData token start");
    if (adastatMultiAssetList.length > 0) {
      const _ids = [],
        _supply = [],
        _holder = [],
        _firstTxs = [],
        _lastTxs = [],
        _txs = [],
        _metaIds = [],
        _policyIds = [];

      for (const token_id of adastatMultiAssetList) {
        _ids.push(token_id);
        _supply.push(storage.adastatMultiAsset[token_id].supply);
        _holder.push(storage.adastatMultiAsset[token_id].holder);
        _firstTxs.push(storage.adastatMultiAsset[token_id].first_tx);
        _lastTxs.push(storage.adastatMultiAsset[token_id].last_tx);
        _txs.push(storage.adastatMultiAsset[token_id].txs.size);
        _metaIds.push(storage.adastatMultiAsset[token_id].meta_id);
        _policyIds.push(storage.tokenPolicy[storage.adastatMultiAsset[token_id].policy]);
      }

      await db.query(
        `
        INSERT INTO adastat_multi_asset (id, supply, holder, first_tx, last_tx, tx, meta_id, policy_id)
        SELECT
          t.id,
          t.supply,
          t.holder,
          t.first_tx,
          t.last_tx,
          t.tx,
          t.meta_id,
          t.policy_id
        FROM unnest(
          $1::bigint[],
          $2::numeric [],
          $3::bigint[],
          $4::bigint[],
          $5::bigint[],
          $6::int[],
          $7::bigint[],
          $8::bigint[]
        ) AS t(id, supply, holder, first_tx, last_tx, tx, meta_id, policy_id)
        ON CONFLICT (id) DO UPDATE
        SET supply = adastat_multi_asset.supply + EXCLUDED.supply,
            holder = adastat_multi_asset.holder + EXCLUDED.holder,
            last_tx = EXCLUDED.last_tx,
            tx = adastat_multi_asset.tx + EXCLUDED.tx,
            meta_id = COALESCE(EXCLUDED.meta_id, adastat_multi_asset.meta_id)
      `,
        [_ids, _supply, _holder, _firstTxs, _lastTxs, _txs, _metaIds, _policyIds],
      );
    }

    logger.trace("storage.insertTableData token policy start");
    if (maPoliciesIds.length > 0) {
      await db.query(
        `
        UPDATE adastat_ma_policy
        SET holder = m.holder
        FROM (
          SELECT policy_id, COUNT(DISTINCT account_id) FILTER (WHERE account_id > 0) + COUNT(DISTINCT holder_id) FILTER (WHERE account_id IS NULL) AS holder
          FROM adastat_ma_holder
          WHERE policy_id = ANY($1::bigint[])
          GROUP BY policy_id
        ) AS m
        WHERE adastat_ma_policy.id = m.policy_id
      `,
        [maPoliciesIds],
      );
    }

    logger.trace("storage.insertTableData delegation start");
    const delegationList = Object.keys(storage.adastatDelegation);
    if (delegationList.length > 0) {
      const _ids = [],
        _amounts = [],
        _fromPools = [];

      for (const id of delegationList) {
        _ids.push(id);
        _amounts.push(storage.adastatDelegation[id].amount);
        _fromPools.push(storage.adastatDelegation[id].from_pool);
      }

      await db.query(
        `
        INSERT INTO adastat_delegation (id, amount, from_pool)
        SELECT
          t.id,
          t.amount,
          t.from_pool
        FROM unnest(
          $1::bigint[],
          $2::bigint[],
          $3::bigint[]
        ) AS t(id, amount, from_pool)
        ON CONFLICT (id) DO NOTHING
      `,
        [_ids, _amounts, _fromPools],
      );
    }

    logger.trace("storage.insertTableData stake deregistration start");
    const stakeDeregistrationList = Object.keys(storage.adastatStakeDeregistration);
    if (stakeDeregistrationList.length > 0) {
      const _ids = [],
        _amounts = [],
        _fromPools = [];

      for (const id of stakeDeregistrationList) {
        _ids.push(id);
        _amounts.push(storage.adastatStakeDeregistration[id].amount);
        _fromPools.push(storage.adastatStakeDeregistration[id].from_pool);
      }

      await db.query(
        `
        INSERT INTO adastat_stake_deregistration (id, amount, from_pool)
        SELECT
          t.id,
          t.amount,
          t.from_pool
        FROM unnest(
          $1::bigint[],
          $2::bigint[],
          $3::bigint[]
        ) AS t(id, amount, from_pool)
        ON CONFLICT (id) DO NOTHING
      `,
        [_ids, _amounts, _fromPools],
      );
    }

    logger.trace("storage.insertTableData pool start");
    {
      if (storage.lastParsedEpochNo >= 0) {
        storage.epochs[storage.lastParsedEpochNo].pool_with_block = 0;
        storage.epochs[storage.lastParsedEpochNo].pool_with_stake = 0;
        storage.epochs[storage.lastParsedEpochNo].stake = 0n;
      }

      const _ids = [],
        _names = [],
        _tickers = [],
        _descriptions = [],
        _homepages = [],
        _extendeds = [],
        _extendedDatas = [],
        _registrationIds = [],
        _liveUpdateIds = [],
        _retirementIds = [],
        _epochWithBlocks = [],
        _validMetaHashes = [],
        _totalBlocks = [],
        _itnTickers = [],
        _updateBlocks = [],
        _epochs = [],
        _blocks = [],
        _stakes = [],
        _delegators = [],
        _updateIds = [],
        _realPledges = [],
        _delegatorWithStakes = [];

      for (const pool_id in storage.adastatPool) {
        if (storage.adastatPool[pool_id]) {
          const pool = storage.adastatPool[pool_id];

          if (pool.retiring_epoch > 0 && pool.retiring_epoch + 1 < storage.lastParsedEpochNo) {
            continue;
          }

          if (pool.need_update) {
            _ids.push(pool.id);
            _names.push(pool.name);
            _tickers.push(pool.ticker);
            _descriptions.push(pool.description);
            _homepages.push(pool.homepage);
            _extendeds.push(pool.extended);
            _extendedDatas.push(pool.extended_data);
            _registrationIds.push(pool.registration_id);
            _liveUpdateIds.push(pool.live_update_id);
            _retirementIds.push(pool.retirement_id);
            _epochWithBlocks.push(pool.epoch_with_block);
            _validMetaHashes.push(pool.valid_meta_hash);
            _totalBlocks.push(pool.total_block);
            _itnTickers.push(pool.itn_ticker);
            _updateBlocks.push(lastParsedBlock.block_no);

            _epochs.push(storage.lastParsedEpochNo);
            _blocks.push(pool.block);
            _stakes.push(pool.stake);
            _delegators.push(pool.delegator);
            _updateIds.push(pool.update_id);
            _realPledges.push(pool.real_pledge);
            _delegatorWithStakes.push(pool.delegator_with_stake);

            pool.need_update = false;

            if (pool.update_cert) {
              if (pool.update_cert.meta_hash == pool.update_cert.data_hash) {
                storage.updatePoolExtendedMetaData(pool.id, 0);
              } else {
                storage.updatePoolMetaData(pool.id, pool.update_cert.meta_id, pool.update_cert.meta_url, pool.update_cert.meta_hash, 0);
              }

              pool.meta_id = pool.update_cert.meta_id;
              pool.meta_url = pool.update_cert.meta_url;
              pool.meta_hash = pool.update_cert.meta_hash;

              delete pool.update_cert;
            }
          }
          if (pool.block > 0) {
            storage.epochs[storage.lastParsedEpochNo].pool_with_block++;
          }
          if (pool.stake > 0) {
            storage.epochs[storage.lastParsedEpochNo].pool_with_stake++;
          }
          storage.epochs[storage.lastParsedEpochNo].stake += pool.stake;
        }
      }
      if (_ids.length) {
        await db.query(
          `
          INSERT INTO adastat_pool (id, name, ticker, description, homepage, extended, extended_data, registration_id, update_id, retirement_id, epoch_with_block, valid_meta_hash, block, itn_ticker, update_block)
          SELECT
            t.id, t.name, t.ticker, t.description, t.homepage, t.extended, t.extended_data, t.registration_id, t.update_id, t.retirement_id, t.epoch_with_block, t.valid_meta_hash, t.block, t.itn_ticker, t.update_block
          FROM unnest(
            $1::bigint[],
            $2::text[],
            $3::text[],
            $4::text[],
            $5::text[],
            $6::text[],
            $7::jsonb[],
            $8::bigint[],
            $9::bigint[],
            $10::bigint[],
            $11::int[],
            $12::smallint[],
            $13::int[],
            $14::smallint[],
            $15::int[]
          ) AS t(id, name, ticker, description, homepage, extended, extended_data, registration_id, update_id, retirement_id, epoch_with_block, valid_meta_hash, block, itn_ticker, update_block)
          ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              ticker = EXCLUDED.ticker,
              description = EXCLUDED.description,
              homepage = EXCLUDED.homepage,
              extended = EXCLUDED.extended,
              extended_data = EXCLUDED.extended_data,
              update_id = EXCLUDED.update_id,
              retirement_id = EXCLUDED.retirement_id,
              epoch_with_block = EXCLUDED.epoch_with_block,
              valid_meta_hash = EXCLUDED.valid_meta_hash,
              block = EXCLUDED.block,
              itn_ticker = EXCLUDED.itn_ticker,
              update_block = EXCLUDED.update_block
        `,
          [
            _ids,
            _names,
            _tickers,
            _descriptions,
            _homepages,
            _extendeds,
            _extendedDatas,
            _registrationIds,
            _liveUpdateIds,
            _retirementIds,
            _epochWithBlocks,
            _validMetaHashes,
            _totalBlocks,
            _itnTickers,
            _updateBlocks,
          ],
        );

        await db.query(
          `
          INSERT INTO adastat_epoch_pool (epoch_no, pool_id, block, stake, delegator, update_id, real_pledge, delegator_with_stake)
          SELECT
            t.epoch_no, t.pool_id, t.block, t.stake, t.delegator, t.update_id, t.real_pledge, t.delegator_with_stake
          FROM unnest(
            $1::int[],
            $2::bigint[],
            $3::smallint[],
            $4::bigint[],
            $5::bigint[],
            $6::bigint[],
            $7::bigint[],
            $8::bigint[]
          ) AS t(epoch_no, pool_id, block, stake, delegator, update_id, real_pledge, delegator_with_stake)
          ON CONFLICT (epoch_no, pool_id) DO UPDATE
          SET block = EXCLUDED.block,
              stake = EXCLUDED.stake,
              delegator = EXCLUDED.delegator,
              real_pledge = EXCLUDED.real_pledge,
              delegator_with_stake = EXCLUDED.delegator_with_stake
        `,
          [_epochs, _ids, _blocks, _stakes, _delegators, _updateIds, _realPledges, _delegatorWithStakes],
        );
      }
    }

    logger.trace("storage.insertTableData tx start");
    const txList = Object.keys(storage.adastatTx);
    if (txList.length > 0) {
      let insertAddressValues = [];

      const _ids = [],
        _types = [],
        _amounts = [],
        _tokens = [];

      const _taTxIds = [],
        _taAddressIds = [],
        _taAccountIds = [];

      for (const tx_id of txList) {
        if (tx_id in storage.adastatTxAddress) {
          for (const address of storage.adastatTxAddress[tx_id]) {
            _taTxIds.push(tx_id);
            _taAddressIds.push(addressId[address].address_id);
            _taAccountIds.push(addressId[address].account_id);
          }
        }

        _ids.push(tx_id);
        _types.push(storage.adastatTx[tx_id].type);
        _amounts.push(storage.adastatTx[tx_id].amount);
        _tokens.push(storage.adastatTx[tx_id].token);
      }

      await db.query(
        `
        INSERT INTO adastat_tx (id, type, amount, token)
        SELECT
            t.id,
            t.type,
            t.amount,
            t.token
          FROM unnest(
            $1::bigint[],
            $2::smallint[],
            $3::bigint[],
            $4::smallint[]
          ) AS t(id, type, amount, token)
        ON CONFLICT (id) DO NOTHING
      `,
        [_ids, _types, _amounts, _tokens],
      );

      if (_taTxIds.length > 0) {
        await db.query(
          `
          INSERT INTO adastat_tx_address (tx_id, address_id, account_id)
          SELECT
            t.tx_id, t.address_id, t.account_id
          FROM unnest(
            $1::bigint[],
            $2::bigint[],
            $3::bigint[]
          ) AS t(tx_id, address_id, account_id)
          ON CONFLICT (address_id, tx_id) DO NOTHING
        `,
          [_taTxIds, _taAddressIds, _taAccountIds],
        );
      }
    }

    logger.trace("storage.insertTableData utxo start");
    const utxoRemoveList = Object.keys(storage.adastatUtxoRemove);
    if (utxoRemoveList.length > 0) {
      const utxoRemoveValues = [];
      for (const tx_out_id of utxoRemoveList) {
        if (tx_out_id in storage.adastatUtxo) {
          delete storage.adastatUtxo[tx_out_id];
        } else {
          utxoRemoveValues.push(tx_out_id);
        }
      }

      if (utxoRemoveValues.length > 0) {
        await db.query(
          `
          DELETE FROM adastat_utxo
          WHERE tx_out_id = ANY($1::bigint[])
        `,
          [utxoRemoveValues],
        );
      }
    }

    const utxoList = Object.keys(storage.adastatUtxo);
    if (utxoList.length > 0) {
      const _addressIds = [],
        _txOutIds = [];

      for (const tx_out_id of utxoList) {
        const address_id = addressId[storage.adastatUtxo[tx_out_id]].address_id;

        _addressIds.push(address_id);
        _txOutIds.push(tx_out_id);
      }

      await db.query(
        `
        INSERT INTO adastat_utxo (address_id, tx_out_id)
        SELECT
            t.address_id,
            t.tx_out_id
        FROM unnest(
            $1::bigint[],
            $2::bigint[]
        ) AS t(address_id, tx_out_id)
        ON CONFLICT (address_id, tx_out_id) DO NOTHING
      `,
        [_addressIds, _txOutIds],
      );
    }

    logger.trace("storage.insertTableData block start");
    const blockList = Object.keys(storage.adastatBlock);
    if (blockList.length > 0) {
      const _ids = [],
        _txAmounts = [],
        _txFees = [],
        _txOutSums = [];

      for (const block_id of blockList) {
        _ids.push(block_id);
        _txAmounts.push(storage.adastatBlock[block_id].tx_amount);
        _txFees.push(storage.adastatBlock[block_id].tx_fee);
        _txOutSums.push(storage.adastatBlock[block_id].tx_out_sum);
      }

      await db.query(
        `
        INSERT INTO adastat_block (id, tx_amount, tx_fee, tx_out_sum)
        SELECT
          t.id, t.tx_amount, t.tx_fee, t.tx_out_sum
        FROM unnest(
            $1::bigint[],
            $2::bigint[],
            $3::bigint[],
            $4::bigint[]
          ) AS t(id, tx_amount, tx_fee, tx_out_sum)
        ON CONFLICT (id) DO UPDATE
        SET tx_amount = EXCLUDED.tx_amount,
            tx_fee = EXCLUDED.tx_fee,
            tx_out_sum = EXCLUDED.tx_out_sum
      `,
        [_ids, _txAmounts, _txFees, _txOutSums],
      );
    }

    logger.trace("storage.insertTableData epoch start", storage.lastParsedEpochNo);
    if (storage.lastParsedEpochNo >= 0) {
      const epoch = storage.epochs[storage.lastParsedEpochNo];

      epoch.byron += deltaByron;
      epoch.byron_with_amount += deltaByronWithAmount;

      await db.query(
        `
        UPDATE adastat_epoch
        SET tx_amount = $1,
          circulating_supply = $2,
          pool = $3,
          pool_with_block = $4,
          pool_with_stake = $5,
          stake = $6,
          delegator = $7,
          account = $8,
          pool_register = $9,
          block_with_tx = $10,
          byron = $11,
          byron_with_amount = $12,
          byron_amount = $13,
          account_with_stake = $14,
          delegator_with_stake = $15,
          token = $16,
          token_policy = $17,
          token_holder = $18,
          token_tx = $19,
          blockchain_size = $20
        WHERE no = $21
      `,
        [
          epoch.tx_amount,
          epoch.circulating_supply,
          epoch.pool,
          epoch.pool_with_block,
          epoch.pool_with_stake,
          epoch.stake,
          epoch.delegator,
          epoch.account,
          epoch.pool_register,
          epoch.block_with_tx,
          epoch.byron,
          epoch.byron_with_amount,
          epoch.byron_amount,
          epoch.account_with_stake,
          epoch.delegator_with_stake,
          epoch.token,
          epoch.token_policy,
          epoch.token_holder,
          epoch.token_tx,
          epoch.blockchain_size,
          epoch.no,
        ],
      );
    }

    await db.query("COMMIT");

    storage.initTableData();

    storage.lastParsedBlock = lastParsedBlock;
  } catch (e) {
    await db.query("ROLLBACK");

    throw e;
  }

  logger.trace("storage.insertTableData end");
};

storage.updatePoolsMetaData = async function (min_pool_id) {
  logger.log("storage.updatePoolsMetaData start");

  let res = await db.query(
    `
    SELECT ap.id AS pool_id, m.id AS meta_id, m.url AS meta_url, ENCODE(m.hash::bytea, 'hex'::text) AS meta_hash, ENCODE(ph.hash_raw::bytea, 'hex'::text) AS pool_hash
    FROM adastat_pool AS ap
    LEFT JOIN pool_hash AS ph ON ph.id = ap.id
    LEFT JOIN pool_update AS pu ON pu.id = ap.update_id
    LEFT JOIN pool_metadata_ref AS m ON m.id = pu.meta_id
    WHERE ap.id > $1
    ORDER BY ap.id ASC
  `,
    [min_pool_id > 0 ? min_pool_id : 0],
  );

  for (let row of res.rows) {
    if (storage.adastatPool[row.pool_id] && row.meta_url) {
      await storage.updatePoolMetaData(row.pool_id, row.meta_id, row.meta_url, row.meta_hash, 0);
    }
  }

  logger.log("storage.updatePoolsMetaData end");
};

storage.updatePoolMetaData = async function (pool_id, meta_id, meta_url, meta_hash, try_count) {
  logger.trace("storage.updatePoolMetaData start", pool_id, meta_id, meta_url);

  if (storage.poolMetaDataUpdateTimer[pool_id]) {
    clearTimeout(storage.poolMetaDataUpdateTimer[pool_id]);

    delete storage.poolMetaDataUpdateTimer[pool_id];
  }
  if (storage.poolExtendedMetaDataUpdateTimer[pool_id]) {
    clearTimeout(storage.poolExtendedMetaDataUpdateTimer[pool_id]);

    delete storage.poolExtendedMetaDataUpdateTimer[pool_id];
  }

  let pool = storage.adastatPool[pool_id],
    data,
    data_hash,
    valid_meta_hash;

  if (!pool) {
    return;
  }

  if (try_count == 0) {
    let res = await db.query(
      `
      SELECT ENCODE(hash::bytea, 'hex'::text) AS meta_hash, COALESCE(CONVERT_POOL_META(bytes), json) AS data
      FROM off_chain_pool_data
      WHERE pool_id = $1 AND pmr_id = $2
      ORDER BY id DESC
      LIMIT 1
    `,
      [pool_id, meta_id],
    );

    if (res.rows.length) {
      data = res.rows[0].data;
      data_hash = res.rows[0].meta_hash;
    }
  } else {
    data = await helper.getDataFromUrl(meta_url, 512);
  }

  if (!data && try_count++ < 4) {
    storage.poolMetaDataUpdateTimer[pool_id] = setTimeout(
      () => {
        storage.updatePoolMetaData(pool_id, meta_id, meta_url, meta_hash, try_count);
      },
      try_count * try_count * 60 * 1000,
    );

    return;
  } else if (data === "Metadata load error") {
    data = null;
  }

  if (data) {
    if (try_count != 0) {
      const tmpFile = config.metaFolder + "/pool." + pool_id + ".metadata.json";

      await app.fs.promises.writeFile(tmpFile, data);

      data_hash = await cardano.getMetaHash(tmpFile);
    }

    valid_meta_hash = data_hash == meta_hash ? 1 : 0;

    try {
      data = typeof data == "string" || data instanceof String ? JSON.parse(data) : data;
      data.name = (data.name || "").toString().trim();
      data.ticker = (data.ticker || "").toString().trim();
      data.description = (data.description || "").toString().trim();
      data.homepage = (data.homepage || "").toString().trim();
      data.extended = (data.extended || "").toString().trim();
    } catch (e) {
      data = null;
    }
  }

  if (!data) {
    data = {
      name: pool.name,
      ticker: pool.ticker,
      description: pool.description,
      homepage: pool.homepage,
      extended: pool.extended,
    };

    valid_meta_hash = 0;

    logger.warn("Metadata error", meta_url);
  }

  if (
    pool.name != data.name ||
    pool.ticker != data.ticker ||
    pool.description != data.description ||
    pool.homepage != data.homepage ||
    pool.extended != data.extended ||
    pool.valid_meta_hash != valid_meta_hash
  ) {
    pool.name = data.name;
    pool.ticker = data.ticker;
    pool.description = data.description;
    pool.homepage = data.homepage;
    pool.extended = data.extended;
    pool.valid_meta_hash = valid_meta_hash;
    if (pool.ticker != data.ticker) {
      pool.itn_ticker = 0;
    }

    db.query(
      `
      UPDATE adastat_pool
      SET name = $2,
          ticker = $3,
          description = $4,
          homepage = $5,
          extended = $6,
          valid_meta_hash = $7,
          itn_ticker = $8
      WHERE id = $1
    `,
      [pool.id, pool.name, pool.ticker, pool.description, pool.homepage, pool.extended, pool.valid_meta_hash, pool.itn_ticker],
    );
  }

  storage.updatePoolExtendedMetaData(pool_id, 0);

  pool.metadataTimestamp = Date.now();

  logger.trace("storage.updatePoolMetaData end");
};

storage.updatePoolExtendedMetaData = async function (pool_id, try_count) {
  if (storage.poolExtendedMetaDataUpdateTimer[pool_id]) {
    clearTimeout(storage.poolExtendedMetaDataUpdateTimer[pool_id]);

    delete storage.poolExtendedMetaDataUpdateTimer[pool_id];
  }

  let pool = storage.adastatPool[pool_id],
    extended_data,
    itn_ticker = 0;

  if (!pool) {
    return;
  }

  if (pool.extended) {
    extended_data = await helper.getDataFromUrl(pool.extended, 16384);
  } else {
    extended_data = Object.create(null);
  }

  if (!extended_data && try_count++ < 4) {
    storage.poolExtendedMetaDataUpdateTimer[pool_id] = setTimeout(
      () => {
        storage.updatePoolExtendedMetaData(pool_id, try_count);
      },
      try_count * try_count * 60 * 1000,
    );

    return;
  } else if (extended_data === "Metadata load error") {
    extended_data = null;
  }

  if (extended_data) {
    try {
      extended_data = JSON.parse(extended_data);
    } catch (e) {
      extended_data = null;
    }
  }

  if (extended_data && typeof extended_data == "object") {
    if (extended_data["adapools"]) {
      if (!extended_data["info"]) {
        extended_data.info = extended_data.adapools;
      }
      delete extended_data.adapools;
    }

    if (extended_data.itn?.owner && extended_data.itn?.witness) {
      data = await db.query(
        `
        SELECT ticker
        FROM adastat_pool_itn
        WHERE owner = $1
      `,
        [extended_data.itn.owner],
      );

      if (data.rows.length) {
        for (let row of data.rows) {
          if (pool.ticker == row.ticker) {
            let isItnTicker = await cardano.checkItnTicker(pool.pool_hash, extended_data.itn.owner, extended_data.itn.witness);
            if (isItnTicker) {
              itn_ticker = 1;
              break;
            }
          }
        }
      }
    }

    if (JSON.stringify(pool.extended_data) != JSON.stringify(extended_data) || pool.itn_ticker != itn_ticker) {
      pool.extended_data = extended_data;
      pool.itn_ticker = itn_ticker;

      db.query(
        `
        UPDATE adastat_pool
        SET extended_data = $2,
            itn_ticker = $3
        WHERE id = $1
      `,
        [pool.id, pool.extended_data, pool.itn_ticker],
      );
    }
  }
};

storage.updateCurrencyPrice = async function () {
  if (isParsingCurrencyPrice) {
    return;
  }

  isParsingCurrencyPrice = true;

  let prices = {
    aed: 0,
    ars: 0,
    aud: 0,
    bdt: 0,
    bhd: 0,
    bmd: 0,
    brl: 0,
    cad: 0,
    chf: 0,
    clp: 0,
    cny: 0,
    czk: 0,
    dkk: 0,
    eur: 0,
    gbp: 0,
    hkd: 0,
    huf: 0,
    idr: 0,
    ils: 0,
    inr: 0,
    jpy: 0,
    krw: 0,
    kwd: 0,
    lkr: 0,
    mmk: 0,
    mxn: 0,
    myr: 0,
    ngn: 0,
    nok: 0,
    nzd: 0,
    php: 0,
    pkr: 0,
    pln: 0,
    rub: 0,
    sar: 0,
    sek: 0,
    sgd: 0,
    thb: 0,
    try: 0,
    twd: 0,
    uah: 0,
    usd: 0,
    vef: 0,
    vnd: 0,
    zar: 0,
  };

  let utcDate = new Date().toISOString().slice(0, 10),
    json;

  if (utcDate != currencyDate) {
    if (currencyDate) {
      let coingeckoDate = currencyDate.split("-").reverse().join("-");

      json = await helper.getDataFromUrl("https://api.coingecko.com/api/v3/coins/cardano/history?date=" + coingeckoDate, 1048576);

      try {
        json = JSON.parse(json);

        for (let [currency, price] of Object.entries(json.market_data.current_price)) {
          if (currency in prices) {
            price = price > 0 ? +price.toFixed(6) : 0;

            prices[currency] = price;
          }
        }

        await db.query(
          `
          INSERT INTO adastat_price_history (date, prices)
          VALUES ($1, $2)
          ON CONFLICT (date) DO UPDATE
          SET prices = EXCLUDED.prices
        `,
          [currencyDate, prices],
        );
      } catch (e) {
        app.logger.warn(e);
      }
    }

    currencyDate = utcDate;
  }

  json = await helper.getDataFromUrl(
    "https://api.coingecko.com/api/v3/coins/cardano?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false",
    1048576,
  );

  try {
    json = JSON.parse(json);

    const _currencies = [],
      _prices = [];

    for (let [currency, price] of Object.entries(json.market_data.current_price)) {
      if (currency in prices) {
        price = price > 0 ? +price.toFixed(6) : 0;

        _currencies.push(currency);
        _prices.push(price);

        prices[currency] = price;
      }
    }

    if (_currencies.length) {
      await db.query(
        `
        INSERT INTO adastat_currency_price (currency, price)
        SELECT
          t.currency,
          t.price
        FROM unnest(
            $1::text[],
            $2::float8[]
          ) AS t(currency, price)
        ON CONFLICT (currency) DO UPDATE
        SET price = EXCLUDED.price
      `,
        [_currencies, _prices],
      );
    }

    await db.query(
      `
      INSERT INTO adastat_price_history (date, prices)
      VALUES ($1, $2)
      ON CONFLICT (date) DO UPDATE
      SET prices = EXCLUDED.prices
    `,
      [utcDate, prices],
    );
  } catch (e) {
    app.logger.warn(e);
  }

  isParsingCurrencyPrice = false;
};

storage.createBackup = async function (block_no) {
  logger.trace("storage.createBackup start");

  const backupEpochNo = storage.lastParsedEpochNo;
  if (backupEpochNo < 0) {
    return;
  }

  let dump_file;

  if (block_no) {
    dump_file = "block." + block_no;
  } else if (config.dbBackup.count > 0) {
    dump_file = backupEpochNo;
  }

  if (dump_file) {
    dump_file = `${config.dbBackup.folder}/adastat.${dump_file}.pgsql.gz`;
    try {
      await app.fs.promises.stat(dump_file);

      return;
    } catch (e) {
      if (e.code !== "ENOENT") {
        throw e;
      }
    }

    app.execFile(
      "pg_dump",
      [
        "-c",
        "-Fc",
        "-h",
        config.db.host,
        "-p",
        String(config.db.port),
        "-d",
        config.db.database,
        "-U",
        config.db.user,
        "-O",
        "-x",
        "-t",
        "adastat_*",
        "-T",
        "adastat_block_orphan",
        "-T",
        "adastat_bot_*",
        "-f",
        dump_file,
      ],
      {
        env: {
          ...process.env,
          PGPASSWORD: config.db.password,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          app.logger.error("Backup failed:", stderr);
        }
      },
    );
    // .unref();
  }

  if (!block_no) {
    const path = require("path");

    let dbBackupFiles = [];

    const fileList = await app.fs.promises.readdir(config.dbBackup.folder);
    for (let file of fileList) {
      let fileExt = path.extname(file),
        fileName = path.basename(file, fileExt);

      if (fileExt === ".gz") {
        if (fileName.substring(0, 14) === "adastat.block.") {
          await app.fs.promises.unlink(config.dbBackup.folder + "/" + file);
        } else if (file != "adastat." + backupEpochNo) {
          dbBackupFiles.push(file);
        }
      }
    }
    if (dbBackupFiles.length > config.dbBackup.count) {
      dbBackupFiles.sort((a, b) => b.localeCompare(a));
      for (let i = 0; i < dbBackupFiles.length; i++) {
        if (i >= config.dbBackup.count - 1) {
          await app.fs.promises.unlink(config.dbBackup.folder + "/" + dbBackupFiles[i]);
        }
      }
    }
  }

  logger.trace("storage.createBackup end");
};

storage.createNewEpoch = async function (newEpochNo) {
  logger.trace("storage.createNewEpoch start", newEpochNo);

  let res;

  const oldEpoch = storage.epochs[newEpochNo - 1],
    reward = newEpochNo > config.epochProtocol.shelley + 2 ? null : 0n;

  if (newEpochNo == config.epochProtocol.chang) {
    res = await db.query(
      `
        SELECT ad.account_id, ac.pool AS pool_id, ac.amount AS stake, SUM(ad.amount)::bigint AS amount
        FROM adastat_address AS ad
        LEFT JOIN adastat_account AS ac ON ac.id = ad.account_id
        WHERE ad.account_id > 0 AND LENGTH(ad.address) < $1
        GROUP BY ad.account_id, ac.pool, ac.amount
      `,
      [config.pointerAddressMaxLength],
    );

    const _accountIds = [],
      _accountAmounts = [],
      poolStake = Object.create(null);

    for (const { account_id, pool_id, stake, amount } of res.rows) {
      _accountIds.push(account_id);
      _accountAmounts.push(amount);

      const pool = storage.adastatPool[pool_id];

      if (pool) {
        if (!(pool_id in poolStake)) {
          poolStake[pool_id] = pool.stake;
        }

        pool.stake -= amount;
        if (oldEpoch) {
          oldEpoch.stake -= amount;
        }

        if (amount > 0 && amount == stake) {
          pool.delegator_with_stake--;
          if (oldEpoch) {
            oldEpoch.delegator_with_stake--;
          }
        }

        if (storage.poolOwner[account_id]?.has(pool_id)) {
          pool.real_pledge -= amount;
        }
      }
    }

    for (const [pool_id, stake] of Object.entries(poolStake)) {
      if (stake > 0 && storage.adastatPool[pool_id].stake == 0) {
        oldEpoch.pool_with_stake--;
      }
    }

    if (_accountIds.length) {
      await db.query(
        `
          UPDATE adastat_address
          SET account_id = NULL
          WHERE account_id > 0 AND LENGTH(address) < $1
        `,
        [config.pointerAddressMaxLength],
      );

      await db.query(
        `
        INSERT INTO adastat_account (id, amount)
        SELECT
          t.id,
          t.amount
        FROM unnest(
          $1::bigint[],
          $2::bigint[]
        ) AS t(id, amount)
        ON CONFLICT (id) DO UPDATE
        SET amount = adastat_account.amount - EXCLUDED.amount
      `,
        [_accountIds, _accountAmounts],
      );
    }
  }

  const newEpoch = {
    no: newEpochNo,
    tx_amount: 0n,
    circulating_supply: 0n,
    pool: 0,
    pool_with_block: 0,
    pool_with_stake: 0,
    pool_reward: 0n,
    delegator_reward: 0n,
    stake: 0n,
    delegator: 0n,
    account: 0n,
    reward: 0n,
    pool_register: 0,
    pool_retire: 0,
    orphaned_reward: 0n,
    block_with_tx: 0,
    byron: 0n,
    byron_with_amount: 0n,
    byron_amount: 0n,
    account_with_stake: 0n,
    delegator_with_stake: 0n,
    token: 0n,
    token_policy: 0n,
    token_holder: 0n,
    token_tx: 0,
    blockchain_size: 0n,
    holder_range: Object.create(null),
  };

  if (oldEpoch) {
    newEpoch.circulating_supply = oldEpoch.circulating_supply;
    newEpoch.pool = oldEpoch.pool;
    newEpoch.pool_with_stake = oldEpoch.pool_with_stake;
    newEpoch.stake = oldEpoch.stake;
    newEpoch.delegator = oldEpoch.delegator;
    newEpoch.account = oldEpoch.account;
    newEpoch.byron = oldEpoch.byron;
    newEpoch.byron_with_amount = oldEpoch.byron_with_amount;
    newEpoch.byron_amount = oldEpoch.byron_amount;
    newEpoch.account_with_stake = oldEpoch.account_with_stake;
    newEpoch.delegator_with_stake = oldEpoch.delegator_with_stake;
    newEpoch.token = oldEpoch.token;
    newEpoch.token_policy = oldEpoch.token_policy;
    newEpoch.token_holder = oldEpoch.token_holder;
    newEpoch.blockchain_size = oldEpoch.blockchain_size;
    newEpoch.holder_range = oldEpoch.holder_range;

    if (newEpochNo < config.epochProtocol.shelley) {
      // epoch boundary blocks
      res = await db.query(
        `
        SELECT size::bigint
        FROM block
        WHERE block_no IS NULL AND epoch_no = $1
        LIMIT 1
      `,
        [newEpochNo],
      );

      if (res.rows.length) {
        newEpoch.blockchain_size += res.rows[0].size;
      }
    }
  } else if (newEpochNo == 0) {
    // genesis
    res = await db.query(`
      SELECT SUM(amount)::bigint AS genesis_amount, COUNT(*)::bigint AS genesis_address, COUNT(*) FILTER(WHERE amount > 0)::bigint AS genesis_address_with_amount
      FROM adastat_address_byron
    `);

    newEpoch.circulating_supply = newEpoch.byron_amount = res.rows[0].genesis_amount;
    newEpoch.byron = res.rows[0].genesis_address;
    newEpoch.byron_with_amount = res.rows[0].genesis_address_with_amount || 0;
  }

  storage.epochs[newEpoch.no] = newEpoch;

  storage.poolWithReward = Object.create(null);

  storage.poolRetire = new Set();

  if (oldEpoch) {
    const poolOwnerUpdate = [],
      _epochs = [],
      _poolIds = [],
      _stakes = [],
      _delegators = [],
      _updateIds = [],
      _realPledges = [],
      _delegatorWithStakes = [];

    storage.rewardPoolOwner = storage._poolOwner;
    storage._poolOwner = Object.create(null);
    for (let account_id in storage.poolOwner) {
      if (storage.poolOwner[account_id]) {
        storage._poolOwner[account_id] = new Set(storage.poolOwner[account_id]);
      }
    }

    for (let pool_id in storage.adastatPool) {
      if (storage.adastatPool[pool_id]) {
        const pool = storage.adastatPool[pool_id];

        if (pool.retiring_epoch > 0 && pool.retiring_epoch + 3 < newEpoch.no) {
          for (let account_id of pool.owner) {
            if (account_id in storage.poolOwner) {
              storage.poolOwner[account_id].delete(pool.id);
              if (storage.poolOwner[account_id].size == 0) {
                delete storage.poolOwner[account_id];
              }
            }
          }
          delete storage.adastatPool[pool_id];
          continue;
        }

        pool.rewardData = {
          leader: {
            stake: 0n,
            reward: 0n,
          },
          member: {
            stake: 0n,
            reward: 0n,
          },
        };

        if (pool._block > 0 && pool.___real_pledge >= pool.___pledge) {
          storage.poolWithReward[pool_id] = [];
          pool.rewardMargin = parseFloat(pool.___margin);
          pool.rewardFixedCost = BigInt(pool.___fixed_cost);
          pool.rewardStake = pool.___stake;
        }

        pool.___real_pledge = pool.__real_pledge;
        pool.___pledge = pool.__pledge;
        pool.___margin = pool.__margin;
        pool.___fixed_cost = pool.__fixed_cost;
        pool.___stake = pool.__stake;

        pool.__real_pledge = pool._real_pledge;
        pool.__pledge = pool._pledge;
        pool.__margin = pool._margin;
        pool.__fixed_cost = pool._fixed_cost;
        pool.__stake = pool._stake;

        pool._stake = pool.stake;
        pool._real_pledge = pool.real_pledge;
        pool._pledge = pool.pledge;
        pool._margin = pool.margin;
        pool._fixed_cost = pool.fixed_cost;
        pool._stake = pool.stake;
        pool._delegator_with_stake = pool.delegator_with_stake;
        pool._block = pool.block;

        pool.block = 0;

        if (pool.retiring_epoch == newEpoch.no) {
          storage.poolRetire.add(pool.id);

          newEpoch.stake -= pool.stake;
          newEpoch.delegator -= pool.delegator;
          newEpoch.delegator_with_stake -= pool.delegator_with_stake;
          newEpoch.pool--;
          newEpoch.pool_retire++;
          if (pool.stake > 0) {
            newEpoch.pool_with_stake--;
          }

          pool.stake = 0n;
          pool.delegator = 0n;
          pool.delegator_with_stake = 0n;
          pool.real_pledge = 0n;
        }

        if (pool.update_id != pool.live_update_id && pool.retiring_epoch != newEpoch.no) {
          pool.update_id = pool.live_update_id;
          pool.margin = pool.live_margin;
          pool.fixed_cost = pool.live_fixed_cost;
          pool.pledge = pool.live_pledge;

          poolOwnerUpdate.push(pool.update_id);

          for (let account_id of pool.owner) {
            if (account_id in storage.poolOwner) {
              storage.poolOwner[account_id].delete(pool.id);
              if (storage.poolOwner[account_id].size == 0) {
                delete storage.poolOwner[account_id];
              }
            }
          }
          pool.owner = [];
          pool.real_pledge = 0n;
        } else {
          _epochs.push(newEpoch.no);
          _poolIds.push(pool.id);
          _stakes.push(pool.stake);
          _delegators.push(pool.delegator);
          _updateIds.push(pool.update_id);
          _realPledges.push(pool.real_pledge);
          _delegatorWithStakes.push(pool.delegator_with_stake);
        }
      }
    }

    if (poolOwnerUpdate.length > 0) {
      res = await db.query(
        `
        SELECT pu.hash_id AS pool_id, po.addr_id AS account_id, a.amount, a.pool
        FROM pool_update AS pu
        LEFT JOIN pool_owner AS po ON po.pool_update_id = pu.id
        LEFT JOIN adastat_account AS a ON a.id = po.addr_id
        WHERE pu.id = ANY($1::bigint[])
      `,
        [poolOwnerUpdate],
      );

      const poolIds = new Set();
      for (const row of res.rows) {
        if (storage.poolRetire.has(row.pool)) {
          row.pool = 0n;
        }
        storage.adastatPool[row.pool_id].owner.push(row.account_id);
        if (row.pool_id == row.pool) {
          storage.adastatPool[row.pool_id].real_pledge += row.amount;
        }

        if (!storage.poolOwner[row.account_id]) {
          storage.poolOwner[row.account_id] = new Set();
        }
        storage.poolOwner[row.account_id].add(row.pool_id);

        poolIds.add(row.pool_id);
      }

      for (let pool_id of poolIds) {
        const pool = storage.adastatPool[pool_id];

        _epochs.push(newEpoch.no);
        _poolIds.push(pool.id);
        _stakes.push(pool.stake);
        _delegators.push(pool.delegator);
        _updateIds.push(pool.update_id);
        _realPledges.push(pool.real_pledge);
        _delegatorWithStakes.push(pool.delegator_with_stake);
      }
    }

    if (_epochs.length) {
      await db.query(
        `
        INSERT INTO adastat_epoch_pool (epoch_no, pool_id, stake, delegator, update_id, real_pledge, delegator_with_stake)
        SELECT
          t.epoch_no,
          t.pool_id,
          t.stake,
          t.delegator,
          t.update_id,
          t.real_pledge,
          t.delegator_with_stake
        FROM unnest(
          $1::int[],
          $2::bigint[],
          $3::bigint[],
          $4::bigint[],
          $5::bigint[],
          $6::bigint[],
          $7::bigint[]
        ) AS t(epoch_no, pool_id, stake, delegator, update_id, real_pledge, delegator_with_stake)
        ON CONFLICT (epoch_no, pool_id) DO NOTHING
      `,
        [_epochs, _poolIds, _stakes, _delegators, _updateIds, _realPledges, _delegatorWithStakes],
      );
    }
  }

  db.query(
    `
    SELECT 'account' AS type,
    COUNT(*) FILTER (WHERE amount > 0                  AND amount <= 10000000)          AS "0",
    COUNT(*) FILTER (WHERE amount > 10000000           AND amount <= 100000000)         AS "1",
    COUNT(*) FILTER (WHERE amount > 100000000          AND amount <= 1000000000)        AS "2",
    COUNT(*) FILTER (WHERE amount > 1000000000         AND amount <= 10000000000)       AS "3",
    COUNT(*) FILTER (WHERE amount > 10000000000        AND amount <= 100000000000)      AS "4",
    COUNT(*) FILTER (WHERE amount > 100000000000       AND amount <= 1000000000000)     AS "5",
    COUNT(*) FILTER (WHERE amount > 1000000000000      AND amount <= 10000000000000)    AS "6",
    COUNT(*) FILTER (WHERE amount > 10000000000000     AND amount <= 100000000000000)   AS "7",
    COUNT(*) FILTER (WHERE amount > 100000000000000    AND amount <= 1000000000000000)  AS "8",
    COUNT(*) FILTER (WHERE amount > 1000000000000000   AND amount <= 10000000000000000) AS "9",
    COUNT(*) FILTER (WHERE amount > 10000000000000000)                                  AS "10"
    FROM "adastat_account"
    UNION ALL
    SELECT 'delegator' AS type,
    COUNT(*) FILTER (WHERE pool > 0 AND amount > 0                  AND amount <= 10000000)          AS "0",
    COUNT(*) FILTER (WHERE pool > 0 AND amount > 10000000           AND amount <= 100000000)         AS "1",
    COUNT(*) FILTER (WHERE pool > 0 AND amount > 100000000          AND amount <= 1000000000)        AS "2",
    COUNT(*) FILTER (WHERE pool > 0 AND amount > 1000000000         AND amount <= 10000000000)       AS "3",
    COUNT(*) FILTER (WHERE pool > 0 AND amount > 10000000000        AND amount <= 100000000000)      AS "4",
    COUNT(*) FILTER (WHERE pool > 0 AND amount > 100000000000       AND amount <= 1000000000000)     AS "5",
    COUNT(*) FILTER (WHERE pool > 0 AND amount > 1000000000000      AND amount <= 10000000000000)    AS "6",
    COUNT(*) FILTER (WHERE pool > 0 AND amount > 10000000000000     AND amount <= 100000000000000)   AS "7",
    COUNT(*) FILTER (WHERE pool > 0 AND amount > 100000000000000    AND amount <= 1000000000000000)  AS "8",
    COUNT(*) FILTER (WHERE pool > 0 AND amount > 1000000000000000   AND amount <= 10000000000000000) AS "9",
    COUNT(*) FILTER (WHERE pool > 0 AND amount > 10000000000000000)                                  AS "10"
    FROM "adastat_account"
    UNION ALL
    SELECT 'address' AS type,
    COUNT(*) FILTER (WHERE account_id IS NULL AND amount > 0                  AND amount <= 10000000)          AS "0",
    COUNT(*) FILTER (WHERE account_id IS NULL AND amount > 10000000           AND amount <= 100000000)         AS "1",
    COUNT(*) FILTER (WHERE account_id IS NULL AND amount > 100000000          AND amount <= 1000000000)        AS "2",
    COUNT(*) FILTER (WHERE account_id IS NULL AND amount > 1000000000         AND amount <= 10000000000)       AS "3",
    COUNT(*) FILTER (WHERE account_id IS NULL AND amount > 10000000000        AND amount <= 100000000000)      AS "4",
    COUNT(*) FILTER (WHERE account_id IS NULL AND amount > 100000000000       AND amount <= 1000000000000)     AS "5",
    COUNT(*) FILTER (WHERE account_id IS NULL AND amount > 1000000000000      AND amount <= 10000000000000)    AS "6",
    COUNT(*) FILTER (WHERE account_id IS NULL AND amount > 10000000000000     AND amount <= 100000000000000)   AS "7",
    COUNT(*) FILTER (WHERE account_id IS NULL AND amount > 100000000000000    AND amount <= 1000000000000000)  AS "8",
    COUNT(*) FILTER (WHERE account_id IS NULL AND amount > 1000000000000000   AND amount <= 10000000000000000) AS "9",
    COUNT(*) FILTER (WHERE account_id IS NULL AND amount > 10000000000000000)                                  AS "10"
    FROM "adastat_address"
    UNION ALL
    SELECT 'byron' AS type,
    COUNT(*) FILTER (WHERE amount > 0                  AND amount <= 10000000)          AS "0",
    COUNT(*) FILTER (WHERE amount > 10000000           AND amount <= 100000000)         AS "1",
    COUNT(*) FILTER (WHERE amount > 100000000          AND amount <= 1000000000)        AS "2",
    COUNT(*) FILTER (WHERE amount > 1000000000         AND amount <= 10000000000)       AS "3",
    COUNT(*) FILTER (WHERE amount > 10000000000        AND amount <= 100000000000)      AS "4",
    COUNT(*) FILTER (WHERE amount > 100000000000       AND amount <= 1000000000000)     AS "5",
    COUNT(*) FILTER (WHERE amount > 1000000000000      AND amount <= 10000000000000)    AS "6",
    COUNT(*) FILTER (WHERE amount > 10000000000000     AND amount <= 100000000000000)   AS "7",
    COUNT(*) FILTER (WHERE amount > 100000000000000    AND amount <= 1000000000000000)  AS "8",
    COUNT(*) FILTER (WHERE amount > 1000000000000000   AND amount <= 10000000000000000) AS "9",
    COUNT(*) FILTER (WHERE amount > 10000000000000000)                                  AS "10"
    FROM "adastat_address_byron"
  `,
  ).then((res) => {
    let holder_range = Object.create(null);

    for (let row of res.rows) {
      holder_range[row.type] = Object.create(null);
      for (let i = 0; i <= 10; i++) {
        holder_range[row.type][i] = parseInt(row[i]);
      }
    }

    storage.epochs[newEpoch.no].holder_range = holder_range;

    db.query(
      `
      UPDATE adastat_epoch
      SET holder_range = $2
      WHERE no = $1
    `,
      [newEpoch.no, holder_range],
    );
  });

  await db.query(
    `
    INSERT INTO adastat_epoch (no, circulating_supply, pool, pool_with_stake, stake, delegator, account, byron, byron_with_amount, byron_amount, account_with_stake, delegator_with_stake, pool_retire, token, token_policy, token_holder, pool_reward, delegator_reward, reward, orphaned_reward, blockchain_size, holder_range)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    ON CONFLICT (no) DO NOTHING
  `,
    [
      newEpoch.no,
      newEpoch.circulating_supply,
      newEpoch.pool,
      newEpoch.pool_with_stake,
      newEpoch.stake,
      newEpoch.delegator,
      newEpoch.account,
      newEpoch.byron,
      newEpoch.byron_with_amount,
      newEpoch.byron_amount,
      newEpoch.account_with_stake,
      newEpoch.delegator_with_stake,
      newEpoch.pool_retire,
      newEpoch.token,
      newEpoch.token_policy,
      newEpoch.token_holder,
      reward,
      reward,
      reward,
      reward,
      newEpoch.blockchain_size,
      newEpoch.holder_range,
    ],
  );

  storage.lastParsedEpochNo = newEpoch.no;

  logger.trace("storage.createNewEpoch end");
};

storage.parseRewardsForEpoch = async function (epochNo) {
  if (epochNo <= Math.max(config.epochProtocol.shelley, 2)) {
    return;
  }

  logger.trace("storage.getRewardsForEpoch start", epochNo);

  logger.log("Rewards parsing");

  const prevEpochNo = epochNo - 1,
    rewardEpochNo = epochNo - 2,
    accounts = Object.create(null),
    totalReward = {
      member: 0n,
      leader: 0n,
      reserves: 0n,
      treasury: 0n,
      refund: 0n,
      proposal_refund: 0n,
    },
    _accountIds = [],
    _accountRewards = [],
    __accountRewards = [];

  let res;

  storage.epochs[rewardEpochNo].reward = 0n;

  res = await db.query(
    `
    SELECT r.type, r.addr_id AS account_id, r.amount::bigint AS reward_amount, r.pool_id AS reward_pool, COALESCE(s.amount, 0)::bigint AS active_stake, a.amount AS account_amount, a.pool AS account_pool
    FROM (
        SELECT type, addr_id, amount, earned_epoch, pool_id
        FROM reward
        WHERE spendable_epoch = $1 AND amount > 0
            UNION ALL
        SELECT type, addr_id, amount, earned_epoch, 0 AS pool_id
        FROM reward_rest
        WHERE spendable_epoch = $1 AND amount > 0
    ) AS r
    LEFT JOIN epoch_stake AS s ON s.epoch_no = r.earned_epoch AND s.addr_id = r.addr_id AND s.pool_id = r.pool_id
    LEFT JOIN adastat_account AS a ON a.id = r.addr_id
  `,
    [epochNo],
  );

  for (let row of res.rows) {
    totalReward[row.type] += row.reward_amount;

    if (!accounts[row.account_id]) {
      accounts[row.account_id] = {
        reward_amount: {
          member: 0n,
          leader: 0n,
          reserves: 0n,
          treasury: 0n,
          refund: 0n,
          proposal_refund: 0n,
        },
        reward_pool: row.reward_pool,
        account_amount: row.account_amount,
        account_pool: storage.poolRetire.has(row.account_pool) ? 0n : row.account_pool,
        _account_pool: row.account_pool,
      };

      if (row.type == "member" || row.type == "leader") {
        storage.epochs[rewardEpochNo].reward++;
      }
    }
    accounts[row.account_id].reward_amount[row.type] += row.reward_amount;

    if (row.type == "member" || row.type == "leader") {
      if (row.reward_pool in storage.poolWithReward) {
        storage.adastatPool[row.reward_pool].rewardData[row.type].reward += row.reward_amount;
        storage.adastatPool[row.reward_pool].rewardData[row.type].stake += row.active_stake;
      } else {
        logger.error("poolWithReward", row);
        app.exit();
      }
    }
  }

  for (const account_id in accounts) {
    if (accounts[account_id]) {
      const account = accounts[account_id];

      account._reward_amount =
        account.reward_amount.member + account.reward_amount.leader + account.reward_amount.reserves + account.reward_amount.treasury;

      account.reward_amount = account._reward_amount + account.reward_amount.refund + account.reward_amount.proposal_refund;

      if (account.account_amount == 0) {
        if (account._reward_amount > 0) {
          storage.epochs[prevEpochNo].account_with_stake++;
          if (account._account_pool > 0) {
            storage.epochs[prevEpochNo].delegator_with_stake++;
            storage.adastatPool[account._account_pool]._delegator_with_stake++;
          }
        }
        if (account.reward_amount > 0) {
          storage.epochs[epochNo].account_with_stake++;
          if (account.account_pool > 0) {
            storage.epochs[epochNo].delegator_with_stake++;
            storage.adastatPool[account.account_pool].delegator_with_stake++;
          }
        }
      }

      if (account._account_pool > 0) {
        if (storage.adastatPool[account._account_pool]._stake == 0 && account._reward_amount > 0) {
          storage.epochs[prevEpochNo].pool_with_stake++;
        }

        storage.adastatPool[account._account_pool]._stake += account._reward_amount;

        storage.epochs[prevEpochNo].stake += account._reward_amount;

        if (account_id in storage._poolOwner && storage._poolOwner[account_id].has(account._account_pool)) {
          storage.adastatPool[account._account_pool]._real_pledge += account._reward_amount;
        }

        storage.adastatPool[account._account_pool].need_update = true;
      }

      if (account.account_pool > 0) {
        if (storage.adastatPool[account.account_pool].stake == 0 && account.reward_amount > 0) {
          storage.epochs[epochNo].pool_with_stake++;
        }

        storage.adastatPool[account.account_pool].stake += account.reward_amount;

        storage.epochs[epochNo].stake += account.reward_amount;

        if (account_id in storage.poolOwner && storage.poolOwner[account_id].has(account.account_pool)) {
          storage.adastatPool[account.account_pool].real_pledge += account.reward_amount;
        }

        storage.adastatPool[account.account_pool].need_update = true;
      }

      _accountIds.push(account_id);
      _accountRewards.push(account.reward_amount);
      __accountRewards.push(account._reward_amount);
    }
  }

  await db.query(`
    UPDATE adastat_account
    SET active_amount = snapshot_amount,
        active_pool = snapshot_pool,
        snapshot_amount = amount,
        snapshot_pool = pool
  `);

  if (_accountIds.length > 0) {
    await db.query(
      `
      INSERT INTO adastat_account (id, amount, reward, total_reward, snapshot_amount)
      SELECT
        t.id,
        t.amount,
        t.reward,
        t.total_reward,
        t.snapshot_amount
      FROM unnest(
        $1::bigint[],
        $2::bigint[],
        $2::bigint[],
        $3::bigint[],
        $3::bigint[]
      ) AS t(id, amount, reward, total_reward, snapshot_amount)
      ON CONFLICT (id) DO UPDATE
      SET amount = adastat_account.amount + EXCLUDED.amount,
          reward = adastat_account.reward + EXCLUDED.reward,
          total_reward = adastat_account.total_reward + EXCLUDED.total_reward,
          snapshot_amount = adastat_account.snapshot_amount + EXCLUDED.snapshot_amount
    `,
      [_accountIds, _accountRewards, __accountRewards],
    );
  }

  let poolWithRewardKeys = Object.keys(storage.poolWithReward);
  if (poolWithRewardKeys.length > 0) {
    const epochRewards = new Object(null);
    res = await db.query(
      `
      SELECT r.addr_id AS account_id, r.pool_id
      FROM reward r
      WHERE r.earned_epoch = $1 AND r.pool_id = ANY($2::bigint[])
    `,
      [rewardEpochNo, poolWithRewardKeys],
    );
    for (let row of res.rows) {
      epochRewards[row.account_id + "_" + row.pool_id] = true;
    }

    res = await db.query(
      `
      SELECT s.addr_id AS account_id, s.pool_id, s.amount::bigint AS stake
      FROM epoch_stake s
      WHERE s.epoch_no = $1 AND s.pool_id = ANY($2::bigint[]) AND s.amount > 0
    `,
      [rewardEpochNo, poolWithRewardKeys],
    );

    for (let row of res.rows) {
      if (epochRewards[row.account_id + "_" + row.pool_id]) {
        continue;
      }

      if (storage.adastatPool[row.pool_id].rewardMargin < 1) {
        if (
          !storage.rewardPoolOwner[row.account_id] ||
          !storage.rewardPoolOwner[row.account_id].has(row.pool_id) ||
          storage.adastatPool[row.pool_id].rewardData.leader.reward == 0
        ) {
          storage.poolWithReward[row.pool_id].push({
            account_id: row.account_id,
            stake: row.stake,
          });
        }
      }
    }
  }

  const _rewardEpochs = [],
    _rewardPoolIds = [],
    _rewardPoolRewards = [],
    _rewardDelegatorRewards = [],
    _rewardOrphanedRewards = [],
    _epochs = [],
    _poolIds = [],
    _poolStakes = [],
    _poolRealPledges = [],
    _poolDelegatorWithStakes = [];

  for (let pool_id in storage.adastatPool) {
    if (storage.adastatPool[pool_id]) {
      let pool = storage.adastatPool[pool_id];

      if (pool_id in storage.poolWithReward) {
        pool.pool_reward = 0n;
        pool.delegator_reward = 0n;
        pool.orphaned_reward = 0n;

        let rewardPot = pool.rewardData.leader.reward + pool.rewardData.member.reward;

        if (storage.poolWithReward[pool_id].length > 0) {
          if (pool.rewardData.member.reward > 0) {
            pool.delegator_reward = pool.rewardData.member.reward;

            let ros = Number(pool.rewardData.member.reward) / Number(pool.rewardData.member.stake);
            for (let account of storage.poolWithReward[pool_id]) {
              let orphaned_reward = BigInt(parseInt(Number(account.stake) * ros));
              pool.orphaned_reward += orphaned_reward;
              pool.delegator_reward += orphaned_reward;
            }

            if (pool.rewardData.leader.reward > 0) {
              rewardPot += pool.orphaned_reward;

              let expectedPoolReward =
                pool.rewardFixedCost + BigInt(parseInt(Number(rewardPot - pool.rewardFixedCost) * pool.rewardMargin));

              if (expectedPoolReward > pool.rewardData.leader.reward) {
                pool.pool_reward = pool.rewardData.leader.reward;
              } else {
                pool.pool_reward = expectedPoolReward;
              }
            } else {
              pool.orphaned_reward += pool.rewardFixedCost + BigInt(parseInt(Number(pool.delegator_reward) * pool.rewardMargin));

              rewardPot += pool.orphaned_reward;
            }

            pool.delegator_reward = rewardPot - pool.pool_reward;
          } else if (pool.rewardData.leader.reward > 0) {
            if (pool.rewardMargin == 0 && pool.rewardData.leader.reward > pool.rewardFixedCost) {
              pool.pool_reward = pool.rewardFixedCost;

              let ros = Number(pool.rewardData.leader.reward - pool.rewardFixedCost) / Number(pool.rewardData.leader.stake);

              pool.delegator_reward = BigInt(parseInt(Number(pool.rewardStake) * ros));

              pool.orphaned_reward = pool.delegator_reward;
            } else {
              pool.pool_reward = pool.rewardData.leader.reward;
            }

            if (pool.rewardData.leader.reward > pool.rewardFixedCost) {
              logger.warn("Orphan pool rewards", pool_id);
            }
          }
        } else {
          if (pool.rewardMargin < 1) {
            let expectedPoolReward = pool.rewardFixedCost + BigInt(parseInt(Number(rewardPot - pool.rewardFixedCost) * pool.rewardMargin));

            if (expectedPoolReward > pool.rewardData.leader.reward) {
              pool.pool_reward = pool.rewardData.leader.reward;
            } else {
              pool.pool_reward = expectedPoolReward;
            }
          } else {
            pool.pool_reward = pool.rewardData.leader.reward;
          }

          pool.delegator_reward = rewardPot - pool.pool_reward;
        }

        _rewardEpochs.push(rewardEpochNo);
        _rewardPoolIds.push(pool_id);
        _rewardPoolRewards.push(pool.pool_reward);
        _rewardDelegatorRewards.push(pool.delegator_reward);
        _rewardOrphanedRewards.push(pool.orphaned_reward);

        storage.epochs[rewardEpochNo].pool_reward += pool.pool_reward;
        storage.epochs[rewardEpochNo].delegator_reward += pool.delegator_reward;
        storage.epochs[rewardEpochNo].orphaned_reward += pool.orphaned_reward;
      }

      if (pool.need_update) {
        _epochs.push(prevEpochNo, epochNo);
        _poolIds.push(pool_id, pool_id);
        _poolStakes.push(pool._stake, pool.stake);
        _poolRealPledges.push(pool._real_pledge, pool.real_pledge);
        _poolDelegatorWithStakes.push(pool._delegator_with_stake, pool.delegator_with_stake);

        pool.need_update = false;
      }
    }
  }
  if (_rewardEpochs.length > 0) {
    await db.query(
      `
      INSERT INTO adastat_pool (id, pool_reward, delegator_reward, orphaned_reward)
      SELECT
        t.id,
        t.pool_reward,
        t.delegator_reward,
        t.orphaned_reward
      FROM unnest(
        $1::bigint[],
        $2::bigint[],
        $3::bigint[],
        $4::bigint[]
      ) AS t(id, pool_reward, delegator_reward, orphaned_reward)
      ON CONFLICT (id) DO UPDATE
      SET pool_reward = adastat_pool.pool_reward + EXCLUDED.pool_reward,
          delegator_reward = adastat_pool.delegator_reward + EXCLUDED.delegator_reward,
          orphaned_reward = adastat_pool.orphaned_reward + EXCLUDED.orphaned_reward,
          update_block = $5
    `,
      [_rewardPoolIds, _rewardPoolRewards, _rewardDelegatorRewards, _rewardOrphanedRewards, storage.lastParsedBlock.block_no],
    );

    await db.query(
      `
      INSERT INTO adastat_epoch_pool (epoch_no, pool_id, pool_reward, delegator_reward, orphaned_reward)
      SELECT
        t.epoch_no,
        t.pool_id,
        t.pool_reward,
        t.delegator_reward,
        t.orphaned_reward
      FROM unnest(
        $1::bigint[],
        $2::bigint[],
        $3::bigint[],
        $4::bigint[],
        $5::bigint[]
      ) AS t(epoch_no, pool_id, pool_reward, delegator_reward, orphaned_reward)
      ON CONFLICT (epoch_no, pool_id) DO UPDATE
      SET pool_reward = EXCLUDED.pool_reward,
          delegator_reward = EXCLUDED.delegator_reward,
          orphaned_reward = EXCLUDED.orphaned_reward
    `,
      [_rewardEpochs, _rewardPoolIds, _rewardPoolRewards, _rewardDelegatorRewards, _rewardOrphanedRewards],
    );
  }
  if (_epochs.length > 0) {
    await db.query(
      `
      INSERT INTO adastat_epoch_pool (epoch_no, pool_id, stake, real_pledge, delegator_with_stake)
      SELECT
        t.epoch_no,
        t.pool_id,
        t.stake,
        t.real_pledge,
        t.delegator_with_stake
        FROM unnest(
          $1::int[],
          $2::bigint[],
          $3::bigint[],
          $4::bigint[],
          $5::bigint[]
        ) AS t(epoch_no, pool_id, stake, real_pledge, delegator_with_stake)
      ON CONFLICT (epoch_no, pool_id) DO UPDATE
      SET stake = EXCLUDED.stake,
          real_pledge = EXCLUDED.real_pledge,
          delegator_with_stake = EXCLUDED.delegator_with_stake
    `,
      [_epochs, _poolIds, _poolStakes, _poolRealPledges, _poolDelegatorWithStakes],
    );
  }

  const totalRewardAmount = totalReward.member + totalReward.leader + totalReward.reserves + totalReward.treasury;

  storage.epochs[prevEpochNo].circulating_supply += totalRewardAmount;
  storage.epochs[epochNo].circulating_supply += totalRewardAmount + totalReward.refund + totalReward.proposal_refund;

  await db.query(
    `
    INSERT INTO adastat_epoch (no, circulating_supply, pool_with_stake, stake, account_with_stake, delegator_with_stake)
    SELECT
      t.no,
      t.circulating_supply,
      t.pool_with_stake,
      t.stake,
      t.account_with_stake,
      t.delegator_with_stake
      FROM unnest(
        $1::int[],
        $2::bigint[],
        $3::int[],
        $4::bigint[],
        $5::bigint[],
        $6::bigint[]
      ) AS t(no, circulating_supply, pool_with_stake, stake, account_with_stake, delegator_with_stake)
    ON CONFLICT (no) DO UPDATE
    SET circulating_supply = EXCLUDED.circulating_supply,
        pool_with_stake = EXCLUDED.pool_with_stake,
        stake = EXCLUDED.stake,
        account_with_stake = EXCLUDED.account_with_stake,
        delegator_with_stake = EXCLUDED.delegator_with_stake
  `,
    [
      [prevEpochNo, epochNo],
      [storage.epochs[prevEpochNo].circulating_supply, storage.epochs[epochNo].circulating_supply],
      [storage.epochs[prevEpochNo].pool_with_stake, storage.epochs[epochNo].pool_with_stake],
      [storage.epochs[prevEpochNo].stake, storage.epochs[epochNo].stake],
      [storage.epochs[prevEpochNo].account_with_stake, storage.epochs[epochNo].account_with_stake],
      [storage.epochs[prevEpochNo].delegator_with_stake, storage.epochs[epochNo].delegator_with_stake],
    ],
  );

  await db.query(
    `
    UPDATE adastat_epoch
    SET pool_reward = $1,
        delegator_reward = $2,
        orphaned_reward = $3,
        reward = $4
    WHERE no = $5
  `,
    [
      storage.epochs[rewardEpochNo].pool_reward,
      storage.epochs[rewardEpochNo].delegator_reward,
      storage.epochs[rewardEpochNo].orphaned_reward,
      storage.epochs[rewardEpochNo].reward,
      rewardEpochNo,
    ],
  );

  logger.trace("storage.getRewardsForEpoch end");
};

module.exports = storage;
