"""MT5 trading operations with MetaApi-compatible response shapes."""

from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

import MetaTrader5 as mt5

from mt5_util import format_last_error, resolve_mt5_path

MT5_PATH = resolve_mt5_path()
TRADE_MAGIC = int(os.environ.get("MT5_TRADE_MAGIC", "880001"))
TRADE_DEVIATION = int(os.environ.get("MT5_TRADE_DEVIATION", "20"))

# symbol_info.filling_mode uses different bit flags than ORDER_FILLING_*
SYMBOL_FILLING_FOK = 1
SYMBOL_FILLING_IOC = 2
SYMBOL_FILLING_RETURN = 4

_lock = threading.Lock()
_initialized = False


class TradingError(Exception):
    def __init__(self, message: str, *, code: str = "TRADING_ERROR"):
        super().__init__(message)
        self.code = code


def _ensure_mt5() -> None:
    global _initialized
    if _initialized and mt5.terminal_info() is not None:
        return
    if not mt5.initialize(MT5_PATH):
        raise TradingError(f"MT5 initialize failed: {format_last_error()}", code="MT5_INIT")
    account = mt5.account_info()
    if account is None:
        raise TradingError(f"MT5 account unavailable: {format_last_error()}", code="NO_ACCOUNT")
    _initialized = True


def _with_lock(action: str, fn: Any) -> Any:
    with _lock:
        _ensure_mt5()
        try:
            return fn()
        except TradingError:
            raise
        except Exception as err:  # noqa: BLE001
            raise TradingError(f"{action} failed: {err}") from err


def _resolve_filling(symbol: str) -> int:
    info = mt5.symbol_info(symbol)
    if info is None:
        raise TradingError(f"symbol unavailable: {symbol}", code="SYMBOL")
    if not info.visible:
        if not mt5.symbol_select(symbol, True):
            raise TradingError(f"cannot select symbol: {symbol}", code="SYMBOL")
    mode = int(info.filling_mode)
    if mode & SYMBOL_FILLING_IOC:
        return mt5.ORDER_FILLING_IOC
    if mode & SYMBOL_FILLING_FOK:
        return mt5.ORDER_FILLING_FOK
    if mode & SYMBOL_FILLING_RETURN:
        return mt5.ORDER_FILLING_RETURN
    return mt5.ORDER_FILLING_IOC


def _map_position(position: Any) -> dict[str, Any]:
    side = "POSITION_TYPE_BUY" if position.type == mt5.ORDER_TYPE_BUY else "POSITION_TYPE_SELL"
    comment = str(position.comment or "")
    return {
        "id": str(position.ticket),
        "positionId": str(position.ticket),
        "symbol": str(position.symbol),
        "volume": float(position.volume),
        "type": side,
        "side": "BUY" if position.type == mt5.ORDER_TYPE_BUY else "SELL",
        "comment": comment,
        "brokerComment": comment,
        "openPrice": float(position.price_open),
        "currentPrice": float(position.price_current),
        "price": float(position.price_open),
        "profit": float(position.profit),
        "time": int(position.time),
    }


def _map_account(info: Any) -> dict[str, Any]:
    return {
        "login": str(info.login),
        "server": str(info.server),
        "name": str(info.name),
        "currency": str(info.currency),
        "balance": float(info.balance),
        "equity": float(info.equity),
        "margin": float(info.margin),
        "freeMargin": float(info.margin_free),
        "marginLevel": float(info.margin_level or 0),
        "leverage": int(info.leverage),
        "tradeAllowed": bool(info.trade_allowed),
    }


def _map_order(order: Any) -> dict[str, Any]:
    order_type = "ORDER_TYPE_BUY" if order.type in (mt5.ORDER_TYPE_BUY, mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_BUY_STOP) else "ORDER_TYPE_SELL"
    if order.type in (mt5.ORDER_TYPE_BUY_LIMIT, mt5.ORDER_TYPE_SELL_LIMIT):
        order_type = "ORDER_TYPE_BUY_LIMIT" if order.type == mt5.ORDER_TYPE_BUY_LIMIT else "ORDER_TYPE_SELL_LIMIT"
    return {
        "id": str(order.ticket),
        "orderId": str(order.ticket),
        "positionId": str(order.position_id or order.ticket),
        "symbol": str(order.symbol),
        "volume": float(order.volume_initial or order.volume_current or 0),
        "volumeCurrent": float(order.volume_current or 0),
        "type": order_type,
        "comment": str(order.comment or ""),
        "brokerComment": str(order.comment or ""),
        "openPrice": float(order.price_open or order.price_current or 0),
        "state": str(order.state),
        "time": int(order.time_setup or order.time_done or 0),
    }


