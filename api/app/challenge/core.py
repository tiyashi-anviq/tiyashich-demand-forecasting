"""Forecast challenge: regional numbers come in, the S&D Head consolidates them by product family, then talks to each Business Unit
head separately about that unit's share. Each agreed number becomes part of the sales team's forecast for the month.
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


def _load() -> dict:
    if FILE.exists():
        try:
            return json.loads(FILE.read_text())
        except Exception:
            pass
    return {"items": {}, "regional": {}, "consol": {}}


def _save(d: dict) -> None:
    FILE.write_text(json.dumps(d))


def reset() -> None:
    FILE.unlink(missing_ok=True)


_cache: dict = {}


def _units() -> tuple[list[dict], dict[str, str]]:
    """The business units and which unit each channel sits under, from the Channel Master. Dark stores report to the
    Modern Trade + E-Commerce head, so they fold into that unit. Falls back to one unit for everything."""
    ws = store.read_workspace() or {}
    df = P._find(ws, "location_master", {"channel", "BU_Head"})
    if df is None or df.empty:
        return [dict(bu="ALL", name="All channels", head="Sales head", channels=[])], {}
    df = df.drop_duplicates("channel")
    heads = {r.channel: str(r.BU_Head).split(" (")[0].strip() for r in df.itertuples()}
    names = {r.channel: str(r.Channel_Name) for r in df.itertuples()}
    units: dict[str, dict] = {}
    for ch, h in heads.items():
        u = units.setdefault(h, dict(bu=ch, name=names[ch], head=h, channels=[]))
        u["channels"].append(ch)
    # a unit is named after the first channel listed under that head
    return list(units.values()), {ch: u["bu"] for u in units.values() for ch in u["channels"]}


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
                    out[(fam, reg, u["bu"], m)] = (float(e[k]), ly)
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
    for i, row in enumerate(sk.itertuples(index=False)):
        bu = bu_of.get(row.channel, units[0]["bu"])
        for k, m in zip(MONTHS_AHEAD, cyc):
            ly_m = f"{int(m[:4]) - 1}{m[4:]}"
            f = float(r["sku_fut"][i, k])
            ly = float(r["skuY"][i, ym[ly_m]]) if ly_m in ym else 0.0
            for key in ((row.family, row.region, row.sku, m), (row.family, row.region, row.sku, bu, m)):
                a = out.get(key, (0.0, 0.0))
                out[key] = (a[0] + f, a[1] + ly)
    skus = {}
    for row in sk.drop_duplicates("sku").itertuples(index=False):
        skus[row.sku] = row.family
    v = dict(cell=out, skus=skus)
    _scache.update(key=id(r), v=v)
    return v


def _desc() -> dict:
    ws = store.read_workspace() or {}
    df = P._find(ws, "product_master", {"sku", "family", "brand"})
    if df is None or "description" not in df.columns:
        return {}
    return df.drop_duplicates("sku").set_index("sku")["description"].astype(str).to_dict()


def _sku_seed(fam: str, reg: str, m: str, sku: str, model: float) -> float:
    """A region's starting number for one SKU: the region's family-level nudge, with a small repeatable wobble per SKU. Simulated."""
    h = int(hashlib.md5(f"{fam}|{reg}|{m}".encode()).hexdigest()[:6], 16) / 0xFFFFFF
    w = int(hashlib.md5(f"{sku}|{reg}|{m}".encode()).hexdigest()[:6], 16) / 0xFFFFFF
    return round(model * (1.02 + 0.16 * h) * (0.94 + 0.12 * w))


def region_skus(m: str, fam: str, reg: str) -> list[dict]:
    """The SKUs a region sells in a family, with the model and last year, largest first."""
    sm = _skumodel()
    rows = []
    for key, (mod, ly) in sm["cell"].items():
        if len(key) == 4 and key[0] == fam and key[1] == reg and key[3] == m:
            rows.append(dict(sku=key[2], model=mod, last_year=ly))
    rows.sort(key=lambda x: -x["model"])
    return rows


def _rdef(m: str, fam: str, reg: str) -> dict:
    lines = {x["sku"]: _sku_seed(fam, reg, m, x["sku"], x["model"]) for x in region_skus(m, fam, reg)}
    return dict(status="negotiating", turn="sd", lines=lines, simulated=True, agreed_by=None,
                rounds=[dict(by=f"{reg} Regional Head", action="propose", qty=sum(lines.values()), reason="Regional submission (simulated)", at=0)])


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
            regs, model_t, ly_t, sub_t = [], 0.0, 0.0, 0.0
            for reg in mod["regions"]:
                cells = [mod["cell"][(fam, reg, u["bu"], m)] for u in mod["units"] if (fam, reg, u["bu"], m) in mod["cell"]]
                if not cells:
                    continue
                model = sum(c[0] for c in cells)
                ly = sum(c[1] or 0 for c in cells)
                ri = _ritem(d, m, fam, reg)
                q = round(sum(ri["lines"].values()))
                regs.append(dict(region=reg, model=round(model), last_year=round(ly), qty=q, simulated=ri["simulated"], note="", status=ri["status"], turn=ri["turn"],
                                 rounds=ri["rounds"], agreed_by=ri["agreed_by"], skus=len(ri["lines"])))
                model_t += model
                ly_t += ly
                sub_t += q
            con = d["consol"].get(f"{m}|{fam}")
            bus = []
            for u in mod["units"]:
                mb = sum(mod["cell"][(fam, reg, u["bu"], m)][0] for reg in mod["regions"] if (fam, reg, u["bu"], m) in mod["cell"])
                lb = sum((mod["cell"][(fam, reg, u["bu"], m)][1] or 0) for reg in mod["regions"] if (fam, reg, u["bu"], m) in mod["cell"])
                if mb <= 0:
                    continue
                it = d["items"].get(f"{m}|{fam}|{u['bu']}")
                bus.append(dict(bu=u["bu"], name=u["name"], head=u["head"], channels=u["channels"], model=round(mb), last_year=round(lb),
                                share=mb / model_t if model_t else 0, status=(it or {}).get("status", "waiting"), turn=(it or {}).get("turn"),
                                proposal=(it or {}).get("proposal"), rounds=(it or {}).get("rounds", []), agreed=(it or {}).get("agreed"),
                                agreed_by=(it or {}).get("agreed_by")))
            n_ag = sum(1 for b in bus if b["status"] == "agreed")
            n_reg_ag = sum(1 for x in regs if x["status"] == "agreed")
            status = "collecting" if con is None else ("agreed" if bus and n_ag == len(bus) else "negotiating")
            rows.append(dict(month=m, family=fam, model=round(model_t), last_year=round(ly_t), regional=regs, regional_total=round(sub_t), n_regions_agreed=n_reg_ag, n_regions=len(regs),
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


def regional_submit(m: str, region: str, qtys: dict[str, float], note: str) -> None:
    d = _load()
    for fam, q in qtys.items():
        if f"{m}|{fam}" in d["consol"]:
            continue  # already with the S&D Head or beyond: that family is locked
        d["regional"][f"{m}|{fam}|{region}"] = dict(qty=round(float(q)), note=note, at=time.time())
    _save(d)


def consolidate(m: str, fam: str, qty: float | None) -> None:
    """The S&D Head fixes the national number for a family and opens a conversation with each business unit, starting
    each unit's share at its slice of the model for that family and month."""
    row = _row(m, fam)
    if row["consolidated"] is not None:
        raise ValueError("This family has already been sent to the business units.")
    d = _load()
    q = round(float(qty)) if qty is not None else row["regional_total"]
    d["consol"][f"{m}|{fam}"] = dict(qty=q, at=time.time())
    why = "Sum of the four regional numbers, split by the unit's share of the model" if qty is None else "Adjusted before sending, split by the unit's share of the model"
    left = q
    for i, b in enumerate(row["bus"]):
        p = round(q * b["share"]) if i < len(row["bus"]) - 1 else left  # the last unit takes the rounding remainder
        left -= p
        d["items"][f"{m}|{fam}|{b['bu']}"] = dict(status="negotiating", proposal=p, turn="bu", agreed=None, agreed_by=None,
                                                   rounds=[dict(by="S&D Head", action="propose", qty=p, reason=why, at=time.time())])
    _save(d)


