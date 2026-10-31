"""New products: the two launch cases in the data (a repackaged SKU and a new segment) and a similarity-based planner."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .. import store
from ..eda import engine as eda
from ..eda import panel as P


def _t(name: str) -> pd.DataFrame | None:
    ws = store.read_workspace() or {}
    for t in ws.get("tables", []):
        if t["type"] == "new_products" and t["name"] == name:
            return pd.read_parquet(t["path"])
    return None


def _ck(a) -> list:
    return [None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 1) for v in a]


def _life(weeks, old_qty, new_qty, new_sku) -> dict:
    """Launch and discontinuation dates. Launch comes from the SKU master when it has one, else the first week the new product sells. The old product has no discontinuation date in the data, so it is the last week it sold."""
    fo = next((i for i, v in enumerate(old_qty) if v and v > 0), None)
    lo = max((i for i, v in enumerate(old_qty) if v and v > 0), default=None)
    fn = next((i for i, v in enumerate(new_qty) if v and v > 0), None)
    try:
        ld = _master().set_index("sku")["Launch_Date"].get(new_sku)
        ld = None if ld is None or pd.isna(ld) else ld.strftime("%Y-%m-%d")
    except Exception:
        ld = None
    first_sale = weeks[fn] if fn is not None else None
    last_old = weeks[lo] if lo is not None else None
    live = lo is not None and lo >= len(weeks) - 2
    gap = None
    if fn is not None and lo is not None:
        gap = int(round((pd.Timestamp(weeks[fn]) - pd.Timestamp(weeks[lo])).days / 7))  # negative = overlap
    return dict(new_launch=ld or first_sale, new_launch_src="SKU master" if ld else "first sale", new_first_sale=first_sale,
                old_first_sale=weeks[fo] if fo is not None else None, old_last_sale=last_old,
                old_discontinued=None if live else last_old, old_still_selling=bool(live), gap_weeks=gap)


def cases() -> dict:
    rep = _t("NPD Repackaged Weekly")
    seg = _t("NPD NewSegment Weekly")
    plan = _t("NPD NewSegment Plan")
    ana = _t("NPD Analogues")
    case = _t("NPD Cases")
    sm = P._find(store.read_workspace() or {}, "product_master", {"sku", "description", "family"}, "SKU Master")
    info = sm.drop_duplicates("sku").set_index("sku")[["description", "mrp", "Sub_Category", "family"]].to_dict("index") if sm is not None else {}
    out: dict = dict(cases=[] if case is None else case.drop(columns="source_table", errors="ignore").astype(str).to_dict("records"))

    if rep is not None and len(rep):
        r = rep.assign(date=pd.to_datetime(rep["date"])).sort_values("date")
        comb = r["Combined_Invoiced_Qty"].to_numpy(float)
        new = r["New_Invoiced_Qty"].to_numpy(float)
        ph = r["Phase"].astype(str).tolist()
        first_new = next((i for i, v in enumerate(new) if v > 0), None)
        est = [i for i, p in enumerate(ph) if p == "Established"]
        before = comb[(first_new - 13):first_new] if first_new else comb[:0]
        after = comb[-13:]
        out["repack"] = dict(
            old=str(r["Old_SKU"].iloc[0]), new=str(r["sku"].iloc[0]), weeks=[d.strftime("%Y-%m-%d") for d in r["date"]],
            combined=_ck(comb), new_qty=_ck(new), old_qty=_ck(comb - new), phase=ph,
            old_name=info.get(str(r["Old_SKU"].iloc[0]), {}).get("description"), new_name=info.get(str(r["sku"].iloc[0]), {}).get("description"),
            first_new=first_new, established_from=est[0] if est else None,
            before_avg=float(before.mean()) if len(before) else None, after_avg=float(after.mean()),
            transition_weeks=sum(1 for p in ph if p.startswith("Transition")),
            carry=float(after.mean() / before.mean()) if len(before) and before.mean() else None,
        )
        _w = out["repack"]["weeks"]
        out["repack"].update(_life(_w, out["repack"]["old_qty"], out["repack"]["new_qty"], out["repack"]["new"]))

    if seg is not None and len(seg):
        s = seg.assign(date=pd.to_datetime(seg["date"]))
        skus = sorted(s["sku"].unique())
        weeks = sorted(s["date"].unique())
        series = {k: _ck([float(s[(s.sku == k) & (s.date == w)]["Invoiced_Qty"].sum()) for w in weeks]) for k in skus}
        pl = [] if plan is None else [dict(month=pd.Timestamp(d).strftime("%Y-%m"), qty=float(q)) for d, q in zip(plan["date"], plan["quantity"])]
        shapes = {}
        if ana is not None:
            for k, g in ana.groupby("Analogue_Product"):
                g = g.sort_values("Months_Since_Launch")
                v = g["National_Monthly_Units_Illustrative"].to_numpy(float)
                shapes[k.split(":")[0] + (": " + k.split(":")[1].replace("(illustrative)", "").strip() if ":" in k else "")] = (v / v[-6:].mean()).round(3).tolist()
        out["segment"] = dict(
            weeks=[pd.Timestamp(w).strftime("%Y-%m-%d") for w in weeks], series=series,
            names={k: info.get(k, {}).get("description", k) for k in skus}, mrp={k: info.get(k, {}).get("mrp") for k in skus},
            plan=pl, shapes=shapes,
        )
    return out


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
ELASTIC = {"Low": -0.5, "Medium": -1.0, "High": -1.5}


def _list(v: str | None) -> list[str]:
    return [x for x in (v or "").split(",") if x and x != "All"]


def _master() -> pd.DataFrame:
    sm = P._find(store.read_workspace() or {}, "product_master", {"sku", "description", "family"}, "SKU Master")
    sm = sm.drop_duplicates("sku")[["sku", "description", "family", "Sub_Category", "brand", "mrp", "Launch_Date", "Nielsen_Category"]].copy()
    sm["Launch_Date"] = pd.to_datetime(sm["Launch_Date"], errors="coerce")
    return sm


def _runrates(regions: list[str] | None = None, channels: list[str] | None = None) -> pd.DataFrame:
    p = eda.panel()
    last = p["date"].max()
    p = p[p["date"] > last - pd.Timedelta(weeks=13)]
    if regions:
        p = p[p["region"].isin(regions)]
    if channels:
        p = p[p["channel"].isin(channels)]
    w = p.groupby(["sku", "date"])["orders_qty"].sum().reset_index()
    rr = w.groupby("sku")["orders_qty"].mean().rename("weekly")
    d = _master().merge(rr, on="sku", how="inner")
    # a product launched in the last 13 weeks has no settled run-rate yet, so it cannot stand in for a new launch
    return d[~(d["Launch_Date"] > last - pd.Timedelta(weeks=13))]


def _nielsen() -> pd.DataFrame | None:
    ws = store.read_workspace() or {}
    for t in ws.get("tables", []):
        if t["type"] == "market" and t["name"] == "Nielsen Market Audit":
            d = pd.read_parquet(t["path"])
            d["date"] = pd.to_datetime(d["date"])
            return d
    return None


def options() -> dict:
    d = _runrates()
    m = _master()
    n = _nielsen()
    mode = lambda s: (s[s != "Not covered"].mode().iloc[0] if (s != "Not covered").any() else None)  # noqa: E731
    sub_cat = {f: {sb: mode(g["Nielsen_Category"]) for sb, g in gf.groupby("Sub_Category")} for f, gf in m.groupby("family")}
    fam_cat = {f: mode(g["Nielsen_Category"]) for f, g in m.groupby("family")}
    p = eda.panel()
    return dict(families=sorted(d["family"].dropna().unique().tolist()),
                subs={f: sorted(g["Sub_Category"].dropna().unique().tolist()) for f, g in d.groupby("family")},
                median_price=float(d["mrp"].median()),
                regions=sorted(p["region"].dropna().unique().tolist()), channels=sorted(p["channel"].dropna().unique().tolist()),
                categories=[] if n is None else sorted(n["category"].unique().tolist()),
                products=[dict(sku=r.sku, name=r.description, family=r.family, sub=r.Sub_Category) for r in d.sort_values("description").itertuples()],
                sub_cat=sub_cat, fam_cat=fam_cat, months=MONTHS, sensitivity=list(ELASTIC))


def _calib(cat: str, regions: list[str], n: pd.DataFrame) -> float:
    """Nielsen counts units on its own scale, so scale them to the units our invoices show (own units / Eveready units in Nielsen)."""
    p = eda.panel()
    p = p[p["date"] > p["date"].max() - pd.Timedelta(weeks=52)]
    if regions:
        p = p[p["region"].isin(regions)]
    p = p.assign(cat=p["sku"].map(_master().set_index("sku")["Nielsen_Category"]))
    own = p.groupby("cat")["orders_qty"].sum() / 52
    nn = n[(n["brand"].isin(["Eveready", "Eveready Ultima"])) & (n["date"] > n["date"].max() - pd.DateOffset(months=12))]
    if regions:
        nn = nn[nn["Market_Region"].isin(regions)]
    ev = nn.groupby("category")["volume"].sum() / 52
    r = (own / ev).replace([np.inf, -np.inf], np.nan).dropna()
    return float(r.get(cat, r.median())) if len(r) else 1.0


def _season_own(family: str, regions: list[str], channels: list[str]) -> tuple[list[float], float]:
    """Month-by-month index of the family's weekly sales (1.0 = an average week) and the index over the last 13 weeks."""
    p = eda.panel()
    p = p[p["family"] == family]
    if regions:
        p = p[p["region"].isin(regions)]
    if channels:
        p = p[p["channel"].isin(channels)]
    w = p.groupby("date")["orders_qty"].sum()
    w = w[w.index < w.index.max() - pd.Timedelta(weeks=1)]
    m = w.groupby(w.index.month).mean()
    idx = (m / m.mean()).reindex(range(1, 13)).fillna(1.0)
    recent = float(np.mean([idx[d.month] for d in w.index[-13:]]))
    return [float(v) for v in idx.to_numpy()], recent


