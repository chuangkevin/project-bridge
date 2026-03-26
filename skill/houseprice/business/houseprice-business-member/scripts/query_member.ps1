# HousePrice Member API Query Script
# Usage:
#   By phone:  .\query_member.ps1 -Mode phone -Value 0900000000
#   By ID:     .\query_member.ps1 -Mode id -Value c5d2d44e-8d0d-4181-9ec4-e6d97a9069e6

param(
    [Parameter(Mandatory)][ValidateSet("phone","id")]
    [string]$Mode,
    [Parameter(Mandatory)]
    [string]$Value
)

$BaseUrl = "https://ws-member-s2.houseprice.tw/api/Member"

$Url = switch ($Mode) {
    "phone" { "$BaseUrl/ByPhone/$Value" }
    "id"    { "$BaseUrl/$Value" }
}

Write-Host ">>> GET $Url" -ForegroundColor Cyan

try {
    $Response = Invoke-RestMethod -Method Get -Uri $Url -Headers @{ Accept = "application/json" }
    $Response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
