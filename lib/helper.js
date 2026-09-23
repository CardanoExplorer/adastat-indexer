const app = require("./app"),
  ipaddr = require("ipaddr.js"),
  { lookup } = require("node:dns"),
  { isIP } = require("node:net"),
  { URL } = require("node:url"),
  { Agent, DecoratorHandler, interceptors, request } = require("undici");

const isIpValid = (ip) => {
  try {
    return ipaddr.parse(ip).range() === "unicast";
  } catch {}

  return false;
};

class MaxSizeHandler extends DecoratorHandler {
  received = 0;

  constructor(handler, maxSize) {
    super(handler);

    this.maxSize = maxSize;
  }

  onResponseData(controller, chunk) {
    this.received += chunk.length;

    if (this.received > this.maxSize) {
      throw new Error(`Response size (${this.received}) larger than maxSize (${this.maxSize})`);
    }

    return super.onResponseData?.(controller, chunk);
  }
}

const agent = new Agent({
  connect: {
    rejectUnauthorized: false,
    lookup: (hostname, options, callback) => {
      lookup(hostname, options, (err, address, family) => {
        if (!err) {
          const lookupAddresses = typeof address === "string" ? [{ address, family }] : address;

          for (const lookupAddress of lookupAddresses) {
            if (!isIpValid(lookupAddress.address)) {
              err = new Error(`SSRF Blocked. Lookup IP: ${lookupAddress.address}`);

              break;
            }
          }
        }

        callback(err, address, family);
      });
    },
  },
}).compose(
  (dispatch) => (opts, handler) => {
    try {
      const { maxSize = 0 } = opts,
        url = typeof opts.origin === "string" ? new URL(opts.origin) : opts.origin,
        hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Invalid protocol");
      }

      if (isIP(hostname) && !isIpValid(hostname)) {
        throw new Error(`SSRF Blocked. Direct IP: ${hostname}`);
      }

      return interceptors.decompress({ maxSize })(dispatch)(opts, new MaxSizeHandler(handler, maxSize));
    } catch (err) {
      handler.onResponseError?.(null, err instanceof Error ? err : new Error());

      return false;
    }
  },
  // Keep redirects outside the checks so every destination is validated.
  interceptors.redirect({ maxRedirections: 5 }),
);

const getDataFromUrl = async function (link, maxSize) {
  try {
    const { body, statusCode, headers } = await request(link, {
      dispatcher: agent,
      maxSize,
      signal: AbortSignal.timeout(10000),
      headers: {
        Pragma: "no-cache",
        DNT: "1",
        "Cache-Control": "no-cache",
        "User-Agent": "AdaStat (Metadata Crawler)",
        Accept: "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
      },
    });

    if (statusCode === 200) {
      const contentType = headers["content-type"];
      if (contentType && contentType.includes("text/html")) {
        await body.dump();

        return "Metadata load error";
      }

      return Buffer.from(await body.bytes()).toString("utf8");
    }

    await body.dump();
  } catch (e) {
    app.logger.warn(`Meta load error for ${link}: ${e.message}`);
  }
};

module.exports = {
  getDataFromUrl,
};
