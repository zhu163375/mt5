"""Shared MT5 helpers for bridge and trading services."""

from __future__ import annotations

import os

import MetaTrader5 as mt5

DEFAULT_MT5_CANDIDATES = (
    r"C:\Program Files\MetaTrader 5\terminal64.exe",
    r"C:\Program Files (x86)\MetaTrader 5\terminal64.exe",
)


def format_last_error() -> str:
    """Format mt5.last_error() without crashing on GBK/non-UTF8 messages."""
    try:
        err = mt5.last_error()
    except Exception as exc:
        return f"unknown ({exc})"
    if err is None:
        return "unknown"
    try:
        return str(err)
    except UnicodeDecodeError:
        pass
    try:
        return repr(err)
    except Exception:
        return "unknown (error message encoding issue)"


def resolve_mt5_path() -> str:
    """Use MT5_PATH from env, or common install locations on Windows."""
    configured = os.environ.get("MT5_PATH", "").strip()
    if configured and os.path.isfile(configured):
        return configured
    for candidate in DEFAULT_MT5_CANDIDATES:
        if os.path.isfile(candidate):
            return candidate
    return configured or DEFAULT_MT5_CANDIDATES[0]
