const assert = require('assert');
const fs = require('fs');
const { submit } = require('./form.js');

assert.deepStrictEqual(submit({ email: 'a@b.com', name: 'Ada' }), { ok: true });
assert.deepStrictEqual(submit({ email: 'nope', name: 'Ada' }), { ok: false, errors: ['email'] });
assert.deepStrictEqual(submit({ email: '', name: '  ' }), { ok: false, errors: ['email', 'name'] });

let validators;
try {
  validators = require('./validators.js');
} catch (err) {
  throw new Error('validators.js is missing');
}
assert.strictEqual(typeof validators.isEmail, 'function');
assert.strictEqual(typeof validators.isRequired, 'function');
assert.strictEqual(validators.isEmail('a@b'), true);
assert.strictEqual(validators.isEmail('ab'), false);
assert.strictEqual(validators.isRequired('x'), true);
assert.strictEqual(validators.isRequired('  '), false);

const src = fs.readFileSync('form.js', 'utf8');
assert.ok(/require\(['"]\.\/validators(\.js)?['"]\)/.test(src), 'form.js must require ./validators');

console.log('PASS');
