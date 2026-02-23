# VyOS Web UI

A modern web management interface for VyOS routers, developed with Claude Code and GLM4.7+Doubao-Seed-2.0-Code.

[中文文档 (Chinese Documentation)](README_CN.md)

## Compatibility

- **Compatible with VyOS 1.4** (with Python 3.11)
- Other versions have not been tested. If you encounter any bugs, please submit an issue.

## Project Overview

This project provides a modern web management interface for VyOS routers, supporting real VyOS device connection and configuration management.

## Features

### 1. System Information
- System version, uptime
- CPU, memory, disk usage
- Hardware information
- Frontend and backend version display

### 2. Network Management
- **Network Interfaces**: View and configure network interfaces (physical, VLAN, PPPoE)
- **Routing Table**: Manage static routes and connected routes
- **Routing Summary**: View complete routing table (all route sources)
- **ARP Table**: View ARP/NDP entries
- **DNS Configuration**: View and configure DNS servers

### 3. Routing Protocols
- **BGP**: Complete BGP configuration (neighbors, networks, route-maps, prefix-lists, community-lists)
- **IS-IS**: IS-IS protocol configuration (interfaces, redistribution, neighbor status)

### 4. VPN Configuration
- **WireGuard**: Complete WireGuard configuration and management
  - Interface creation, editing, deletion
  - Peer management
  - Random private key generation
  - Public key display and copy
- **IPsec**: IPsec VPN configuration
- **OpenVPN**: OpenVPN configuration

### 5. Security Management
- **Firewall**: Firewall rules management
- **NAT**: NAT rules management
- **Policy**: Policy management (route-maps, prefix-lists, community-lists)

### 6. User Authentication
- User login authentication
- Default admin account: vyos/vyos

## Technology Stack

### Frontend
- React 19 + TypeScript
- Vite
- Ant Design 6

### Backend
- FastAPI (Python 3.12)
- Pydantic (data validation)
- Paramiko (SSH connection)
- Uvicorn (ASGI server)

### VyOS Interaction
- **Read**: `vyatta-op-cmd-wrapper` + `show` commands
- **Write Configuration**: Interactive SSH session (`invoke_shell()`) + `configure` mode

## Project Structure

```
vyos-webui/
├── frontend/          # Frontend project
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── api/           # API calls
│   │   └── contexts/      # React Context
│   └── package.json
├── backend/           # Backend project
│   ├── app/
│   │   ├── api/           # API routes (v1)
│   │   ├── services/      # Business logic
│   │   │   ├── vyos_ssh.py        # SSH connection
│   │   │   ├── vyos_command.py    # Command execution
│   │   │   ├── vyos_config.py     # Configuration session
│   │   │   └── vyos_config_service.py  # Advanced configuration service
│   │   └── core/          # Core functionality
│   └── main.py           # FastAPI entry point
├── scripts/           # Helper scripts
└── README.md
```

## Quick Start (Development Environment)

### Prerequisites

- Node.js 18+
- Python 3.12+
- VyOS device

### 1. Configure VyOS Connection

Create `backend/.env` with VyOS connection information:

```env
VYOS_HOST=192.168.1.1
VYOS_PORT=22
VYOS_USERNAME=vyos
VYOS_PASSWORD=your_password
VYOS_TIMEOUT=30
```

### 2. Start Backend

```bash
cd backend

# Create virtual environment (first time)
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start backend server
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Backend API docs: http://localhost:8000/docs

### 3. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend access: http://localhost:5173

### 4. Login

Default admin account:
- Username: `vyos`
- Password: `vyos`

## Deployment

### Prerequisites for Deployment Machine

- Node.js 18+
- Python 3.11+
- Git
- sshpass, scp
- Access to VyOS device

### Deploy to VyOS

```bash
./scripts/deploy.sh [VyOS_HOST] [VyOS_USER] [VyOS_PASSWORD]
```

Example:
```bash
./scripts/deploy.sh 192.168.1.1 vyos vyos
```

After deployment, access: http://[VyOS_IP]:8000

**Note: The default credentials are vyos/vyos

### Management commands on VyOS:
```bash
cd /opt/vyos-webui
./start.sh   # Start services
./stop.sh    # Stop services
./status.sh  # Check status
```

## DEB Package Installation (Offline)

A fully offline DEB package is available for VyOS 1.4.

### Install DEB Package

```bash
# 1. Copy DEB package to VyOS
scp vyos-webui_0.0.1-1_all.deb vyos@<vyos-ip>:/tmp/

