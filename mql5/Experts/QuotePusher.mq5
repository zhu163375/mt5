//+------------------------------------------------------------------+
//| QuotePusher.mq5 - 将 MT5 行情推送到 Node.js TCP 服务              |
//+------------------------------------------------------------------+
#property copyright "mt5_project"
#property version   "1.00"
#property strict

input string InpServerHost   = "127.0.0.1";   // Node.js 服务地址
input int    InpServerPort   = 9527;          // Node.js TCP 端口
input string InpSymbols      = ""; // 推送品种（逗号分隔，留空则仅推送当前图表品种）
input int    InpPollMs       = 200;           // 行情轮询间隔（毫秒）
input int    InpReconnectSec = 3;               // 断线重连间隔（秒）

int      g_socket = INVALID_HANDLE;
string   g_symbols[];
datetime g_lastReconnect = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   ParseSymbols(InpSymbols);
   AddSymbolIfMissing(Symbol());

   if(ArraySize(g_symbols) == 0)
     {
      Print("QuotePusher: 未配置有效品种");
      return INIT_PARAMETERS_INCORRECT;
     }

   for(int i = 0; i < ArraySize(g_symbols); i++)
     {
      if(!SymbolSelect(g_symbols[i], true))
         Print("QuotePusher: 无法选择品种 ", g_symbols[i], "，请在市场报价中添加该品种");
     }

   ConnectToServer();
   EventSetMillisecondTimer(InpPollMs);
   Print("QuotePusher: 已启动，目标 ", InpServerHost, ":", InpServerPort);
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(g_socket != INVALID_HANDLE)
     {
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
     }
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   if(g_socket == INVALID_HANDLE)
     {
      TryReconnect();
      return;
     }

   for(int i = 0; i < ArraySize(g_symbols); i++)
      PushQuote(g_symbols[i]);
  }

//+------------------------------------------------------------------+
void ParseSymbols(const string raw)
  {
   string parts[];
   int count = StringSplit(raw, ',', parts);
   ArrayResize(g_symbols, 0);

   for(int i = 0; i < count; i++)
     {
      string sym = Trim(parts[i]);
      if(sym == "")
         continue;
      AddSymbolIfMissing(sym);
     }
  }

//+------------------------------------------------------------------+
void AddSymbolIfMissing(const string symbol)
  {
   string sym = Trim(symbol);
   if(sym == "")
      return;

   for(int i = 0; i < ArraySize(g_symbols); i++)
     {
      if(g_symbols[i] == sym)
         return;
     }

   int n = ArraySize(g_symbols);
   ArrayResize(g_symbols, n + 1);
   g_symbols[n] = sym;
  }

//+------------------------------------------------------------------+
string Trim(const string value)
  {
   string result = value;
   StringTrimLeft(result);
   StringTrimRight(result);
   return result;
  }

//+------------------------------------------------------------------+
bool ConnectToServer()
  {
   if(g_socket != INVALID_HANDLE)
     {
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
     }

   g_socket = SocketCreate();
   if(g_socket == INVALID_HANDLE)
     {
      Print("QuotePusher: SocketCreate 失败, err=", GetLastError());
      return false;
     }

   if(!SocketConnect(g_socket, InpServerHost, (uint)InpServerPort, 3000))
     {
      Print("QuotePusher: 连接失败 ", InpServerHost, ":", InpServerPort, " err=", GetLastError());
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
      return false;
     }

   Print("QuotePusher: 已连接到 Node.js");
   return true;
  }

//+------------------------------------------------------------------+
void TryReconnect()
  {
   datetime now = TimeCurrent();
   if(now - g_lastReconnect < InpReconnectSec)
      return;
   g_lastReconnect = now;
   ConnectToServer();
  }

//+------------------------------------------------------------------+
bool SendLine(const string line)
  {
   if(g_socket == INVALID_HANDLE)
      return false;

   uchar data[];
   int len = StringToCharArray(line, data, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   if(len <= 0)
      return false;

   int sent = SocketSend(g_socket, data, len);
   if(sent != len)
     {
      Print("QuotePusher: 发送失败, 关闭连接 err=", GetLastError());
      SocketClose(g_socket);
      g_socket = INVALID_HANDLE;
      return false;
     }
   return true;
  }

//+------------------------------------------------------------------+
void PushQuote(const string symbol)
  {
   if(!SymbolSelect(symbol, true))
      return;

   double bid = SymbolInfoDouble(symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
   if(bid <= 0.0 || ask <= 0.0)
      return;

   datetime quoteTime = (datetime)SymbolInfoInteger(symbol, SYMBOL_TIME);
   string json = StringFormat(
      "{\"type\":\"quote\",\"symbol\":\"%s\",\"bid\":%.10f,\"ask\":%.10f,\"time\":%I64d}\n",
      symbol, bid, ask, (long)quoteTime
   );
   SendLine(json);
  }

//+------------------------------------------------------------------+
