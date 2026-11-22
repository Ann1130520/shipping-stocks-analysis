import math
import os
import csv
import io
import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

DIR = os.path.dirname(os.path.abspath(__file__))

def get_tw_now():
    tz_tw = timezone(timedelta(hours=8))
    return datetime.now(tz_tw).strftime("%Y-%m-%d %H:%M:%S")

def calc_rsi(closes, period=14):
    if len(closes) < period + 1:
        return None
    gains = []
    losses = []
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        gains.append(max(0.0, diff))
        losses.append(max(0.0, -diff))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    for i in range(period + 1, len(closes)):
        diff = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(0.0, diff)) / period
        avg_loss = (avg_loss * (period - 1) + max(0.0, -diff)) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100.0 - (100.0 / (1.0 + rs)), 1)

def fetch_quote_with_technicals(symbol, include_technicals=False):
    rng = "1y" if include_technicals else "1d"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range={rng}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            res = data['chart']['result'][0]
            meta = res['meta']

            price = round(float(meta.get('regularMarketPrice', 0.0)), 2)
            prev_close = round(float(meta.get('chartPreviousClose', price)), 2)

            # Use previous trading day's close from daily series if range=1y
            closes_raw = res.get('indicators', {}).get('quote', [{}])[0].get('close', [])
            closes = [float(c) for c in closes_raw if c is not None]
            if include_technicals and len(closes) >= 2:
                prev_close = round(closes[-2], 2)
                if price == 0.0:
                    price = round(closes[-1], 2)

            change = round(price - prev_close, 2)
            pct = round((change / prev_close) * 100, 2) if prev_close else 0.0
            high = round(float(meta.get('regularMarketDayHigh', price)), 2)
            low = round(float(meta.get('regularMarketDayLow', price)), 2)
            volume = int(meta.get('regularMarketVolume', 0) or 0)

            result = {
                "symbol": symbol,
                "price": price,
                "prev_close": prev_close,
                "change": change,
                "change_percent": pct,
                "high": high,
                "low": low,
                "volume": volume,
                "status": "success"
            }

            if include_technicals and len(closes) >= 20:
                ma5 = round(sum(closes[-5:]) / 5, 2)
                ma20 = round(sum(closes[-20:]) / 20, 2)
                ma60 = round(sum(closes[-60:]) / 60, 2) if len(closes) >= 60 else None
                ma240 = round(sum(closes[-240:]) / 240, 2) if len(closes) >= 200 else round(sum(closes) / len(closes), 2)
                rsi14 = calc_rsi(closes, 14)

                bias_20 = round((price - ma20) / ma20 * 100, 2) if ma20 else 0.0
                bias_60 = round((price - ma60) / ma60 * 100, 2) if ma60 else None

                if ma60 and price > ma20 and ma20 > ma60:
                    trend = "多頭排列 (站上月線與季線)"
                elif price > ma20:
                    trend = "短期轉強 (站上20MA月線)"
                elif ma60 and price < ma20 and price > ma60:
                    trend = "回測季線震盪整理"
                else:
                    trend = "均線下方弱勢整理"

                result["technicals"] = {
                    "ma5": ma5,
                    "ma20": ma20,
                    "ma60": ma60,
                    "ma240": ma240,
                    "bias_20": bias_20,
                    "bias_60": bias_60,
                    "rsi14": rsi14,
                    "trend": trend
                }

            return result
    except Exception as e:
        print(f"Error fetching quote {symbol}: {e}")
        return {
            "symbol": symbol,
            "status": "error",
            "error": str(e)
        }

def fetch_weekly_series(symbol, range_str="1y"):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1wk&range={range_str}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            res = data['chart']['result'][0]
            timestamps = res.get('timestamp', [])
            closes = res.get('indicators', {}).get('quote', [{}])[0].get('close', [])
            week_map = {}
            tz_tw = timezone(timedelta(hours=8))
            for ts, c in zip(timestamps, closes):
                if c is None:
                    continue
                dt = datetime.fromtimestamp(ts, tz=tz_tw)
                iso_year, iso_week, _ = dt.isocalendar()
                week_key = f"{iso_year}-W{iso_week:02d}"
                week_map[week_key] = (dt.strftime("%Y/%m/%d"), round(float(c), 2))
            return week_map
    except Exception as e:
        print(f"Error fetching weekly series {symbol} ({range_str}): {e}")
        return {}

