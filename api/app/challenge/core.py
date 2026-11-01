"""Forecast challenge: every number is held at the deepest level, region -> channel -> SKU. Each Regional Head submits a number for every
channel and SKU in their region and agrees it with the S&D Head. Once every region has agreed a family, the agreed numbers go to the
Business Unit heads, who each take the channels under them (across all regions) and agree them line by line with the S&D Head. What the
units agree is the final forecast for the month, and the supply plan, depot allocation and stock transfers are checked against it.
Decisions are kept in one small JSON file next to the workspace."""
from __future__ import annotations

import hashlib
import json
import time

import numpy as np
import pandas as pd

from .. import store
from ..eda import panel as P
from ..forecast import engine

FILE = store.ROOT / "challenge.json"
MONTHS_AHEAD = (0, 1, 2)  # the three months after the last actuals: with September actuals in, October is M1, November M2 and December M3
REGIONS_ORDER = ["North", "South", "East", "West"]


def _migrate(d: dict) -> dict:
    """Numbers saved before the challenge went to channel and SKU level cannot be read at that level, so they are dropped."""
    d.setdefault("items", {})
    d.setdefault("consol", {})
    d.setdefault("rneg", {})
    stale_r = [k for k, v in d["rneg"].items() if any("|" not in s_ for s_ in v.get("lines", {}))]
    stale_b = any("lines" not in v for v in d["items"].values())
    for k in stale_r:
        del d["rneg"][k]
    if stale_r or stale_b:
        d["items"], d["consol"] = {}, {}
    # What each Regional Head put on the table, kept apart from the number the S&D Head has since countered with.
    # Numbers saved before this split are read as the regional submission, which is the best record there is.
    for v in d["rneg"].values():
        if "lines" in v:
            v.setdefault("submitted", dict(v["lines"]))
            v.setdefault("submitted_reason", "Regional submission")
            v.setdefault("submitted_at", 0)
    return d


def _load() -> dict:
    if FILE.exists():
        try:
            return _migrate(json.loads(FILE.read_text()))
        except Exception:
            pass
    return _migrate({})


def _save(d: dict) -> None:
    FILE.write_text(json.dumps(d))


def reset() -> None:
    FILE.unlink(missing_ok=True)


_cache: dict = {}


def _units() -> tuple[list[dict], dict[str, str]]:
    """The business units and which unit each channel sits under, from the Channel Master. 
    Each channel is its own BU (1:1 mapping). Falls back to one unit for everything."""
    ws = store.read_workspace() or {}
    df = P._find(ws, "location_master", {"channel", "BU_Head"})
    if df is None or df.empty:
        return [dict(bu="ALL", name="All channels", head="Sales head", channels=[])], {}
    df = df.drop_duplicates("channel")
    heads = {r.channel: str(r.BU_Head).split(" (")[0].strip() for r in df.itertuples()}
    names = {r.channel: str(r.Channel_Name) for r in df.itertuples()}
    # Each channel is its own BU - 1:1 mapping
    units = [dict(bu=ch, name=names[ch], head=heads[ch], channels=[ch]) for ch in sorted(heads.keys())]
    bu_of = {ch: ch for ch in heads.keys()}  # channel maps to itself as BU
    return units, bu_of


def _model():
    """Model forecast and last year by (family, region, business unit) for the cycle's months, cached per build."""
    r = engine.result()
    key = id(r)
    if _cache.get("key") == key:
        return _cache["v"]
    units, bu_of = _units()
    sidx, months, fm = r["sidx"], r["months"], r["fmonths"]
    ym = {m: i for i, m in enumerate(months)}
    cyc = [fm[i] for i in MONTHS_AHEAD]
    fams = sorted(sidx["family"].unique())
    regs = [x for x in REGIONS_ORDER if x in set(sidx["region"])] + [x for x in sorted(sidx["region"].unique()) if x not in REGIONS_ORDER]
    ens = r["fut"]["ens"]
    bu_col = sidx["channel"].map(lambda c: bu_of.get(c, units[0]["bu"]))
    used = [u for u in units if (bu_col == u["bu"]).any()]
    lm_i = len(months) - 1  # the last actual month: the month before the cycle starts
    out = {}
    for fam in fams:
        for reg in regs:
            for u in used:
                ix = np.where(((sidx["family"] == fam) & (sidx["region"] == reg) & (bu_col == u["bu"])).to_numpy())[0]
                if not len(ix):
                    continue
                e = ens[:, ix].sum(axis=1)
                a = np.nansum(r["Y"][ix], axis=0)
                for k, m in zip(MONTHS_AHEAD, cyc):
                    ly_m = f"{int(m[:4]) - 1}{m[4:]}"
                    ly = float(a[ym[ly_m]]) if ly_m in ym else None
                    lm = float(a[lm_i]) if lm_i >= 0 else None
                    out[(fam, reg, u["bu"], m)] = (float(e[k]), ly, lm)
    v = dict(months=cyc, families=fams, regions=regs, units=used, cell=out)
    _cache.update(key=key, v=v)
    return v


