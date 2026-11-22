let cache = { token: null, until: 0 };

async function token() {
  if (cache.token && cache.until > Date.now() + 60000) return cache.token;
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new Error("CJ_API_KEY_MISSING");
  const response = await fetch("https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code !== 200 || !payload.data?.accessToken) {
    const error = new Error("CJ_AUTH_FAILED");
    error.code = payload.code;
    error.requestId = payload.requestId;
    throw error;
  }
  const expiry = Date.parse(payload.data.accessTokenExpiryDate || "");
  cache = {
    token: payload.data.accessToken,
    until: Number.isFinite(expiry) ? expiry : Date.now() + 6 * 60 * 60 * 1000
  };
  return cache.token;
}

async function cj(path, method = "GET", body) {
  const accessToken = await token();
  const response = await fetch("https://developers.cjdropshipping.com/api2.0/v1" + path, {
    method,
    headers: { "CJ-Access-Token": accessToken, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.code !== 200 || payload.result === false) {
    const error = new Error("CJ_API_ERROR");
    error.code = payload.code || response.status;
    error.requestId = payload.requestId;
    throw error;
  }
  return payload.data;
}

module.exports = { cj };
