# HR Dashboard — Daily Auto-Sync
# Runs every morning at 8am via Windows Task Scheduler
# Calls the PeopleForce sync endpoint, with retry logic

$ErrorActionPreference = "Stop"
$BASE_URL = "http://localhost:3000"
$LOG_FILE = "$PSScriptRoot\sync-log.txt"

function Write-Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Add-Content -Path $LOG_FILE -Value $line
    Write-Host $line
}

Write-Log "=== Daily sync starting ==="

# Check if the dev server is responding
$serverRunning = $false
for ($i = 1; $i -le 5; $i++) {
    try {
        $ping = Invoke-WebRequest -Uri "$BASE_URL/api/sync" -Method GET -TimeoutSec 5 -UseBasicParsing
        $serverRunning = $true
        break
    } catch {
        Write-Log "Server not responding (attempt $i/5). Waiting 10s..."
        Start-Sleep -Seconds 10
    }
}

if (-not $serverRunning) {
    Write-Log "ERROR: Dashboard server is not running at $BASE_URL"
    Write-Log "Please start the server first: npm run dev"
    exit 1
}

# Trigger PeopleForce sync
try {
    Write-Log "Triggering PeopleForce sync..."
    $response = Invoke-RestMethod -Uri "$BASE_URL/api/sync?source=peopleforce" -Method POST -TimeoutSec 120
    if ($response.ok) {
        Write-Log "SUCCESS: PeopleForce sync completed"
    } else {
        Write-Log "WARNING: Sync returned ok=false: $($response | ConvertTo-Json -Compress)"
    }
} catch {
    Write-Log "ERROR during PeopleForce sync: $_"
}

Write-Log "=== Daily sync finished ==="
