"""Eveready's five plants, and how production is shared between them.

The capacity file holds one rated figure per line type (nationwide). Real plants each hold part of it, so each line type is split across the plants here.
THE SPLIT AND THE REGION-TO-PLANT SUPPLY MAP ARE ILLUSTRATIVE ASSUMPTIONS: the data has no plant column. To use real figures, put a JSON file at
storage/plants.json with the same keys as DEFAULT ({"shares": {line: {plant: share}}, "home": {region: {plant: weight}}}); no code change is needed."""
from __future__ import annotations

import json

import numpy as np

from .. import store  # noqa: F401  (kept so the storage root is importable from here)

PLANTS = ["Jammu", "Haridwar", "Lucknow", "Matia", "Maddur"]
STATE = {"Jammu": "Jammu and Kashmir", "Haridwar": "Uttarakhand", "Lucknow": "Uttar Pradesh", "Matia": "Assam", "Maddur": "Karnataka"}

DEFAULT = dict(
    # share of each line type's rated capacity held by each plant (rows sum to 1; a missing plant does not make that line type)
    shares={
        "Carbon Zinc Line": {"Jammu": 0.15, "Haridwar": 0.20, "Lucknow": 0.25, "Matia": 0.25, "Maddur": 0.15},
        "Torch & Lantern Assembly": {"Jammu": 0.20, "Lucknow": 0.30, "Matia": 0.20, "Maddur": 0.30},
        "Alkaline Line": {"Haridwar": 0.30, "Lucknow": 0.30, "Maddur": 0.40},
        "Coin Cell Line": {"Haridwar": 0.50, "Maddur": 0.50},
        "Rechargeable / NiMH Line": {"Jammu": 0.40, "Lucknow": 0.60},
    },
    # where each region's orders are served from first (weights add to 1)
    home={
        "North": {"Haridwar": 0.40, "Jammu": 0.30, "Lucknow": 0.30},
        "East": {"Matia": 0.70, "Lucknow": 0.30},
        "South": {"Maddur": 1.0},
        "West": {"Maddur": 0.50, "Lucknow": 0.50},
    },
)


def config() -> dict:
    try:
        p = store.ROOT / "plants.json"  # type: ignore[attr-defined]
        if p.exists():
            return {**DEFAULT, **json.loads(p.read_text())}
    except Exception:
        pass
    return DEFAULT


def allocate(need: float, region_share: dict[str, float], caps: dict[str, float], home: dict) -> dict:
    """Share one month's need for a line type between the plants that make it.

    1. Each plant first takes the orders from the regions it serves, up to its own capacity.
    2. What a full plant cannot make goes to plants that still have room, in proportion to that room.
    3. Only if every plant is full is the rest unmet, and it moves on to next month."""
    ps = [p for p, c in caps.items() if c > 0]
    w = {p: 0.0 for p in ps}
    for rg, sh in region_share.items():
        h = {p: v for p, v in home.get(rg, {}).items() if p in w}
        tot = sum(h.values())
        if tot <= 0:
            h, tot = {p: caps[p] for p in ps}, sum(caps[p] for p in ps)
        for p, v in h.items():
            w[p] += sh * v / tot
    s = sum(w.values()) or 1.0
    own = {p: need * w[p] / s for p in ps}
    made_own = {p: min(own[p], caps[p]) for p in ps}
    over = {p: max(0.0, own[p] - caps[p]) for p in ps}
    spare = {p: caps[p] - made_own[p] for p in ps}
    pool, room = sum(over.values()), sum(spare.values())
    moved = min(pool, room)
    take = {p: (moved * spare[p] / room if room > 0 else 0.0) for p in ps}
    return dict(own=own, made_own=made_own, sent=over, take=take, made={p: made_own[p] + take[p] for p in ps}, unmet=pool - moved, made_total=sum(made_own.values()) + moved)
