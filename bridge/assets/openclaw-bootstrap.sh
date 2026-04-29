#!/bin/sh
set -eu

node_major="${NODE_MAJOR:-24}"
openclaw_package="${OPENCLAW_PACKAGE:-openclaw}"
version_policy="${OPENCLAW_VERSION_POLICY:-latest}"
install_root="/opt/agent-security/current"
state_dir="/var/lib/agent-security"
log_dir="/var/log/agent-security"
ubuntu_mirror="${AGENT_SECURITY_UBUNTU_APT_MIRROR:-http://mirrors.ustc.edu.cn/ubuntu}"
ubuntu_mirror_fallbacks="${AGENT_SECURITY_UBUNTU_APT_MIRROR_FALLBACKS:-http://mirrors.ustc.edu.cn/ubuntu http://mirrors.tuna.tsinghua.edu.cn/ubuntu http://mirrors.cloud.tencent.com/ubuntu http://mirrors.aliyun.com/ubuntu http://archive.ubuntu.com/ubuntu}"
node_mirror="${AGENT_SECURITY_NODE_DIST_MIRROR:-https://npmmirror.com/mirrors/node}"
node_mirror_fallbacks="${AGENT_SECURITY_NODE_DIST_MIRROR_FALLBACKS:-https://npmmirror.com/mirrors/node https://nodejs.org/dist https://mirrors.tuna.tsinghua.edu.cn/nodejs-release https://mirrors.ustc.edu.cn/node}"
node_tarball="${AGENT_SECURITY_NODE_TARBALL:-}"
node_tarball_sha256="${AGENT_SECURITY_NODE_TARBALL_SHA256:-}"
npm_registry="${AGENT_SECURITY_NPM_REGISTRY:-https://registry.npmjs.org}"
npm_registry_fallbacks="${AGENT_SECURITY_NPM_REGISTRY_FALLBACKS:-https://registry.npmmirror.com https://mirrors.cloud.tencent.com/npm https://repo.huaweicloud.com/repository/npm}"
npm_proxy="${AGENT_SECURITY_NPM_PROXY:-}"
openclaw_tarball="${AGENT_SECURITY_OPENCLAW_TARBALL:-}"
openclaw_tarball_sha256="${AGENT_SECURITY_OPENCLAW_TARBALL_SHA256:-}"

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

mkdir -p "$install_root/bin" "$state_dir" "$log_dir"

configure_ubuntu_mirror() {
  mirror="$1"
  if [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then
    cp /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list.d/ubuntu.sources.agentsecurity.bak 2>/dev/null || true
    sed "s#http://archive.ubuntu.com/ubuntu#${mirror}#g; s#http://security.ubuntu.com/ubuntu#${mirror}#g; s#https://mirrors.ustc.edu.cn/ubuntu#${mirror}#g" \
      /etc/apt/sources.list.d/ubuntu.sources.agentsecurity.bak > /etc/apt/sources.list.d/ubuntu.sources
  elif [ -f /etc/apt/sources.list ]; then
    cp /etc/apt/sources.list /etc/apt/sources.list.agentsecurity.bak 2>/dev/null || true
    sed "s#http://archive.ubuntu.com/ubuntu#${mirror}#g; s#http://security.ubuntu.com/ubuntu#${mirror}#g; s#https://mirrors.ustc.edu.cn/ubuntu#${mirror}#g" \
      /etc/apt/sources.list.agentsecurity.bak > /etc/apt/sources.list
  fi
}

install_system_prerequisites() {
  if [ -d /etc/ssl/certs ] && command -v curl >/dev/null 2>&1 && command -v xz >/dev/null 2>&1; then
    return 0
  fi

  mirrors="$ubuntu_mirror $ubuntu_mirror_fallbacks"
  for mirror in $mirrors; do
    echo "Trying Ubuntu apt mirror ${mirror}"
    configure_ubuntu_mirror "$mirror"
    if apt-get update && apt-get install -y --fix-missing ca-certificates curl xz-utils; then
      echo "$mirror" > "$state_dir/ubuntu-apt-mirror"
      return 0
    fi
    echo "Ubuntu apt mirror failed: ${mirror}" >&2
  done

  echo "Unable to install system prerequisites from every configured Ubuntu mirror." >&2
  exit 27
}

install_node_from_dist() {
  arch="$(uname -m)"
  case "$arch" in
    x86_64) node_arch="x64" ;;
    aarch64|arm64) node_arch="arm64" ;;
    *) echo "Unsupported Node architecture: $arch" >&2; exit 23 ;;
  esac

  sums_path="/tmp/node-shasums.txt"
  tar_name=""
  tar_path=""
  if [ -n "$node_tarball" ]; then
    if [ ! -f "$node_tarball" ]; then
      echo "Bundled Node tarball is missing: $node_tarball" >&2
      exit 24
    fi
    if [ -n "$node_tarball_sha256" ] && [ "$(sha256sum "$node_tarball" | awk '{print $1}')" != "$node_tarball_sha256" ]; then
      echo "Bundled Node tarball checksum mismatch" >&2
      exit 25
    fi
    tar_path="$node_tarball"
  else
  mirrors="$node_mirror $node_mirror_fallbacks"
  for mirror in $mirrors; do
    echo "Trying Node ${node_major} download from ${mirror}"
    if ! timeout 45 curl -fL --connect-timeout 10 --max-time 40 "${mirror}/latest-v${node_major}.x/SHASUMS256.txt" -o "$sums_path"; then
      echo "Node SHASUMS download failed from ${mirror}" >&2
      continue
    fi
    tar_name="$(grep "node-v${node_major}.*-linux-${node_arch}.tar.xz\$" "$sums_path" | awk '{print $2}' | tail -n 1)"
    if [ -z "$tar_name" ]; then
      echo "Unable to resolve Node ${node_major} linux-${node_arch} tarball from ${mirror}" >&2
      continue
    fi
    expected="$(grep " ${tar_name}\$" "$sums_path" | awk '{print $1}' | tail -n 1)"
    tar_path="/tmp/${tar_name}"
    if ! timeout 180 curl -fL --connect-timeout 10 --max-time 170 "${mirror}/latest-v${node_major}.x/${tar_name}" -o "$tar_path"; then
      echo "Node tarball download failed from ${mirror}" >&2
      continue
    fi
    actual="$(sha256sum "$tar_path" | awk '{print $1}')"
    if [ "$actual" != "$expected" ]; then
      echo "Node tarball checksum mismatch from ${mirror}" >&2
      continue
    fi
    echo "$mirror" > "$state_dir/node-dist-mirror"
    break
  done
  if [ -z "$tar_name" ] || [ ! -f "$tar_path" ]; then
    echo "Unable to download Node ${node_major} from every configured mirror." >&2
    exit 24
  fi
  fi
  rm -rf /opt/node-v"${node_major}"
  mkdir -p /opt/node-v"${node_major}"
  tar -xJf "$tar_path" -C /opt/node-v"${node_major}" --strip-components=1
  ln -sf /opt/node-v"${node_major}"/bin/node /usr/local/bin/node
  ln -sf /opt/node-v"${node_major}"/bin/npm /usr/local/bin/npm
  ln -sf /opt/node-v"${node_major}"/bin/npx /usr/local/bin/npx
}

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -Eq "^v${node_major}\\."; then
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    install_system_prerequisites
    install_node_from_dist
  else
    echo "apt-get is required to install Node ${node_major}" >&2
    exit 20
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not available after Node installation" >&2
  exit 21