def _resolve_position_ticket(position_id: str) -> int:
    ticket = int(str(position_id).strip())
    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        raise TradingError(f"position not found: {position_id}", code="NOT_FOUND")
    return ticket


def _find_position_id(symbol: str, comment: str, order_ticket: int) -> str:
    time.sleep(0.05)
    by_ticket = mt5.positions_get(ticket=order_ticket)
    if by_ticket:
        return str(by_ticket[0].ticket)
    positions = mt5.positions_get(symbol=symbol) or []
    if comment:
        for item in positions:
            if str(item.comment or "") == comment:
                return str(item.ticket)
    if positions:
        return str(positions[-1].ticket)
    return str(order_ticket)


def _send_market_order(
    *,
    symbol: str,
    volume: float,
    order_type: int,
    comment: str = "",
    stop_loss: float | None = None,
    take_profit: float | None = None,
) -> dict[str, Any]:
    symbol = symbol.strip().upper()
    if volume <= 0:
        raise TradingError("volume must be > 0", code="INVALID_VOLUME")

    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise TradingError(f"no tick for {symbol}", code="NO_TICK")

    price = tick.ask if order_type == mt5.ORDER_TYPE_BUY else tick.bid
    request: dict[str, Any] = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "volume": float(volume),
        "type": order_type,
        "price": float(price),
        "deviation": TRADE_DEVIATION,
        "magic": TRADE_MAGIC,
        "comment": str(comment or "")[:31],
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": _resolve_filling(symbol),
    }
    if stop_loss is not None:
        request["sl"] = float(stop_loss)
    if take_profit is not None:
        request["tp"] = float(take_profit)

    result = mt5.order_send(request)
    if result is None:
        raise TradingError(f"order_send failed: {format_last_error()}", code="ORDER_SEND")
    if result.retcode != mt5.TRADE_RETCODE_DONE:
        raise TradingError(
            f"order rejected retcode={result.retcode} comment={result.comment}",
            code="ORDER_REJECTED",
        )

    action = "ORDER_TYPE_BUY" if order_type == mt5.ORDER_TYPE_BUY else "ORDER_TYPE_SELL"
    position_id = _find_position_id(symbol, request["comment"], int(result.order))
    return {
        "orderId": str(result.order),
        "positionId": position_id,
        "symbol": symbol,
        "actionType": action,
        "volume": float(volume),
        "status": "success",
        "error": None,
    }


def create_market_buy_order(
    symbol: str,
    volume: float,
    stop_loss: float | None = None,
    take_profit: float | None = None,
    comment: str = "",
) -> dict[str, Any]:
    return _with_lock(
        "create_market_buy_order",
        lambda: _send_market_order(
            symbol=symbol,
            volume=volume,
            order_type=mt5.ORDER_TYPE_BUY,
            comment=comment,
            stop_loss=stop_loss,
            take_profit=take_profit,
        ),
    )


def create_market_sell_order(
    symbol: str,
    volume: float,
    stop_loss: float | None = None,
    take_profit: float | None = None,
    comment: str = "",
) -> dict[str, Any]:
    return _with_lock(
        "create_market_sell_order",
        lambda: _send_market_order(
            symbol=symbol,
            volume=volume,
            order_type=mt5.ORDER_TYPE_SELL,
            comment=comment,
            stop_loss=stop_loss,
            take_profit=take_profit,
        ),
    )