def build_aligned_history(range_str="1y"):
    symbols = {
        "evergreen": "2603.TW",
        "yangming": "2609.TW",
        "wanhai": "2615.TW",
        "tsmc": "2330.TW",
        "etf0050": "0050.TW",
        "tw": "^TWII",
        "us": "^GSPC",
        "jp": "^N225",
        "eu": "^STOXX50E"
    }
    maps = {k: fetch_weekly_series(sym, range_str) for k, sym in symbols.items()}
    anchor_keys = sorted(maps["evergreen"].keys())
    if not anchor_keys:
        return None

    labels = []
    series = {k: [] for k in symbols.keys()}
    last_val = {}

    for wk in anchor_keys:
        date_label = maps["evergreen"][wk][0]
        # Format label shorter as YY/MM/DD
        labels.append(date_label[2:])
        for k in symbols.keys():
            if wk in maps[k]:
                val = maps[k][wk][1]
                last_val[k] = val
                series[k].append(val)
            else:
                # Forward-fill or look for nearest earlier week in maps[k]
                if k in last_val:
                    series[k].append(last_val[k])
                else:
                    earlier = [maps[k][m][1] for m in sorted(maps[k].keys()) if m <= wk]
                    val = earlier[-1] if earlier else (list(maps[k].values())[0][1] if maps[k] else 0)
                    last_val[k] = val
                    series[k].append(val)

    return {"labels": labels, "raw": series}

def fetch_twse_bwibbu():
    url = "https://www.twse.com.tw/exchangeReport/BWIBBU_ALL?response=open_data"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    targets = {"2603", "2609", "2615", "2330"}
    fundamentals = {}
    try:
        raw = urllib.request.urlopen(req, timeout=15).read().decode('utf-8-sig')
        for row in csv.reader(io.StringIO(raw)):
            if len(row) >= 6 and row[1].strip() in targets:
                code = row[1].strip()
                pe_str = row[3].strip()
                yld_str = row[4].strip()
                pb_str = row[5].strip()
                fundamentals[code] = {
                    "date": row[0].strip(),
                    "pe": float(pe_str) if pe_str else None,
                    "yield": float(yld_str) if yld_str else None,
                    "pb": float(pb_str) if pb_str else None
                }
    except Exception as e:
        print(f"Error fetching TWSE BWIBBU_ALL: {e}")
    return fundamentals

def fetch_twse_t86():
    url = "https://www.twse.com.tw/rwd/zh/fund/T86?response=json&selectType=ALLBUT0999"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    targets = {"2603", "2609", "2615", "2330", "0050"}
    inst_data = {}
    try:
        data = json.loads(urllib.request.urlopen(req, timeout=15).read().decode('utf-8'))
        if data.get("stat") != "OK":
            return {}
        report_date = data.get("date", "")
        for row in data.get("data", []):
            code = row[0].strip()
            if code in targets:
                def to_lots(val_str):
                    try:
                        return round(int(val_str.replace(",", "").strip()) / 1000.0, 1)
                    except Exception:
                        return 0.0
                inst_data[code] = {
                    "date": report_date,
                    "foreign_lots": to_lots(row[4]),
                    "trust_lots": to_lots(row[10]),
                    "dealer_lots": to_lots(row[11]),
                    "total_lots": to_lots(row[-1])
                }
    except Exception as e:
        print(f"Error fetching TWSE T86: {e}")
    return inst_data


