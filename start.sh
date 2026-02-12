#!/bin/bash

# FundVal Live - Development Mode Startup Script
# For desktop app users: Download from https://github.com/Ye-Yu-Mo/FundVal-Live/releases
#
# 耗时说明（慢的主要原因）：
#   - npm ci：每次都会安装/校验全部 node 依赖，约 20s～2min（网络与缓存相关）
#   - npm run build：每次完整打前端包（Vite 编译+打包），约 10s～1min
#   - uv sync：校验/安装 Python 依赖，约几秒
#   - sleep 2 + sleep 4：固定等待约 6 秒
# 快速启动：若前端已构建过且未改代码，可加参数跳过前端构建： ./start.sh --no-build

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

SKIP_BUILD=false
for arg in "$@"; do
    if [ "$arg" = "--no-build" ]; then
        SKIP_BUILD=true
        break
    fi
done

echo -e "${GREEN}>>> Starting FundVal Live (Development Mode)...${NC}"
echo -e "${YELLOW}>>> For desktop app, download from Releases page${NC}"
echo ""

mkdir -p logs backend/data

# 1. Check Prerequisites
if ! command -v uv &> /dev/null; then
    echo -e "${RED}Error: 'uv' is not installed. Please install it first.${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: 'npm' is not installed. Please install Node.js.${NC}"
    exit 1
fi

# 2. Build Frontend（--no-build 时跳过，可节省约 30s～3min）
if [ "$SKIP_BUILD" = true ]; then
    if [ ! -d "frontend/dist" ]; then
        echo -e "${RED}✘ frontend/dist 不存在，无法跳过构建。请去掉 --no-build 先完整执行一次。${NC}"
        exit 1
    fi
    echo -e "${BLUE}>>> [1/2] Skipping frontend build (--no-build)${NC}"
    echo -e "${GREEN}✔ Using existing frontend/dist${NC}"
else
    echo -e "${BLUE}>>> [1/2] Building Frontend...${NC}"
    cd frontend || exit
    npm ci > /dev/null 2>&1
    npm run build > ../logs/frontend-build.log 2>&1
    cd ..

    if [ ! -d "frontend/dist" ]; then
        echo -e "${RED}✘ Frontend build failed (Check logs/frontend-build.log)${NC}"
        exit 1
    fi
    echo -e "${GREEN}✔ Frontend built${NC}"
fi

# 3. Start Backend
echo -e "${BLUE}>>> [2/2] Starting Backend...${NC}"
# Release port 21345 if already in use (e.g. previous run)
BACKEND_PORT=21345
if command -v lsof &> /dev/null; then
    OLD_PID=$(lsof -ti :$BACKEND_PORT 2>/dev/null)
    if [ -n "$OLD_PID" ]; then
        echo -e "${YELLOW}>>> Port $BACKEND_PORT in use (PID: $OLD_PID), stopping old process...${NC}"
        kill $OLD_PID 2>/dev/null || true
        sleep 2
    fi
fi
cd backend || exit
uv sync > /dev/null 2>&1
# Start with nohup and redirect to root logs folder
nohup uv run uvicorn app.main:app --port $BACKEND_PORT --host 0.0.0.0 > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../backend.pid
cd ..

# 4. Final Validation
echo -e "${GREEN}>>> Waiting for initialization...${NC}"
sleep 4

echo -e "------------------------------------------------"
if ps -p $(cat backend.pid) > /dev/null; then
    echo -e "${GREEN}✔ Backend  : RUNNING (Port 21345)${NC}"
    echo -e "${GREEN}>>> Access : http://localhost:21345${NC}"
else
    echo -e "${RED}✘ Backend  : FAILED (Check logs/backend.log)${NC}"
fi
echo -e "------------------------------------------------"
echo -e "${BLUE}View logs with: tail -f logs/backend.log${NC}"
if [ "$SKIP_BUILD" = false ]; then
    echo -e "${BLUE}Tip: 下次若未改前端代码，可用 ./start.sh --no-build 跳过构建，启动更快${NC}"
fi