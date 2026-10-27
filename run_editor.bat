@echo off
setlocal
cd /d "%~dp0"
title Subtitled Otomad Archive - Editor Server

echo ========================================================
echo   Starting Otomad Archive Editor Server...
echo ========================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    python server.py
    goto END
)

where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
    py server.py
    goto END
)

where python3 >nul 2>nul
if %ERRORLEVEL% equ 0 (
    python3 server.py
    goto END
)

echo [ERROR] Python is not installed or not in PATH.
echo Please install Python (https://www.python.org/) and try again.
pause
exit /b 1

:END
if %ERRORLEVEL% neq 0 (
    echo.
    echo Server stopped unexpectedly.
    pause
)
