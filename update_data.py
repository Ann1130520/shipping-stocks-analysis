import os
import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

DIR = os.path.dirname(os.path.abspath(__file__))

def get_tw_now():
    tz_tw = timezone(timedelta(hours=8))
    return datetime.now(tz_tw).strftime("%Y-%m-%d %H:%M:%S")

def fetch_quote(symbol):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1d"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode())
            res = data['chart']['result'][0]
            meta = res['meta']
            
            price = round(meta.get('regularMarketPrice', 0.0), 2)
            prev_close = round(meta.get('chartPreviousClose', price), 2)
            change = round(price - prev_close, 2)
            pct = round((change / prev_close) * 100, 2) if prev_close else 0.0
            
            high = round(meta.get('regularMarketDayHigh', price), 2)
            low = round(meta.get('regularMarketDayLow', price), 2)
            volume = meta.get('regularMarketVolume', 0)
            
            return {
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
    except Exception as e:
        print(f"Error fetching quote {symbol}: {e}")
        return {
            "symbol": symbol,
            "status": "error",
            "error": str(e)
        }

def fetch_shipping_news():
    query = urllib.parse.quote("長榮 陽明 萬海 貨櫃 運價")
    url = f"https://news.google.com/rss/search?q={query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    
    news_items = []
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            xml_data = resp.read()
            root = ET.fromstring(xml_data)
            items = root.findall('.//item')[:10]
            
            for idx, item in enumerate(items):
                title = item.find('title').text if item.find('title') is not None else ""
                link = item.find('link').text if item.find('link') is not None else ""
                pubDate = item.find('pubDate').text if item.find('pubDate') is not None else ""
                source_elem = item.find('source')
                source = source_elem.text if source_elem is not None else "財經新聞"
                
                clean_title = title
                if " - " in title:
                    parts = title.rsplit(" - ", 1)
                    clean_title = parts[0]
                    if source == "財經新聞":
                        source = parts[1]
                
                sentiment = "bull" if any(w in clean_title for w in ["漲", "飆", "新高", "旺", "賺", "紅利", "利多", "揚", "強", "突破", "按讚"]) else "neutral"
                
                news_items.append({
                    "id": f"live-{idx+1}",
                    "title": clean_title,
                    "link": link,
                    "pubDate": pubDate,
                    "source": source,
                    "sentiment": sentiment,
                    "category": "freight" if any(k in clean_title for k in ["運價", "SCFI", "貨櫃"]) else "corporate",
                    "impact": "即時追蹤貨櫃三雄（長榮、陽明、萬海）營運與籌碼影響"
                })
    except Exception as e:
        print(f"Error fetching news RSS: {e}")
        
    return news_items

def main():
    print("1. Fetching Shipping Big 3 (2603, 2609, 2615)...")
    stock_2603 = fetch_quote("2603.TW")
    stock_2609 = fetch_quote("2609.TW")
    stock_2615 = fetch_quote("2615.TW")
    
    print("2. Fetching Global Market Indices (TW, US, JP, EU)...")
    idx_tw = fetch_quote("^TWII")       # 台灣加權
    idx_us = fetch_quote("^GSPC")       # 美國 S&P 500
    idx_jp = fetch_quote("^N225")       # 日本日經225
    idx_eu = fetch_quote("^STOXX50E")   # 歐洲 Stoxx 50

    print("2.5 Fetching Taiwan Benchmarks (2330, 0050)...")
    bench_2330 = fetch_quote("2330.TW") # 台積電
    bench_0050 = fetch_quote("0050.TW") # 元大台灣50
    
    print("3. Fetching live shipping news...")
    news = fetch_shipping_news()
    
    output_data = {
        "last_updated": get_tw_now(),
        "stocks": {
            "2603": stock_2603,
            "2609": stock_2609,
            "2615": stock_2615
        },
        "global_indices": {
            "tw": idx_tw,
            "us": idx_us,
            "jp": idx_jp,
            "eu": idx_eu
        },
        "tw_benchmarks": {
            "2330": bench_2330,
            "0050": bench_0050
        },
        "live_news": news
    }
    
    json_path = os.path.join(DIR, "latest_data.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully generated {json_path}")
    print(f"長榮 (2603): {stock_2603.get('price')} ({stock_2603.get('change_percent')}%)")
    print(f"陽明 (2609): {stock_2609.get('price')} ({stock_2609.get('change_percent')}%)")
    print(f"萬海 (2615): {stock_2615.get('price')} ({stock_2615.get('change_percent')}%)")
    print(f"台股大盤: {idx_tw.get('price')} ({idx_tw.get('change_percent')}%)")
    print(f"美股S&P500: {idx_us.get('price')} ({idx_us.get('change_percent')}%)")
    print(f"日經225: {idx_jp.get('price')} ({idx_jp.get('change_percent')}%)")
    print(f"歐股STOXX50: {idx_eu.get('price')} ({idx_eu.get('change_percent')}%)")
    print(f"台積電 (2330): {bench_2330.get('price')} ({bench_2330.get('change_percent')}%)")
    print(f"台灣50 (0050): {bench_0050.get('price')} ({bench_0050.get('change_percent')}%)")

if __name__ == '__main__':
    main()