def fetch_twse_t86_3days():
    """Fetch T86 institutional data for the last 3 trading days and return both cumulative and daily data."""
    from datetime import date as _date, timedelta as _td
    targets = {"2603", "2609", "2615", "2330", "0050"}

    def _fetch_one(date_str):
        url = f"https://www.twse.com.tw/rwd/zh/fund/T86?response=json&selectType=ALLBUT0999&date={date_str}"
        req = __import__('urllib.request', fromlist=['Request']).Request(
            url, headers={'User-Agent': 'Mozilla/5.0'})
        import urllib.request as _ur
        try:
            data = __import__('json').loads(_ur.urlopen(req, timeout=12).read().decode('utf-8'))
            if data.get("stat") != "OK":
                return None, None
            report_date = data.get("date", date_str)
            result = {}
            for row in data.get("data", []):
                code = row[0].strip()
                if code in targets:
                    def to_lots(v):
                        try:
                            return round(int(v.replace(",", "").strip()) / 1000.0, 1)
                        except Exception:
                            return 0.0
                    result[code] = {
                        "foreign_lots": to_lots(row[4]),
                        "trust_lots": to_lots(row[10]),
                        "dealer_lots": to_lots(row[11]),
                        "total_lots": to_lots(row[-1])
                    }
            return report_date, result
        except Exception as e:
            print(f"  T86 3day fetch {date_str}: {e}")
            return None, None

    # Walk backward finding 3 trading days (skip weekends)
    today = _date.today()
    found_dates = []
    check = today
    for _ in range(14):  # look back up to 2 weeks
        if len(found_dates) >= 3:
            break
        if check.weekday() < 5:  # Mon-Fri only
            d_str = check.strftime("%Y%m%d")
            dt, result = _fetch_one(d_str)
            if result:
                found_dates.append((dt or d_str, result))
        check -= _td(days=1)

    if not found_dates:
        return {}, []

    # Sort chronological: oldest to newest
    found_dates.sort(key=lambda x: x[0])

    daily_list = []
    for dt, day_data in found_dates:
        daily_list.append({
            "date": dt,
            "data": day_data
        })

    cumulative = {}
    date_labels = [d for d, _ in found_dates]
    for _, day_data in found_dates:
        for code, vals in day_data.items():
            if code not in cumulative:
                cumulative[code] = {"foreign_lots_3d": 0.0, "trust_lots_3d": 0.0,
                                    "dealer_lots_3d": 0.0, "total_lots_3d": 0.0}
            cumulative[code]["foreign_lots_3d"] = round(cumulative[code]["foreign_lots_3d"] + vals.get("foreign_lots", 0.0), 1)
            cumulative[code]["trust_lots_3d"]  = round(cumulative[code]["trust_lots_3d"] + vals.get("trust_lots", 0.0), 1)
            cumulative[code]["dealer_lots_3d"] = round(cumulative[code]["dealer_lots_3d"] + vals.get("dealer_lots", 0.0), 1)
            cumulative[code]["total_lots_3d"]  = round(cumulative[code]["total_lots_3d"] + vals.get("total_lots", 0.0), 1)

    for code in cumulative:
        cumulative[code]["dates"] = date_labels

    print(f"  T86 3 days: {len(daily_list)} days {date_labels}")
    return cumulative, daily_list


