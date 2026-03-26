const { execFile } = require("child_process"),
  execFilePromisify = require("util").promisify(execFile);

let logger, config, cardano, db, dbPool, storage, dbSubscriber, helper;

// BigInt JSON.stringify() hack
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const app = {
  isProceed: false,
  lastQuery: Object.create(null),
  sleep: (ms) => {
    return new Promise((r) => setTimeout(r, ms));
  },
  unblockEventLoop: () => {
    return new Promise((r) => setImmediate(r));
  },
  fs: require("fs"),
  execFile: execFile,
  execFilePromisify: async (file, args) => {
    try {
      const { stdout } = await execFilePromisify(file, args, {
        timeout: 10_000,
      });

      return stdout.trim();
    } catch (err) {}
  },
};

app.proceedQueue = async function () {
  let nextBlocks = await storage.getNextBlocks();

  if (nextBlocks.length <= 1) {
    return;
  }

  if (storage.lastParsedBlock.id > 0) {
    const nextBlock = nextBlocks.shift();

    if (
      storage.lastParsedBlock.id != nextBlock.id ||
      storage.lastParsedBlock.hash != nextBlock.hash ||
      storage.lastParsedBlock.epoch_no != nextBlock.epoch_no ||
      storage.lastParsedBlock.slot_no != nextBlock.slot_no ||
      storage.lastParsedBlock.block_no != nextBlock.block_no ||
      storage.lastParsedBlock.slot_leader_id != nextBlock.slot_leader_id
    ) {
      logger.error("The last saved block does not match the block from the DB-Sync");
      logger.error("storage.lastParsedBlock", storage.lastParsedBlock);
      logger.error("nextBlock", nextBlock);

      app.exit();
    }
  }

  let lastParsedBlock = Object.assign({}, storage.lastParsedBlock);

  for (const nextBlock of nextBlocks) {
    if (nextBlock.epoch_no === null) {
      // Genesis
      nextBlock.epoch_no = -1;
      nextBlock.block_no = -1;
    }

    if (nextBlock.epoch_no != storage.lastEpochNo && !(nextBlock.block_no % 1000)) {
      app.logger.debug(`Epoch ${nextBlock.epoch_no}, slot ${nextBlock.epoch_slot_no}, block ${nextBlock.block_no}`);
    }

    if (nextBlock.epoch_no > lastParsedBlock.epoch_no) {
      // New epoch starts

      logger.log("Epoch no", nextBlock.epoch_no);

      storage.blockInEpoch = 0;

      if (Object.keys(storage.adastatBlock).length > 0) {
        await storage.insertTableData(lastParsedBlock);
      }

      if (
        (nextBlock.epoch_no >= config.epochProtocol.shelley && storage.lastParsedBlock.epoch_no % 10 == 0) ||
        (nextBlock.epoch_no >= config.epochProtocol.alonzo && storage.lastParsedBlock.epoch_no % 5 == 0) ||
        nextBlock.epoch_no == storage.lastEpochNo
      ) {
        storage.createBackup();
      }

      let res;

      if (!storage.epochs[nextBlock.epoch_no]) {
        if (nextBlock.epoch_no == storage.lastEpochNo - 1) {
          await storage.updatePoolsMetaData();
        }

        res = await db.query(
          `
          SELECT no
          FROM epoch
          WHERE no = $1
        `,
          [nextBlock.epoch_no],
        );

        if (!res.rows.length) {
          logger.log(`Waiting for Epoch ${nextBlock.epoch_no} creation`);
          return;
        }

        try {
          await db.query("BEGIN");

          await storage.createNewEpoch(nextBlock.epoch_no);

          await storage.parseRewardsForEpoch(nextBlock.epoch_no);

          if (storage.poolRetire.size > 0) {
            await db.query(
              `
              UPDATE adastat_account
              SET retired_pool = pool,
                  pool = 0
              WHERE pool = ANY($1::bigint[])
            `,
              [Array.from(storage.poolRetire)],
            );
          }

          await db.query("COMMIT");
        } catch (e) {
          await db.query("ROLLBACK");

          throw e;
        }
      }

      if (nextBlock.epoch_no > config.epochProtocol.mary + 1) {
        logger.log("Data checking");

        let error = false;

        // Byron check
        res = await db.query(
          `
          SELECT 'address_byron' AS table, count(*) AS byron, COUNT(*) filter (where amount > 0) AS byron_with_amount, SUM(amount) AS byron_amount
          FROM adastat_address_byron
          UNION ALL
          SELECT 'epoch' AS table, byron, byron_with_amount, byron_amount
          FROM adastat_epoch
          WHERE no = $1
        `,
          [nextBlock.epoch_no],
        );

        if (
          res.rows[0].byron != res.rows[1].byron ||
          res.rows[0].byron_with_amount != res.rows[1].byron_with_amount ||
          res.rows[0].byron_amount != res.rows[1].byron_amount
        ) {
          logger.error("Byron check");
          logger.debug(res.rows);
          logger.debug(app.lastQuery);
          error = true;
        }

        // Shelley check
        res = await db.query(
          `
          SELECT 'account' AS table, count(*) AS account, COUNT(*) filter (where pool > 0) AS delegator, COUNT(*) filter (where amount > 0) AS account_with_stake, COUNT(*) filter (where amount > 0 AND pool > 0) AS delegator_with_stake, COALESCE(SUM(amount) + (SELECT SUM(amount) FROM adastat_address WHERE account_id IS NULL), 0) AS amount, COALESCE(SUM(amount) filter (where amount > 0 AND pool > 0), 0) AS stake, 0 AS pool_with_block, 0 AS pool_with_stake
          FROM adastat_account
          UNION ALL
          SELECT 'epoch' AS table, account, delegator, account_with_stake, delegator_with_stake, circulating_supply-byron_amount as amount, stake, pool_with_block, pool_with_stake
          FROM adastat_epoch
          WHERE no = $1
          UNION ALL
          SELECT 'epoch_pool' AS table, 0 as account, COALESCE(SUM(delegator), 0) AS delegator, 0 as account_with_stake, COALESCE(SUM(delegator_with_stake), 0) AS delegator_with_stake, 0 as amount, COALESCE(SUM(stake), 0) AS stake, COUNT(*) FILTER (WHERE block > 0) as pool_with_block, COUNT(*) FILTER (WHERE stake > 0) as pool_with_stake
          FROM adastat_epoch_pool
          WHERE epoch_no = $1
        `,
          [nextBlock.epoch_no],
        );

        if (
          res.rows[0].account != res.rows[1].account ||
          res.rows[0].delegator != res.rows[1].delegator ||
          res.rows[1].delegator != res.rows[2].delegator ||
          res.rows[0].account_with_stake != res.rows[1].account_with_stake ||
          res.rows[0].delegator_with_stake != res.rows[1].delegator_with_stake ||
          res.rows[1].delegator_with_stake != res.rows[2].delegator_with_stake ||
          res.rows[0].amount != res.rows[1].amount ||
          res.rows[0].stake != res.rows[1].stake ||
          res.rows[1].stake != res.rows[2].stake ||
          res.rows[1].pool_with_block != res.rows[2].pool_with_block ||
          res.rows[1].pool_with_stake != res.rows[2].pool_with_stake
        ) {
          logger.error("Shelley check");
          logger.debug(res.rows);
          logger.debug(app.lastQuery);
          error = true;
        }

        // Epoch Stake check
        res = await db.query(
          `
          SELECT 'stake' AS table, SUM(amount) AS stake, COUNT(*) AS delegator
          FROM epoch_stake
          WHERE epoch_no = $1
          UNION ALL
          SELECT 'epoch' AS table, stake, delegator
          FROM adastat_epoch
          WHERE no = $2
          UNION ALL
          SELECT 'epoch_pool' AS table, COALESCE(SUM(stake), 0) AS stake, COALESCE(SUM(delegator), 0) AS delegator
          FROM adastat_epoch_pool
          WHERE epoch_no = $2
        `,
          [nextBlock.epoch_no - 1, nextBlock.epoch_no - 3],
        );

        if (res.rows[0].stake !== null) {
          if (
            res.rows[0].stake != res.rows[1].stake ||
            res.rows[1].stake != res.rows[2].stake ||
            res.rows[0].delegator != res.rows[1].delegator ||
            res.rows[1].delegator != res.rows[2].delegator
          ) {
            logger.error("Epoch Stake check");
            logger.debug(res.rows);
            logger.debug(app.lastQuery);
            error = true;
          }
        } else {
          logger.debug("The ledger stake is null, skip the stake check");
        }

        // Reward check
        res = await db.query(
          `
          SELECT 'epoch' AS table, pool_reward, delegator_reward, orphaned_reward
          FROM adastat_epoch
          WHERE no = $1
          UNION ALL
          SELECT 'epoch_pool' AS table, COALESCE(SUM(pool_reward), 0) AS pool_reward, COALESCE(SUM(delegator_reward), 0) AS delegator_reward, COALESCE(SUM(orphaned_reward), 0) AS orphaned_reward
          FROM adastat_epoch_pool
          WHERE epoch_no = $1
        `,
          [nextBlock.epoch_no - 2],
        );

        if (
          res.rows[0].pool_reward != res.rows[1].pool_reward ||
          res.rows[0].delegator_reward != res.rows[1].delegator_reward ||
          res.rows[0].orphaned_reward != res.rows[1].orphaned_reward
        ) {
          logger.error("Reward check");
          logger.debug(res.rows);
          logger.debug(app.lastQuery);
          error = true;
        }

        if (nextBlock.epoch_no > config.epochProtocol.mary) {
          // Token check
          res = await db.query(
            `
            SELECT 'ma' AS type, count(*) AS token, count(DISTINCT multi_asset.policy) AS token_policy
            FROM adastat_multi_asset
            LEFT JOIN multi_asset ON multi_asset.id = adastat_multi_asset.id
            UNION ALL
            SELECT 'epoch' AS type, token, token_policy
            FROM adastat_epoch
            WHERE no = $1
          `,
            [nextBlock.epoch_no],
          );

          if (res.rows[0].token != res.rows[1].token || res.rows[0].token_policy != res.rows[1].token_policy) {
            logger.error("Token check");
            logger.debug(res.rows);
            logger.debug(app.lastQuery);
            error = true;
          }
        }

        if (error) {
          app.exit();
        } else {
          logger.log("All checks have been passed");
        }
      }
    } else if (storage.blockInEpoch == 5000 || storage.blockInEpoch == 10000 || storage.blockInEpoch == 15000) {
      if (storage.lastParsedBlock.epoch_no == storage.lastEpochNo) {
        if (Object.keys(storage.adastatBlock).length > 0) {
          await storage.insertTableData(lastParsedBlock);
        }
        storage.createBackup(lastParsedBlock.block_no);
      }
    }

    if (storage.addressShelleyCount > 20000 || storage.addressByronCount > 20000 || storage.multiAssetCount > 20000) {
      logger.debug("Epoch %s, Block %s, Block in epoch %s", lastParsedBlock.epoch_no, lastParsedBlock.block_no, storage.blockInEpoch);
      await storage.insertTableData(lastParsedBlock);
    }

    storage.blockInEpoch++;

    if (nextBlock.pool_hash_id > 0) {
      let pool = storage.adastatPool[nextBlock.pool_hash_id];

      pool.total_block++;
      pool.block++;
      if (pool.block == 1) {
        pool.epoch_with_block++;
      }
      pool.need_update = true;

      if (nextBlock.block_no - storage.lastParsedBlock.block_no < 10) {
        if (Date.now() - pool.metadataTimestamp > 3 * 60 * 60 * 1000) {
          // 3 hours cache
          if (pool.meta_url) {
            storage.updatePoolMetaData(pool.id, pool.meta_id, pool.meta_url, pool.meta_hash, 0);
          }
        }
      }
    }

    storage.adastatBlock[nextBlock.id] = {
      block_no: nextBlock.block_no,
      tx_amount: 0n,
      tx_fee: 0n,
      tx_out_sum: 0n,
    };

    if (nextBlock.tx_count > 0) {
      let {
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
      } = await storage.getBlockTxData(nextBlock.id, nextBlock.epoch_no);

      let deltaByronAmount = 0n,
        deltaCirculatingSupply = 0n;

      if (nextBlock.epoch_no >= config.epochProtocol.shelley) {
        for (let txInOut of txsInOut) {
          txInOut.amount = BigInt(txInOut.amount);

          deltaCirculatingSupply += txInOut.amount;

          if (!storage.adastatTx[txInOut.tx_id]) {
            storage.adastatTx[txInOut.tx_id] = {
              type: 0,
              amount: 0n,
              token: 0,
              amountChange: Object.create(null),
              tokenChange: new Set(),
            };
          }

          let addressInfo;
          if (!txInOut.account_id) {
            addressInfo = cardano.getAddressInfo(txInOut.address);
          }
          if (txInOut.account_id || addressInfo.type != "byron") {
            if (txInOut.address == "_reward_withdrawal_") {
              if (txInOut.account_id > 0) {
                storage.adastatTx[txInOut.tx_id].type = storage.adastatTx[txInOut.tx_id].type | config.txType["withdrawal"];
                storage.addAccount(txInOut.account_id, txInOut.tx_id, txInOut.amount, txInOut.amount, null);
              } else {
                logger.error("There are no account_id for reward address", txInOut.tx_id);
                app.exit();
              }
            } else {
              if (txInOut.address.length < config.pointerAddressMaxLength && nextBlock.epoch_no >= config.epochProtocol.chang) {
                // old pointer address
                txInOut.account_id = null;
              }
              storage.addAddressShelley(txInOut.address, txInOut.account_id, txInOut.tx_id, txInOut.amount);
            }
          } else {
            // byron
            storage.addAddressByron(txInOut.address, txInOut.tx_id, txInOut.amount);

            deltaByronAmount += txInOut.amount;
          }

          let accountId = txInOut.account_id || "_" + txInOut.address;
          if (!storage.adastatTx[txInOut.tx_id].amountChange[accountId]) {
            storage.adastatTx[txInOut.tx_id].amountChange[accountId] = 0n;
          }
          storage.adastatTx[txInOut.tx_id].amountChange[accountId] += txInOut.amount;
        }

        let txCert = [].concat(stakeRegistrationCert, delegationCert, stakeDeregistrationCert, poolUpdateCert, poolRetireCert);
        txCert.sort((a, b) => {
          if (a.tx_id == b.tx_id) {
            return a.cert_index - b.cert_index;
          }
          return a.tx_id > b.tx_id ? 1 : -1;
        });
        for (let cert of txCert) {
          storage.adastatTx[cert.tx_id].type = storage.adastatTx[cert.tx_id].type | config.txType[cert.type];

          switch (cert.type) {
            case "stake_registration":
              storage.addAccount(cert.account_id, null, 0n, 0n, 0, cert.tx_id);
              break;
            case "delegation":
              storage.adastatDelegation[cert.id] = {
                from_pool: cert.account_pool_id,
                amount: cert.amount || 0n,
              };
              if (cert.account_id in storage.adastatAccount) {
                for (let txData of storage.adastatAccount[cert.account_id].txData) {
                  if (txData.tx_id < cert.tx_id) {
                    if (txData.pool > 0) {
                      storage.adastatDelegation[cert.id].from_pool = txData.pool;
                    } else if (txData.pool !== null) {
                      storage.adastatDelegation[cert.id].from_pool = null;
                    }
                    storage.adastatDelegation[cert.id].amount += txData.amount;
                  }
                }
              }
              storage.addAccount(cert.account_id, null, 0n, 0n, cert.pool_id, cert.tx_id);
              if (cert.account_retired_pool_id) {
                storage.adastatAccountRetiredPool.add(cert.account_id);
              }
              break;
            case "stake_deregistration":
              storage.adastatStakeDeregistration[cert.id] = {
                from_pool: cert.account_pool_id,
                amount: cert.amount || 0n,
              };
              if (cert.account_id in storage.adastatAccount) {
                for (let txData of storage.adastatAccount[cert.account_id].txData) {
                  if (txData.tx_id < cert.tx_id) {
                    if (txData.pool > 0) {
                      storage.adastatStakeDeregistration[cert.id].from_pool = txData.pool;
                    } else if (txData.pool !== null) {
                      storage.adastatStakeDeregistration[cert.id].from_pool = null;
                    }
                    storage.adastatStakeDeregistration[cert.id].amount += txData.amount;
                  }
                }
              }
              storage.addAccount(cert.account_id, null, 0n, 0n, -1, cert.tx_id);
              if (cert.account_retired_pool_id) {
                storage.adastatAccountRetiredPool.add(cert.account_id);
              }
              break;
            case "pool_update":
              if (
                !storage.adastatPool[cert.pool_id] ||
                (storage.adastatPool[cert.pool_id].retiring_epoch > 0 &&
                  storage.adastatPool[cert.pool_id].retiring_epoch <= nextBlock.epoch_no)
              ) {
                if (!storage.adastatPool[cert.pool_id]) {
                  storage.adastatPool[cert.pool_id] = {
                    id: cert.pool_id,
                    pool_hash: cert.pool_hash,
                    block: 0,
                    epoch_with_block: 0,
                    total_block: 0,
                    itn_ticker: 0,
                    name: "",
                    ticker: "",
                    description: "",
                    homepage: "",
                    extended: "",
                    extended_data: Object.create(null),
                    valid_meta_hash: 0,
                    registration_id: cert.update_id,
                  };

                  let res = await db.query(
                    `
                    SELECT registration_id, epoch_with_block, block AS total_block
                    FROM adastat_pool
                    WHERE id = $1
                  `,
                    [cert.pool_id],
                  );

                  if (res.rows.length) {
                    storage.adastatPool[cert.pool_id].registration_id = res.rows[0].registration_id;
                    storage.adastatPool[cert.pool_id].epoch_with_block = res.rows[0].epoch_with_block;
                    storage.adastatPool[cert.pool_id].total_block = res.rows[0].total_block;
                  }
                }

                storage.adastatPool[cert.pool_id].delegator = 0n;
                storage.adastatPool[cert.pool_id].delegator_with_stake = 0n;
                storage.adastatPool[cert.pool_id].real_pledge = 0n;
                storage.adastatPool[cert.pool_id].stake = 0n;
                storage.adastatPool[cert.pool_id].update_id = cert.update_id;

                storage.adastatPool[cert.pool_id].margin = cert.margin;
                storage.adastatPool[cert.pool_id].fixed_cost = cert.fixed_cost;
                storage.adastatPool[cert.pool_id].pledge = cert.pledge;
                storage.adastatPool[cert.pool_id].owner = [];

                let res = await db.query(
                  `
                  SELECT addr_id AS account_id
                  FROM pool_owner
                  WHERE pool_update_id = $1
                `,
                  [cert.update_id],
                );
                for (let row of res.rows) {
                  storage.adastatPool[cert.pool_id].owner.push(row.account_id);

                  if (!storage.poolOwner[row.account_id]) {
                    storage.poolOwner[row.account_id] = new Set();
                  }
                  storage.poolOwner[row.account_id].add(cert.pool_id);
                }

                storage.epochs[nextBlock.epoch_no].pool_register++;
                storage.epochs[nextBlock.epoch_no].pool++;
              }

              storage.adastatPool[cert.pool_id].retirement_id = null;
              storage.adastatPool[cert.pool_id].retiring_epoch = 0;

              if (cert.meta_hash == cert.data_hash) {
                storage.adastatPool[cert.pool_id].name = cert.json.name ? cert.json.name.trim() : "";
                storage.adastatPool[cert.pool_id].ticker = cert.json.ticker ? cert.json.ticker.trim() : "";
                storage.adastatPool[cert.pool_id].description = cert.json.description ? cert.json.description.trim() : "";
                storage.adastatPool[cert.pool_id].homepage = cert.json.homepage ? cert.json.homepage.trim() : "";
                try {
                  let json_data = JSON.parse(cert.json_data);
                  storage.adastatPool[cert.pool_id].extended = json_data.extended ? json_data.extended.trim() : "";
                } catch (e) {
                  storage.adastatPool[cert.pool_id].extended = "";
                }
                storage.adastatPool[cert.pool_id].valid_meta_hash = 1;
              }

              storage.adastatPool[cert.pool_id].meta_url = cert.meta_url;
              storage.adastatPool[cert.pool_id].meta_hash = cert.meta_hash;

              storage.adastatPool[cert.pool_id].live_update_id = cert.update_id;
              storage.adastatPool[cert.pool_id].live_margin = cert.margin;
              storage.adastatPool[cert.pool_id].live_fixed_cost = cert.fixed_cost;
              storage.adastatPool[cert.pool_id].live_pledge = cert.pledge;

              storage.adastatPool[cert.pool_id].need_update = true;

              if (nextBlock.epoch_no >= storage.lastEpochNo - 1) {
                storage.adastatPool[cert.pool_id].update_cert = cert;
              }

              break;
            case "pool_retire":
              if (cert.pool_id in storage.adastatPool) {
                storage.adastatPool[cert.pool_id].retirement_id = cert.retirement_id;
                storage.adastatPool[cert.pool_id].retiring_epoch = cert.retiring_epoch;

                storage.adastatPool[cert.pool_id].need_update = true;
              }

              break;
          }
        }

        for (let cert of tokenMintCert) {
          storage.adastatTx[cert.tx_id].type = storage.adastatTx[cert.tx_id].type | config.txType[cert.type];

          if (!(cert.policy in storage.tokenPolicy)) {
            storage.tokenPolicy[cert.policy] = null;
            storage.epochs[nextBlock.epoch_no].token_policy++;
          }

          if (!cert.exist_token_id && !storage.adastatMultiAsset[cert.token_id]) {
            storage.epochs[nextBlock.epoch_no].token++;
            storage.addMaPolicy(cert.policy, cert.tx_id, true);
          } else {
            storage.addMaPolicy(cert.policy, cert.tx_id, false);
          }

          let meta_id = null;
          if (
            cert.meta_data_20 &&
            typeof cert.meta_data_20 === "object" &&
            cert.meta_data_20[cert.policy] &&
            ((cert.name && cert.meta_data_20[cert.policy][cert.name]) ||
              (cert.escape_name && cert.meta_data_20[cert.policy][cert.escape_name]) ||
              (cert.convert_name && cert.meta_data_20[cert.policy][cert.convert_name]))
          ) {
            meta_id = cert.meta_id_20;
          } else if (
            cert.meta_data_721 &&
            typeof cert.meta_data_721 === "object" &&
            cert.meta_data_721[cert.policy] &&
            ((cert.name && cert.meta_data_721[cert.policy][cert.name]) ||
              (cert.escape_name && cert.meta_data_721[cert.policy][cert.escape_name]) ||
              (cert.convert_name && cert.meta_data_721[cert.policy][cert.convert_name]))
          ) {
            meta_id = cert.meta_id_721;
          }

          storage.addMultiAsset(cert.token_id, cert.policy, cert.tx_id, BigInt(cert.quantity), meta_id);

          if (cert.quantity < 0) {
            if (-storage.adastatMultiAsset[cert.token_id].supply == BigInt(cert.supply)) {
              storage.adastatMaPolicy[cert.policy].token--;
              storage.adastatMultiAsset[cert.token_id].zeroSupply = true;
            }
          } else if (storage.adastatMultiAsset[cert.token_id].zeroSupply) {
            storage.adastatMaPolicy[cert.policy].token++;
            delete storage.adastatMultiAsset[cert.token_id].zeroSupply;
          }
        }
        for (let token of txsInOutMA) {
          let address;

          if (token.address in storage.adastatAddressShelley) {
            address = storage.adastatAddressShelley[token.address];
          } else if (token.address in storage.adastatAddressByron) {
            address = storage.adastatAddressByron[token.address];
          } else {
            logger.error("Address for token is not exist", token);
            app.exit();
          }

          if (token.id in address.multi_asset) {
            address.multi_asset[token.id] += token.quantity;

            if (address.multi_asset[token.id] == 0) {
              delete address.multi_asset[token.id];
            }
          } else if (token.quantity != 0) {
            address.multi_asset[token.id] = token.quantity;
          }

          storage.addMultiAsset(token.id, token.policy, token.tx_id, 0n, null);
          storage.addMaPolicy(token.policy, token.tx_id, false);

          storage.adastatTx[token.tx_id].tokenChange.add(token.id);
        }

        for (let cert of typeCert) {
          storage.adastatTx[cert.tx_id].type = storage.adastatTx[cert.tx_id].type | config.txType[cert.type];
          storage.adastatTx[cert.tx_id].amount += BigInt(cert.amount);
        }

        for (let blockTx of blockTxs) {
          if (blockTx.id in storage.adastatTx) {
            for (let k in storage.adastatTx[blockTx.id].amountChange) {
              if (storage.adastatTx[blockTx.id].amountChange[k] && storage.adastatTx[blockTx.id].amountChange[k] > 0) {
                storage.adastatTx[blockTx.id].amount += storage.adastatTx[blockTx.id].amountChange[k];
              }
            }

            storage.adastatTx[blockTx.id].token = storage.adastatTx[blockTx.id].tokenChange.size;

            if (storage.adastatTx[blockTx.id].token > 0) {
              storage.epochs[nextBlock.epoch_no].token_tx++;
            }

            storage.adastatBlock[nextBlock.id].tx_fee += BigInt(blockTx.fee);
            storage.adastatBlock[nextBlock.id].tx_out_sum += BigInt(blockTx.out_sum);
            storage.adastatBlock[nextBlock.id].tx_amount += storage.adastatTx[blockTx.id].amount;
          }
        }

        storage.epochs[nextBlock.epoch_no].block_with_tx++;
        storage.epochs[nextBlock.epoch_no].circulating_supply += deltaCirculatingSupply;
        storage.epochs[nextBlock.epoch_no].byron_amount += deltaByronAmount;
        storage.epochs[nextBlock.epoch_no].tx_amount += storage.adastatBlock[nextBlock.id].tx_amount;
      } else {
        for (let txInOut of txsInOut) {
          txInOut.amount = BigInt(txInOut.amount);

          deltaCirculatingSupply += txInOut.amount;

          storage.addAddressByron(txInOut.address, txInOut.tx_id, txInOut.amount);
        }

        deltaByronAmount = deltaCirculatingSupply;

        for (let blockTx of blockTxs) {
          storage.adastatTx[blockTx.id] = {
            type: 0,
            amount: BigInt(blockTx.out_sum),
            token: 0,
          };

          storage.adastatBlock[nextBlock.id].tx_fee += BigInt(blockTx.fee);
          storage.adastatBlock[nextBlock.id].tx_out_sum += storage.adastatTx[blockTx.id].amount;
        }
        storage.adastatBlock[nextBlock.id].tx_amount = storage.adastatBlock[nextBlock.id].tx_out_sum;

        if (nextBlock.epoch_no >= 0) {
          storage.epochs[nextBlock.epoch_no].block_with_tx++;
          storage.epochs[nextBlock.epoch_no].circulating_supply += deltaCirculatingSupply;
          storage.epochs[nextBlock.epoch_no].byron_amount += deltaByronAmount;
          storage.epochs[nextBlock.epoch_no].tx_amount += storage.adastatBlock[nextBlock.id].tx_amount;
        }
      }
    }

    if (nextBlock.epoch_no >= 0) {
      storage.epochs[nextBlock.epoch_no].blockchain_size += BigInt(nextBlock.size);
    }

    lastParsedBlock = {
      id: nextBlock.id,
      hash: nextBlock.hash,
      epoch_no: nextBlock.epoch_no,
      slot_no: nextBlock.slot_no,
      block_no: nextBlock.block_no,
      slot_leader_id: nextBlock.slot_leader_id,
    };
  }

  await storage.insertTableData(lastParsedBlock);

  if (storage.lastBlockNo - config.ignoreBlockCount > lastParsedBlock.block_no) {
    await app.proceedQueue();
  }
};

