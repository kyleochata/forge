const assert = require('assert');
const { createUser, updateUser, validateInput } = require('./handlers.js');

if (typeof validateInput !== 'function') {
  throw new Error('validateInput is not exported');
}

assert.deepStrictEqual(
  createUser({ name: ' Ada ', age: 30 }),
  { ok: true, action: 'create', name: 'Ada', age: 30 }
);

assert.deepStrictEqual(
  updateUser({ name: 'Bob', age: 0 }),
  { ok: true, action: 'update', name: 'Bob', age: 0 }
);

assert.deepStrictEqual(
  createUser({ name: '', age: 5 }),
  { error: 'invalid name' }
);

assert.deepStrictEqual(
  updateUser({ name: 'x', age: -1 }),
  { error: 'invalid age' }
);

assert.deepStrictEqual(
  validateInput({ name: '', age: 1 }),
  { error: 'invalid name' }
);

assert.strictEqual(
  validateInput({ name: 'a', age: 1 }),
  null
);

console.log('PASS');
