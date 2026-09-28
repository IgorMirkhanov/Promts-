#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Установи Node.js 20+ с https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install
[ -f .env ] || { cp .env.example .env; echo "Впиши ключи в .env и запусти снова"; exit 0; }
npm run web
