const assert = require('assert');
const { record, total, stats } = require('./counter.js');

if (typeof stats !== 'function') {
  throw new Error('stats is not exported');
}

// Test empty stats
assert.deepStrictEqual(stats(), { count: 0, min: null, max: null, mean: null });

// Record values
record(4);
record(2);
record(9);

// Test total
assert.strictEqual(total(), 15);

// Test stats after recording
assert.deepStrictEqual(stats(), { count: 3, min: 2, max: 9, mean: 5 });

console.log('PASS');