_scache: dict = {}


def _skumodel():
    """The model for each SKU in each region and business unit, for the cycle's months, with the same month last year.
    The family forecast is shared across SKUs the way the backtest does it (each SKU's share of its family, region and channel)."""
    r = engine.result()
    if _scache.get("key") == id(r):
        return _scache["v"]
    units, bu_of = _units()
    sk, months, fm = r["skus"].reset_index(drop=True), r["months"], r["fmonths"]
    ym = {m: i for i, m in enumerate(months)}
    cyc = [fm[i] for i in MONTHS_AHEAD]
    out: dict = {}
    chan: dict = {}  # (family, region, channel, sku, month) -> (model, last year, last month)
    lm_i = len(months) - 1  # the last actual month
    for i, row in enumerate(sk.itertuples(index=False)):
        bu = bu_of.get(row.channel, units[0]["bu"])
        for k, m in zip(MONTHS_AHEAD, cyc):
            ly_m = f"{int(m[:4]) - 1}{m[4:]}"
            f = float(r["sku_fut"][i, k])
            ly = float(r["skuY"][i, ym[ly_m]]) if ly_m in ym else 0.0
            lm = float(r["skuY"][i, lm_i]) if lm_i >= 0 else 0.0
            for key in ((row.family, row.region, row.sku, m), (row.family, row.region, row.sku, bu, m)):
                a = out.get(key, (0.0, 0.0, 0.0))
                out[key] = (a[0] + f, a[1] + ly, a[2] + lm)
            ck = (row.family, row.region, row.channel, row.sku, m)
            a = chan.get(ck, (0.0, 0.0, 0.0))
            chan[ck] = (a[0] + f, a[1] + ly, a[2] + lm)
    skus = {}
    for row in sk.drop_duplicates("sku").itertuples(index=False):
        skus[row.sku] = row.family
    v = dict(cell=out, chan=chan, skus=skus)
    _scache.update(key=id(r), v=v)
    return v


def _desc() -> dict:
    ws = store.read_workspace() or {}
    df = P._find(ws, "product_master", {"sku", "family", "brand"})
    if df is None or "description" not in df.columns:
        return {}
    return df.drop_duplicates("sku").set_index("sku")["description"].astype(str).to_dict()


def _sku_seed(fam: str, reg: str, m: str, line: str, model: float) -> float:
    """A region's starting number for one channel and SKU: the region's family-level nudge, with a small repeatable wobble per line. Simulated."""
    h = int(hashlib.md5(f"{fam}|{reg}|{m}".encode()).hexdigest()[:6], 16) / 0xFFFFFF
    w = int(hashlib.md5(f"{line}|{reg}|{m}".encode()).hexdigest()[:6], 16) / 0xFFFFFF
    return round(model * (1.02 + 0.16 * h) * (0.94 + 0.12 * w))


def _bu_for(channel: str) -> str:
    units, bu_of = _units()
    return bu_of.get(channel, units[0]["bu"])


def region_skus(m: str, fam: str, reg: str) -> list[dict]:
    """The channel and SKU lines a region sells in a family, channel by channel, largest SKU first."""
    sm = _skumodel()
    rows = []
    for key, (mod, ly, lm) in sm["chan"].items():
        if key[0] == fam and key[1] == reg and key[4] == m:
            rows.append(dict(channel=key[2], sku=key[3], model=mod, last_year=ly, last_month=lm))
    rows.sort(key=lambda x: (x["channel"], -x["model"]))
    return rows


def _rdef(m: str, fam: str, reg: str) -> dict:
    lines = {f"{x['channel']}|{x['sku']}": _sku_seed(fam, reg, m, f"{x['channel']}|{x['sku']}", x["model"]) for x in region_skus(m, fam, reg)}
    # Start with empty submitted dict - Regional submits products one by one
    return dict(status="negotiating", turn="regional", lines=lines, submitted={}, submitted_reason="", submitted_at=0,
                simulated=False, agreed_by=None, rounds=[])


