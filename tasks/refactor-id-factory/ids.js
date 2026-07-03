let next = 1;
function nextId() {
  return 'id-' + next++;
}
module.exports = { nextId };
