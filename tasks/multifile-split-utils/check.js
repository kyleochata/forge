const assert = require('assert');

let stringUtils;
try {
  stringUtils = require('./stringUtils.js');
} catch (err) {
  throw new Error('stringUtils.js is missing');
}
let numberUtils;
try {
  numberUtils = require('./numberUtils.js');
} catch (err) {
  throw new Error('numberUtils.js is missing');
}
const utils = require('./utils.js');

assert.strictEqual(typeof stringUtils.capitalize, 'function');
assert.strictEqual(typeof stringUtils.titleCase, 'function');
assert.strictEqual(typeof numberUtils.clamp, 'function');
assert.strictEqual(typeof numberUtils.sum, 'function');

assert.strictEqual(stringUtils.capitalize('ada'), 'Ada');
assert.strictEqual(stringUtils.titleCase('hello world'), 'Hello World');
assert.strictEqual(numberUtils.clamp(15, 0, 10), 10);
assert.strictEqual(numberUtils.clamp(-5, 0, 10), 0);
assert.strictEqual(numberUtils.sum([1, 2, 3]), 6);

assert.strictEqual(typeof utils.capitalize, 'function');
assert.strictEqual(typeof utils.titleCase, 'function');
assert.strictEqual(typeof utils.clamp, 'function');
assert.strictEqual(typeof utils.sum, 'function');
assert.strictEqual(utils.capitalize('x'), 'X');
assert.strictEqual(utils.sum([2, 2]), 4);

console.log('PASS');
