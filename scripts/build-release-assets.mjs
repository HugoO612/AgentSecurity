import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const version = process.argv[2] ?? new Date().toISOString().slice(0, 10).replaceAll('-', '.')
const sourceCommit = await git(['rev-parse', '--short', 'HEAD']).catch(() => 'unknown')
const assetDir = resolve('bridge/assets')
const rootfsPath = resolve(assetDir, 'agent-security-rootfs.tar')
const agentPath = resolve(assetDir, 'agent-security-agent.pkg')
const manifestPath = resolve(assetDir, 'release-assets-manifest.json')

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
{"name":"agent-security-agent","version":"${'${ASSET_VERSION}'}","entrypoint":"/opt/agent-security/current/bin/start-agent-security.sh","packageFormat":"agent-security-tar-pkg-v1"}
EOF
tar --numeric-owner --owner=0 --group=0 -C "$agent_dir" -cf "${'${ASSET_DIR}'}/agent-security-agent.pkg" .
`

await writeFile(buildScriptPath, shell.replace(/\r\n/g, '\n'), 'utf8')

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

const [rootfsSha256, agentSha256] = await Promise.all([
  sha256(rootfsPath),
  sha256(agentPath),
])

const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  source: 'scripts/build-release-assets.mjs using WSL Ubuntu static busybox',
  sourceCommit,
  packageFormat: 'agent-security-tar-pkg-v1',
  updatePolicy: 'bundled-only',
  artifacts: {
    rootfs: {
      path: 'bridge/assets/agent-security-rootfs.tar',
      sha256: rootfsSha256,
    },
    agent: {
      path: 'bridge/assets/agent-security-agent.pkg',
      sha256: agentSha256,
    },
  },
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
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