def _ritem(d: dict, m: str, fam: str, reg: str) -> dict:
    return d.setdefault("rneg", {}).get(f"{m}|{fam}|{reg}") or _rdef(m, fam, reg)


def _rsave(d: dict, m: str, fam: str, reg: str, it: dict) -> None:
    d.setdefault("rneg", {})[f"{m}|{fam}|{reg}"] = it


def _seed(fam: str, reg: str, m: str, model: float) -> float:
    """Where a region's number starts: the model, nudged by a repeatable amount per region, family and month.
    Simulated: no real regional submissions exist in this demo."""
    h = int(hashlib.md5(f"{fam}|{reg}|{m}".encode()).hexdigest()[:6], 16) / 0xFFFFFF  # 0..1
    return round(model * (1.02 + 0.16 * h))


def _label(m: str) -> str:
    y, mo = m.split("-")
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][int(mo) - 1] + " " + y


def _ly(x):
    return None if x is None else round(x)


def cycle() -> dict:
    mod = _model()
    d = _load()
    rows = []
    for m in mod["months"]:
        for fam in mod["families"]:
            regs, model_t, ly_t, lm_t, sub_t = [], 0.0, 0.0, 0.0, 0.0
            for reg in mod["regions"]:
                cells = [mod["cell"][(fam, reg, u["bu"], m)] for u in mod["units"] if (fam, reg, u["bu"], m) in mod["cell"]]
                if not cells:
                    continue
                model = sum(c[0] for c in cells)
                ly = sum(c[1] or 0 for c in cells)
                lm = sum(c[2] or 0 for c in cells)
                # the same split by business unit, so a single unit can be looked at on its own
                reg_bus = []
                for u in mod["units"]:
                    c = mod["cell"].get((fam, reg, u["bu"], m))
                    if c is None:
                        continue
                    reg_bus.append(dict(bu=u["bu"], model=round(c[0]), last_year=round(c[1] or 0), last_month=round(c[2] or 0)))
                ri = _ritem(d, m, fam, reg)
                # Show submitted total if exists, otherwise 0 (not model forecast)
                q = round(sum(ri.get("submitted", {}).values())) if ri.get("submitted") else 0
                submitted_skus = len({k.split("|", 1)[1] for k in ri.get("submitted", {})})
                submitted_channels = len({k.split("|", 1)[0] for k in ri.get("submitted", {})})
                regs.append(dict(region=reg, model=round(model), last_year=round(ly), last_month=round(lm), qty=q, simulated=ri["simulated"], note="", status=ri["status"], turn=ri["turn"],
                                 rounds=ri["rounds"], agreed_by=ri["agreed_by"], skus=submitted_skus,
                                channels=submitted_channels, bus=reg_bus))
                model_t += model
                ly_t += ly
                lm_t += lm
                sub_t += q
            con = d["consol"].get(f"{m}|{fam}")
            bus = []
            for u in mod["units"]:
                mb = sum(mod["cell"][(fam, reg, u["bu"], m)][0] for reg in mod["regions"] if (fam, reg, u["bu"], m) in mod["cell"])
                lb = sum((mod["cell"][(fam, reg, u["bu"], m)][1] or 0) for reg in mod["regions"] if (fam, reg, u["bu"], m) in mod["cell"])
                lmb = sum((mod["cell"][(fam, reg, u["bu"], m)][2] or 0) for reg in mod["regions"] if (fam, reg, u["bu"], m) in mod["cell"])
                if mb <= 0:
                    continue
                it = d["items"].get(f"{m}|{fam}|{u['bu']}")
                bus.append(dict(bu=u["bu"], name=u["name"], head=u["head"], channels=u["channels"], model=round(mb), last_year=round(lb), last_month=round(lmb),
                                share=mb / model_t if model_t else 0, status=(it or {}).get("status", "waiting"), turn=(it or {}).get("turn"),
                                proposal=(it or {}).get("proposal"), rounds=(it or {}).get("rounds", []), agreed=(it or {}).get("agreed"),
                                agreed_by=(it or {}).get("agreed_by")))
            n_ag = sum(1 for b in bus if b["status"] == "agreed")
            n_reg_ag = sum(1 for x in regs if x["status"] == "agreed")
            status = "collecting" if con is None else ("agreed" if bus and n_ag == len(bus) else "negotiating")
            rows.append(dict(month=m, family=fam, model=round(model_t), last_year=round(ly_t), last_month=round(lm_t), regional=regs, regional_total=round(sub_t), n_regions_agreed=n_reg_ag, n_regions=len(regs),
                             consolidated=None if con is None else con["qty"], status=status, bus=bus, n_agreed=n_ag,
                             agreed=round(sum(b["agreed"] for b in bus)) if status == "agreed" else None))
    return dict(months=[dict(m=m, label=_label(m), lead=i + 1) for i, m in enumerate(mod["months"])], families=mod["families"], regions=mod["regions"],
                units=[dict(bu=u["bu"], name=u["name"], head=u["head"], channels=u["channels"]) for u in mod["units"]], items=rows)


