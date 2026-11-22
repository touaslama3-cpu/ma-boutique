const { cj } = require("./_cj");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }
  const number = String(req.query?.number || "").trim();
  if (!/^[A-Za-z0-9-]{6,60}$/.test(number)) {
    return res.status(400).json({ error: "Numéro de suivi invalide." });
  }
  try {
    const rows = await cj("/logistic/trackInfo?trackNumber=" + encodeURIComponent(number));
    const list = Array.isArray(rows) ? rows : [];
    return res.status(200).json({
      tracking: list.map(item => ({
        number: item.trackingNumber || number,
        carrier: item.logisticName || "",
        status: item.trackingStatus || "",
        origin: item.trackingFrom || "",
        destination: item.trackingTo || "",
        deliveryDay: item.deliveryDay || "",
        lastMileCarrier: item.lastMileCarrier || "",
        lastMileNumber: item.lastTrackNumber || "",
        lastUpdate: item.deliveryTime || ""
      }))
    });
  } catch (error) {
    console.error("CJ tracking lookup failed", error.code, error.requestId);
    return res.status(error.message === "CJ_API_KEY_MISSING" ? 503 : 502).json({
      error: error.message === "CJ_API_KEY_MISSING" ? "Connexion CJ non configurée." : "Suivi indisponible auprès de CJ."
    });
  }
};
