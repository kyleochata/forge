const assert = require('assert');
const { parseData } = require('./parse.js');

// Happy path test
assert.deepStrictEqual(parseData('{"items":[{"name":"a"},{"name":"b"}]}'), ['a', 'b']);

// Test that it doesn't throw on bad inputs
const badInputs = ['not json', '{}', '{"items":5}', null];

badInputs.forEach((badInput) => {
  assert.doesNotThrow(() => parseData(badInput), `parseData must not throw on ${JSON.stringify(badInput)}`);
});

console.log('PASS');
