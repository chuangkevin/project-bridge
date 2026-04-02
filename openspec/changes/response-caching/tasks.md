## 1. Create TtlCache utility

- [ ] 1.1 Create `packages/server/src/utils/cache.ts` with generic `TtlCache<V>` class — constructor takes `ttlMs` and `name`, implements `get(key)`, `set(key, value)`, `clear()`
- [ ] 1.2 `get()` checks expiry, deletes expired entries, returns `undefined` on miss
- [ ] 1.3 Add periodic full-clear: track `lastClearTime`, clear entire map when `now - lastClearTime > ttlMs` (same pattern as `skillFilterCache` in plannerAgent.ts)
- [ ] 1.4 Unit test: set + get returns value, get after TTL returns undefined, clear empties map

## 2. Add cache metrics logging

- [ ] 2.1 In TtlCache, track `hits` and `misses` counters
- [ ] 2.2 On `get()` hit: `console.log([cache:<name>] HIT key=<first8>)`; on miss: `console.log([cache:<name>] MISS key=<first8>)`
- [ ] 2.3 On periodic clear (when total > 0): log `[cache:<name>] period hits=N misses=M ratio=P%`, then reset counters
- [ ] 2.4 Unit test: verify hit/miss counters increment correctly

## 3. Add intent classification cache

- [ ] 3.1 In `intentClassifier.ts`, import TtlCache and create `const intentCache = new TtlCache<Intent>(300_000, 'intent')`
- [ ] 3.2 Add `hasPrototype: boolean` parameter to `classifyIntent()` function signature
- [ ] 3.3 Compute cache key: `createHash('md5').update(message.slice(0, 100) + '|' + hasPrototype + '|' + hasShell).digest('hex')`
- [ ] 3.4 Before API call: check `intentCache.get(key)`, return cached value if hit
- [ ] 3.5 After API call: `intentCache.set(key, intent)` before returning
- [ ] 3.6 Update caller in `chat.ts` to pass `hasPrototype` (from existing `latestPrototype` check) to `classifyIntent()`

## 4. Update call sites

- [ ] 4.1 In `chat.ts`, find the `classifyIntent()` call and add `hasPrototype` argument (boolean, derived from whether `latestPrototype` exists)
- [ ] 4.2 Verify no other callers of `classifyIntent()` exist; update any if found

## 5. Testing

- [ ] 5.1 Unit test `TtlCache`: set/get, expiry, clear, metrics counters
- [ ] 5.2 Unit test `classifyIntent` caching: mock Gemini API, verify second call with same args does not call API
- [ ] 5.3 Unit test: different hasPrototype values produce different cache entries
- [ ] 5.4 Integration test: send two identical chat messages in quick succession, verify only one intent classification API call is made (check logs for HIT)