app.execute = async function () {
  if (app.isProceed) {
    return;
  }

  app.isProceed = true;

  logger.log("before proceedQueue");

  await app.proceedQueue();

  logger.log("after proceedQueue");

  app.isProceed = false;
};

app.start = async function () {
  config = app.config = require("./config");
  logger = app.logger = require("./logger")();
  logger.log("Init logger: [OK]");
  dbPool = app.dbPool = require("./db");
  logger.log("Init dbPool: [OK]");
  db = app.db = await dbPool.connect();
  logger.log("Init db: [OK]");
  helper = app.helper = require("./helper");
  logger.log("Init helper: [OK]");
  cardano = app.cardano = require("./cardano");
  logger.log("Init cardano: [OK]");
  storage = app.storage = require("./storage");
  logger.log("Init storage: [OK]");

  await storage.init();

  logger.log("last received block:", storage.lastBlockNo);
  logger.log("last parsed block:", storage.lastParsedBlock);

  dbSubscriber = require("./db_subscriber");

  await dbSubscriber.connect();
  await dbSubscriber.listenTo("insert_block_event");

  let notifyTimerId,
    isCurrencyUpdating = false;

  dbSubscriber.notifications.on("insert_block_event", (row) => {
    // Payload as passed to subscriber.notify() (see below)
    if (row.block_no) {
      // sometimes row.block_no is null (epoch boundary)

      clearTimeout(notifyTimerId);

      storage.lastBlockNo = row.block_no;
      storage.lastEpochNo = row.epoch_no;

      if (storage.lastParsedBlock.epoch_no == storage.lastEpochNo || storage.lastParsedBlock.block_no > storage.lastBlockNo - 100) {
        logger.log('Received notification in "insert_block_event":', row.block_no);

        if (row.block_no % 10 == 0 && !isCurrencyUpdating) {
          isCurrencyUpdating = true;
          storage.updateCurrencyPrice().finally(() => {
            isCurrencyUpdating = false;
          });
        }
      }

      notifyTimerId = setTimeout(() => {
        app.execute();
      }, 100);
    }
  });

  if (storage.lastBlockNo - storage.lastParsedBlock.block_no > config.ignoreBlockCount) {
    app.execute();
  }
};

app.restart = async function () {
  await storage.init();

  logger.log("last received block:", storage.lastBlockNo);
  logger.log("last parsed block:", storage.lastParsedBlock);

  if (storage.lastBlockNo - storage.lastParsedBlock.block_no > config.ignoreBlockCount) {
    app.execute();
  }
};

app.exit = function () {
  process.exit();
};

process.on("exit", () => {
  logger && logger.log("app exit");
  dbSubscriber && dbSubscriber.close();
  db && db.end();
  dbPool && dbPool.end();
});

module.exports = app;
