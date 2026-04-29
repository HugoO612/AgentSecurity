#!/bin/sh
set -eu

node_major="${NODE_MAJOR:-24}"
openclaw_package="${OPENCLAW_PACKAGE:-openclaw}"
version_policy="${OPENCLAW_VERSION_POLICY:-latest}"
install_root="/opt/agent-security/current"
state_dir="/var/lib/agent-security"
log_dir="/var/log/agent-security"

mkdir -p "$install_root/bin" "$state_dir" "$log_dir"

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -Eq "^v${node_major}\\."; then
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${node_major}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update
    apt-get install -y nodejs
  else
    echo "apt-get is required to install Node ${node_major}" >&2
    exit 20
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not available after Node installation" >&2
  exit 21
fi

if [ "$version_policy" = "latest" ]; then
  npm install -g "${openclaw_package}@latest"
else
  npm install -g "$openclaw_package"
fi

cat > "$install_root/bin/start-agent-security.sh" <<'EOF'
#!/bin/sh
set -eu
mkdir -p /var/lib/agent-security /var/log/agent-security
if command -v openclaw >/dev/null 2>&1; then
  openclaw start >>/var/log/agent-security/openclaw.log 2>&1 &
else
  echo "openclaw command not found" >&2
  exit 22
fi
pid=$!
echo "$pid" >/var/run/agent-security.pid
echo running >/var/lib/agent-security/state
wait "$pid"
EOF
chmod +x "$install_root/bin/start-agent-security.sh"

cat > "$install_root/manifest.json" <<EOF
{"agentName":"OpenClaw","installSource":"npm","versionPolicy":"${version_policy}","nodeVersion":"$(node --version)","npmVersion":"$(npm --version)","onboardingUrl":"http://127.0.0.1:3000"}
EOF

echo installed > "$state_dir/openclaw-install.state"
echo "openclaw-installed"
