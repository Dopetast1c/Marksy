# Marksy on a Windows host with only Docker Desktop (docs/running.md): the same commands as marksy.sh, run in the
# folder that holds docker-compose.prod.yml and .env.production.
#   .\marksy.ps1 up | stop | pull | ps | logs [service] | status
#   .\marksy.ps1 backup | restore <file in BACKUP_DIR> [--without-demo] [--replace --yes]
#   .\marksy.ps1 sync enable|disable | check-network | connect | tunnel on|off
#   .\marksy.ps1 update status | history [n] | pause | resume | now [--to X.Y.Z]
#   .\marksy.ps1 init-env [--credentials-key-from <file>] [--tz <zone>] [--show-hook-secret]
param([Parameter(Position = 0)][string]$Command = 'help', [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @())
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$EnvFile = '.env.production'
function Setting([string]$Name) {
  if (-not (Test-Path $EnvFile)) { return '' }
  $line = Get-Content $EnvFile | Where-Object { $_ -match "^$Name=" } | Select-Object -Last 1
  if ($line) { return $line.Substring($Name.Length + 1) } else { return '' }
}
function Compose([string[]]$Arguments) {
  $files = @('-f', 'docker-compose.prod.yml')
  if (Setting 'MACVLAN_ADDRESS') { $files += @('-f', 'docker-compose.macvlan.yml') }
  & docker compose --env-file $EnvFile @files @Arguments
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
function NeedEnv {
  if (-not (Test-Path $EnvFile)) {
    Write-Error "No $EnvFile here: create it first with .\marksy.ps1 init-env (docs/running.md)"
    exit 2
  }
}

switch ($Command) {
  'init-env' {
    $channel = if ($env:UPDATE_CHANNEL) { $env:UPDATE_CHANNEL } elseif (Setting 'UPDATE_CHANNEL') { Setting 'UPDATE_CHANNEL' } else { '1' }
    & docker run --rm -v "${PWD}:/work" "ghcr.io/dopetast1c/marksy-server:$channel" init-env "/work/$EnvFile" @Rest
  }
  'up' { NeedEnv; Compose (@('up', '-d') + $Rest) }
  'stop' { NeedEnv; Compose (@('stop') + $Rest) }
  'pull' { NeedEnv; Compose (@('pull') + $Rest) }
  'ps' { NeedEnv; Compose @('ps') }
  'logs' { NeedEnv; Compose (@('logs', '--tail', '200', '-f') + $Rest) }
  'status' {
    NeedEnv
    Compose @('ps')
    Compose @('exec', 'server', 'node', '/app/dist/marksy.mjs', 'status')
    Compose @('exec', 'updater', 'marksy-updater', 'status')
  }
  'update' {
    NeedEnv
    $sub = if ($Rest.Count -gt 0) { $Rest[0] } else { 'status' }
    if ($sub -notin @('status', 'history', 'pause', 'resume', 'now')) { Write-Error 'update status|history [n]|pause|resume|now [--to X.Y.Z]'; exit 2 }
    Compose (@('exec', 'updater', 'marksy-updater') + $Rest)
  }
  'backup' { NeedEnv; Compose @('exec', 'server', 'node', '/app/dist/marksy.mjs', 'backup') }
  'restore' {
    NeedEnv
    if ($Rest.Count -lt 1) {
      Write-Error 'restore <file>: a path inside BACKUP_DIR, e.g. daily/marksy-2026-10-29T03-30-00Z-daily-1.0.0.dump'
      exit 2
    }
    $file = $Rest[0]
    $more = if ($Rest.Count -gt 1) { $Rest[1..($Rest.Count - 1)] } else { @() }
    # the updater too: no update may start while the database is replaced
    Compose @('stop', 'updater', 'server', 'backup')
    Compose (@('run', '--rm', '--no-deps', 'server', 'restore', "/backups/$file") + $more)
    Compose @('up', '-d')
  }
  'sync' { NeedEnv; Compose (@('exec', 'server', 'node', '/app/dist/marksy.mjs', 'sync') + $Rest) }
  'check-network' { NeedEnv; Compose @('exec', 'server', 'node', '/app/dist/marksy.mjs', 'check-network') }
  'seed' { NeedEnv; Compose (@('exec', 'server', 'node', '/app/dist/marksy.mjs', 'seed') + $Rest) }
  'connect' {
    NeedEnv
    Compose (@('run', '--rm', '--no-deps', '-e', 'DIARY_LOGIN', '-e', 'DIARY_PASSWORD', '-e', 'MARKSY_DEV_EMAIL', '-e', 'MARKSY_DEV_PASSWORD', 'server', 'connect') + $Rest)
  }
  'tunnel' {
    NeedEnv
    if ($Rest[0] -eq 'on') { & docker compose --env-file $EnvFile -f docker-compose.prod.yml --profile tunnel up -d cloudflared }
    elseif ($Rest[0] -eq 'off') { & docker compose --env-file $EnvFile -f docker-compose.prod.yml --profile tunnel stop cloudflared }
    else { Write-Error 'tunnel on|off'; exit 2 }
  }
  default { Get-Content $PSCommandPath | Select-Object -Skip 0 -First 7 }
}
