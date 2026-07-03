const assert = require('assert');
const { parseLine } = require('./csv.js');

assert.deepStrictEqual(parseLine('a,b,c'), ['a', 'b', 'c']);
assert.deepStrictEqual(parseLine('"a,b",c'), ['a,b', 'c']);
assert.deepStrictEqual(parseLine('"say ""hi""",x'), ['say "hi"', 'x']);
assert.deepStrictEqual(parseLine('""'), ['']);
assert.deepStrictEqual(parseLine('a,"",b'), ['a', '', 'b']);

console.log('PASS');
