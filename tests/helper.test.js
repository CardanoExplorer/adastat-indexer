const assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process"),
  { readFileSync } = require("node:fs"),
  { mkdtemp, rm } = require("node:fs/promises"),
  http = require("node:http"),
  https = require("node:https"),
  { isIP } = require("node:net"),
  { tmpdir } = require("node:os"),
  { join } = require("node:path"),
  { after, before, beforeEach, test } = require("node:test"),
  { runInNewContext } = require("node:vm"),
  { brotliCompressSync, deflateSync, gzipSync } = require("node:zlib"),
  ipaddr = require("ipaddr.js"),
  undici = require("undici");

const publicAddress = "127.0.0.2",
  sourcePath = join(__dirname, "../lib/helper.js"),
  agents = [],
  servers = [],
  warnings = [],
  lookups = [],
  publicRequests = [],
  privateRequests = [],
  dnsAnswers = new Map(),
  metadata = '{\n  "name": "Тест",\n  "value": 9007199254740993\n}\n';

let publicOrigin,
  privateOrigin,
  privateIpv6Origin,
  tlsOrigin,
  certificateDir,
  requestTimeout = 10000;

// Treat one loopback listener as a public origin so all real HTTP/TLS traffic stays local.
// Every other address uses the real ipaddr.js classification.
const testIpaddr = {
  parse(address) {
    const parsed = ipaddr.parse(address);
    if (address === publicAddress) {
      parsed.range = () => "unicast";
    }
    return parsed;
  },
};

const testDns = {
  lookup(hostname, options, callback) {
    lookups.push(hostname);
    const addresses = dnsAnswers.get(hostname);
    if (!addresses?.length) {
      callback(new Error("Unknown test hostname"));
      return;
    }

    const records = addresses.map((address) => ({ address, family: isIP(address) }));
    if (options.all) {
      callback(null, records);
    } else {
      callback(null, records[0].address, records[0].family);
    }
  },
};

const helperModule = { exports: {} };
runInNewContext(
  readFileSync(sourcePath, "utf8"),
  {
    module: helperModule,
    Buffer,
    Error,
    AbortSignal: {
      timeout(ms) {
        assert.equal(ms, 10000);
        return AbortSignal.timeout(requestTimeout);
      },
    },
    require(id) {
      if (id === "./app") {
        return { logger: { warn: (message) => warnings.push(message) } };
      }
      if (id === "ipaddr.js") {
        return testIpaddr;
      }
      if (id === "node:dns") {
        return testDns;
      }
      if (id === "undici") {
        return {
          ...undici,
          Agent: class extends undici.Agent {
            constructor(options) {
              super(options);
              agents.push(this);
            }
          },
        };
      }
      if (id.startsWith("node:")) {
        return require(id);
      }
      throw new Error(`Unexpected dependency in isolated helper test: ${id}`);
    },
  },
  { filename: sourcePath },
);

const { getDataFromUrl } = helperModule.exports;

const listen = async (server, host, protocol = "http") => {
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  return `${protocol}://${host.includes(":") ? `[${host}]` : host}:${server.address().port}`;
};

const publicHandler = (req, res) => {
  const url = new URL(req.url, "http://metadata.invalid");
  publicRequests.push({ path: url.pathname, headers: req.headers });
  res.setHeader("connection", "close");
  res.setHeader("content-type", "application/json");

  if (url.pathname === "/redirect") {
    res.writeHead(302, { location: url.searchParams.get("to") });
    res.end();
  } else if (url.pathname.startsWith("/chain/")) {
    const remaining = Number(url.pathname.split("/").pop());
    res.writeHead(302, { location: remaining > 0 ? `/chain/${remaining - 1}` : "/ok" });
    res.end();
  } else if (url.pathname === "/html") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<html>Not metadata</html>");
  } else if (url.pathname === "/not-found") {
    res.writeHead(404);
    res.end("Not found");
  } else if (url.pathname === "/created") {
    res.writeHead(201);
    res.end(metadata);
  } else if (url.pathname === "/oversized") {
    res.write("é".repeat(20));
    res.end("é".repeat(20));
  } else if (url.pathname === "/compressed-oversized") {
    res.setHeader("content-encoding", "gzip");
    res.end(gzipSync("x".repeat(1024)));
  } else if (url.pathname === "/broken-gzip") {
    res.setHeader("content-encoding", "gzip");
    res.end("invalid gzip");
  } else if (url.pathname === "/slow") {
    const timer = setTimeout(() => res.end(metadata), 500);
    res.on("close", () => clearTimeout(timer));
  } else if (["/gzip", "/deflate", "/br"].includes(url.pathname)) {
    const encoding = url.pathname.slice(1),
      compress = { gzip: gzipSync, deflate: deflateSync, br: brotliCompressSync }[encoding];
    res.setHeader("content-encoding", encoding);
    res.end(compress(metadata));
  } else {
    res.end(metadata);
  }
};

