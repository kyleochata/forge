const assert = require('assert');
const { sortByAge } = require('./sort.js');

const input = [{ name: 'c', age: 30 }, { name: 'a', age: 10 }, { name: 'b', age: 20 }];
const snapshot = JSON.parse(JSON.stringify(input));
const result = sortByAge(input);

assert.deepStrictEqual(result.map((u) => u.age), [10, 20, 30]);
assert.deepStrictEqual(input, snapshot);
assert.notStrictEqual(result, input);

console.log('PASS');