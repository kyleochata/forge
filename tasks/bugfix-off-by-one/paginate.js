function paginate(items, page, size) {
  const start = page * size + 1;
  return items.slice(start, start + size);
}
module.exports = { paginate };