def _row(m: str, fam: str) -> dict:
    mod = _model()
    if m not in mod["months"] or fam not in mod["families"]:
        raise ValueError("That month or family is not in this cycle.")
    return next(x for x in cycle()["items"] if x["month"] == m and x["family"] == fam)


def _bu(row: dict, bu: str) -> dict:
    b = next((x for x in row["bus"] if x["bu"] == bu), None)
    if b is None:
        raise ValueError("That business unit does not sell this family.")
    return b


def respond(m: str, fam: str, bu: str, role: str, action: str, lines: dict | None, reason: str) -> None:
    """The conversation between the S&D Head and one business unit head about a family: numbers go in region by region, channel by channel, SKU by SKU."""
    _bu(_row(m, fam), bu)
    d = _load()
    it = d["items"].get(f"{m}|{fam}|{bu}")
    if not it or it["status"] != "negotiating":
        raise ValueError("This number is not being negotiated.")
    who = "BU Head" if role == "bu" else "S&D Head"
    if role != it["turn"] and not (role == "sd" and action == "final"):
        raise ValueError("It is the other side's turn.")
    total = round(sum(it["lines"].values()))
    if action == "accept":
        it.update(status="agreed", agreed=total, proposal=total, agreed_by=f"{who} accepted", turn=None)
        it["rounds"].append(dict(by=who, action="accept", qty=total, reason=reason or "Accepted", at=time.time()))
    elif action in ("counter", "final"):
        if action == "final" and role != "sd":
            raise ValueError("Only the S&D Head can make the final call.")
        if not reason.strip():
            raise ValueError("A counter-offer or a final call needs a reason.")
        new = _check_lines(it["lines"], lines)
        old = it["lines"]
        it["lines"] = new
        q = round(sum(new.values()))
        changed = sum(1 for k in new if new[k] != old.get(k))
        if action == "final":
            it.update(status="agreed", proposal=q, agreed=q, agreed_by="S&D Head, final call", turn=None)
        else:
            it.update(proposal=q, turn="sd" if role == "bu" else "bu")
        it["rounds"].append(dict(by=who, action=action, qty=q, reason=reason.strip(), at=time.time(), changed=changed))
    else:
        raise ValueError("Unknown action.")
    _save(d)


def reopen(m: str, fam: str, bu: str) -> None:
    _bu(_row(m, fam), bu)
    d = _load()
    it = d["items"].get(f"{m}|{fam}|{bu}")
    if not it:
        raise ValueError("This number has not been sent to the business unit yet.")
    it.update(status="negotiating", turn="bu", agreed=None, agreed_by=None)
    it["rounds"].append(dict(by="S&D Head", action="reopen", qty=it["proposal"], reason="Reopened", at=time.time()))
    _save(d)


def agreed() -> list[dict]:
    """The sales team's forecast: one record per agreed business unit, plus the family total once every unit has agreed."""
    out = []
    for r in cycle()["items"]:
        for b in r["bus"]:
            if b["agreed"] is not None:
                out.append(dict(month=r["month"], family=r["family"], bu=b["bu"], bu_name=b["name"], qty=b["agreed"], model=b["model"], last_year=b["last_year"], by=b["agreed_by"],
                                family_complete=r["agreed"] is not None))
    return out


_WHAT = {"propose": "Proposed", "counter": "Countered", "accept": "Accepted", "final": "Final call", "reopen": "Reopened", "revise": "Revised"}