fi

install_openclaw_from_npm() {
  if [ "$version_policy" = "latest" ]; then
    package_spec="${openclaw_package}@latest"
  else
    package_spec="$openclaw_package"
  fi

  if [ -n "$openclaw_tarball" ]; then
    if [ ! -f "$openclaw_tarball" ]; then
      echo "Bundled OpenClaw npm tarball is missing: $openclaw_tarball" >&2
      exit 28
    fi
    if [ -n "$openclaw_tarball_sha256" ] && [ "$(sha256sum "$openclaw_tarball" | awk '{print $1}')" != "$openclaw_tarball_sha256" ]; then
      echo "Bundled OpenClaw npm tarball checksum mismatch" >&2
      exit 29
    fi
    echo "Installing OpenClaw from bundled npm tarball"
    if timeout -k 10 180 npm --loglevel=notice install -g "$openclaw_tarball"; then
      echo "bundled-npm-tarball" > "$state_dir/openclaw-registry"
      return 0
    fi
    echo "Bundled OpenClaw npm tarball install failed; trying registries." >&2
  fi

  if [ -z "$npm_proxy" ] && command -v curl >/dev/null 2>&1; then
    host_ip="$(ip route | awk '/default/ {print $3; exit}' 2>/dev/null || true)"
    for candidate in "http://${host_ip}:7890" "http://127.0.0.1:7890"; do
      if [ "$candidate" = "http://:7890" ]; then
        continue
      fi
      if timeout -k 3 8 curl -fsI --proxy "$candidate" --connect-timeout 3 https://registry.npmjs.org/openclaw >/dev/null 2>&1; then
        npm_proxy="$candidate"
        echo "Using detected npm proxy ${npm_proxy}"
        break
      fi
    done
  fi

  registries="$npm_registry $npm_registry_fallbacks"
  seen_registries=""
  for registry in $registries; do
    case " $seen_registries " in
      *" $registry "*) continue ;;
    esac
    seen_registries="$seen_registries $registry"
    npm_proxy_args=""
    if [ -n "$npm_proxy" ]; then
      npm_proxy_args="--proxy $npm_proxy --https-proxy $npm_proxy"
    fi
    pkill -f "npm .*${openclaw_package}" 2>/dev/null || true
    echo "Trying OpenClaw npm install from ${registry}"
    if timeout -k 10 240 npm \
      --registry "$registry" \
      $npm_proxy_args \
      --fetch-timeout=20000 \
      --fetch-retries=0 \
      --prefer-online \
      --loglevel=notice \
      install -g "$package_spec"; then
      echo "$registry" > "$state_dir/openclaw-registry"
      return 0
    fi
    pkill -f "npm .*${openclaw_package}" 2>/dev/null || true
    echo "OpenClaw install failed from ${registry}; trying next registry." >&2
  done

  echo "OpenClaw npm install failed from every configured registry." >&2
  exit 26
}

install_openclaw_from_npm
if [ -x /opt/node-v"${node_major}"/bin/openclaw ]; then
  ln -sf /opt/node-v"${node_major}"/bin/openclaw /usr/local/bin/openclaw
fi

cat > "$install_root/bin/start-agent-security.sh" <<'EOF'
#!/bin/sh
set -eu
mkdir -p /var/lib/agent-security /var/log/agent-security
export PATH="/usr/local/sbin:/usr/local/bin:/opt/node-v24/bin:/usr/sbin:/usr/bin:/sbin:/bin"
if command -v openclaw >/dev/null 2>&1; then
  openclaw --no-color gateway --allow-unconfigured --bind loopback --auth none run >>/var/log/agent-security/openclaw.log 2>&1 &
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
{"agentName":"OpenClaw","installSource":"npm","versionPolicy":"${version_policy}","nodeVersion":"$(node --version)","npmVersion":"$(npm --version)","onboardingUrl":"http://127.0.0.1:18789/"}
EOF

echo installed > "$state_dir/openclaw-install.state"
echo "openclaw-installed"