def _scheme(family: str, channels: list[str]) -> tuple[float, float]:
    """Sales lift per point of trade-scheme discount, and the average discount the history already carries."""
    ws = store.read_workspace() or {}
    ts = next((pd.read_parquet(t["path"]) for t in ws.get("tables", []) if t["name"] == "Trade Schemes"), None)
    p = eda.panel()
    p = p[(p["family"] == family) & (p["orders_qty"] > 0)]
    if channels:
        p = p[p["channel"].isin(channels)]
    if ts is None or p.empty:
        return 0.0, 0.0
    k = ["sku", "region", "channel"]
    rel = p["orders_qty"] / p.groupby(k)["orders_qty"].transform("mean")
    a, b = rel[p["on_promo"]].mean(), rel[~p["on_promo"]].mean()
    t = ts[ts["family"] == family]
    if channels:
        t = t[t["channel"].isin(channels)]
    disc = float(t["discount_pct"].mean()) if len(t) else 6.0
    if not (a > 0 and b > 0) or disc <= 0:
        return 0.0, 0.0
    per_pt = float(np.clip((a / b - 1) / disc, 0.0, 0.05))
    return per_pt, float(p["on_promo"].mean()) * disc


def _ramp() -> tuple[list[float], str]:
    """How a launch builds up over its first 12 months, as a share of its settled level: the average of the analogue launches, else a plain ramp."""
    a = _t("NPD Analogues")
    try:
        if a is not None and len(a):
            cur = []
            for _, g in a.groupby("Analogue_Product"):
                v = g.sort_values("Months_Since_Launch")["National_Monthly_Units_Illustrative"].to_numpy(float)[:12]
                if len(v) >= 12 and v[-6:].mean() > 0:
                    cur.append(v / v[-6:].mean())
            if cur:
                return [float(x) for x in np.mean(cur, axis=0)], f"average of {len(cur)} comparable launches (illustrative)"
    except Exception:
        pass
    return [0.25, 0.45, 0.65, 0.8, 0.9, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0], "a standard build-up (no comparable launches loaded)"


