#!/usr/bin/env python3
"""추가 설치 없이 페이지의 연결, 수치와 로컬 HTTP 응답을 검사한다."""
import functools
import json
from collections import Counter
from datetime import date, datetime
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import subprocess
import threading
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.links = []
        self.assets = []
        self.sections = []
        self.in_main = False
        self.body_external_links = []
        self.lang = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "html":
            self.lang = attrs.get("lang")
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "main":
            self.in_main = True
        if tag == "section":
            self.sections.append(attrs.get("id"))
        if tag == "a":
            href = attrs.get("href", "")
            self.links.append(href)
            if self.in_main and urlsplit(href).scheme in ("http", "https"):
                self.body_external_links.append(href)
        if tag in ("script", "img") and attrs.get("src"):
            self.assets.append(attrs["src"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.assets.append(attrs["href"])

    def handle_endtag(self, tag):
        if tag == "main":
            self.in_main = False


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    parser = PageParser()
    parser.feed(html)
    require(parser.lang == "ko", "페이지 언어가 한국어가 아닙니다.")
    duplicates = [key for key, value in Counter(parser.ids).items() if value > 1]
    require(not duplicates, "중복 ID: " + ", ".join(duplicates))
    require(parser.sections == ["overview", "financials", "news", "risks"], "필수 네 부분을 확인하세요.")
    for href in parser.links:
        if href.startswith("#"):
            require(href[1:] in parser.ids, "깨진 본문 연결: " + href)
    require(not parser.body_external_links, "본문의 출처는 번호로만 표시해야 합니다.")
    for number in range(1, 8):
        require("source-" + str(number) in parser.ids, "출처 목록 누락")
        require("#source-" + str(number) in parser.links, "본문에서 사용하지 않은 출처")
    for asset in parser.assets:
        require(not urlsplit(asset).scheme, "외부 자산 의존: " + asset)
        require((ROOT / asset).is_file(), "없는 파일: " + asset)
    require("missing-title" in parser.ids, "빠진 자료 블록 누락")
    require("작성:" in html and "자료 기준:" in html, "작성 시점 또는 자료 기준일 누락")
    raw = (ROOT / "data.js").read_text(encoding="utf-8").strip()
    require(raw.startswith("window.APPLE_DATA = "), "데이터 선언을 확인하세요.")
    data = json.loads(raw.split("=", 1)[1].strip().removesuffix(";"))
    written = datetime.fromisoformat(data["writtenAt"]).date()
    for period, values in data["financials"].items():
        require(sum(item["value"] for item in values["categories"]) == values["revenue"], period + " 매출 합계 불일치")
        require(sum(item["previous"] for item in values["categories"]) == values["previousRevenue"], period + " 전년 매출 합계 불일치")
        require(0 < values["netIncome"] < values["operatingIncome"] < values["grossProfit"] < values["revenue"], period + " 손익 수치 확인 필요")
    prices = data["prices"]
    require(len(prices) == 22, "확보한 22거래일 데이터가 필요합니다.")
    dates = [date.fromisoformat(item["date"]) for item in prices]
    require(dates == sorted(set(dates)), "가격 날짜 중복 또는 순서 오류")
    require(all(day.weekday() < 5 and day <= written for day in dates), "주말 또는 작성일 이후 가격")
    require(all(isinstance(item["close"], (int, float)) and item["close"] > 0 for item in prices), "유효하지 않은 종가")
    require(dates[-1].isoformat() == data["priceAsOf"], "주가 자료 기준일 불일치")
    require(date.fromisoformat(data["financialAsOf"]) <= written, "재무 기준일 확인 필요")
    require(prices[0]["close"] == 343.91 and prices[-1]["close"] == 354.07, "주가 시작·종료값 확인 필요")
    for filename in ("app.js", "data.js"):
        if shutil.which("node"):
            subprocess.run(["node", "--check", str(ROOT / filename)], check=True, capture_output=True, text=True)
    print("통과: 네 부분 구성, 출처 7개, 내부 연결, 로컬 자산")
    print("통과: 4분기·연간 매출 합계, 손익 수치, 22거래일 종가")

    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        for resource in ["", *parser.assets]:
            with urlopen("http://127.0.0.1:" + str(server.server_port) + "/" + resource, timeout=5) as response:
                require(response.status == 200, "HTTP 응답 실패: " + resource)
                require(bool(response.read()), "빈 HTTP 응답: " + resource)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    print("통과: 로컬 HTTP 페이지 및 모든 자산 200 응답")
    print("검사 완료")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit("검사 실패: " + str(error))
