#!/bin/bash
# Quick deployment script for VyOS Web UI

VYOS_HOST="198.18.5.188"
VYOS_USER="vyos"
VYOS_PASS="vyos"
REMOTE_DIR="/opt/vyos-webui"

echo "Deploying VyOS Web UI to $VYOS_HOST..."

# Create SSH command with password using sshpass
SSH_CMD="sshpass -p $VYOS_PASS ssh -o StrictHostKeyChecking=no $VYOS_USER@$VYOS_HOST"
SCP_CMD="sshpass -p $VYOS_PASS scp -o StrictHostKeyChecking=no"

# Create directory on VyOS
echo "Creating directory $REMOTE_DIR..."
$SSH_CMD "sudo mkdir -p $REMOTE_DIR && sudo chown -R vyos:vyos $REMOTE_DIR"

# Copy files - use rsync if available, otherwise scp
echo "Copying files..."
cd /home/ubuntu/Codes/vyos-webui

# Create tarball for faster transfer
echo "Creating archive..."
tar -czf /tmp/vyos-webui-deploy.tar.gz --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' --exclude='node_modules' --exclude='venv' --exclude='.env' --exclude='dist' --exclude='.claude' ./

# Copy and extract
echo "Transferring archive..."
$SCP_CMD /tmp/vyos-webui-deploy.tar.gz $VYOS_USER@$VYOS_HOST:/tmp/

echo "Extracting on remote..."
$SSH_CMD "cd $REMOTE_DIR && tar -xzf /tmp/vyos-webui-deploy.tar.gz && rm -f /tmp/vyos-webui-deploy.tar.gz"

# Cleanup local tarball
rm -f /tmp/vyos-webui-deploy.tar.gz

echo "Files transferred successfully!"

# Now setup backend
echo "Setting up backend..."
$SSH_CMD "cd $REMOTE_DIR/backend && [ ! -d venv ] && python3 -m venv venv || true"
$SSH_CMD "cd $REMOTE_DIR/backend && source venv/bin/activate && pip install -q -r requirements.txt"

# Create .env file for backend
echo "Creating backend .env..."
$SSH_CMD "cat > $REMOTE_DIR/backend/.env << 'EOF'
VYOS_HOST=127.0.0.1
VYOS_PORT=22
VYOS_USERNAME=vyos
VYOS_PASSWORD=vyos
VYOS_TIMEOUT=30
EOF"

# Setup frontend
echo "Setting up frontend..."
$SSH_CMD "cd $REMOTE_DIR/frontend && npm install --silent"
$SSH_CMD "cd $REMOTE_DIR/frontend && npm run build"

echo "Deployment complete!"
echo ""
echo "To start services manually on VyOS:"
echo "  Backend: cd $REMOTE_DIR/backend && source venv/bin/activate && python -m uvicorn main:app --host 0.0.0.0 --port 8000"
echo "  Frontend: cd $REMOTE_DIR/frontend && npx serve -s dist -l 5173 -L"
echo ""
echo "Access the UI at: http://$VYOS_HOST:5173"
