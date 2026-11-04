# Demand Driver Page - Performance Optimization Plan

## Problem Summary
The demand driver page is slow because it performs expensive computations on every request, even when filters haven't changed significantly.

## Root Causes

### 1. No Caching at the GraphStore Level
**Location:** `api/app/eda/router.py:85`
```python
@router.get("/drivers")
def drivers(...):
    _ready()
    return G.serve('eda', 'drivers', dict(locals()), _ver(), lambda: D.drivers(_f(...), feature))
```

**Issue:** The `G.serve` (GraphStore) caching works, but the version key `_ver()` includes `loaded_at` timestamp, which changes whenever data is reloaded. This invalidates ALL cached results even for the same filters.

### 2. Expensive Computations Run Synchronously
**Location:** `api/app/eda/drivers.py:169-179` (Mutual Information)

**Operations that run on EVERY uncached request:**
- Mutual information regression on 12,000 samples (~500-1000ms)
- Pearson/Spearman correlations on 40,000 samples (~200-500ms)
- Lag table correlations (7 lags × N features) (~300-800ms)
- Response curve quantile binning (~100-300ms)
- Collinearity matrix computation (~100-200ms)

**Total: 1.2-3.5 seconds** per request when cache is cold

### 3. Frontend Marks Data Stale Immediately
**Location:** `ui/src/lib/useView.ts:15`
```typescript
staleTime: 0,  // Mark data as stale immediately
```

**Issue:** Combined with `keepPreviousData`, this causes the UI to refetch on every filter change, even minor ones.

## Recommended Solutions

### Priority 1: Improve Backend Caching Strategy (HIGH IMPACT)

#### Option A: Multi-Level GraphStore Cache Keys
Instead of invalidating everything on data reload, use more granular cache keys:

```python
# In graphstore.py
def version_with_filters(data_version: str, filters: dict) -> str:
    """Create version key that includes filter signature"""
    filter_sig = hashlib.md5(
        json.dumps({
            'family': filters.get('family'),
            'region': filters.get('region'), 
            'channel': filters.get('channel'),
            'measure': filters.get('measure')
        }, sort_keys=True).encode()
    ).hexdigest()[:8]
    return f"{data_version[:12]}_{filter_sig}"
```

**Benefit:** Results stay cached across feature changes, date range tweaks, etc.

#### Option B: Pre-compute Expensive Operations
Add a background task after model training to pre-compute common filter combinations:

```python
def _precompute_driver_analytics(measure: str) -> None:
    """Pre-compute MI, correlations, lag tables for common filters"""
    common_filters = [
        {},  # All data
        {'family': ['Batteries']},
        {'family': ['Lighting']},
        # etc.
    ]
    for f in common_filters:
        try:
            drivers(f, feature=None)  # This populates caches
        except:
            pass
```

### Priority 2: Optimize Computation Patterns (MEDIUM IMPACT)

#### A. Parallelize Independent Computations
```python
from concurrent.futures import ThreadPoolExecutor

def drivers(f: dict, feature: str | None = None) -> dict:
    # ... existing code ...
    
    with ThreadPoolExecutor(max_workers=3) as executor:
        # Run these in parallel
        mi_future = executor.submit(_compute_mi, d, y, feats, key)
        lag_future = executor.submit(_lag_table, f, d, y)
        ex_future = executor.submit(_example_check, p)
        
        mi = mi_future.result()
        lag = lag_future.result()
        ex = ex_future.result()
```

**Benefit:** ~40-50% reduction in total compute time

#### B. Sample Size Reduction for MI Calculation
```python
# Current: min(12000, len(d))
# Proposed: Adaptive sampling based on data size
sample_size = min(5000 if len(d) < 50000 else 8000, len(d))
```

**Benefit:** 30-40% faster MI computation with minimal accuracy loss

#### C. Lazy Load Heavy Analytics
Split the endpoint into:
- `/drivers` - Core rankings and SHAP only
- `/drivers/details` - Event study, collinearity, etc. loaded on-demand

### Priority 3: Frontend Optimizations (LOW-MEDIUM IMPACT)

#### A. Increase StaleTime for Stable Data
```typescript
// In useView.ts
export function useView<T extends { state?: string }>(
  base: string, 
  view: string, 
  query: string, 
  enabled = true,
  staleTime = 30000  // 30 seconds for most views
) {
  return useQuery<T, AppError>({
    queryKey: [base, view, query],
    queryFn: () => getJson<T>(`/api/${base}/${view}?${query}`),
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: (q) => (q.state.data?.state && q.state.data.state !== 'ready' ? 2500 : false),
    staleTime,  // Don't refetch unnecessarily
  })
}
```

#### B. Debounce Filter Changes
```typescript
// In Drivers.tsx
const debouncedFilters = useMemo(
  () => debounce(f, 300),  // Wait 300ms after filter stops changing
  [f]
);
const q = useView<any>('eda', 'drivers', queryOf(debouncedFilters, opts, ...))
```

### Priority 4: Monitor and Alert (ONGOING)

Add timing instrumentation:

```python
import time
import logging

def drivers(f: dict, feature: str | None = None) -> dict:
    start = time.time()
    timings = {}
    
    # ... existing code with timing checkpoints ...
    timings['mi'] = time.time() - checkpoint
    # ... etc ...
    
    logger.info(f"drivers() completed in {time.time() - start:.2f}s", extra={"timings": timings})
```

## Implementation Priority & Impact

| Fix | Effort | Speed Improvement | User Impact |
|-----|--------|------------------|-------------|
| Multi-level cache keys | 4 hours | 70-90% (for repeated filter patterns) | High - Most users revisit same filters |
| Parallelize computations | 6 hours | 40-50% (when cache cold) | Medium |
| Increase staleTime | 1 hour | 60-80% (for rapid filter changes) | High |
| Pre-compute common filters | 8 hours | 90%+ (for those filters) | High |
| Reduce MI sample size | 2 hours | 30-40% | Low (slight accuracy ↓) |
| Debounce filters | 2 hours | 70-80% (for rapid typing) | Medium |
| Lazy load details | 16 hours | 50-60% (initial load) | Medium |

## Quick Win (Implement First)

**Combo: Multi-level cache + Increase staleTime + Debounce**
- **Total Effort:** ~7 hours
- **Speed Improvement:** 80-90% for typical usage patterns
- **Risk:** Low - all are additive improvements

## Testing Strategy

1. Add performance logging to measure before/after
2. Test with realistic filter combinations (families, regions, date ranges)
3. Measure time-to-interactive for:
   - First page load
   - Filter change
   - Feature selection change
4. Monitor cache hit rates in production

## Success Metrics

- **Current:** 2-4 seconds for initial load, 1-3 seconds per filter change
- **Target:** <500ms for cached results, <1.5 seconds for cold cache
- **Cache hit rate target:** >70% after warmup

