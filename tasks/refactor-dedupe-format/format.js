function formatUser(user) {
  let name = user.name;
  if (name.length > 20) {
    name = name.slice(0, 17) + '...';
  }
  return 'User: ' + name + ' (#' + user.id + ')';
}
function formatProduct(product) {
  let name = product.name;
  if (name.length > 20) {
    name = name.slice(0, 17) + '...';
  }
  return 'Product: ' + name + ' (#' + product.id + ')';
}
module.exports = { formatUser, formatProduct };