const privateHandler = (req, res) => {
  privateRequests.push(req.url);
  res.setHeader("connection", "close");
  res.end('{"internal":true}');
};

before(async () => {
  certificateDir = await mkdtemp(join(tmpdir(), "adastat-indexer-tls-test-"));
  const keyFile = join(certificateDir, "key.pem"),
    certFile = join(certificateDir, "cert.pem");
  execFileSync(
    "openssl",
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=metadata.invalid", "-keyout", keyFile, "-out", certFile],
    { stdio: "ignore" },
  );

  publicOrigin = (await listen(http.createServer(publicHandler), publicAddress)).replace(publicAddress, "metadata.invalid");
  privateOrigin = await listen(http.createServer(privateHandler), "127.0.0.1");
  privateIpv6Origin = await listen(http.createServer(privateHandler), "::1");
  tlsOrigin = (await listen(https.createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, publicHandler), publicAddress, "https")).replace(
    publicAddress,
    "metadata.invalid",
  );
});

beforeEach(() => {
  warnings.length = 0;
  lookups.length = 0;
  publicRequests.length = 0;
  privateRequests.length = 0;
  dnsAnswers.clear();
  dnsAnswers.set("metadata.invalid", [publicAddress]);
  requestTimeout = 10000;
});

after(async () => {
  await Promise.all(agents.map((agent) => agent.destroy()));
  await Promise.all(servers.map((server) => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))));
  if (certificateDir) {
    await rm(certificateDir, { recursive: true, force: true });
  }
});

const privateTargets = [
  ["IPv4", () => privateOrigin],
  ["IPv6", () => privateIpv6Origin],
  ["IPv4-mapped IPv6", () => privateOrigin.replace("127.0.0.1", "[::ffff:127.0.0.1]")],
  ["integer IPv4", () => privateOrigin.replace("127.0.0.1", "2130706433")],
  ["DNS resolving to loopback", () => privateOrigin.replace("127.0.0.1", "local.invalid")],
];

for (const [name, target] of privateTargets) {
  test(`blocks direct ${name} targets`, async () => {
    dnsAnswers.set("local.invalid", ["127.0.0.1"]);
    assert.equal(await getDataFromUrl(target(), 512), undefined);
    assert.equal(privateRequests.length, 0);
    assert.match(warnings.join("\n"), /SSRF Blocked/);
  });

  test(`blocks redirects to ${name} targets`, async () => {
    dnsAnswers.set("local.invalid", ["127.0.0.1"]);
    assert.equal(await getDataFromUrl(`${publicOrigin}/redirect?to=${encodeURIComponent(target())}`, 512), undefined);
    assert.equal(publicRequests.length, 1);
    assert.equal(privateRequests.length, 0);
    assert.match(warnings.join("\n"), /SSRF Blocked/);
  });
}

test("returns original metadata text without changing whitespace or large JSON numbers", async () => {
  assert.equal(await getDataFromUrl(publicOrigin, 512), metadata);
  assert.deepEqual(lookups, ["metadata.invalid"]);
  assert.equal(publicRequests[0].headers["user-agent"], "AdaStat (Metadata Crawler)");
  assert.equal(publicRequests[0].headers["cache-control"], "no-cache");
});

