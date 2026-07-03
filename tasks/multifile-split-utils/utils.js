function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function titleCase(s) {
  return s.split(' ').map(capitalize).join(' ');
}
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
function sum(nums) {
  return nums.reduce((a, b) => a + b, 0);
}
module.exports = { capitalize, titleCase, clamp, sum };
