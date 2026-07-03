function search(query, items) {
  return items.filter((item) => item.includes(query));
}
module.exports = { search };