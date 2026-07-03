const assert = require('assert');
const { readConfig } = require('./config.js');

(async () => {
  assert.strictEqual(readConfig.length, 0, 'readConfig must take no arguments');
  
  const p = readConfig();
  
  assert.ok(p instanceof Promise, 'readConfig must return a Promise');
  
  const result = await p;
  assert.deepStrictEqual(result, { port: 3000, host: 'localhost', debug: false });
  
  console.log('PASS');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