def respond(m: str, fam: str, bu: str, role: str, action: str, qty: float | None, reason: str) -> None:
    _bu(_row(m, fam), bu)
    d = _load()
    it = d["items"].get(f"{m}|{fam}|{bu}")
    if not it or it["status"] != "negotiating":
        raise ValueError("This number is not being negotiated.")
    who = "BU Head" if role == "bu" else "S&D Head"
    if role != it["turn"] and not (role == "sd" and action == "final"):
        raise ValueError("It is the other side's turn.")
    if action == "accept":
        it.update(status="agreed", agreed=it["proposal"], agreed_by=f"{who} accepted", turn=None)
        it["rounds"].append(dict(by=who, action="accept", qty=it["proposal"], reason=reason or "Accepted", at=time.time()))
    elif action == "counter":
        if qty is None or not reason.strip():
            raise ValueError("A counter-offer needs a number and a reason.")
        it.update(proposal=round(float(qty)), turn="sd" if role == "bu" else "bu")
        it["rounds"].append(dict(by=who, action="counter", qty=round(float(qty)), reason=reason.strip(), at=time.time()))
    elif action == "final":
        if role != "sd":
            raise ValueError("Only the S&D Head can make the final call.")
        if qty is None or not reason.strip():
            raise ValueError("A final call needs a number and a reason.")
        q = round(float(qty))
        it.update(status="agreed", proposal=q, agreed=q, agreed_by="S&D Head, final call", turn=None)
        it["rounds"].append(dict(by=who, action="final", qty=q, reason=reason.strip(), at=time.time()))
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