def activity() -> list[dict]:
    """Everything that has happened in the cycle, newest first: every round with a region, the hand-over to the units and every round with a unit."""
    d = _load()
    out = []
    for k, v in d["rneg"].items():
        m, fam, reg = k.split("|")
        for r in v["rounds"]:
            if r["at"]:  # the simulated opening number has no time
                out.append(dict(at=r["at"], month=m, family=fam, bu=None, who=r["by"], what=_WHAT.get(r["action"], r["action"]), qty=r["qty"], reason=f"{reg}: {r['reason']}"))
    for k, v in d["consol"].items():
        m, fam = k.split("|")
        out.append(dict(at=v["at"], month=m, family=fam, bu=None, who="S&D Head", what="Sent to the units", qty=v["qty"], reason="Every region agreed"))
    names = {u["bu"]: u["name"] for u in _model()["units"]}
    for k, v in d["items"].items():
        m, fam, bu = k.split("|")
        for r in v["rounds"]:
            out.append(dict(at=r["at"], month=m, family=fam, bu=names.get(bu, bu), who=r["by"], what=_WHAT.get(r["action"], r["action"]), qty=r["qty"], reason=r["reason"]))
    out.sort(key=lambda x: -x["at"])
    return out


def _all_regions_agreed(d: dict, m: str, fam: str) -> bool:
    mod = _model()
    regs = [rg for rg in mod["regions"] if any((fam, rg, u["bu"], m) in mod["cell"] for u in mod["units"])]
    return bool(regs) and all(_ritem(d, m, fam, rg)["status"] == "agreed" for rg in regs)


def _consolidate(d: dict, m: str, fam: str) -> None:
    """Send the numbers on the table for a family to the business units. Each unit gets the channels under it, in every
    region, channel by channel and SKU by SKU. Only submitted products are sent."""
    mod = _model()
    q = 0
    unit_lines: dict[str, dict[str, float]] = {}
    for rg in mod["regions"]:
        if any((fam, rg, u["bu"], m) in mod["cell"] for u in mod["units"]):
            ri = _ritem(d, m, fam, rg)
            # Use submitted values only, not all lines with simulated values
            submitted = ri.get("submitted", {})
            q += round(sum(submitted.values()))
            for k, v in submitted.items():
                unit_lines.setdefault(_bu_for(k.split("|", 1)[0]), {})[f"{rg}|{k}"] = v
    _save(d)
    d = _load()
    row = _row(m, fam)
    d["consol"][f"{m}|{fam}"] = dict(qty=q, at=time.time())
    for b in row["bus"]:
        lines = unit_lines.get(b["bu"], {})
        p = round(sum(lines.values()))
        # Only create BU items if there are actually lines for that BU
        if lines:
            d["items"][f"{m}|{fam}|{b['bu']}"] = dict(status="negotiating", proposal=p, turn="bu", agreed=None, agreed_by=None, lines=lines,
                                                       rounds=[dict(by="S&D Head", action="propose", qty=p, reason="The agreed regional numbers for this unit's channels", at=time.time())])
    _save(d)


def _auto_consolidate(d: dict, m: str, fam: str) -> None:
    """Once every region has agreed its numbers with the S&D Head, the family goes to the business units."""
    if f"{m}|{fam}" in d["consol"] or not _all_regions_agreed(d, m, fam):
        return
    _consolidate(d, m, fam)


def consolidate(m: str, fam: str) -> None:
    """The S&D Head sends the numbers on the table to the business units without waiting for every region. The demo's
    short path: one regional submission is enough to open the business unit conversation."""
    _row(m, fam)
    d = _load()
    if f"{m}|{fam}" in d["consol"]:
        raise ValueError("This family has already gone to the business units.")
    _consolidate(d, m, fam)


def _check_lines(cur: dict, lines: dict | None, merge: bool = True) -> dict:
    """Validate submitted lines. If merge=True, update existing values. If merge=False, only store submitted products."""
    if not lines:
        raise ValueError("A submission needs at least one channel and SKU with a number.")
    out = dict(cur) if merge else {}  # Merge with existing or start fresh
    for k, v in lines.items():
        if k not in cur and merge:
            continue  # Skip keys not in current data (might be filtered out)
        if v is None:
            if merge:
                continue  # Keep existing value if None submitted
            else:
                raise ValueError("Every submitted number must have a value.")
        if float(v) < 0:
            raise ValueError("Every number must be zero or more.")
        out[k] = round(float(v))
    return out


