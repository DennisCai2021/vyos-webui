# VyOS Web UI

一个现代化的 VyOS 路由器 Web 管理界面，通过 Claude Code 配合模型 GLM4.7+Doubao-Seed-2.0-Code 开发。

## 项目概述

本项目为 VyOS 路由器提供一个现代化的 Web 管理界面，支持真实的 VyOS 设备连接和配置管理。

## 已实现的功能

### 1. 系统信息
- 系统版本、运行时间
- CPU、内存、磁盘使用情况
- 硬件信息
- 前后端版本显示

### 2. 网络管理
- **网络接口**: 查看和配置网络接口（物理接口、VLAN、PPPoE）
- **路由表**: 管理静态路由和已连接路由
- **路由表摘要**: 查看完整的路由表（包含所有路由来源）
- **ARP 表**: 查看 ARP/NDP 表项
- **DNS 配置**: 查看和配置 DNS 服务器

### 3. 路由协议
- **BGP**: BGP 协议完整配置（对等体、网络、路由映射、前缀列表、团体列表）
- **IS-IS**: IS-IS 协议配置（接口、重分发、邻居状态显示）

### 4. VPN 配置
- **WireGuard**: 完整的 WireGuard 配置和管理
  - 接口创建、编辑、删除
  - Peer 管理
  - 私钥随机生成
  - 公钥显示和复制功能
- **IPsec**: IPsec VPN 配置
- **OpenVPN**: OpenVPN 配置

### 5. 安全管理
- **防火墙**: 防火墙规则管理
- **NAT**: NAT 规则管理
- **Policy**: 策略管理（路由映射、前缀列表、团体列表）

### 6. 用户认证
- 用户登录验证
- 默认管理员账号: vyos/vyos

## 技术栈

### 前端
- React 19 + TypeScript
- Vite
- Ant Design 6

### 后端
- FastAPI (Python 3.12)
- Pydantic (数据验证)
- Paramiko (SSH 连接)
- Uvicorn (ASGI 服务器)

### VyOS 交互方式
- **读取数据**: `vyatta-op-cmd-wrapper` + `show` 命令
- **写入配置**: 交互式 SSH 会话 (`invoke_shell()`) + `configure` 模式

## 项目结构

```
vyos-webui/
├── frontend/          # 前端项目
│   ├── src/
│   │   ├── components/    # 可复用组件
│   │   ├── pages/         # 页面组件
│   │   ├── api/           # API 调用
│   │   └── contexts/      # React Context
│   └── package.json
├── backend/           # 后端项目
│   ├── app/
│   │   ├── api/           # API 路由 (v1)
│   │   ├── services/      # 业务逻辑
│   │   │   ├── vyos_ssh.py        # SSH 连接
│   │   │   ├── vyos_command.py    # 命令执行
│   │   │   ├── vyos_config.py     # 配置会话
│   │   │   └── vyos_config_service.py  # 高级配置服务
│   │   └── core/          # 核心功能
│   └── main.py           # FastAPI 入口
├── scripts/           # 辅助脚本
├── debian/            # Debian 打包配置
└── README.md
```

## 快速开始（开发环境）

### 前置要求

- Node.js 18+
- Python 3.12+
- VyOS 设备

### 1. 配置 VyOS 连接

在 `backend/.env` 中配置 VyOS 连接信息：

```env
VYOS_HOST=192.168.1.1
VYOS_PORT=22
VYOS_USERNAME=vyos
VYOS_PASSWORD=your_password
VYOS_TIMEOUT=30
```

### 2. 启动后端

```bash
cd backend

# 创建虚拟环境 (首次)
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 启动后端服务器
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

后端 API 文档: http://localhost:8000/docs

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端访问: http://localhost:5173

### 4. 登录

默认管理员账号:
- 用户名: `vyos`
- 密码: `vyos`

## 部署说明

详细的 VyOS 部署文档请参考 [DEPLOY.md](./DEPLOY.md)。

## API 端点

### 系统信息
- `GET /api/v1/system/info` - 获取系统信息
- `GET /api/v1/version` - 获取后端版本

### 网络管理
- `GET /api/v1/network/interfaces` - 获取网络接口列表
- `GET /api/v1/network/interfaces/{name}` - 获取特定接口详情
- `POST /api/v1/network/interfaces` - 创建接口
- `PUT /api/v1/network/interfaces/{name}` - 更新接口
- `DELETE /api/v1/network/interfaces/{name}` - 删除接口
- `GET /api/v1/network/routes` - 获取路由表
- `POST /api/v1/network/routes` - 添加静态路由
- `DELETE /api/v1/network/routes/{destination}` - 删除静态路由
- `GET /api/v1/network/routes/summary` - 获取完整路由表摘要
- `GET /api/v1/network/arp-table` - 获取 ARP 表
- `GET /api/v1/network/dns` - 获取 DNS 配置
- `PUT /api/v1/network/dns/servers` - 设置 DNS 服务器

### VPN 管理
- `GET /api/v1/vpn/wireguard/config` - 获取 WireGuard 配置
- `POST /api/v1/vpn/wireguard/interfaces` - 创建 WireGuard 接口
- `DELETE /api/v1/vpn/wireguard/interfaces/{name}` - 删除 WireGuard 接口
- `POST /api/v1/vpn/wireguard/interfaces/{name}/peers` - 添加 WireGuard Peer
- `DELETE /api/v1/vpn/wireguard/interfaces/{name}/peers/{peerName}` - 删除 WireGuard Peer
- `GET /api/v1/vpn/ipsec/config` - 获取 IPsec 配置
- `GET /api/v1/vpn/openvpn/config` - 获取 OpenVPN 配置

### BGP 管理
- `GET /api/v1/bgp/config` - 获取 BGP 配置
- `PUT /api/v1/bgp/config` - 更新 BGP 配置
- `POST /api/v1/bgp/neighbors` - 创建 BGP 对等体
- `DELETE /api/v1/bgp/neighbors/{ip}` - 删除 BGP 对等体
- `GET /api/v1/bgp/summary` - 获取 BGP 摘要
- `GET /api/v1/bgp/prefix-lists` - 获取前缀列表
- `GET /api/v1/bgp/route-maps` - 获取路由映射
- `GET /api/v1/bgp/community-lists` - 获取团体列表

### IS-IS 管理
- `GET /api/v1/isis/config` - 获取 IS-IS 配置
- `POST /api/v1/isis/setup` - 设置 IS-IS
- `PUT /api/v1/isis/config` - 更新 IS-IS 配置
- `DELETE /api/v1/isis/config` - 禁用 IS-IS
- `GET /api/v1/isis/status` - 获取 IS-IS 状态

### 认证
- `POST /api/v1/auth/login` - 用户登录

## 版本信息

- 前端版本: 0.0.1-20250221
- 后端版本: 0.0.1-20250221

## 开发说明

本项目通过 Claude Code 配合模型 GLM4.7+Doubao-Seed-2.0-Code 开发。

## 许可证

MIT License
