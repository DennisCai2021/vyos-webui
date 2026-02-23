#!/bin/bash
echo "VyOS Web UI 状态:"
echo ""
if pgrep -f 'uvicorn.*main:app' > /dev/null; then
    echo "服务: 运行中 (PID: $(pgrep -f 'uvicorn.*main:app'))"
elif pgrep -f 'python.*run_backend.py' > /dev/null; then
    echo "服务: 运行中 (PID: $(pgrep -f 'python.*run_backend.py'))"
else
    echo "服务: 未运行"
fi
echo ""
if ss -tlnp 2>/dev/null | grep -q ':8000'; then
    echo "端口 8000: 已监听"
fi
echo ""
echo "访问地址: http://<VyOS-IP>:8000"
