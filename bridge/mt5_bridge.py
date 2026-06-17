"""Push MT5 quotes to Node TCP server via MetaTrader5 Python API."""

from __future__ import annotations

import json
import os
import socket
import sys
import time

import MetaTrader5 as mt5

MT5_PATH = os.environ.get("MT5_PATH", r"E:\workspace\服务器\MT5\terminal64.exe")
TCP_HOST = os.environ.get("MT5_TCP_HOST", "127.0.0.1")
TCP_PORT = int(os.environ.get("MT5_TCP_PORT", "9627"))
POLL_MS = int(os.environ.get("MT5_POLL_MS", "200"))
DEFAULT_SYMBOLS = os.environ.get("MT5_SYMBOLS", "XAUUSD,XAGUSD,USDCNH")


def parse_symbols(raw: str) -> list[str]:
    return [s.strip().upper() for s in raw.split(",") if s.strip()]


def connect_tcp() -> socket.socket | None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    try:
        sock.connect((TCP_HOST, TCP_PORT))
        sock.settimeout(None)
        print(f"[bridge] connected to {TCP_HOST}:{TCP_PORT}", flush=True)
        return sock
    except OSError as err:
        print(f"[bridge] connect failed: {err}", flush=True)
        sock.close()
        return None


def send_quote(sock: socket.socket, symbol: str, bid: float, ask: float, tick_time: int) -> bool:
    payload = {
        "type": "quote",
        "symbol": symbol,
        "bid": bid,
        "ask": ask,
        "time": tick_time,
    }
    data = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
    try:
        sock.sendall(data)
        return True
    except OSError as err:
        print(f"[bridge] send failed: {err}", flush=True)
        return False


def ensure_mt5() -> list[str]:
    if not mt5.initialize(MT5_PATH):
        raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")

    account = mt5.account_info()
    if account is None:
        raise RuntimeError(f"MT5 account unavailable: {mt5.last_error()}")

    print(f"[bridge] MT5 account {account.login} @ {account.server}", flush=True)

    symbols = parse_symbols(DEFAULT_SYMBOLS)
    active: list[str] = []

    for symbol in symbols:
        if not mt5.symbol_select(symbol, True):
            print(f"[bridge] skip unavailable symbol: {symbol}", flush=True)
            continue
        active.append(symbol)

    if not active:
        raise RuntimeError("no valid symbols to push")

    print(f"[bridge] pushing symbols: {', '.join(active)}", flush=True)
    return active


def push_once(sock: socket.socket, symbols: list[str]) -> None:
    for symbol in symbols:
        tick = mt5.symbol_info_tick(symbol)
        if tick is None or tick.bid <= 0 or tick.ask <= 0:
            continue
        if not send_quote(sock, symbol, tick.bid, tick.ask, int(tick.time)):
            raise ConnectionError("tcp send failed")


def main() -> int:
    symbols = ensure_mt5()
    sock: socket.socket | None = None
    reconnect_at = 0.0

    try:
        while True:
            now = time.time()
            if sock is None:
                if now < reconnect_at:
                    time.sleep(0.5)
                    continue
                sock = connect_tcp()
                if sock is None:
                    reconnect_at = now + 3
                    time.sleep(0.5)
                    continue

            try:
                push_once(sock, symbols)
            except ConnectionError:
                if sock is not None:
                    sock.close()
                sock = None
                reconnect_at = time.time() + 3
                continue

            time.sleep(POLL_MS / 1000)
    except KeyboardInterrupt:
        print("[bridge] stopped", flush=True)
        return 0
    finally:
        if sock is not None:
            sock.close()
        mt5.shutdown()


if __name__ == "__main__":
    sys.exit(main())
