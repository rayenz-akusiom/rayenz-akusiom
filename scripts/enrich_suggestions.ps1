# Requires PowerShell 5.1+
param(
    [Parameter(Mandatory = $true)][string]$Input,
    [string]$Output,
    [string]$ProfilesDir = (Join-Path $env:USERPROFILE 'mtg\decks\profiles')
)

$ErrorActionPreference = 'Stop'
$ARCHIDEKT_API = 'https://archidekt.com/api'
$DELAY_MS = 150

function Parse-YamlList([string]$Text, [string]$FieldName) {
    $items = @()
    $inSection = $false
    foreach ($line in ($Text -split "`r?`n")) {
        if ($line -match '^[^\s#]' -and $line -notmatch '^-') {
            $inSection = ($line.Trim() -eq ($FieldName + ':'))
            continue
        }
        if ($inSection) {
            if ($line -match '^[^\s#-]') { break }
            if ($line -match '^\s*-\s+(.+?)\s*$') {
                $name = $Matches[1].Trim().Trim('"').Trim("'")
                $items += $name
            }
        }
    }
    return ,$items
}

function Get-ProfilePreferences([string]$DeckId, [string]$Dir) {
    $path = Join-Path $Dir ($DeckId + '.yaml')
    if (-not (Test-Path $path)) { return $null }
    $text = Get-Content $path -Raw
    return [ordered]@{
        protected_cards = @(Parse-YamlList $text 'protected_cards')
        blocked_cards = @(Parse-YamlList $text 'blocked_cards')
    }
}

function Get-DeckIdFromUrl([string]$Url) {
    if ($Url -match 'archidekt\.com/decks/(\d+)') { return [int]$Matches[1] }
    throw "Invalid Archidekt URL: $Url"
}

function Get-ArchidektDeck([int]$DeckId) {
    Start-Sleep -Milliseconds $DELAY_MS
    $headers = @{ 'User-Agent' = 'rayenz-hub-enrich/1.0'; 'Accept' = 'application/json' }
    return Invoke-RestMethod -Uri "$ARCHIDEKT_API/decks/$DeckId/" -Headers $headers
}

function Build-Snapshot($deck) {
    $cards = @()
    foreach ($entry in $deck.cards) {
        if ($entry.deletedAt) { continue }
        $cats = @($entry.categories)
        $primary = if ($cats.Count -gt 0) { $cats[0] } else { $null }
        $oracle = $entry.card.oracleCard
        $name = $oracle.name
        if (-not $name) { continue }
        $edition = $entry.card.edition
        $setCode = $edition.editioncode
        if (-not $setCode) { $setCode = $edition.editionCode }
        $cards += [ordered]@{
            name = $name
            quantity = if ($entry.quantity) { $entry.quantity } else { 1 }
            set_code = if ($setCode) { $setCode.ToLower() } else { $null }
            collector_number = if ($null -ne $entry.card.collectorNumber) { [string]$entry.card.collectorNumber } else { $null }
            primary_category = $primary
            categories = $cats
            archidekt_uid = $entry.uid
        }
    }
    return @{
        fetched_at = (Get-Date -Format 'yyyy-MM-dd')
        cards = $cards
    }
}

$data = Get-Content $Input -Raw | ConvertFrom-Json
foreach ($deckEntry in $data.decks) {
    $deckId = Get-DeckIdFromUrl $deckEntry.archidekt_url
    Write-Host "Fetching $($deckEntry.deck_name) ($deckId)..."
    $raw = Get-ArchidektDeck $deckId
    $deckEntry | Add-Member -NotePropertyName deck_snapshot -NotePropertyValue (Build-Snapshot $raw) -Force
    $prefs = Get-ProfilePreferences $deckEntry.deck_id $ProfilesDir
    if ($prefs) {
        $deckEntry | Add-Member -NotePropertyName profile_preferences -NotePropertyValue $prefs -Force
    }
}

$outPath = if ($Output) { $Output } else { [System.IO.Path]::ChangeExtension($Input, '.enriched.json') }
$json = $data | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($outPath, $json + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote $outPath ($((Get-Item $outPath).Length) bytes)"
