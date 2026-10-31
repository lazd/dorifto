#!/usr/bin/env bash

# ==============================================================================
# ORACLE CLOUD ALWAYS FREE INSTANCE PROVISIONING & SECURITY SCRIPT
# ==============================================================================
# Targets: Ubuntu Server (Optimized for LTS 24.04/26.04) on VM.Standard.E2.1.Micro
# Run command: chmod +x server-setup.sh && ./server-setup.sh
# Run as the default user (not root); sudo is used where needed.
# ==============================================================================

# Exit immediately if a command (or any part of a pipeline) fails
set -eo pipefail

if [[ $EUID -eq 0 ]]; then
    echo "Run as the default user, not root (sudo is used where needed)." >&2
    exit 1
fi

# Avoid prompts halting execution mid-script
export DEBIAN_FRONTEND=noninteractive
APT_OPTS=(-y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold")

echo "========================================================================"
echo "🚀 Starting System Initialization & Security Hardening Script..."
echo "========================================================================"

# ------------------------------------------------------------------------------
# STEP 1: Core System Updates, Swap & Network Time Configuration
# ------------------------------------------------------------------------------
echo "🔄 Updating apt package repositories..."
sudo apt-get update -y

echo "📦 Upgrading existing system packages to their latest secure versions..."
sudo -E apt-get upgrade "${APT_OPTS[@]}"

SWAPSIZE="4G"
echo "💾 Configuring $SWAPSIZE swap file (the micro instance only has 1G RAM)..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l $SWAPSIZE /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
else
    echo "✅ Swap file already exists."
fi

echo "🕒 Installing chrony for network time synchronization..."
sudo -E apt-get install "${APT_OPTS[@]}" chrony
# Prefer Oracle's link-local NTP server, falling back to the Ubuntu pool
CHRONY_CONF="/etc/chrony/chrony.conf"
if ! grep -q "169.254.169.254" "$CHRONY_CONF"; then
    echo "server 169.254.169.254 iburst prefer" | sudo tee -a "$CHRONY_CONF" > /dev/null
fi
sudo systemctl enable chrony
sudo systemctl restart chrony

# ------------------------------------------------------------------------------
# STEP 2: Install lazd's dotfiles
# ------------------------------------------------------------------------------
DOTFILES_DIR="$HOME/dotfiles"
if [ ! -d "$DOTFILES_DIR" ]; then
    echo "⚫️ Installing lazd's dotfiles"
    git clone https://github.com/lazd/dotfiles.git "$DOTFILES_DIR"
    (cd "$DOTFILES_DIR" && ./install.sh)
else
    echo "⚫️ Updating lazd's dotfiles"
    (
        cd "$DOTFILES_DIR"
        OLD_HEAD=$(git rev-parse HEAD)
        git pull
        if [ "$(git rev-parse HEAD)" != "$OLD_HEAD" ]; then
            ./install.sh
        else
            echo "✅ Dotfiles already up to date."
        fi
    )
fi

# ------------------------------------------------------------------------------
# STEP 3: Configure Unattended Security Upgrades & Scheduled Auto-Reboots
# ------------------------------------------------------------------------------
echo "🛡️ Installing and configuring unattended-upgrades..."
sudo -E apt-get install "${APT_OPTS[@]}" unattended-upgrades

# Enable background daily runs for unattended upgrades automatically
echo "unattended-upgrades unattended-upgrades/enable_auto_updates boolean true" | sudo debconf-set-selections
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "🕒 Scheduling maintenance reboots for kernel upgrades at 03:00 UTC..."
# Drop-in overrides 50unattended-upgrades; only reboots if an update requires it
printf 'Unattended-Upgrade::Automatic-Reboot "true";\nUnattended-Upgrade::Automatic-Reboot-Time "03:00";\n' \
    | sudo tee /etc/apt/apt.conf.d/52auto-reboot > /dev/null

sudo systemctl enable unattended-upgrades
sudo systemctl restart unattended-upgrades

# ------------------------------------------------------------------------------
# STEP 4: Open HTTP/HTTPS in Oracle's iptables rules
# ------------------------------------------------------------------------------
# Oracle's images ship iptables rules that end in a REJECT and also protect
# link-local traffic (metadata, boot volume). Don't flush them or use UFW;
# insert ACCEPT rules ahead of the REJECT instead.
echo "🔥 Opening ports 80 and 443 in iptables..."
sudo -E apt-get install "${APT_OPTS[@]}" iptables-persistent
for PORT in 80 443; do
    RULE=(-m state --state NEW -p tcp --dport "$PORT" -j ACCEPT)
    if ! sudo iptables -C INPUT "${RULE[@]}" 2> /dev/null; then
        REJECT_LINE=$(sudo iptables -L INPUT --line-numbers | awk '$2 == "REJECT" { print $1; exit }')
        sudo iptables -I INPUT "${REJECT_LINE:-1}" "${RULE[@]}"
    fi
done
sudo netfilter-persistent save

# ------------------------------------------------------------------------------
# STEP 5: Install Node Version Manager (NVM) & Node.js Runtime Stack
# ------------------------------------------------------------------------------
echo "🟢 Deploying Node Version Manager (NVM)..."
export NVM_DIR="$HOME/.nvm"
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash

# Load NVM into the running script without needing a new shell
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "🟢 Installing Node.js Long-Term Support (LTS) active release..."
nvm install --lts
nvm use --lts
nvm alias default 'lts/*'

echo "✅ Node.js $(node -v), npm $(npm -v)"

echo "========================================================================"
echo "🎉 SYSTEM CONFIGURATION COMPLETE!"
echo "========================================================================"
echo "Next steps:"
echo "1. In the Oracle Cloud console, add Ingress Rules to the subnet's"
echo "   security list for TCP ports 80 and 443."
echo "2. Clone dorifto and run: deploy/setup.sh <domain>"
echo "3. Run deploy/download-regions.sh to import map data and start serving."
echo "========================================================================"

sudo iptables -L INPUT --line-numbers
