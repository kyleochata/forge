function log(level, message) {
  return '[app] ' + level + ': ' + message;
}
module.exports = { log };