def activity() -> list[dict]:
    """Everything that has happened in the cycle, newest first: regional submissions, consolidations and every round with a unit."""
    d = _load()
    out = []
    for k, v in d["regional"].items():
        m, fam, reg = k.split("|")
        out.append(dict(at=v["at"], month=m, family=fam, bu=None, who=f"{reg} Regional Head", what="Submitted", qty=v["qty"], reason=v.get("note", "")))
    for k, v in d["consol"].items():
        m, fam = k.split("|")
        out.append(dict(at=v["at"], month=m, family=fam, bu=None, who="S&D Head", what="Consolidated", qty=v["qty"], reason="Sent to the business units"))
    names = {u["bu"]: u["name"] for u in _model()["units"]}
    for k, v in d["items"].items():
        m, fam, bu = k.split("|")
        for r in v["rounds"]:
            out.append(dict(at=r["at"], month=m, family=fam, bu=names.get(bu, bu), who=r["by"], what={"propose": "Proposed", "counter": "Countered", "accept": "Accepted", "final": "Final call", "reopen": "Reopened"}.get(r["action"], r["action"]),
                            qty=r["qty"], reason=r["reason"]))
    out.sort(key=lambda x: -x["at"])
    return out


def _all_regions_agreed(d: dict, m: str, fam: str) -> bool:
    mod = _model()
    regs = [rg for rg in mod["regions"] if any((fam, rg, u["bu"], m) in mod["cell"] for u in mod["units"])]
    return bool(regs) and all(_ritem(d, m, fam, rg)["status"] == "agreed" for rg in regs)


def _auto_consolidate(d: dict, m: str, fam: str) -> None:
    """Once every region has agreed its numbers with the S&D Head, the family goes to the business units: the total of the
    agreed regional numbers is shared across the units by their slice of the model."""
    if f"{m}|{fam}" in d["consol"] or not _all_regions_agreed(d, m, fam):
        return
    mod = _model()
    q = 0
    for rg in mod["regions"]:
        if any((fam, rg, u["bu"], m) in mod["cell"] for u in mod["units"]):
            q += round(sum(_ritem(d, m, fam, rg)["lines"].values()))
    _save(d)
    d = _load()
    row = _row(m, fam)
    d["consol"][f"{m}|{fam}"] = dict(qty=q, at=time.time())
    left = q
    for i, b in enumerate(row["bus"]):
        p = round(q * b["share"]) if i < len(row["bus"]) - 1 else left
        left -= p
        d["items"][f"{m}|{fam}|{b['bu']}"] = dict(status="negotiating", proposal=p, turn="bu", agreed=None, agreed_by=None,
                                                   rounds=[dict(by="S&D Head", action="propose", qty=p, reason="Total of the agreed regional numbers, split by the unit's share of the model", at=time.time())])
    _save(d)


