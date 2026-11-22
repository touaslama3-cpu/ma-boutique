// Routeur unique des 4 endpoints CJ afin de respecter la limite Vercel Hobby.
const handlers = {
  products: require("./_cj-products"),
  product: require("./_cj-product"),
  freight: require("./_cj-freight"),
  track: require("./_cj-track")
};
module.exports = async function(req, res) {
  const route = String(req.query?.route || "");
  const handler = handlers[route];
  if (!handler) return res.status(404).json({ error: "Route CJ inconnue." });
  return handler(req, res);
};