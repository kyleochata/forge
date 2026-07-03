const assert = require('assert');
const { paginate } = require('./paginate.js');

assert.deepStrictEqual(paginate([1,2,3,4,5,6,7,8,9,10], 1, 3), [1,2,3]);
assert.deepStrictEqual(paginate([1,2,3,4,5,6,7,8,9,10], 2, 3), [4,5,6]);
assert.deepStrictEqual(paginate([1,2,3,4,5,6,7,8,9,10], 4, 3), [10]);
assert.deepStrictEqual(paginate([1,2,3,4,5,6,7,8,9,10], 5, 3), []);
assert.deepStrictEqual(paginate([], 1, 3), []);

console.log('PASS');