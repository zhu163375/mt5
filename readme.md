配置 config.env

cd C:\mt5_project
python --version
python -c "import platform; print(platform.architecture())"
python -m pip install MetaTrader5 -i https://pypi.org/simple
python -c "import MetaTrader5 as mt5; print('OK')"
python bridge\mt5_bridge.py
