# Requires PowerShell 5.1+
param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [string]$Output,
    [string]$ProfilesDir = (Join-Path $env:USERPROFILE 'mtg\decks\profiles')
)

$ErrorActionPreference = 'Stop'
$ARCHIDEKT_API = 'https://archidekt.com/api'
$DELAY_MS = 150
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Read-Utf8Text([string]$Path) {
    return [System.IO.File]::ReadAllText($Path, $Utf8NoBom)
}

function Repair-SuggestionsJsonFile([string]$Path) {
    $code = @"
import json, pathlib
path = pathlib.Path(r'''$Path''')
data = json.loads(path.read_text(encoding='utf-8'))
for deck in data.get('decks', []):
    suggestions = deck.get('suggestions')
    if suggestions is None:
        deck['suggestions'] = []
    elif isinstance(suggestions, dict):
        deck['suggestions'] = [suggestions]
    for suggestion in deck.get('suggestions', []):
        replaces = suggestion.get('replaces')
        if replaces is None:
            suggestion['replaces'] = []
        elif isinstance(replaces, dict):
            suggestion['replaces'] = [replaces]
path.write_text(json.dumps(data, indent=4, ensure_ascii=False) + '\n', encoding='utf-8')
"@
    & python -c $code
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to repair suggestions arrays in $Path"
    }
}

function Write-JsonFile([string]$Path, $Object, [int]$Depth = 20) {
    if ($Object.decks) {
        Normalize-DeckSuggestions $Object | Out-Null
    }
    $json = $Object | ConvertTo-Json -Depth $Depth
    $json = $json -replace '"suggestions":\s*null', '"suggestions": []'
    [System.IO.File]::WriteAllText($Path, $json + "`n", $Utf8NoBom)
}

function Repair-MojibakeText([string]$Text) {
    if ([string]::IsNullOrEmpty($Text)) { return $Text }
    $emDash = [string][char]0x2014
    $badDash = [string][char]0xE2 + [char]0x20AC + [char]0x201D
    if ($Text.Contains($badDash)) {
        $Text = $Text.Replace($badDash, $emDash)
    }
    $badDash2 = [string][char]0xE2 + [char]0x20AC + [char]0x201C
    if ($Text.Contains($badDash2)) {
        $Text = $Text.Replace($badDash2, $emDash)
    }
    if ($Text -match 'â|Ã') {
        $encoding1252 = [System.Text.Encoding]::GetEncoding(1252)
        $current = $Text
        for ($i = 0; $i -lt 3; $i++) {
            try {
                $bytes = $encoding1252.GetBytes($current)
                $next = [System.Text.Encoding]::UTF8.GetString($bytes)
                if ($next -eq $current) { break }
                $current = $next
            } catch {
                break
            }
        }
        $Text = $current
    }
    return $Text
}

function Repair-ObjectStrings($Object) {
    if ($null -eq $Object) { return $null }
    if ($Object -is [string]) {
        return Repair-MojibakeText $Object
    }
    if ($Object -is [System.Collections.IList]) {
        for ($i = 0; $i -lt $Object.Count; $i++) {
            $Object[$i] = Repair-ObjectStrings $Object[$i]
        }
        return $Object
    }
    if ($Object -is [pscustomobject]) {
        foreach ($prop in $Object.PSObject.Properties) {
            $prop.Value = Repair-ObjectStrings $prop.Value
        }
        return $Object
    }
    return $Object
}

function Normalize-SuggestionsProperty($Value) {
    if ($null -eq $Value) { return @() }
    if ($Value -is [System.Collections.IList]) { return @($Value) }
    return ,@($Value)
}

function Normalize-SuggestionReplaces($Suggestion) {
    if ($null -eq $Suggestion.replaces) {
        $Suggestion.replaces = @()
        return $Suggestion
    }
    if ($Suggestion.replaces -is [System.Collections.IList]) {
        $Suggestion.replaces = @($Suggestion.replaces)
    } else {
        $Suggestion.replaces = ,@($Suggestion.replaces)
    }
    return $Suggestion
}

function Normalize-DeckSuggestions($Data) {
    foreach ($deck in $Data.decks) {
        $deck.suggestions = Normalize-SuggestionsProperty $deck.suggestions
        foreach ($suggestion in $deck.suggestions) {
            Normalize-SuggestionReplaces $suggestion | Out-Null
        }
    }
    return $Data
}

function Read-JsonFile([string]$Path) {
    $data = (Read-Utf8Text $Path) | ConvertFrom-Json
    $data = Repair-ObjectStrings $data
    return Normalize-DeckSuggestions $data
}

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
    $text = Read-Utf8Text $path
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

function Build-CategorySettings($deck) {
    $map = @{}
    foreach ($cat in @($deck.categories)) {
        if (-not $cat -or -not $cat.name) { continue }
        $map[$cat.name] = @{
            includedInDeck = ($cat.includedInDeck -ne $false)
            includedInPrice = ($cat.includedInPrice -ne $false)
        }
    }
    return $map
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
        category_settings = (Build-CategorySettings $deck)
    }
}

$data = Read-JsonFile $InputPath
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

$outPath = if ($Output) { $Output } else { [System.IO.Path]::ChangeExtension($InputPath, '.enriched.json') }
Write-JsonFile $outPath $data 20
Repair-SuggestionsJsonFile $outPath
Write-Host "Wrote $outPath ($((Get-Item $outPath).Length) bytes)"
