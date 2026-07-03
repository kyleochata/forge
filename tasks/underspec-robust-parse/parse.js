function parseData(raw) {
  return JSON.parse(raw).items.map((item) => item.name);
}
module.exports = { parseData };
