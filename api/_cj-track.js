const { cj } = require("./_cj");
module.exports = async function(req, res) {
  res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Méthode non autorisée." }); }
  const number = String(req.query?.number || "").trim();
  if (!/^[A-Za-z0-9-]{6,60}$/.test(number)) return res.status(400).json({ error: "Numéro de suivi invalide." });
  try {
    const rows = await cj("/logistic/trackInfo?trackNumber=" + encodeURIComponent(number));
    const list = Array.isArray(rows) ? rows : [];
    return res.status(200).json({ tracking: list.map(x => ({ number: x.trackingNumber, carrier: x.logisticName,
      status: x.trackingStatus, origin: x.trackingFrom, destination: x.trackingTo, deliveryDay: x.deliveryDay,
      lastMileCarrier: x.lastMileCarrier, lastMileNumber: x.lastTrackNumber, lastUpdate: x.deliveryTime })) });
  } catch (e) {
    console.error("CJ tracking error", e.code, e.requestId);
    return res.status(502).json({ error: "Suivi indisponible auprès de CJ." });
  }
};