def _close_position_ticket(
    position_id: str,
    volume: float | None,
    comment: str = "",
) -> dict[str, Any]:
    ticket = _resolve_position_ticket(position_id)
    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        raise TradingError(f"position not found: {position_id}", code="NOT_FOUND")
    position = positions[0]
    close_volume = float(volume if volume is not None else position.volume)
    if close_volume <= 0 or close_volume > float(position.volume) + 1e-8:
        raise TradingError("invalid close volume", code="INVALID_VOLUME")

    order_type = mt5.ORDER_TYPE_SELL if position.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
    tick = mt5.symbol_info_tick(position.symbol)
    if tick is None:
        raise TradingError(f"no tick for {position.symbol}", code="NO_TICK")
    price = tick.bid if order_type == mt5.ORDER_TYPE_SELL else tick.ask

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": position.symbol,
        "volume": close_volume,
        "type": order_type,
        "position": ticket,
        "price": float(price),
        "deviation": TRADE_DEVIATION,
        "magic": TRADE_MAGIC,
        "comment": str(comment or "")[:31],
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": _resolve_filling(position.symbol),
    }
    result = mt5.order_send(request)
    if result is None:
        raise TradingError(f"close failed: {format_last_error()}", code="ORDER_SEND")
    if result.retcode != mt5.TRADE_RETCODE_DONE:
        raise TradingError(
            f"close rejected retcode={result.retcode} comment={result.comment}",
            code="ORDER_REJECTED",
        )
    return {
        "orderId": str(result.order),
        "positionId": str(position_id),
        "status": "success",
        "error": None,
    }


def close_position(position_id: str, comment: str = "") -> dict[str, Any]:
    return _with_lock(
        "close_position",
        lambda: _close_position_ticket(position_id, None, comment),
    )


def close_position_partially(position_id: str, volume: float, comment: str = "") -> dict[str, Any]:
    return _with_lock(
        "close_position_partially",
        lambda: _close_position_ticket(position_id, volume, comment),
    )


def get_position(position_id: str) -> dict[str, Any] | None:
    def _load() -> dict[str, Any] | None:
        ticket = int(str(position_id).strip())
        positions = mt5.positions_get(ticket=ticket)
        if not positions:
            return None
        return _map_position(positions[0])

    return _with_lock("get_position", _load)


def get_positions() -> list[dict[str, Any]]:
    def _load() -> list[dict[str, Any]]:
        positions = mt5.positions_get() or []
        return [_map_position(item) for item in positions]

    return _with_lock("get_positions", _load)


def get_order(order_id: str) -> dict[str, Any] | None:
    def _load() -> dict[str, Any] | None:
        ticket = int(str(order_id).strip())
        pending = mt5.orders_get(ticket=ticket)
        if pending:
            return _map_order(pending[0])
        from_ts = datetime(2000, 1, 1, tzinfo=timezone.utc)
        to_ts = datetime.now(timezone.utc)
        history = mt5.history_orders_get(from_ts, to_ts, ticket=ticket)
        if history:
            return _map_order(history[0])
        return None

    return _with_lock("get_order", _load)


def get_account_information() -> dict[str, Any]:
    def _load() -> dict[str, Any]:
        info = mt5.account_info()
        if info is None:
            raise TradingError(f"account unavailable: {format_last_error()}", code="NO_ACCOUNT")
        return _map_account(info)

    return _with_lock("get_account_information", _load)


def get_history_orders_by_time_range(
    time_from: datetime,
    time_to: datetime,
) -> list[dict[str, Any]]:
    def _load() -> list[dict[str, Any]]:
        if time_from.tzinfo is None:
            start = time_from.replace(tzinfo=timezone.utc)
        else:
            start = time_from.astimezone(timezone.utc)
        if time_to.tzinfo is None:
            end = time_to.replace(tzinfo=timezone.utc)
        else:
            end = time_to.astimezone(timezone.utc)
        orders = mt5.history_orders_get(start, end) or []
        return [_map_order(item) for item in orders]

    return _with_lock("get_history_orders_by_time_range", _load)


def health() -> dict[str, Any]:
    def _load() -> dict[str, Any]:
        _ensure_mt5()
        account = mt5.account_info()
        terminal = mt5.terminal_info()
        return {
            "ok": account is not None and terminal is not None,
            "login": str(account.login) if account else None,
            "server": str(account.server) if account else None,
            "tradeAllowed": bool(account.trade_allowed) if account else False,
        }

    return _with_lock("health", _load)
