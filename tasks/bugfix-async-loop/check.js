const { runAll } = require('./jobs.js');
const assert = require('assert');

const delay = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

(async () => {
  const result1 = await runAll([() => delay(15, 'a'), () => delay(5, 'b'), () => delay(0, 'c')]);
  assert.deepStrictEqual(result1, ['a', 'b', 'c']);
  
  const result2 = await runAll([]);
  assert.deepStrictEqual(result2, []);
  
  console.log('PASS');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