def region_respond(m: str, fam: str, reg: str, role: str, action: str, lines: dict | None, reason: str) -> None:
    """The conversation between the S&D Head and one Regional Head about a family: numbers go in SKU by SKU."""
    d = _load()
    if f"{m}|{fam}" in d["consol"]:
        raise ValueError("This family has already gone to the business units, so the regional numbers are locked.")
    it = _ritem(d, m, fam, reg)
    it.setdefault("submitted", dict(it["lines"]))
    it.setdefault("submitted_reason", "Regional submission")
    it.setdefault("submitted_at", 0)
    if it["status"] != "negotiating":
        raise ValueError("These numbers are not being negotiated.")
    who = "S&D Head" if role == "sd" else f"{reg} Regional Head"
    mine = "sd" if role == "sd" else "regional"
    if action == "final":
        if role != "sd":
            raise ValueError("Only the S&D Head can make the final call.")
    elif it["turn"] != mine and not (role == "regional" and action == "revise" and it["turn"] == "sd"):
        raise ValueError("It is the other side's turn.")
    total = round(sum(it["lines"].values()))
    if action == "accept":
        it.update(status="agreed", agreed_by=f"{who} accepted", turn=None)
        it["rounds"].append(dict(by=who, action="accept", qty=total, reason=reason or "Accepted", at=time.time()))
    elif action in ("counter", "final", "revise", "propose"):
        if not reason.strip() and action != "propose":
            raise ValueError("A change needs a reason.")
        # For Regional: merge new submissions with existing submitted products (additive)
        # For S&D: merge with lines (full product list)
        if role == "regional":
            new_submitted = _check_lines(it.get("submitted", {}), lines, merge=False)
            it["submitted"].update(new_submitted)
            it["submitted_reason"] = reason.strip() or "Regional submission"
            it["submitted_at"] = time.time()
            # Update lines with submitted values
            for k, v in new_submitted.items():
                if k in it["lines"]:
                    it["lines"][k] = v
            new = it["lines"]
            old = it["lines"]
        else:
            new = _check_lines(it["lines"], lines, merge=True)
            old = dict(it["lines"])
            it["lines"] = new
        t2 = round(sum(new.values()))
        if action == "final":
            it.update(status="agreed", agreed_by="S&D Head, final call", turn=None, simulated=False)
        elif action == "revise":
            it.update(simulated=False)  # the Regional Head is revising their own number; still the S&D Head's turn
        else:
            it.update(turn="regional" if role == "sd" else "sd", simulated=False)
        it["rounds"].append(dict(by=who, action=action, qty=t2, reason=reason.strip(), at=time.time(), changed=sum(1 for k in new if new[k] != old.get(k))))
    else:
        raise ValueError("Unknown action.")
    _rsave(d, m, fam, reg, it)
    _save(d)
    _auto_consolidate(_load(), m, fam)
    # Once the S&D Head has agreed, the family goes straight to the business units with the number that was agreed.
    if it.get("status") == "agreed" and f"{m}|{fam}" not in _load()["consol"]:
        _consolidate(_load(), m, fam)


def region_reopen(m: str, fam: str, reg: str) -> None:
    d = _load()
    if f"{m}|{fam}" in d["consol"]:
        raise ValueError("This family has already gone to the business units.")
    it = _ritem(d, m, fam, reg)
    it.update(status="negotiating", turn="regional", agreed_by=None)
    it["rounds"].append(dict(by="S&D Head", action="reopen", qty=round(sum(it["lines"].values())), reason="Reopened", at=time.time()))
    _rsave(d, m, fam, reg, it)
    _save(d)


def region_lines(m: str, fam: str, reg: str) -> dict:
    """SKU by SKU for one region: the model, last year and the number now on the table, with each SKU's change from the previous round."""
    d = _load()
    it = _ritem(d, m, fam, reg)
    submitted = it.get("submitted") or it["lines"]
    desc = _desc()
    rows = []
    for x in region_skus(m, fam, reg):
        key = f"{x['channel']}|{x['sku']}"
        cur = it["lines"].get(key, 0)
        rows.append(dict(channel=x["channel"], bu=_bu_for(x["channel"]), sku=x["sku"], description=desc.get(x["sku"], ""), model=round(x["model"]),
                         last_year=round(x["last_year"]), last_month=round(x["last_month"]), qty=cur,
                         submitted=submitted.get(key, cur)))
    # Extract BU and SKUs from submitted keys for filter auto-population
    submitted_keys = list(it.get("submitted", {}).keys())
    submitted_bus = list(set([k.split('|')[0] for k in submitted_keys])) if submitted_keys else []
    submitted_skus = list(set([k.split('|')[1] for k in submitted_keys])) if submitted_keys else []
    
    return dict(month=m, family=fam, region=reg, status=it["status"], turn=it["turn"], simulated=it["simulated"], rows=rows, 
                total=round(sum(it.get("submitted", {}).values())),
                submitted_reason=it.get("submitted_reason") or "",
                submitted_bus=submitted_bus,
                submitted_skus=submitted_skus)


