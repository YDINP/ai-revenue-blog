@echo off
chcp 65001 >nul
REM Daily Naver index measurement. Scheduled task runs this at 08:30 KST,
REM before the 09:00 daily report so the report carries a fresh number.
REM Unregister: schtasks /Delete /TN "mungge-naver-index" /F
REM NOTE: keep this file ASCII + no BOM. cmd.exe chokes on a UTF-8 BOM.
cd /d "%~dp0.."
if not exist ".logs" mkdir ".logs"
echo [%date% %time%] start >> ".logs\naver-index.log"
node "scripts\naver-index-check.mjs" >> ".logs\naver-index.log" 2>&1
echo [%date% %time%] exit=%errorlevel% >> ".logs\naver-index.log"