# 2. Install on VyOS
ssh vyos@<vyos-ip>
sudo dpkg -i /tmp/vyos-webui_0.0.1-1_all.deb

# 3. Start service
# Option 1: systemd (recommended)
sudo systemctl start vyos-webui
sudo systemctl enable vyos-webui  # Auto-start on boot

# Option 2: Script (same as deploy.sh)
cd /opt/vyos-webui
./start.sh
```

### Modify VyOS SSH Configuration

Edit the configuration file:

```bash
sudo vi /opt/vyos-webui/backend/.env
```

Configuration options:

```env
VYOS_HOST=127.0.0.1       # VyOS host address
VYOS_PORT=22                # SSH port
VYOS_USERNAME=vyos          # SSH username
VYOS_PASSWORD=vyos          # SSH password
VYOS_TIMEOUT=30             # Timeout in seconds
```

After modifying, restart the service:

```bash
cd /opt/vyos-webui && ./stop.sh && ./start.sh
# or
sudo systemctl restart vyos-webui
```

## API Endpoints

### System
- `GET /api/v1/system/info` - Get system information
- `GET /api/v1/version` - Get backend version

### Network Management
- `GET /api/v1/network/interfaces` - Get network interface list
- `GET /api/v1/network/interfaces/{name}` - Get specific interface details
- `POST /api/v1/network/interfaces` - Create interface
- `PUT /api/v1/network/interfaces/{name}` - Update interface
- `DELETE /api/v1/network/interfaces/{name}` - Delete interface
- `GET /api/v1/network/routes` - Get routing table
- `POST /api/v1/network/routes` - Add static route
- `DELETE /api/v1/network/routes/{destination}` - Delete static route
- `GET /api/v1/network/routes/summary` - Get complete routing table summary
- `GET /api/v1/network/arp-table` - Get ARP table
- `GET /api/v1/network/dns` - Get DNS configuration
- `PUT /api/v1/network/dns/servers` - Set DNS servers

### VPN Management
- `GET /api/v1/vpn/wireguard/config` - Get WireGuard configuration
- `POST /api/v1/vpn/wireguard/interfaces` - Create WireGuard interface
- `DELETE /api/v1/vpn/wireguard/interfaces/{name}` - Delete WireGuard interface
- `POST /api/v1/vpn/wireguard/interfaces/{name}/peers` - Add WireGuard peer
- `DELETE /api/v1/vpn/wireguard/interfaces/{name}/peers/{peerName}` - Delete WireGuard peer
- `GET /api/v1/vpn/ipsec/config` - Get IPsec configuration
- `GET /api/v1/vpn/openvpn/config` - Get OpenVPN configuration

### BGP Management
- `GET /api/v1/bgp/config` - Get BGP configuration
- `PUT /api/v1/bgp/config` - Update BGP configuration
- `POST /api/v1/bgp/neighbors` - Create BGP neighbor
- `DELETE /api/v1/bgp/neighbors/{ip}` - Delete BGP neighbor
- `GET /api/v1/bgp/summary` - Get BGP summary
- `GET /api/v1/bgp/prefix-lists` - Get prefix lists
- `GET /api/v1/bgp/route-maps` - Get route maps
- `GET /api/v1/bgp/community-lists` - Get community lists

### IS-IS Management
- `GET /api/v1/isis/config` - Get IS-IS configuration
- `POST /api/v1/isis/setup` - Setup IS-IS
- `PUT /api/v1/isis/config` - Update IS-IS configuration
- `DELETE /api/v1/isis/config` - Disable IS-IS
- `GET /api/v1/isis/status` - Get IS-IS status

### Authentication
- `POST /api/v1/auth/login` - User login

## Version Information

- Frontend version: 0.0.1-20250221
- Backend version: 0.0.1-20250221

## Development Notes

This project was developed with Claude Code and GLM4.7+Doubao-Seed-2.0-Code.

## License

MIT License
