const assert = require('assert');
const fs = require('fs');
const { log } = require('./logger.js');

assert.strictEqual(log('debug', 'x'), null);
assert.strictEqual(log('info', 'hi'), '[app] info: hi');
assert.strictEqual(log('warn', 'w'), '[app] warn: w');
assert.strictEqual(log('error', 'e'), '[app] error: e');

const src = fs.readFileSync('logger.js', 'utf8');
assert.ok(/require\(['"]\.\/config(\.js)?['"]\)/.test(src), 'logger.js must read from ./config');

console.log('PASS');
