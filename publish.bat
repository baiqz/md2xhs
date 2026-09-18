@echo off
setlocal
set "GITEXE=C:\Program Files\Git\cmd\git.exe"
cd /d "%~dp0"

echo.
echo   ==========================================================
echo     Publish md2xhs
echo   ==========================================================
echo.
echo     Repo   : https://github.com/baiqz/md2xhs
echo     Online : https://baiqz.github.io/md2xhs/
echo     Branch : main
echo.
echo     Edit the files, then double-click this. GitHub Pages
echo     rebuilds automatically, in about 1 minute.
echo.
echo   ----------------------------------------------------------
echo     Pending changes:
echo.
"%GITEXE%" status --short
echo.
echo   ----------------------------------------------------------
echo     Press any key to commit + push...
pause >nul
echo.

"%GITEXE%" add -A
"%GITEXE%" commit -m "update site"
"%GITEXE%" -c credential.helper=manager push

echo.
echo   ==========================================================
echo     Exit code : %ERRORLEVEL%
echo     0 = pushed. Wait ~1 min, then refresh the online URL.
echo   ==========================================================
echo.
pause
