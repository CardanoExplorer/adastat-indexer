const app = require("./app"),
  config = app.config,
  axios = require("axios"),
  ipaddr = require("ipaddr.js"),
  dns = require("dns").promises,
  { Agent } = require("https"),
  { URL } = require("url");

const unsafeRanges = [
  "loopback", // 127.0.0.1, ::1
  "private", // 10.x.x.x, 192.168.x.x, 172.16.x.x
  "linkLocal", // 169.254.x.x (AWS metadata!), fe80::
  "uniqueLocal", // fc00::/7 (IPv6 private)
  "carrierGradeNat", // 100.64.0.0/10
  "unspecified", // 0.0.0.0
  "broadcast", // 255.255.255.255
  "multicast", // 224.x.x.x
  "reserved", // 240.x.x.x (Class E)
  "amt",
  "teredo",
  "6to4",
  "benchmarking", // 198.18.x.x
  "documentation", // 192.0.2.x (TEST-NET)
];

async function validateUrl(link) {
  try {
    const parsed = new URL(link);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Invalid protocol");
    }

    const { address } = await dns.lookup(parsed.hostname);

    const ip = ipaddr.parse(address);

    let range = ip.range();

    if (range === "ipv4Mapped") {
      range = ip.toIPv4Address().range();
    }

    if (unsafeRanges.includes(range)) {
      throw new Error(`SSRF protection: IP ${address} is restricted`);
    }
  } catch (e) {
    throw new Error(`Invalid URL or SSRF attempt: ${e.message}`);
  }
}

const getDataFromUrl = async function (link, maxSize) {
  try {
    await validateUrl(link);

    const response = await axios.get(link, {
      timeout: 10000,
      maxContentLength: maxSize,
      headers: {
        Pragma: "no-cache",
        DNT: "1",
        "Cache-Control": "no-cache",
        "User-Agent": "AdaStat (Metadata Crawler)",
        Accept: "application/json, text/plain, */*",
      },
      httpsAgent: new Agent({ rejectUnauthorized: false }),
      validateStatus: () => true,
    });

    if (response.status === 200) {
      const data = response.data;

      const contentType = response.headers["content-type"];
      if (contentType && contentType.includes("text/html")) {
        return "Metadata load error";
      }

      if (typeof data === "object") {
        return JSON.stringify(data);
      }

      return typeof data === "string" && data.length <= maxSize ? data : "Metadata load error";
    }
  } catch (e) {
    const errorMsg = e.response ? `Status: ${e.response.status}` : e.message;
    app.logger.warn(`Meta load error for ${link}: ${errorMsg}`);
  }
};

module.exports = {
  getDataFromUrl,
};
