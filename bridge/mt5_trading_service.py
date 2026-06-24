"""HTTP RPC service for local MT5 trading (MetaApi-compatible)."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, HTTPException, Query
from pydantic import AliasChoices, BaseModel, Field

import mt5_trading as trading

BIND_HOST = os.environ.get("MT5_TRADE_BIND_HOST", "127.0.0.1")
BIND_PORT = int(os.environ.get("MT5_TRADE_PORT", "9530"))

app = FastAPI(
    title="MT5 Local Trading RPC",
    version="1.0.0",
    description="Python 交易层（127.0.0.1:9530）。对外请使用 Node 网关 9628 的 /docs。",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)


class MarketOrderBody(BaseModel):
    symbol: str
    volume: float
    stopLoss: float | None = None
    takeProfit: float | None = None
    comment: str = ""
    clientId: str | None = None

    model_config = {"populate_by_name": True}


class ClosePositionBody(BaseModel):
    positionId: str = Field(validation_alias=AliasChoices("positionId", "position_id"))
    comment: str = ""
    clientId: str | None = None

    model_config = {"populate_by_name": True}


class ClosePartialBody(ClosePositionBody):
    volume: float


def _handle_trading_error(err: Exception) -> HTTPException:
    if isinstance(err, trading.TradingError):
        status = 404 if err.code == "NOT_FOUND" else 400
        return HTTPException(status_code=status, detail={"code": err.code, "message": str(err)})
    return HTTPException(status_code=500, detail={"code": "INTERNAL", "message": str(err)})


@app.get("/health")
def route_health() -> dict[str, Any]:
    try:
        return trading.health()
    except trading.TradingError as err:
        raise _handle_trading_error(err) from err


@app.post("/rpc/create_market_buy_order")
def route_buy(body: MarketOrderBody) -> dict[str, Any]:
    try:
        return trading.create_market_buy_order(
            symbol=body.symbol,
            volume=body.volume,
            stop_loss=body.stopLoss,
            take_profit=body.takeProfit,
            comment=body.comment,
        )
    except trading.TradingError as err:
        raise _handle_trading_error(err) from err


@app.post("/rpc/create_market_sell_order")
def route_sell(body: MarketOrderBody) -> dict[str, Any]:
    try:
        return trading.create_market_sell_order(
            symbol=body.symbol,
            volume=body.volume,
            stop_loss=body.stopLoss,
            take_profit=body.takeProfit,
            comment=body.comment,
        )
    except trading.TradingError as err:
        raise _handle_trading_error(err) from err


@app.post("/rpc/close_position")
def route_close(body: ClosePositionBody) -> dict[str, Any]:
    try:
        return trading.close_position(body.positionId, body.comment)
    except trading.TradingError as err:
        raise _handle_trading_error(err) from err


@app.post("/rpc/close_position_partially")
def route_close_partial(body: ClosePartialBody) -> dict[str, Any]:
    try:
        return trading.close_position_partially(body.positionId, body.volume, body.comment)
    except trading.TradingError as err:
        raise _handle_trading_error(err) from err


@app.get("/rpc/get_position/{position_id}")
def route_get_position(position_id: str) -> dict[str, Any]:
    try:
        result = trading.get_position(position_id)
        if result is None:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "position not found"})
        return result
    except trading.TradingError as err:
        raise _handle_trading_error(err) from err


@app.get("/rpc/get_positions")
def route_get_positions() -> list[dict[str, Any]]:
    try:
        return trading.get_positions()
    except trading.TradingError as err:
        raise _handle_trading_error(err) from err


@app.get("/rpc/get_orders")
def route_get_orders() -> list[dict[str, Any]]:
    try:
        return trading.get_orders()
    except trading.TradingError as err:
        raise _handle_trading_error(err) from err


@app.get("/rpc/get_order/{order_id}")
def route_get_order(order_id: str) -> dict[str, Any]:
    try:
        result = trading.get_order(order_id)
        if result is None:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "order not found"})
        return result
    except trading.TradingError as err:
        raise _handle_trading_error(err) from err


@app.get("/rpc/get_account_information")
def route_get_account_information() -> dict[str, Any]:
    try:
        return trading.get_account_information()
    except trading.TradingError as err:
        raise _handle_trading_error(err) from err


@app.get("/rpc/get_history_orders_by_time_range")
def route_get_history_orders(
    time_from: str = Query(..., alias="from"),
    time_to: str = Query(..., alias="to"),
) -> list[dict[str, Any]]:
    try:
        start = datetime.fromisoformat(time_from.replace("Z", "+00:00"))
        end = datetime.fromisoformat(time_to.replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return trading.get_history_orders_by_time_range(start, end)
    except ValueError as err:
        raise HTTPException(status_code=400, detail={"code": "INVALID_TIME", "message": str(err)}) from err
    except trading.TradingError as err:
        raise _handle_trading_error(err) from err


def main() -> None:
    import uvicorn

    print(f"[trade] MT5 trading RPC http://{BIND_HOST}:{BIND_PORT}", flush=True)
    uvicorn.run(app, host=BIND_HOST, port=BIND_PORT, log_level="info")


if __name__ == "__main__":
    main()
