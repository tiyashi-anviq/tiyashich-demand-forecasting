# Demand Drivers Page - Issue Resolution

## Problem
The demand drivers page was stuck showing "Training the driver model" loading message even when the model was ready.

## Root Cause
1. **Caching Building States**: The GraphStore (`api/app/graphstore.py`) was caching API responses with `state: "building"` or `state: "error"`
2. **Server Auto-Restart**: The API server runs with `--reload` flag, which auto-restarts on code changes, resetting in-memory state
3. **Stale Cache Served**: After server restart, while the model was rebuilding, cached "building" responses were served to the frontend

## Solution Applied
Modified `api/app/graphstore.py` to **never cache responses with building or error states**:

```python
# Don't cache building or error states - they should be recomputed
result_state = result.get("state") if isinstance(result, dict) else None
should_cache = result_state not in ("building", "error")
if should_cache:
    # ... save to cache
```

## Benefits
- ✅ The frontend always gets fresh data when the model is ready
- ✅ No manual cache clearing needed
- ✅ Transitional states (building/error) are never cached
- ✅ Ready states are still cached for performance

## After Server Restart
When the API server restarts (due to code changes or manual restart):
1. The panel and model need to rebuild (takes ~1-2 minutes)
2. During this time, the page will show the loading state (correct behavior)
3. Once ready, the page automatically loads the full analysis
4. No manual intervention needed

## How to Check Status
```bash
# Check if panel and model are ready
curl -s "http://localhost:8000/api/eda/status" | python3 -m json.tool

# Test the drivers endpoint
curl -s "http://localhost:8000/api/eda/drivers" | head -c 200
```

## Clear Stale Cache (if needed)
If you ever need to manually clear stale cache entries:

```bash
./clear_driver_cache.sh
```

Or directly:
```bash
sqlite3 api/storage/graphs.sqlite "DELETE FROM graph_payloads WHERE view='drivers' AND (payload LIKE '%building%' OR payload LIKE '%error%');"
```

## Prevention Tips
1. The fix prevents this issue automatically - no action needed
2. If modifying API code during development, expect 1-2 minute rebuild time after restart
3. The `--reload` flag is useful for development but should be removed in production

## Status: ✅ FIXED
Date: November 2, 2026
