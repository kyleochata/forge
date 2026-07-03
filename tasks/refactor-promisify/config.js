function readConfig(callback) {
  setTimeout(() => {
    callback(null, { port: 3000, host: 'localhost', debug: false });
  }, 5);
}
module.exports = { readConfig };
