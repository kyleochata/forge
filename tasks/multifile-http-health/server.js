const http = require('http');
const { routes } = require('./routes.js');

const server = http.createServer((req, res) => {
  const handler = routes[req.method + ' ' + req.url];
  if (handler) {
    handler(req, res);
  } else {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});

server.listen(process.env.PORT || 3000, () => {
  console.log('listening ' + server.address().port);
});