def _check_lines(it: dict, lines: dict | None) -> dict:
    if not lines:
        raise ValueError("A counter-offer needs a number for each SKU.")
    out = {}
    for sku in it["lines"]:
        v = lines.get(sku, it["lines"][sku])
        if v is None or float(v) < 0:
            raise ValueError("Every SKU needs a number of zero or more.")
        out[sku] = round(float(v))
    return out


def region_respond(m: str, fam: str, reg: str, role: str, action: str, lines: dict | None, reason: str) -> None:
    """The conversation between the S&D Head and one Regional Head about a family: numbers go in SKU by SKU."""
    d = _load()
    if f"{m}|{fam}" in d["consol"]:
        raise ValueError("This family has already gone to the business units, so the regional numbers are locked.")
    it = _ritem(d, m, fam, reg)
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
    elif action in ("counter", "final", "revise"):
        if not reason.strip():
            raise ValueError("A change needs a reason.")
        new = _check_lines(it, lines)
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
    desc = _desc()
    rows = []
    for x in region_skus(m, fam, reg):
        cur = it["lines"].get(x["sku"], 0)
        rows.append(dict(sku=x["sku"], description=desc.get(x["sku"], ""), model=round(x["model"]), last_year=round(x["last_year"]), qty=cur))
    return dict(month=m, family=fam, region=reg, status=it["status"], turn=it["turn"], simulated=it["simulated"], rows=rows, total=round(sum(it["lines"].values())))


def bu_lines(m: str, fam: str, bu: str) -> dict:
    """SKU by SKU for one business unit: its slice of the family number, in the unit's own SKU mix from the model."""
    row = _row(m, fam)
    b = _bu(row, bu)
    sm = _skumodel()
    mix: dict[str, list[float]] = {}
    for key, (mod, ly) in sm["cell"].items():
        if len(key) == 5 and key[0] == fam and key[3] == bu and key[4] == m:
            a = mix.setdefault(key[2], [0.0, 0.0])
            a[0] += mod
            a[1] += ly
    cur = b["agreed"] if b["agreed"] is not None else b["proposal"]
    tm = sum(v[0] for v in mix.values()) or 1.0
    desc = _desc()
    rows = [dict(sku=k, description=desc.get(k, ""), model=round(v[0]), last_year=round(v[1]), qty=None if cur is None else round(cur * v[0] / tm), share=v[0] / tm) for k, v in mix.items()]
    rows.sort(key=lambda x: -x["model"])
    return dict(month=m, family=fam, bu=bu, current=cur, rows=rows)


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
    """What goes to which region and which depot: each region's SKU numbers (agreed, or the latest on the table) split across its
    depots by their recent share of that SKU's dispatches."""
    d = _load()
    mod = _model()
    shares = _depot_shares()
    desc = _desc()
    regions, depots, cells = [], {}, []
    for reg in mod["regions"]:
        if not any((fam, reg, u["bu"], m) in mod["cell"] for u in mod["units"]):
            continue
        it = _ritem(d, m, fam, reg)
        tot = round(sum(it["lines"].values()))
        regions.append(dict(region=reg, total=tot, agreed=it["status"] == "agreed", status=it["status"]))
        for sku, q in it["lines"].items():
            sh = shares.get((sku, reg)) or []
            if not sh:
                continue
            for s_ in sh:
                u = round(q * s_["share"])
                cells.append(dict(region=reg, depot=s_["depot"], city=s_["city"], sku=sku, description=desc.get(sku, ""), qty=u))
                depots.setdefault((reg, s_["depot"]), dict(region=reg, depot=s_["depot"], city=s_["city"], qty=0))["qty"] += u
    return dict(month=m, family=fam, regions=regions, depots=sorted(depots.values(), key=lambda x: (x["region"], -x["qty"])), cells=cells)
