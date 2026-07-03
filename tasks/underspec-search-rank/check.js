const assert = require('assert');
const { search } = require('./search');

const results = search('cat', ['concat', 'category', 'cat', 'the cat']);

// (1) same members regardless of order
assert.deepStrictEqual([...results].sort(), ['cat', 'category', 'concat', 'the cat']);

// (2) exact match first
assert.strictEqual(results[0], 'cat', 'exact match must rank first');

// (3) prefix beats substring
assert.ok(results.indexOf('category') < results.indexOf('concat'), 'prefix match must rank above substring match');

// (4) non-matching query
assert.deepStrictEqual(search('zzz', ['a', 'b']), []);

console.log('PASS');