const app = require("./app"),
  config = app.config,
  { execFile } = require("child_process"),
  { bech32 } = require("bech32");

const cardano = {};

const verifyItnPoolSignature = async (poolHash, pubKeyFile, signatureFile) => {
  return new Promise((resolve) => {
    const child = execFile(
      config.jCli,
      ["key", "verify", "--public-key", pubKeyFile, "--signature", signatureFile],
      {
        timeout: 10_000,
      },
      (error, stdout) => {
        resolve(!error && stdout.trim().toLowerCase() == "success");
      },
    );

    child.stdin.on("error", (err) => {
      resolve(false);
    });

    child.stdin.end(poolHash);
  });
};

cardano.checkItnTicker = async function (poolHash, pubKey, signature) {
  app.logger.trace("cardano.checkItnTicker start", poolHash, pubKey, signature);

  const pubKeyFile = config.metaFolder + "/itn/" + poolHash + ".key";
  const signatureFile = config.metaFolder + "/itn/" + poolHash + ".sig";

  let ret = false;

  try {
    await Promise.all([app.fs.promises.writeFile(pubKeyFile, pubKey), app.fs.promises.writeFile(signatureFile, signature)]);

    ret =
      (await verifyItnPoolSignature(poolHash, pubKeyFile, signatureFile)) ||
      (await verifyItnPoolSignature(poolHash + "\n", pubKeyFile, signatureFile));
  } catch (e) {}

  app.logger.trace("cardano.checkItnTicker end");

  return ret;
};

cardano.getMetaHash = async function (file) {
  app.logger.trace("cardano.getMetaHash start", file);

  let ret = false;

  try {
    ret = await app.execFilePromisify(config.cardanoCli, ["stake-pool", "metadata-hash", "--pool-metadata-file", file]);
  } catch (e) {}

  app.logger.trace("cardano.getMetaHash end");

  return ret;
};

cardano.fromHashToAddress = function (hash, prefix) {
  app.logger.trace("cardano.fromHashToAddress start", hash, prefix);

  let address;

  if (!prefix) {
    prefix = "addr";
  }
  try {
    let words = bech32.toWords(Buffer.from(hash.toString(), "hex"));
    address = bech32.encode(prefix, words, 128);
  } catch (e) {
    app.logger.warn("Error get address from hash", e.stack);
  }

  app.logger.trace("cardano.fromHashToAddress end");

  return address;
};

cardano.getAddressInfo = function (address) {
  app.logger.trace("cardano.getAddressInfo start", address);

  // https://github.com/input-output-hk/cardano-ledger/blob/f2a783cf00911b7492e81dd6c7fb8a963f9ce8fe/eras/shelley/test-suite/cddl-files/shelley.cddl#L89

  let addressInfo = {
    address: address,
    type: "byron",
    type_int: 8,
  };

  try {
    addressInfo = {
      address: address,
      base16: Buffer.from(bech32.fromWords(bech32.decode(address, 128).words)).toString("hex"),
      type: "enterprise", // 6, 7
    };

    addressInfo.type_int = parseInt(addressInfo.base16.substring(0, 1), 16);
    addressInfo.base_hash = addressInfo.base16.substring(2);
    addressInfo.stake_hash = "";

    if (addressInfo.type_int <= 3) {
      // 0, 1, 2, 3
      addressInfo.stake_hash = addressInfo.base_hash.substring(56);
      addressInfo.base_hash = addressInfo.base_hash.substring(0, 56);
      addressInfo.type = "base";
    } else if (addressInfo.type_int <= 5) {
      // 4, 5
      addressInfo.stake_hash = addressInfo.base_hash.substring(56);
      addressInfo.base_hash = addressInfo.base_hash.substring(0, 56);
      addressInfo.type = "pointer";
    } else if (addressInfo.type_int >= 14) {
      // 14, 15
      addressInfo.stake_hash = addressInfo.base_hash;
      addressInfo.base_hash = "";
      addressInfo.type = "reward";
    }
  } catch (e) {}

  app.logger.trace("cardano.getAddressInfo end");

  return addressInfo;
};

cardano.getPointerInfo = function (pointer) {
  app.logger.trace("cardano.getPointerInfo start", pointer);

  let slot_no,
    block_index,
    cert_index,
    data = Array.from(Buffer.from(pointer, "hex"));

  let f = () => {
    let temp = [],
      val;

    while (data.length > 0) {
      let b = data.shift();
      temp.push(b & 0x7f);
      if ((b & 0x80) == 0) {
        break;
      }
    }

    if (temp.length > 0) {
      temp.reverse();

      let v = 0;
      for (let i = 0; i < temp.length; i++) {
        let b = temp[i];
        v = v | (b << (8 * i - i));
      }

      val = v;
    }

    return val;
  };

  slot_no = f();
  block_index = f();
  cert_index = f();

  app.logger.trace("cardano.getPointerInfo end");

  return data.length > 0
    ? {}
    : {
        slot_no,
        block_index,
        cert_index,
      };
};

cardano.isBech32 = function (address) {
  try {
    bech32.decode(address, 128);
    return true;
  } catch (e) {
    return false;
  }
};

module.exports = cardano;
