#!/bin/bash

# FundVal Live - Stop Development Services
# Note: This script is for development mode only
# Desktop app users can simply quit the application

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}>>> Stopping FundVal Live (Development Mode)...${NC}"

# Kill Backend
if [ -f "backend.pid" ]; then
    PID=$(cat backend.pid)
    if ps -p $PID > /dev/null; then
        kill $PID
        echo -e "Backend (PID: $PID) stopped."
    else
        echo -e "${RED}Backend process $PID not found.${NC}"
    fi
    rm backend.pid
else
    echo "No backend PID file found."
fi

# Also kill any process still bound to port 21345
if command -v lsof &> /dev/null; then
    OLD_PID=$(lsof -ti :21345 2>/dev/null)
    if [ -n "$OLD_PID" ]; then
        kill $OLD_PID 2>/dev/null
        echo -e "Stopped process on port 21345 (PID: $OLD_PID)."
    fi
fi

echo -e "${GREEN}>>> All services stopped.${NC}"
