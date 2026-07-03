const assert = require('assert');
const { LRUCache } = require('./lru.js');

// Test 1: Capacity 2 with eviction
const c = new LRUCache(2);
c.put(1, 'a');
c.put(2, 'b');
assert.strictEqual(c.get(1), 'a');
c.put(3, 'c'); // must evict key 2, since 1 was just used
assert.strictEqual(c.get(2), -1);
assert.strictEqual(c.get(3), 'c');
assert.strictEqual(c.get(1), 'a');
c.put(1, 'z');
assert.strictEqual(c.get(1), 'z');

// Test 2: Capacity 1 with eviction
const c2 = new LRUCache(1);
c2.put(1, 'x');
c2.put(2, 'y');
assert.strictEqual(c2.get(1), -1);
assert.strictEqual(c2.get(2), 'y');

console.log('PASS');