def plan(family: str, sub: str | None, price: float | None, k: int = 5, region: str | None = None, channel: str | None = None,
         month: int | None = None, nd: float | None = None, scheme: float | None = None, category: str | None = None,
         sensitivity: str | None = None, mode: str = "upgrade", base_sku: str | None = None) -> dict:
    """mode "upgrade": an upgraded version of something Eveready sells, so it is judged against Eveready's own range (optionally anchored on `base_sku`).
    mode "new_range": a product range Eveready does not have, so it is judged against what already sells in the market category."""
    new_range = mode == "new_range"
    regions, channels = _list(region), _list(channel)
    month = month or (pd.Timestamp.today().month % 12 + 1)
    nd = float(nd) if nd else 60.0
    scheme = 5.0 if scheme is None else float(scheme)
    el = ELASTIC.get(sensitivity or "Medium", -1.0)

    # ---- own segment: how alike products in the range sold, scaled to the launch conditions
    d = _runrates(regions, channels)
    d = d[d["weekly"] > 0].copy()
    same = d[d["family"] == family]
    borrowed = len(same) < 3
    if not borrowed:
        d = same.copy()
    ps = d["mrp"].astype(float)
    score = np.where(d["family"] == family, 50.0, 0.0)
    if sub:
        score = score + np.where(d["Sub_Category"] == sub, 30.0, np.where(d["family"] == family, 8.0, 0.0))
    else:
        score = score + np.where(d["family"] == family, 15.0, 0.0)
    if price and price > 0:
        ratio = np.abs(np.log(np.maximum(ps, 1) / price)) / np.log(4)
        score = score + 20.0 * np.clip(1 - ratio, 0, 1)
    else:
        score = score + 10.0
    if base_sku:
        score = score + np.where(d["sku"] == base_sku, 100.0, 0.0)
    d["score"] = np.round(score, 1)
    top = d.sort_values("score", ascending=False).head(k)
    w = top["score"].to_numpy(float)
    base = float((top["weekly"].to_numpy(float) * w).sum() / w.sum()) if w.sum() else 0.0
    lo0, hi0 = float(top["weekly"].quantile(0.25)), float(top["weekly"].quantile(0.75))

    idx, recent = _season_own(family, regions, channels) if not new_range else ([1.0] * 12, 1.0)
    season_own = idx[month - 1] / recent if recent else 1.0
    per_pt, hist_disc = _scheme(family, channels) if family else (0.0, 0.0)
    scheme_f = max(0.5, 1 + per_pt * (scheme - hist_disc))

    # ---- external segment: the market category in Nielsen
    n = _nielsen() if new_range else None
    cat = category if category and category != "Auto" else None
    if cat is None:
        m = _master()
        g = m[(m["family"] == family) & (m["Sub_Category"] == sub)] if sub else m[m["family"] == family]
        g = g[g["Nielsen_Category"].notna() & (g["Nielsen_Category"] != "Not covered")]
        if len(g) and not sub and price:
            # no sub-category given: take the family's category whose products are priced closest to this one
            med = g.groupby("Nielsen_Category")["mrp"].median()
            cat = (np.log(med / price)).abs().idxmin()
        else:
            cat = g["Nielsen_Category"].mode().iloc[0] if len(g) else None
    nreg = [r for r in regions if n is not None and r in set(n["Market_Region"])]
    ext = None
    ref_nd = 0.0
    if n is not None and cat and (n["category"] == cat).any():
        c = n[n["category"] == cat]
        if regions:
            c = c[c["Market_Region"].isin(nreg or regions)]
        c12 = c[c["date"] > c["date"].max() - pd.DateOffset(months=12)]
        tot = float(c12["volume"].sum())
        mkt_week = tot / 52.0
        b = c12.groupby("brand").agg(vol=("volume", "sum"), val=("Sales_Value_INR_Lakh", "sum"), nd=("Numeric_Distribution_Pct", "mean")).reset_index()
        b["share"] = b["vol"] / tot
        b["price"] = b["val"] * 1e5 / b["vol"]
        named = b[b["brand"] != "Local / Others"].copy()
        leader_nd = float(named["nd"].max())
        # reach is measured against the best-covered brand, so categories with very different store coverage compare fairly
        b["rel"] = b["nd"] / leader_nd
        b["prod"] = b["share"] / b["rel"]
        named = b[b["brand"] != "Local / Others"]
        evb = named[named["brand"].isin(["Eveready", "Eveready Ultima"])]
        # an incumbent's productivity if Eveready is already in the category, otherwise the weakest named competitor's (a challenger)
        ref_prod = float(evb["prod"].mean()) if len(evb) else float(named["prod"].min())
        ref_nd = float(evb["rel"].mean() * 100) if len(evb) else 0.0
        m2 = _master()
        depth = m2[(m2["Nielsen_Category"] == cat)].shape[0] if len(evb) else 0
        if depth == 0:
            depth = int(m2[m2["Nielsen_Category"].notna() & (m2["Nielsen_Category"] != "Not covered")].groupby("Nielsen_Category").size().median())
        cat_price = float(c12["Sales_Value_INR_Lakh"].sum() * 1e5 / tot)
        pidx = (price / cat_price) if price and cat_price else 1.0
        price_f = float(np.clip(pidx ** el, 0.4, 2.0))
        mm = c.groupby(c["date"].dt.month)["volume"].sum()
        mi = (mm / mm.mean()).reindex(range(1, 13)).fillna(1.0)
        season_ext = float(mi[month])
        # the brand's productivity is for its whole range in the category, so one new product gets its share of that
        share = ref_prod * price_f * (nd / 100.0) / depth
        share = float(min(share, named["share"].median()))
        ch_share = 1.0
        if channels:
            pp = eda.panel()
            pp = pp[pp["date"] > pp["date"].max() - pd.Timedelta(weeks=52)]
            if family:
                pp = pp[pp["family"] == family]
            if regions:
                pp = pp[pp["region"].isin(regions)]
            ch_share = float(pp[pp["channel"].isin(channels)]["orders_qty"].sum() / max(pp["orders_qty"].sum(), 1))
        calib = _calib(cat, regions, n)
        weekly = share * mkt_week * calib * season_ext * scheme_f * ch_share
        ext = dict(category=cat, weekly=weekly, share=share, market_week=mkt_week, price=cat_price, price_index=pidx, price_factor=price_f,
                   season=season_ext, channel_share=ch_share, ref_prod=ref_prod, leader_nd=leader_nd, calib=calib, depth=depth, incumbent=bool(len(evb)), elasticity=el,
                   eveready_share=float(b[b["brand"].isin(["Eveready", "Eveready Ultima"])]["share"].sum()),
                   brands=[dict(brand=r.brand, share=float(r.share), nd=float(r.nd), price=float(r.price), prod=float(r.prod)) for r in b.sort_values("share", ascending=False).itertuples()])

    dist_f = float(np.clip(nd / ref_nd, 0.2, 2.5)) if ref_nd and ref_nd > 0 else 1.0
    own = base * season_own * scheme_f * dist_f
    lo, hi = lo0 * season_own * scheme_f * dist_f, hi0 * season_own * scheme_f * dist_f
    ew = ext["weekly"] if ext else None
    # when the own range has too few settled products, the market view is the sturdier of the two
    if new_range:
        if ew is None:
            return dict(error="Pick the market category this product will sit in.", mode=mode)
        blend, lows, highs = ew, [ew], [ew]
    else:
        blend = ew if (ew is not None and borrowed) else ((own + ew) / 2 if ew is not None else own)
        lows = [lo] + ([ew] if ew is not None else [])
        highs = [hi] + ([ew] if ew is not None else [])
    ramp, ramp_src = _ramp()
    order = [MONTHS[(month - 1 + i) % 12] for i in range(12)]
    sim = dict(months=order, expected=[float(blend * r) for r in ramp], low=[float(min(lows) * r) for r in ramp], high=[float(max(highs) * r) for r in ramp], source=ramp_src)
    return dict(
        mode=mode, base_sku=base_sku, sim=sim,
        matches=[] if new_range else [dict(sku=r.sku, name=r.description, family=r.family, sub=r.Sub_Category, price=float(r.mrp), weekly=float(r.weekly), score=float(r.score)) for r in top.itertuples()],
        own=None if new_range else dict(weekly=own, base=base, low=lo, high=hi, season=season_own, scheme=scheme_f, dist=dist_f, ref_nd=ref_nd, nd=nd, per_point=per_pt, hist_disc=hist_disc),
        ext=ext, blend=float(blend), low=float(min(lows)), high=float(max(highs)), month=MONTHS[month - 1],
        price_median=float(d[d["family"] == family]["mrp"].median()) if (d["family"] == family).any() else None,
        pool=int(len(d)), borrowed=borrowed, scope=dict(regions=regions, channels=channels),
    )


