const assert = require('assert');
const { nextId, createIdGenerator } = require('./ids.js');

// Test nextId continuity
assert.strictEqual(nextId(), 'id-1');
assert.strictEqual(nextId(), 'id-2');

// Test createIdGenerator is exported
if (typeof createIdGenerator !== 'function') {
  throw new Error('createIdGenerator is not exported');
}

// Test independent generators
const g1 = createIdGenerator('a');
const g2 = createIdGenerator();

assert.strictEqual(g1(), 'a-1');
assert.strictEqual(g1(), 'a-2');

assert.strictEqual(g2(), 'id-1');

// Test nextId is unaffected by g1/g2
assert.strictEqual(nextId(), 'id-3');

console.log('PASS');
