const assert = require('assert');
const { signup } = require('./signup.js');

function rejects(value) {
  try {
    const r = signup(value);
    return !r || r.ok !== true;
  } catch (err) {
    return true;
  }
}

const good = signup('ada@example.com');
assert.ok(good && good.ok === true, 'valid email must still be accepted');
assert.ok(rejects('not-an-email'), 'must reject a string without @');
assert.ok(rejects(''), 'must reject empty string');
assert.ok(rejects(null), 'must reject null');

console.log('PASS');
