const assert = require('assert');
const { formatPrice } = require('./price.js');

assert.strictEqual(formatPrice(2.5), '$2.50');
assert.strictEqual(formatPrice(3), '$3.00');
assert.strictEqual(formatPrice(19.99), '$19.99');
assert.strictEqual(formatPrice(0), '$0.00');

console.log('PASS');
