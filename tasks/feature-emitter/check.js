const assert = require('assert');
const { Emitter } = require('./emitter.js');

const emitter = new Emitter();
const seen = [];

// Test 1: registration order
const handlerA = (arg) => seen.push('A' + arg);
const handlerB = (arg) => seen.push('B' + arg);
emitter.on('x', handlerA);
emitter.on('x', handlerB);
const result1 = emitter.emit('x', 1);
assert.deepStrictEqual(seen, ['A1', 'B1']);
assert.strictEqual(result1, 2);

// Test 2: once semantics
seen.length = 0;
const onceHandler = () => seen.push('once');
emitter.once('y', onceHandler);
const result2a = emitter.emit('y');
assert.strictEqual(result2a, 1);
const result2b = emitter.emit('y');
assert.strictEqual(result2b, 0);
assert.deepStrictEqual(seen, ['once']);

// Test 3: targeted off
seen.length = 0;
const handler1 = () => seen.push('handler1');
const handler2 = () => seen.push('handler2');
emitter.on('z', handler1);
emitter.on('z', handler2);
emitter.off('z', handler1);
const result3 = emitter.emit('z');
assert.deepStrictEqual(seen, ['handler2']);
assert.strictEqual(result3, 1);

// Test 4: args pass through
seen.length = 0;
const argHandler = (p, q) => seen.push(p + q);
emitter.on('w', argHandler);
emitter.emit('w', 'p', 'q');
assert.deepStrictEqual(seen, ['pq']);

// Test 5: unknown event
const result5 = emitter.emit('unknown');
assert.strictEqual(result5, 0);

console.log('PASS');
