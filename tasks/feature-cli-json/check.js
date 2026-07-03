const assert = require('assert');
const { spawnSync } = require('child_process');

const plain = spawnSync(process.execPath, ['cli.js'], { encoding: 'utf8' });
assert.strictEqual(plain.status, 0);
assert.strictEqual(plain.stdout, 'name: forge\nversion: 1.0\n');

const json = spawnSync(process.execPath, ['cli.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(json.status, 0);
assert.deepStrictEqual(JSON.parse(json.stdout), { name: 'forge', version: '1.0' });

console.log('PASS');
