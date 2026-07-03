const routes = {
  'GET /': function (req, res) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('hello');
  },
};
module.exports = { routes };
