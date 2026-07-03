function deepGet(obj, path, fallback) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    cur = cur[p];
    if (cur === undefined) return fallback;
  }
  return cur;
}
module.exports = { deepGet };
