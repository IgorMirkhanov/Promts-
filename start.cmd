@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Установи Node.js 20+ с https://nodejs.org и запусти снова & pause & exit /b 1)
if not exist node_modules (echo Установка зависимостей... & call npm install || (pause & exit /b 1))
if not exist .env (copy .env.example .env >nul & echo Впиши ключи в .env и сохрани файл & notepad .env)
start "" http://localhost:3000
call npm run web
pause