def products() -> list[dict]:
    """Every product with sales, for mapping old products to a new one."""
    p = eda.panel()
    have = set(p["sku"].unique())
    m = _master()
    m = m[m["sku"].isin(have)].sort_values("description")
    return [dict(sku=r.sku, name=r.description, family=r.family, sub=r.Sub_Category) for r in m.itertuples()]


def switch(old: list[str], new: str) -> dict:
    """Old product(s) replaced by a new one, week by week, from orders received. The switch is the first week the new product sells."""
    p = eda.panel()
    w = p[p["sku"].isin(old + [new])].groupby(["sku", "date"])["orders_qty"].sum().unstack(0).fillna(0.0)
    if new not in w.columns or not len(w):
        return dict(error="The new product has no sales yet.")
    w = w.sort_index()
    on = w[new].to_numpy(float)
    od = w[[c for c in old if c in w.columns]].sum(axis=1).to_numpy(float) if any(c in w.columns for c in old) else np.zeros(len(w))
    comb = on + od
    first_new = next((i for i, v in enumerate(on) if v > 0), None)
    last_old = max((i for i, v in enumerate(od) if v > 0), default=None)
    ph = []
    for i in range(len(w)):
        if first_new is None or i < first_new:
            ph.append("Old only")
        elif od[i] > 0:
            ph.append("Both sold")
        else:
            ph.append("New only")
    before = comb[max(0, first_new - 13):first_new] if first_new else comb[:0]
    after = comb[-13:]
    m = _master().set_index("sku")["description"].to_dict()
    _wk = [d.strftime("%Y-%m-%d") for d in w.index]
    return dict(
        **_life(_wk, _ck(od), _ck(on), new),
        old=", ".join(old), new=new, old_name=" + ".join(m.get(o, o) for o in old), new_name=m.get(new, new),
        weeks=[d.strftime("%Y-%m-%d") for d in w.index], combined=_ck(comb), new_qty=_ck(on), old_qty=_ck(od), phase=ph,
        first_new=first_new, last_old=last_old, established_from=None,
        before_avg=float(before.mean()) if len(before) else None, after_avg=float(after.mean()),
        transition_weeks=sum(1 for q in ph if q == "Both sold"),
        carry=float(after.mean() / before.mean()) if len(before) and before.mean() else None,
    )
