const assert = require('assert');
const { slugify } = require('./slugify.js');

assert.strictEqual(slugify('Hello World Again!'), 'hello-world-again');
assert.strictEqual(slugify('  Rock & Roll  '), 'rock-roll');
assert.strictEqual(slugify('already-good'), 'already-good');
assert.strictEqual(slugify('A  B'), 'a-b');
assert.strictEqual(slugify('!!!'), '');

console.log('PASS');