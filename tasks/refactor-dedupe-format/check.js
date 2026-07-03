const assert = require('assert');
const { formatUser, formatProduct, formatEntity } = require('./format.js');

const long = 'abcdefghijklmnopqrstuvwxyz';

assert.strictEqual(formatUser({ name: 'Ada', id: 1 }), 'User: Ada (#1)');
assert.strictEqual(formatUser({ name: long, id: 2 }), 'User: abcdefghijklmnopq... (#2)');
assert.strictEqual(formatProduct({ name: 'Lamp', id: 3 }), 'Product: Lamp (#3)');
assert.strictEqual(formatProduct({ name: long, id: 4 }), 'Product: abcdefghijklmnopq... (#4)');

if (typeof formatEntity !== 'function') {
  throw new Error('formatEntity is not exported');
}

assert.strictEqual(formatEntity('Order', 'x', 5), 'Order: x (#5)');

console.log('PASS');