def submissions(m: str, region: str | None = None, bu: str | None = None, family: str | None = None,
                product: str | None = None, status: str | None = None) -> dict:
    """The product-level numbers each Regional Head has submitted, region by region, business unit by business unit,
    with the Regional Head's own number beside the number now on the table. The S&D review tab filters this list so
    every region, unit and product does not arrive at once."""
    mod = _model()
    if m not in mod["months"]:
        raise ValueError("That month is not in this cycle.")
    d = _load()
    desc = _desc()
    names = _channel_names()
    units, bu_of = _units()
    unit_names = {u["bu"]: u["name"] for u in units}
    rows = []
    for (fam, reg, ch, sku, mm), (model, ly, lm) in _skumodel()["chan"].items():
        if mm != m or (family and fam != family) or (region and reg != region) or (product and sku != product):
            continue
        b = bu_of.get(ch, units[0]["bu"])
        if bu and b != bu:
            continue
        it = _ritem(d, m, fam, reg)
        if status and it["status"] != status:
            continue
        key = f"{ch}|{sku}"
        submitted = it.get("submitted") or it["lines"]
        sub = submitted.get(key, it["lines"].get(key, 0))
        cur = it["lines"].get(key, 0)
        rows.append(dict(family=fam, region=reg, bu=b, bu_name=unit_names.get(b, b), channel=ch, channel_name=names.get(ch, ch),
                         sku=sku, description=desc.get(sku, ""), model=round(model), last_year=round(ly), last_month=round(lm),
                         submitted=sub, current=cur, changed=cur - sub, status=it["status"], turn=it["turn"],
                         agreed_by=it["agreed_by"], submitted_by=f"{reg} Regional Head", submitted_at=it.get("submitted_at") or 0,
                         reason=it.get("submitted_reason") or "", rounds=len(it["rounds"])))
    rows.sort(key=lambda r: (r["region"], r["family"], r["bu"], r["channel"], -r["model"]))
    return dict(month=m, rows=rows, total=len(rows), regions=mod["regions"], families=mod["families"],
                units=[dict(bu=u["bu"], name=u["name"]) for u in units])


def _line_rows(m: str, fam: str, lines: dict, desc: dict) -> list[dict]:
    """Region, channel and SKU lines with the model and last year beside the number."""
    chan = _skumodel()["chan"]
    names = _channel_names()
    rows = []
    for k, q in lines.items():
        reg, ch, sku = k.split("|", 2)
        mod, ly, lm = chan.get((fam, reg, ch, sku, m), (0.0, 0.0, 0.0))
        rows.append(dict(key=k, region=reg, channel=ch, channel_name=names.get(ch, ch), sku=sku, description=desc.get(sku, ""), model=round(mod), last_year=round(ly), last_month=round(lm), qty=q))
    rows.sort(key=lambda x: (x["region"], x["channel"], -x["model"]))
    return rows


def _channel_names() -> dict:
    ws = store.read_workspace() or {}
    df = P._find(ws, "location_master", {"channel", "Channel_Name"})
    return {} if df is None else df.drop_duplicates("channel").set_index("channel")["Channel_Name"].astype(str).to_dict()


def bu_lines(m: str, fam: str, bu: str) -> dict:
    """Region by region, channel by channel and SKU by SKU for one business unit: the number now on the table."""
    row = _row(m, fam)
    b = _bu(row, bu)
    it = _load()["items"].get(f"{m}|{fam}|{bu}")
    rows = _line_rows(m, fam, it["lines"], _desc()) if it else []
    return dict(month=m, family=fam, bu=bu, status=b["status"], turn=b["turn"], current=b["agreed"] if b["agreed"] is not None else b["proposal"], rows=rows)


