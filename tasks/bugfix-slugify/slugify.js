function slugify(title) {
  return title.toLowerCase().replace(' ', '-');
}
module.exports = { slugify };