test("checks DNS again when opening a new connection", async () => {
  assert.equal(await getDataFromUrl(publicOrigin, 512), metadata);
  dnsAnswers.set("metadata.invalid", ["127.0.0.1"]);
  assert.equal(await getDataFromUrl(publicOrigin, 512), undefined);
  assert.equal(publicRequests.length, 1);
  assert.equal(privateRequests.length, 0);
  assert.match(warnings.join("\n"), /SSRF Blocked/);
});

test("rejects a mixed public/private DNS answer", async () => {
  dnsAnswers.set("metadata.invalid", [publicAddress, "127.0.0.1"]);
  assert.equal(await getDataFromUrl(publicOrigin, 512), undefined);
  assert.equal(publicRequests.length, 0);
  assert.equal(privateRequests.length, 0);
});

test("follows relative redirects", async () => {
  assert.equal(await getDataFromUrl(`${publicOrigin}/redirect?to=/ok`, 512), metadata);
  assert.equal(publicRequests.length, 2);
});

test("accepts a self-signed HTTPS server", async () => {
  assert.equal(await getDataFromUrl(tlsOrigin, 512), metadata);
});

for (const [name, from, to] of [
  ["HTTP to HTTPS", () => publicOrigin, () => tlsOrigin],
  ["HTTPS to HTTP", () => tlsOrigin, () => publicOrigin],
]) {
  test(`follows ${name} redirects`, async () => {
    assert.equal(await getDataFromUrl(`${from()}/redirect?to=${encodeURIComponent(to())}`, 512), metadata);
    assert.equal(publicRequests.length, 2);
  });
}

test("blocks an HTTPS redirect to a private target", async () => {
  assert.equal(await getDataFromUrl(`${tlsOrigin}/redirect?to=${encodeURIComponent(privateOrigin)}`, 512), undefined);
  assert.equal(privateRequests.length, 0);
});

test("limits a redirect chain to five transitions", async () => {
  assert.equal(await getDataFromUrl(`${publicOrigin}/chain/10`, 512), undefined);
  assert.equal(publicRequests.length, 6);
});

for (const target of ["file:///etc/hosts", "ftp://metadata.invalid/file"]) {
  test(`rejects unsupported protocol ${new URL(target).protocol}`, async () => {
    assert.equal(await getDataFromUrl(target, 512), undefined);
    assert.equal(await getDataFromUrl(`${publicOrigin}/redirect?to=${encodeURIComponent(target)}`, 512), undefined);
    assert.equal(publicRequests.length, 1);
  });
}

test("keeps the HTML error and non-200 response contracts", async () => {
  assert.equal(await getDataFromUrl(`${publicOrigin}/html`, 512), "Metadata load error");
  assert.equal(await getDataFromUrl(`${publicOrigin}/not-found`, 512), undefined);
  assert.equal(await getDataFromUrl(`${publicOrigin}/created`, 512), undefined);
});

test("applies the byte limit to plain and redirected responses", async () => {
  assert.equal(await getDataFromUrl(`${publicOrigin}/oversized`, 64), undefined);
  assert.equal(await getDataFromUrl(`${publicOrigin}/redirect?to=/oversized`, 64), undefined);
});

for (const encoding of ["gzip", "deflate", "br"]) {
  test(`decodes ${encoding} responses without changing metadata`, async () => {
    assert.equal(await getDataFromUrl(`${publicOrigin}/${encoding}`, 512), metadata);
  });
}

test("limits decompressed response size", async () => {
  assert.equal(await getDataFromUrl(`${publicOrigin}/compressed-oversized`, 64), undefined);
});

test("handles a corrupt compressed response", async () => {
  assert.equal(await getDataFromUrl(`${publicOrigin}/broken-gzip`, 512), undefined);
});

test("aborts a slow response", async () => {
  requestTimeout = 50;
  assert.equal(await getDataFromUrl(`${publicOrigin}/slow`, 512), undefined);
});