def fetch_ohlcv_and_indicators(symbol):
    """Fetch 6-month daily OHLCV and compute 5MA, 20MA, 60MA, Bollinger Bands, KD(9,3,3), MACD(12,26,9)."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=6mo"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            res = data['chart']['result'][0]
            timestamps = res.get('timestamp', [])
            quote = res.get('indicators', {}).get('quote', [{}])[0]
            opens = quote.get('open', [])
            highs = quote.get('high', [])
            lows = quote.get('low', [])
            closes = quote.get('close', [])
            volumes = quote.get('volume', [])

            clean = []
            tz_tw = timezone(timedelta(hours=8))
            for i in range(len(timestamps)):
                o, h, l, c, v = opens[i], highs[i], lows[i], closes[i], volumes[i]
                if o is not None and h is not None and l is not None and c is not None and v is not None:
                    dt = datetime.fromtimestamp(timestamps[i], tz=tz_tw).strftime("%Y-%m-%d")
                    clean.append({
                        "date": dt,
                        "open": round(float(o), 2),
                        "high": round(float(h), 2),
                        "low": round(float(l), 2),
                        "close": round(float(c), 2),
                        "volume": int(v)
                    })

            if len(clean) < 30:
                return None

            closes_arr = [x['close'] for x in clean]
            highs_arr = [x['high'] for x in clean]
            lows_arr = [x['low'] for x in clean]
            n = len(clean)

            ma5 = [None] * n
            ma20 = [None] * n
            ma60 = [None] * n
            bb_upper = [None] * n
            bb_lower = [None] * n

            for i in range(n):
                if i >= 4:
                    ma5[i] = round(sum(closes_arr[i-4:i+1]) / 5.0, 2)
                if i >= 19:
                    sub = closes_arr[i-19:i+1]
                    m = sum(sub) / 20.0
                    ma20[i] = round(m, 2)
                    variance = sum((x - m) ** 2 for x in sub) / 20.0
                    sd = math.sqrt(variance)
                    bb_upper[i] = round(m + 2 * sd, 2)
                    bb_lower[i] = round(m - 2 * sd, 2)
                if i >= 59:
                    ma60[i] = round(sum(closes_arr[i-59:i+1]) / 60.0, 2)

            k_val = [50.0] * n
            d_val = [50.0] * n
            for i in range(n):
                if i >= 8:
                    highest_9 = max(highs_arr[i-8:i+1])
                    lowest_9 = min(lows_arr[i-8:i+1])
                    if highest_9 == lowest_9:
                        rsv = 50.0
                    else:
                        rsv = ((closes_arr[i] - lowest_9) / (highest_9 - lowest_9)) * 100.0
                    prev_k = k_val[i-1] if i > 0 else 50.0
                    prev_d = d_val[i-1] if i > 0 else 50.0
                    cur_k = (2.0 / 3.0) * prev_k + (1.0 / 3.0) * rsv
                    cur_d = (2.0 / 3.0) * prev_d + (1.0 / 3.0) * cur_k
                    k_val[i] = round(cur_k, 2)
                    d_val[i] = round(cur_d, 2)

            ema12 = [0.0] * n
            ema26 = [0.0] * n
            dif = [0.0] * n
            dem = [0.0] * n
            osc = [0.0] * n

            k12 = 2.0 / 13.0
            k26 = 2.0 / 27.0
            k9 = 2.0 / 10.0

            for i in range(n):
                if i == 0:
                    ema12[i] = closes_arr[i]
                    ema26[i] = closes_arr[i]
                else:
                    ema12[i] = closes_arr[i] * k12 + ema12[i-1] * (1.0 - k12)
                    ema26[i] = closes_arr[i] * k26 + ema26[i-1] * (1.0 - k26)
                dif[i] = round(ema12[i] - ema26[i], 2)

            for i in range(n):
                if i == 0:
                    dem[i] = dif[i]
                else:
                    dem[i] = round(dif[i] * k9 + dem[i-1] * (1.0 - k9), 2)
                osc[i] = round(dif[i] - dem[i], 2)

            result_bars = []
            start_idx = max(0, n - 60)
            for i in range(start_idx, n):
                result_bars.append({
                    "date": clean[i]["date"],
                    "open": clean[i]["open"],
                    "high": clean[i]["high"],
                    "low": clean[i]["low"],
                    "close": clean[i]["close"],
                    "volume": clean[i]["volume"],
                    "ma5": ma5[i],
                    "ma20": ma20[i],
                    "ma60": ma60[i],
                    "bb_upper": bb_upper[i],
                    "bb_lower": bb_lower[i],
                    "k": k_val[i],
                    "d": d_val[i],
                    "macd_dif": dif[i],
                    "macd_dem": dem[i],
                    "macd_osc": osc[i]
                })

            return result_bars
    except Exception as e:
        print(f"Error fetching OHLCV for {symbol}: {e}")
        return None

def fetch_shipping_news():
    queries = [
        "長榮海運 OR 陽明海運 OR 萬海航運",
        "貨櫃 運價 OR SCFI"
    ]
    seen_titles = set()
    news_items = []

    for q in queries:
        url = f"https://news.google.com/rss/search?q={urllib.parse.quote(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                xml_data = resp.read()
                root = ET.fromstring(xml_data)
                items = root.findall('.//item')[:15]
                for item in items:
                    raw_title = item.find('title').text if item.find('title') is not None else ""
                    link = item.find('link').text if item.find('link') is not None else ""
                    raw_pubDate = item.find('pubDate').text if item.find('pubDate') is not None else ""
                    source_elem = item.find('source')
                    source = source_elem.text if source_elem is not None else "財經新聞"

                    clean_title = raw_title
                    if " - " in raw_title:
                        parts = raw_title.rsplit(" - ", 1)
                        clean_title = parts[0]
                        if source == "財經新聞":
                            source = parts[1]

                    if clean_title in seen_titles:
                        continue
                    seen_titles.add(clean_title)

                    formatted_date = ""
                    sort_ts = 0
                    if raw_pubDate:
                        try:
                            import email.utils
                            dt = email.utils.parsedate_to_datetime(raw_pubDate)
                            tz_tw = timezone(timedelta(hours=8))
                            dt_tw = dt.astimezone(tz_tw)
                            formatted_date = dt_tw.strftime("%Y-%m-%d %H:%M")
                            sort_ts = int(dt.timestamp())
                        except Exception:
                            formatted_date = raw_pubDate

                    if any(w in clean_title for w in ["跌", "降", "虧", "破底", "壓力", "風險", "警", "減", "疲軟", "縮水"]):
                        sentiment = "bear"
                        sentiment_label = "偏空警訊"
                    elif any(w in clean_title for w in ["漲", "飆", "新高", "旺", "賺", "紅利", "利多", "揚", "強", "突破", "按讚", "買超", "噴出", "大賺", "獲利王"]):
                        sentiment = "bull"
                        sentiment_label = "偏多利多"
                    else:
                        sentiment = "neutral"
                        sentiment_label = "即時市場"

                    if any(k in clean_title for k in ["紅海", "蘇伊士", "巴拿馬", "關稅", "美東", "罷工", "地緣", "衝突", "胡塞", "好望角", "繞行"]):
                        category = "geopolitics"
                    elif any(k in clean_title for k in ["聯盟", "MSC", "ONE", "馬士基", "聯營"]):
                        category = "alliances"
                    elif any(k in clean_title for k in ["法說", "財報", "EPS", "獲利", "毛利", "股利", "營收", "大賺", "獲利王", "目標價", "買超", "大樓"]):
                        category = "corporate"
                    elif any(k in clean_title for k in ["運價", "SCFI", "貨櫃", "運費", "集裝箱"]):
                        category = "freight"
                    else:
                        category = "freight"

                    news_items.append({
                        "id": f"live-{len(news_items)+1}",
                        "title": clean_title,
                        "link": link,
                        "pubDate": formatted_date or raw_pubDate,
                        "date": formatted_date or raw_pubDate,
                        "source": source,
                        "sentiment": sentiment,
                        "sentimentLabel": sentiment_label,
                        "category": category,
                        "impact": "即時追蹤貨櫃三雄（長榮、陽明、萬海）營運、運價與法人籌碼影響",
                        "_sort_ts": sort_ts
                    })
        except Exception as e:
            print(f"Error fetching news for query '{q}': {e}")

    news_items.sort(key=lambda x: x.get("_sort_ts", 0), reverse=True)
    for item in news_items:
        item.pop("_sort_ts", None)

    return news_items[:20]

def main():
    json_path = os.path.join(DIR, "latest_data.json")
    prev_data = {}
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                prev_data = json.load(f)
        except Exception:
            prev_data = {}

    print("1. Fetching Shipping Big 3 with Technicals (2603, 2609, 2615)...")
    stock_2603 = fetch_quote_with_technicals("2603.TW", include_technicals=True)
    stock_2609 = fetch_quote_with_technicals("2609.TW", include_technicals=True)
    stock_2615 = fetch_quote_with_technicals("2615.TW", include_technicals=True)

    print("2. Fetching Global Market Indices & Brent Oil...")
    idx_tw = fetch_quote_with_technicals("^TWII", include_technicals=False)
    idx_us = fetch_quote_with_technicals("^GSPC", include_technicals=False)
    idx_jp = fetch_quote_with_technicals("^N225", include_technicals=False)
    idx_eu = fetch_quote_with_technicals("^STOXX50E", include_technicals=False)
    brent_oil = fetch_quote_with_technicals("BZ=F", include_technicals=False)

    print("2.5 Fetching Taiwan Benchmarks with Technicals (2330, 0050)...")
    bench_2330 = fetch_quote_with_technicals("2330.TW", include_technicals=True)
    bench_0050 = fetch_quote_with_technicals("0050.TW", include_technicals=True)

    print("3. Fetching TWSE Fundamentals (BWIBBU_ALL) & Institutional Investors (T86)...")
    fundamentals = fetch_twse_bwibbu()
    institutional = fetch_twse_t86()
    if not institutional and prev_data.get("institutional"):
        institutional = prev_data["institutional"]
    print("3b. Fetching T86 3-day cumulative...")
    institutional_3d, institutional_daily = fetch_twse_t86_3days()
    if not institutional_daily and prev_data.get("institutional_daily"):
        institutional_daily = prev_data["institutional_daily"]
    if not institutional_3d and prev_data.get("institutional_3d"):
        institutional_3d = prev_data["institutional_3d"]
    if not fundamentals and prev_data.get("fundamentals"):
        fundamentals = prev_data["fundamentals"]

    print("4. Fetching Real Weekly Historical Series (1Y & 2Y)...")
    history_1y = build_aligned_history("1y") or prev_data.get("history", {}).get("1Y")
    history_2y = build_aligned_history("2y") or prev_data.get("history", {}).get("2Y")

    print("4.5 Fetching OHLCV and Technical Indicator series for K-line chart...")
    tech_charts = {
        "2603": fetch_ohlcv_and_indicators("2603.TW") or prev_data.get("tech_charts", {}).get("2603"),
        "2609": fetch_ohlcv_and_indicators("2609.TW") or prev_data.get("tech_charts", {}).get("2609"),
        "2615": fetch_ohlcv_and_indicators("2615.TW") or prev_data.get("tech_charts", {}).get("2615"),
        "2330": fetch_ohlcv_and_indicators("2330.TW") or prev_data.get("tech_charts", {}).get("2330")
    }
    print("5. Fetching live shipping news...")
    news = fetch_shipping_news()

    output_data = {
        "last_updated": get_tw_now(),
        "stocks": {
            "2603": stock_2603,
            "2609": stock_2609,
            "2615": stock_2615
        },
        "tw_benchmarks": {
            "2330": bench_2330,
            "0050": bench_0050
        },
        "global_indices": {
            "tw": idx_tw,
            "us": idx_us,
            "jp": idx_jp,
            "eu": idx_eu
        },
        "commodities": {
            "brent": brent_oil
        },
        "fundamentals": fundamentals,
        "institutional": institutional,
        "institutional_3d": institutional_3d,
        "institutional_daily": institutional_daily,
        "tech_charts": tech_charts,
        "history": {
            "1Y": history_1y,
            "2Y": history_2y
        },
        "live_news": news
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"Successfully generated {json_path}")
    print(f"2603: {stock_2603.get('price')} ({stock_2603.get('change_percent')}%) | MA20: {stock_2603.get('technicals', {}).get('ma20')} | RSI: {stock_2603.get('technicals', {}).get('rsi14')}")
    print(f"2609: {stock_2609.get('price')} ({stock_2609.get('change_percent')}%) | MA20: {stock_2609.get('technicals', {}).get('ma20')} | RSI: {stock_2609.get('technicals', {}).get('rsi14')}")
    print(f"2615: {stock_2615.get('price')} ({stock_2615.get('change_percent')}%) | MA20: {stock_2615.get('technicals', {}).get('ma20')} | RSI: {stock_2615.get('technicals', {}).get('rsi14')}")
    print(f"Brent Oil: {brent_oil.get('price')} | Fundamentals: {len(fundamentals)} | Institutional: {len(institutional)}")
    print(f"History 1Y points: {len(history_1y['labels']) if history_1y else 0} | 2Y points: {len(history_2y['labels']) if history_2y else 0}")

if __name__ == '__main__':
    main()
