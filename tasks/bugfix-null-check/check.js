const assert = require('assert');
const { displayName } = require('./user.js');

assert.strictEqual(displayName({ profile: { firstName: 'Ada', lastName: 'Lovelace' } }), 'Ada Lovelace');
assert.strictEqual(displayName({}), 'anonymous');
assert.strictEqual(displayName({ profile: {} }), 'anonymous');
assert.strictEqual(displayName({ profile: { firstName: 'Ada' } }), 'Ada');
assert.strictEqual(displayName({ profile: { lastName: 'Lovelace' } }), 'Lovelace');

console.log('PASS');