def final_lines(m: str, fam: str | None = None) -> list[dict]:
    """The final forecast: every line from BUs that have agreed, region by region, channel by channel and SKU by SKU. 
    Shows partial agreements - don't wait for all BUs."""
    d = _load()
    desc = _desc()
    out = []
    for row in cycle()["items"]:
        if row["month"] != m or (fam and row["family"] != fam):
            continue
        # Show lines from individual BUs that have agreed, not waiting for entire family
        for b in row["bus"]:
            if b["status"] == "agreed" and b["agreed"] is not None:
                it = d["items"].get(f"{m}|{row['family']}|{b['bu']}")
                if it:
                    for x in _line_rows(m, row["family"], it["lines"], desc):
                        out.append(dict(x, family=row["family"], bu=b["bu"], bu_name=b["name"], agreed_by=b["agreed_by"]))
    return out


def final_demand(m: str) -> dict:
    """The final numbers in the shape the supply plan wants: units by SKU, and by SKU and region, for families that are fully agreed."""
    by_sku: dict[str, float] = {}
    by_reg: dict[str, dict[str, float]] = {}
    fams = set()
    for x in final_lines(m):
        fams.add(x["family"])
        by_sku[x["sku"]] = by_sku.get(x["sku"], 0.0) + x["qty"]
        r = by_reg.setdefault(x["sku"], {})
        r[x["region"]] = r.get(x["region"], 0.0) + x["qty"]
    return dict(sku=by_sku, region=by_reg, families=fams)


def final_view(m: str) -> dict:
    """What the Final numbers tab shows: where each family stands, and every line of the families that are done."""
    fams = [dict(family=r["family"], status=r["status"], model=r["model"], last_year=r["last_year"], final=r["agreed"], n_agreed=r["n_agreed"], n_units=len(r["bus"]))
            for r in cycle()["items"] if r["month"] == m]
    return dict(month=m, families=fams, lines=final_lines(m))


def _depot_shares() -> dict:
    """Each depot's share of a SKU's invoiced units in its region, over the last 13 weeks of the inventory file."""
    ws = store.read_workspace() or {}
    inv = P._find(ws, "inventory", {"closing_qty", "Invoiced_Qty"})
    if inv is None:
        return {}
    inv = inv.copy()
    inv["date"] = pd.to_datetime(inv["date"])
    inv = inv[inv["date"] > inv["date"].max() - pd.Timedelta(days=91)]
    g = inv.groupby(["sku", "region", "depot", "City"], dropna=False)["Invoiced_Qty"].sum().reset_index()
    out: dict = {}
    for (sku, reg), x in g.groupby(["sku", "region"]):
        tot = float(x["Invoiced_Qty"].sum()) or 1.0
        out[(sku, reg)] = [dict(depot=r.depot, city=str(r.City), share=float(r.Invoiced_Qty) / tot) for r in x.itertuples()]
    return out


def allocation(m: str, fam: str) -> dict:
    """What goes to which region and which depot: the final numbers once the family is agreed (until then the latest on the table
    for each region), split across the region's depots by their recent share of that SKU's dispatches."""
    d = _load()
    mod = _model()
    shares = _depot_shares()
    desc = _desc()
    final = final_lines(m, fam)
    regions, depots, cells = [], {}, []
    for reg in mod["regions"]:
        if not any((fam, reg, u["bu"], m) in mod["cell"] for u in mod["units"]):
            continue
        it = _ritem(d, m, fam, reg)
        if final:
            lines: dict[str, float] = {}
            for x in final:
                if x["region"] == reg:
                    lines[x["sku"]] = lines.get(x["sku"], 0.0) + x["qty"]
        else:
            lines = {}
            for k, v in it["lines"].items():
                lines[k.split("|", 1)[1]] = lines.get(k.split("|", 1)[1], 0.0) + v
        tot = round(sum(lines.values()))
        regions.append(dict(region=reg, total=tot, agreed=it["status"] == "agreed", status=it["status"]))
        for sku, q in lines.items():
            sh = shares.get((sku, reg)) or []
            for s_ in sh:
                u = round(q * s_["share"])
                cells.append(dict(region=reg, depot=s_["depot"], city=s_["city"], sku=sku, description=desc.get(sku, ""), qty=u))
                depots.setdefault((reg, s_["depot"]), dict(region=reg, depot=s_["depot"], city=s_["city"], qty=0))["qty"] += u
    return dict(month=m, family=fam, final=bool(final), regions=regions, depots=sorted(depots.values(), key=lambda x: (x["region"], -x["qty"])), cells=cells)
