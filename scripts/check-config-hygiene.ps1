# 检查源码和示例配置里没有真实密钥，也没有写死的产品监听端口。
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$files = @()
foreach ($dir in @("backend\src", "frontend\src")) {
    $path = Join-Path $root $dir
    if (Test-Path $path) {
        $files += Get-ChildItem -Path $path -Recurse -File
    }
}
foreach ($name in @("compose.yaml", ".env.example")) {
    $path = Join-Path $root $name
    if (Test-Path $path) {
        $files += Get-Item $path
    }
}

$portPatterns = @(
    '(?i)listen\s+\d+',
    '(?i)--port[\s=]+\d+',
    '(?i)\bport[\s:=]+\d{2,5}\b',
    '(?i)0\.0\.0\.0:\d+',
    '(?i)localhost:\d+'
)
$failures = @()
foreach ($file in $files) {
    $relative = $file.FullName.Substring($root.Length + 1)
    $lines = Get-Content -Path $file.FullName
    $number = 0
    foreach ($line in $lines) {
        $number += 1
        foreach ($pattern in $portPatterns) {
            if ($line -match $pattern) {
                $failures += "$relative`:$number 写死了监听端口"
            }
        }
        if ($line -match 'sk-[A-Za-z0-9]{8,}' -or $line -match 'AKIA[0-9A-Z]{16}') {
            $failures += "$relative`:$number 含有疑似真实密钥"
        }
        if ($line -match '(?i)(api[_-]?key|password|secret)\s*[:=]\s*[''"](?<value>[^''"]+)[''"]') {
            $value = $Matches.value
            if ($value -and $value -notmatch '^\$\{[^}]+\}$' -and $value.Length -ge 8) {
                $failures += "$relative`:$number 含有非空密钥"
            }
        }
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Output $_ }
    exit 1
}
Write-Output "config hygiene ok"
exit 0
