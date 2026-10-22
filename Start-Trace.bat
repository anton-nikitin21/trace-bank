@echo off
cd /d "%~dp0"
py -3 start-local.py
if errorlevel 1 python start-local.py
pause
