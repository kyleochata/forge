const assert = require('assert');
const { deepGet } = require('./get.js');

assert.strictEqual(deepGet({ a: { b: null } }, 'a.b.c', 'X'), 'X');
assert.strictEqual(deepGet({ a: null }, 'a', 'X'), null);
assert.strictEqual(deepGet({ a: 0 }, 'a', 'X'), 0);
assert.strictEqual(deepGet({ a: { b: { c: 5 } } }, 'a.b.c', 'X'), 5);
assert.strictEqual(deepGet({}, 'x.y', 'F'), 'F');
assert.strictEqual(deepGet({ a: { b: false } }, 'a.b', 'X'), false);

console.log('PASS');
