# Serve the page and relay.php locally on http://127.0.0.1:8787 with PHP's built-in server.
# Keys are read from the user environment variables; nothing is written to disk.
param([int]$Port = 8787)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $here)
foreach ($k in 'GEMINI_API_KEY', 'GROQ_API_KEY') {
    if (-not [Environment]::GetEnvironmentVariable($k, 'Process')) {
        [Environment]::SetEnvironmentVariable($k, [Environment]::GetEnvironmentVariable($k, 'User'), 'Process')
    }
}
$env:CT_CONFIG = Join-Path $here 'config.php'
$php = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter php.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like '*PHP.PHP.8.4*' } | Select-Object -First 1
& $php.FullName -c (Join-Path $here 'php.ini') -S "127.0.0.1:$Port" -t $root
