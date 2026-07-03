const assert = require('assert');
const { retry } = require('./retry');

(async () => {
  // Test 1: fail twice, then succeed
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls < 3) {
      throw new Error('nope');
    }
    return 42;
  };
  const result = await retry(fn, 3, 1);
  assert.strictEqual(result, 42);
  assert.strictEqual(calls, 3);

  // Test 2: always fail
  let calls2 = 0;
  const fn2 = async () => {
    calls2++;
    throw new Error('boom');
  };
  await assert.rejects(() => retry(fn2, 2, 1), /boom/);
  assert.strictEqual(calls2, 2);

  // Test 3: succeed immediately
  let calls3 = 0;
  const fn3 = async () => {
    calls3++;
    return 'ok';
  };
  const result3 = await retry(fn3, 5, 1);
  assert.strictEqual(result3, 'ok');
  assert.strictEqual(calls3, 1);

  console.log('PASS');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
