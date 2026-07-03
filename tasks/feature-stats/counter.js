const values = [];
function record(n) {
  values.push(n);
}
function total() {
  return values.reduce((a, b) => a + b, 0);
}
module.exports = { record, total };
