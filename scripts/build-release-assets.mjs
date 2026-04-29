import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const version = process.argv[2] ?? new Date().toISOString().slice(0, 10).replaceAll('-', '.')
const sourceCommit =
  process.env.AGENT_SECURITY_SOURCE_COMMIT?.trim() ||
  (await git(['rev-parse', '--short', 'HEAD']).catch(() => 'unknown'))
const assetDir = resolve('bridge/assets')
const rootfsPath = resolve(assetDir, 'agent-security-rootfs.tar')
const agentPath = resolve(assetDir, 'openclaw-agent.pkg')
const bootstrapPath = resolve(assetDir, 'openclaw-bootstrap.sh')
const manifestPath = resolve(assetDir, 'release-assets-manifest.json')
const ubuntuRootfsUrl =
  process.env.AGENT_SECURITY_UBUNTU_ROOTFS_URL?.trim() ||
  'https://cloud-images.ubuntu.com/wsl/releases/24.04/current/ubuntu-noble-wsl-amd64-24.04lts.rootfs.tar.gz'
const bundledOpenClawPath =
  process.env.AGENT_SECURITY_OPENCLAW_PAYLOAD_PATH?.trim()
    ? resolve(process.env.AGENT_SECURITY_OPENCLAW_PAYLOAD_PATH.trim())
    : null
const providedUbuntuRootfsPath =
  process.env.AGENT_SECURITY_UBUNTU_ROOTFS_PATH?.trim()
    ? resolve(process.env.AGENT_SECURITY_UBUNTU_ROOTFS_PATH.trim())
    : null
const shouldDownloadUbuntuRootfs = process.env.AGENT_SECURITY_DOWNLOAD_UBUNTU_ROOTFS === '1'

await mkdir(assetDir, { recursive: true })
await mkdir(resolve('.tmp'), { recursive: true })

const wslAssetDir = windowsPathToWsl(assetDir)
const buildScriptPath = resolve('.tmp', 'build-release-assets.sh')
const wslBuildScriptPath = windowsPathToWsl(buildScriptPath)
const shell = String.raw`
set -eu
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

root_dir="$work/rootfs"
agent_dir="$work/agent"
mkdir -p "$root_dir/bin" "$root_dir/etc" "$root_dir/root" "$root_dir/tmp" "$root_dir/proc" "$root_dir/sys" "$root_dir/dev" "$root_dir/run" "$root_dir/mnt/a" "$root_dir/mnt/c" "$root_dir/var/run" "$root_dir/var/log" "$root_dir/var/lib/agent-security" "$root_dir/opt/agent-security/bin" "$root_dir/opt/agent-security/current" "$root_dir/opt/agent-security/inbox"
cp /usr/bin/busybox "$root_dir/bin/busybox"
for applet in sh tar mkdir rm cat sleep kill nohup test true false echo uname id ps chmod touch ls date; do
  ln -sf busybox "$root_dir/bin/$applet"
done
cat > "$root_dir/etc/passwd" <<'EOF'
root:x:0:0:root:/root:/bin/sh
EOF
cat > "$root_dir/etc/group" <<'EOF'
root:x:0:
EOF
cat > "$root_dir/etc/wsl.conf" <<'EOF'
[boot]
systemd=false
[user]
default=root
EOF
cat > "$root_dir/opt/agent-security/bin/agent-security-runner.sh" <<'EOF'
#!/bin/sh
set -eu
mkdir -p /var/lib/agent-security
echo running > /var/lib/agent-security/state
trap 'echo stopped > /var/lib/agent-security/state; exit 0' TERM INT
while true; do sleep 30; done
EOF
chmod +x "$root_dir/opt/agent-security/bin/agent-security-runner.sh"
cat > "$root_dir/opt/agent-security/bin/start-managed.sh" <<'EOF'
#!/bin/sh
set -eu
mkdir -p /var/run /var/log /var/lib/agent-security
target=/opt/agent-security/bin/agent-security-runner.sh
if [ -x /opt/agent-security/current/bin/start-agent-security.sh ]; then
  target=/opt/agent-security/current/bin/start-agent-security.sh
fi
nohup "$target" >/var/log/agent-security.log 2>&1 &
pid=$!
echo "$pid" >/var/run/agent-security.pid
echo running >/var/lib/agent-security/state
echo running
EOF
cat > "$root_dir/opt/agent-security/bin/stop-managed.sh" <<'EOF'
#!/bin/sh
set +e
if [ -f /var/run/agent-security.pid ]; then
  pid="$(cat /var/run/agent-security.pid)"
  kill "$pid" >/dev/null 2>&1
  rm -f /var/run/agent-security.pid
fi
mkdir -p /var/lib/agent-security
echo stopped >/var/lib/agent-security/state
echo stopped
EOF
cat > "$root_dir/opt/agent-security/bin/health-check.sh" <<'EOF'
#!/bin/sh
set -eu
[ -f /var/run/agent-security.pid ]
pid="$(cat /var/run/agent-security.pid)"
kill -0 "$pid"
[ "$(cat /var/lib/agent-security/state)" = running ]
echo healthy
EOF
chmod +x "$root_dir/opt/agent-security/bin/start-managed.sh" "$root_dir/opt/agent-security/bin/stop-managed.sh" "$root_dir/opt/agent-security/bin/health-check.sh"
tar --numeric-owner --owner=0 --group=0 -C "$root_dir" -cf "${'${ASSET_DIR}'}/agent-security-rootfs.tar" .

mkdir -p "$agent_dir/bin"
cat > "$agent_dir/bin/start-agent-security.sh" <<'EOF'
#!/bin/sh
set -eu
mkdir -p /var/lib/agent-security
echo running > /var/lib/agent-security/state
trap 'echo stopped > /var/lib/agent-security/state; exit 0' TERM INT
while true; do sleep 30; done
EOF
chmod +x "$agent_dir/bin/start-agent-security.sh"
cat > "$agent_dir/manifest.json" <<EOF
{"name":"agent-security-agent","agentName":"OpenClaw","version":"${'${ASSET_VERSION}'}","entrypoint":"/opt/agent-security/current/bin/start-agent-security.sh","packageFormat":"agent-security-tar-pkg-v1"}
EOF
tar --numeric-owner --owner=0 --group=0 -C "$agent_dir" -cf "${'${ASSET_DIR}'}/openclaw-agent.pkg" .
`

