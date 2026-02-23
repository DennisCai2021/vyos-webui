#!/bin/bash
echo "停止 VyOS Web UI..."
pkill -f 'uvicorn.*main:app' 2>/dev/null && echo "  服务已停止" || echo "  服务未运行"
pkill -f 'python.*-m http.server' 2>/dev/null
pkill -f 'python.*backend/main.py' 2>/dev/null
pkill -f 'python.*run_backend.py' 2>/dev/null
echo "完成"