await writeFile(buildScriptPath, shell.replace(/\r\n/g, '\n'), 'utf8')

if (bundledOpenClawPath) {
  try {
    await execFileAsync(
      'wsl.exe',
      [
        '-d',
        'Ubuntu',
        '--',
        'env',
        `ASSET_DIR=${wslAssetDir}`,
        `ASSET_VERSION=${version}`,
        'sh',
        wslBuildScriptPath,
      ],
      {
        env: process.env,
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
      },
    )
  } finally {
    await rm(buildScriptPath, { force: true })
  }
  await rm(agentPath, { force: true })
  await copyFileCompat(bundledOpenClawPath, agentPath)
} else {
  try {
    await execFileAsync(
      'wsl.exe',
      [
        '-d',
        'Ubuntu',
        '--',
        'env',
        `ASSET_DIR=${wslAssetDir}`,
        `ASSET_VERSION=${version}`,
        'sh',
        wslBuildScriptPath,
      ],
      {
        env: process.env,
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
      },
    )
  } finally {
    await rm(buildScriptPath, { force: true })
  }
}

const rootfsSource = await resolveUbuntuRootfsSource()

const [rootfsSha256, agentSha256, bootstrapSha256] = await Promise.all([
  sha256(rootfsPath),
  sha256(agentPath),
  sha256(bootstrapPath),
])

const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  source: rootfsSource,
  sourceCommit,
  agentName: 'OpenClaw',
  ubuntuVersion: '24.04-lts',
  nodeVersion: '24',
  openClawInstallSource: 'npm',
  openClawVersionPolicy: 'latest',
  packageFormat: 'agent-security-tar-pkg-v1',
  updatePolicy: 'mostly-bundled',
  artifacts: {
    rootfs: {
      path: 'bridge/assets/agent-security-rootfs.tar',
      sha256: rootfsSha256,
    },
    agentPackage: {
      path: 'bridge/assets/openclaw-agent.pkg',
      sha256: agentSha256,
    },
    bootstrap: {
      path: 'bridge/assets/openclaw-bootstrap.sh',
      sha256: bootstrapSha256,
    },
  },
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function resolveUbuntuRootfsSource() {
  if (providedUbuntuRootfsPath) {
    await copyFileCompat(providedUbuntuRootfsPath, rootfsPath)
    return 'ubuntu-24.04-lts-provided-rootfs'
  }

  if (shouldDownloadUbuntuRootfs) {
    await downloadFile(ubuntuRootfsUrl, rootfsPath)
    return `ubuntu-24.04-lts-official:${ubuntuRootfsUrl}`
  }

  return 'dev-busybox-placeholder'
}

async function downloadFile(url, target) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download Ubuntu rootfs from ${url}: ${response.status} ${response.statusText}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  await writeFile(target, bytes)
}

function windowsPathToWsl(path) {
  const normalized = path.replaceAll('\\', '/')
  const match = normalized.match(/^([A-Za-z]):\/(.*)$/)
  if (!match) {
    throw new Error(`Cannot convert Windows path to WSL path: ${path}`)
  }
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`
}

async function git(args) {
  const { stdout } = await execFileAsync('git', args)
  return stdout.trim()
}

async function copyFileCompat(source, target) {
  const content = await readFile(source)
  await writeFile(target, content)
}
