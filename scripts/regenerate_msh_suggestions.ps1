# regenerate_msh_suggestions.ps1 - MSH deck suggestions schema 1.1
param(
    [string]$ProfilesDir = (Join-Path $env:USERPROFILE 'mtg\decks\profiles'),
    [string]$OldPath = (Join-Path $env:USERPROFILE 'mtg\decks\suggestions\MSH-2026-06-19.json'),
    [string]$CachePath = (Join-Path $env:USERPROFILE 'mtg\decks\suggestions\msh-cards-cache.json'),
    [string]$OutPath = (Join-Path $env:USERPROFILE 'mtg\decks\suggestions\MSH-2026-06-21.json'),
    [string]$GeneratedAt = '2026-06-21'
)

$ErrorActionPreference = 'Stop'
$MARVEL_SETS = @('msh','msc','mar')
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

$global:ValidationReport = [ordered]@{
    replaces_added = 0
    overlaps_resolved = 0
    blocked_filtered = 0
    dropped_no_cut = 0
    swap_regenerated = 0
}

function Parse-YamlScalar([string]$Text, [string]$FieldName) {
    foreach ($line in ($Text -split "`r?`n")) {
        if ($line -match ('^' + [regex]::Escape($FieldName) + ':\s*(.+?)\s*$')) {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
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
                $items += $Matches[1].Trim().Trim('"').Trim("'")
            }
        }
    }
    return ,@($items)
}

function Parse-YamlColors([string]$Text) {
    $line = ($Text -split "`r?`n") | Where-Object { $_ -match '^colors:' } | Select-Object -First 1
    if (-not $line) { return @() }
    if ($line -match '\[(.+)\]') {
        return @($Matches[1] -split ',' | ForEach-Object { $_.Trim() })
    }
    return @()
}

function Get-Profile([string]$Path) {
    $text = Read-Utf8Text $Path
    $deckId = Parse-YamlScalar $text 'deck_id'
    return [ordered]@{
        deck_id = $deckId
        name = Parse-YamlScalar $text 'name'
        format = Parse-YamlScalar $text 'format'
        archidekt_url = Parse-YamlScalar $text 'archidekt_url'
        colors = @(Parse-YamlColors $text)
        protected_cards = @(Parse-YamlList $text 'protected_cards')
        blocked_cards = @(Parse-YamlList $text 'blocked_cards')
        role_priority = (Get-RolePriorityMap $text)
    }
}

function Get-RolePriorityMap([string]$Text) {
    $map = @{}
    $currentId = $null
    foreach ($line in ($Text -split "`r?`n")) {
        if ($line -match '^\s*-\s+id:\s*(\S+)') { $currentId = $Matches[1] }
        if ($currentId -and $line -match '^\s+priority:\s*(\S+)') {
            $map[$currentId] = $Matches[1]
        }
    }
    return $map
}

function Get-DeckIdFromUrl([string]$Url) {
    if ($Url -match 'archidekt\.com/decks/(\d+)') { return [int]$Matches[1] }
    throw "Invalid Archidekt URL: $Url"
}

function Get-ArchidektDeck([int]$DeckId) {
    Start-Sleep -Milliseconds $DELAY_MS
    $headers = @{ 'User-Agent' = 'msh-regen/1.0'; 'Accept' = 'application/json' }
    return Invoke-RestMethod -Uri "$ARCHIDEKT_API/decks/$DeckId/" -Headers $headers
}

function Normalize-Name([string]$Name) { return ($Name -replace '\s+', ' ').Trim().ToLowerInvariant() }

function Build-MarvelLookup($cacheCards) {
    $byName = @{}
    $setRank = @{ msh = 0; msc = 1; mar = 2 }
    foreach ($c in $cacheCards) {
        $key = Normalize-Name $c.name
        if (-not $key) { continue }
        $sc = ($c.set -as [string]).ToLower()
        if ($MARVEL_SETS -notcontains $sc) { continue }
        if (-not $byName.ContainsKey($key)) {
            $byName[$key] = $c
        } else {
            $cur = ($byName[$key].set -as [string]).ToLower()
            if ($setRank[$sc] -lt $setRank[$cur]) { $byName[$key] = $c }
        }
    }
    return $byName
}

function ConvertTo-SuggestionCard($scryfallCard) {
    $sc = ($scryfallCard.set -as [string]).ToUpper()
    return [ordered]@{
        name = $scryfallCard.name
        set_code = $sc
        collector_number = [string]$scryfallCard.collector_number
        scryfall_id = $scryfallCard.id
        scryfall_uri = $scryfallCard.scryfall_uri
        mana_cost = $scryfallCard.mana_cost
        cmc = $scryfallCard.cmc
        type_line = $scryfallCard.type_line
    }
}

$script:ScryfallCache = @{}

function Get-ScryfallNamed([string]$Name) {
    $key = Normalize-Name $Name
    if ($script:ScryfallCache.ContainsKey($key)) { return $script:ScryfallCache[$key] }
    Start-Sleep -Milliseconds 100
    $encoded = [uri]::EscapeDataString($Name)
    $headers = @{ 'User-Agent' = 'msh-regen/1.1'; 'Accept' = 'application/json' }
    foreach ($q in @("exact=$encoded", "fuzzy=$encoded")) {
        try {
            $r = Invoke-RestMethod -Uri "https://api.scryfall.com/cards/named?$q" -Headers $headers
            $script:ScryfallCache[$key] = $r
            return $r
        } catch { }
    }
    return $null
}

function Get-DeckCardsInfo($rawDeck) {
    $cards = @()
    foreach ($entry in $rawDeck.cards) {
        if ($entry.deletedAt) { continue }
        $oracle = $entry.card.oracleCard
        $name = $oracle.name
        if (-not $name) { continue }
        $cats = @($entry.categories)
        $primary = if ($cats.Count -gt 0) { $cats[0] } else { $null }
        $edition = $entry.card.edition
        $setCode = $null
        if ($edition) {
            if ($edition.editioncode) { $setCode = $edition.editioncode }
            elseif ($edition.editionCode) { $setCode = $edition.editionCode }
        }
        $cards += [pscustomobject]@{
            name = $name
            quantity = if ($entry.quantity) { $entry.quantity } else { 1 }
            primary_category = $primary
            categories = $cats
            is_commander = ($cats -contains 'Commander') -or ($primary -eq 'Commander')
            type_line = if ($oracle.types) { ($oracle.types -join ' ') } else { '' }
            set_code = if ($setCode) { $setCode.ToUpper() } else { $null }
            collector_number = if ($null -ne $entry.card.collectorNumber) { [string]$entry.card.collectorNumber } else { $null }
            mana_cost = $oracle.manaCost
            cmc = $oracle.cmc
            scryfall_uri = $oracle.scryfallUri
        }
    }
    return $cards
}

function Test-BasicLandName([string]$Name, $deckCards) {
    $k = Normalize-Name $Name
    foreach ($c in $deckCards) {
        if ((Normalize-Name $c.name) -eq $k) {
            return ($c.type_line -match 'Basic Land')
        }
    }
    return ($Name -match '^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered (Plains|Island|Swamp|Mountain|Forest))$')
}

function Add-SwapQueueReconciliation($swapQueue) {
    $in = @($swapQueue.new_set_in)
    $out = @($swapQueue.new_set_out)
    $paired = [Math]::Min($in.Count, $out.Count)
    $unpairedIn = @()
    for ($i = $paired; $i -lt $in.Count; $i++) { $unpairedIn += $in[$i] }
    $unpairedOut = @()
    for ($i = $paired; $i -lt $out.Count; $i++) { $unpairedOut += $out[$i] }
    $notes = [System.Collections.Generic.List[string]]::new()
    foreach ($n in $unpairedIn) { $notes.Add("$n`: no Out paired — cut suggested from main deck") }
    foreach ($n in $unpairedOut) { $notes.Add("$n`: no In paired — Marvel add suggested") }
    return [ordered]@{
        new_set_in = $in
        new_set_out = $out
        metadata_flags = @($swapQueue.metadata_flags)
        in_count = $in.Count
        out_count = $out.Count
        unpaired_in = $unpairedIn
        unpaired_out = $unpairedOut
        reconciliation_notes = @($notes)
    }
}

function Get-QueueInCard([string]$InName, $deckCards, $marvelLookup) {
    $key = Normalize-Name $InName
    if ($marvelLookup.ContainsKey($key)) {
        return ConvertTo-SuggestionCard $marvelLookup[$key]
    }
    $deckCard = $deckCards | Where-Object {
        (Normalize-Name $_.name) -eq $key -and $_.primary_category -eq 'New Set In'
    } | Select-Object -First 1
    if ($deckCard -and $deckCard.set_code) {
        $sf = Get-ScryfallNamed $InName
        return [ordered]@{
            name = $deckCard.name
            set_code = $deckCard.set_code
            collector_number = $deckCard.collector_number
            scryfall_id = if ($sf) { $sf.id } else { $null }
            scryfall_uri = if ($sf) { $sf.scryfall_uri } elseif ($deckCard.scryfall_uri) { $deckCard.scryfall_uri } else { $null }
            mana_cost = if ($sf) { $sf.mana_cost } else { $deckCard.mana_cost }
            cmc = if ($sf) { $sf.cmc } else { $deckCard.cmc }
            type_line = if ($sf) { $sf.type_line } else { $deckCard.type_line }
        }
    }
    $sf = Get-ScryfallNamed $InName
    if ($sf) { return ConvertTo-SuggestionCard $sf }
    return [ordered]@{
        name = $InName
        set_code = 'UNK'
        collector_number = '0'
        scryfall_id = $null
        scryfall_uri = $null
        mana_cost = $null
        cmc = 0
        type_line = ''
    }
}

function Get-SwapQueue($deckCards) {
    $in = [System.Collections.Generic.List[string]]::new()
    $out = [System.Collections.Generic.List[string]]::new()
    $flags = [System.Collections.Generic.List[string]]::new()
    foreach ($c in $deckCards) {
        $p = $c.primary_category
        if ($p -eq 'New Set In') { $in.Add($c.name); continue }
        if ($p -eq 'New Set Out') { $out.Add($c.name); continue }
        $secIn = ($c.categories | Where-Object { $_ -eq 'New Set In' })
        $secOut = ($c.categories | Where-Object { $_ -eq 'New Set Out' })
        if ($secIn -or $secOut) {
            $flags.Add("$($c.name): secondary In/Out tag (primary=$p)")
        }
    }
    return @{
        new_set_in = @($in)
        new_set_out = @($out)
        metadata_flags = @($flags)
    }
}

function Test-MarvelName($name, $marvelLookup) {
    $key = Normalize-Name $name
    if (-not $marvelLookup.ContainsKey($key)) { return $false }
    $sc = ($marvelLookup[$key].set -as [string]).ToLower()
    return ($MARVEL_SETS -contains $sc)
}

function Get-ConfidenceRank([string]$c) {
    switch ($c) { 'high' { 0 } 'medium' { 1 } 'low' { 2 } default { 3 } }
}

function Get-SuggestionPriority($s, $rolePriority) {
    $tier = if ($s.priority_tier -eq 'swap') { 0 } else { 1 }
    $conf = Get-ConfidenceRank $s.confidence
    $roleP = 3
    if ($s.roles_matched -and $s.roles_matched.Count -gt 0) {
        $rid = $s.roles_matched[0]
        if ($rolePriority.ContainsKey($rid)) {
            switch ($rolePriority[$rid]) { 'high' { $roleP = 0 } 'medium' { $roleP = 1 } 'low' { $roleP = 2 } }
        }
    }
    return ('{0}|{1}|{2}|{3}' -f $tier, $conf, $roleP, $s.suggestion_id)
}

function Get-CutCandidates($deckCards, $protected, $reservedCuts) {
    $prot = @{}; foreach ($p in $protected) { $prot[(Normalize-Name $p)] = $true }
    $used = @{}; foreach ($r in $reservedCuts) { $used[(Normalize-Name $r)] = $true }
    $inDeck = @{}
    foreach ($c in $deckCards) { $inDeck[(Normalize-Name $c.name)] = $c }

    function Test-Available($name) {
        $k = Normalize-Name $name
        if ($prot.ContainsKey($k)) { return $false }
        if ($used.ContainsKey($k)) { return $false }
        if (-not $inDeck.ContainsKey($k)) { return $false }
        if ($inDeck[$k].is_commander) { return $false }
        return $true
    }

    $ordered = [System.Collections.Generic.List[string]]::new()
    foreach ($c in $deckCards) {
        if ($c.primary_category -eq 'New Set Out' -and (Test-Available $c.name)) { $ordered.Add($c.name) }
    }
    $maybeCats = @('Maybeboard','Probable Cut','Cut','Consider Cutting','Sideboard','Upgrade Slot')
    foreach ($cat in $maybeCats) {
        foreach ($c in $deckCards) {
            if ($c.primary_category -eq $cat -and (Test-Available $c.name)) { $ordered.Add($c.name) }
        }
    }
    foreach ($c in $deckCards) {
        if ($c.is_commander) { continue }
        if ($c.primary_category -eq 'New Set In') { continue }
        if ($c.type_line -match 'Basic Land') { continue }
        if (Test-Available $c.name) { $ordered.Add($c.name) }
    }
    # dedupe preserve order
    $seen = @{}; $result = @()
    foreach ($n in $ordered) {
        $k = Normalize-Name $n
        if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; $result += $n }
    }
    return $result
}

function Set-SuggestionProperty($s, [string]$Name, $Value) {
    if ($s -is [System.Collections.IDictionary]) {
        $s[$Name] = $Value
    } else {
        $s | Add-Member -NotePropertyName $Name -NotePropertyValue $Value -Force
    }
}

function Normalize-SuggestionArrays($s) {
    foreach ($field in @('roles_matched', 'tags')) {
        $val = if ($s -is [System.Collections.IDictionary]) { $s[$field] } else { $s.$field }
        if ($null -eq $val) {
            Set-SuggestionProperty $s $field @('synergy')
        } elseif ($val -is [string]) {
            Set-SuggestionProperty $s $field @($val)
        } else {
            Set-SuggestionProperty $s $field @($val)
        }
    }
}

function Ensure-Replaces($suggestions, $deckCards, $swapQueue, $protected) {
    $reserved = @()
    foreach ($s in $suggestions) {
        if ($s.action -eq 'sideboard') { continue }
        if ($s.replaces -and @($s.replaces).Count -gt 0) {
            foreach ($r in $s.replaces) { if ($r.name) { $reserved += $r.name } }
        }
    }
    foreach ($s in $suggestions) {
        if ($s.action -eq 'sideboard') { continue }
        $has = ($s.replaces -and @($s.replaces).Count -gt 0 -and $s.replaces[0].name)
        if ($has) { continue }
        # swap tier should already have replaces
        $candidates = Get-CutCandidates $deckCards $protected $reserved
        if ($s.fills_swap_slot -and $swapQueue.new_set_out) {
            $pairIdx = [array]::IndexOf($swapQueue.new_set_in, $s.fills_swap_slot)
            if ($pairIdx -ge 0 -and $pairIdx -lt $swapQueue.new_set_out.Count) {
                $outName = $swapQueue.new_set_out[$pairIdx]
                if ($outName -and (Get-CutCandidates $deckCards $protected ($reserved + @($outName)) | Where-Object { Normalize-Name $_ -eq Normalize-Name $outName })) {
                    Set-SuggestionProperty $s 'replaces' @([ordered]@{ name = $outName; quantity = 1 })
                    $reserved += $outName
                    $global:ValidationReport.replaces_added++
                    continue
                }
            }
        }
        $pick = $candidates | Select-Object -First 1
        if ($pick) {
            Set-SuggestionProperty $s 'replaces' @([ordered]@{ name = $pick; quantity = 1 })
            $reserved += $pick
            $global:ValidationReport.replaces_added++
        }
    }
}

function Resolve-Overlaps($suggestions, $deckCards, $swapQueue, $protected, $rolePriority) {
    $sorted = $suggestions | Sort-Object { Get-SuggestionPriority $_ $rolePriority }
    $kept = [System.Collections.Generic.List[object]]::new()
    $usedCuts = @{}

    foreach ($s in $sorted) {
        if ($s.action -eq 'sideboard') { $kept.Add($s); continue }
        $cutName = $null
        if ($s.replaces -and $s.replaces.Count -gt 0) { $cutName = $s.replaces[0].name }
        $cutKey = if ($cutName) { Normalize-Name $cutName } else { $null }

        if ($cutKey -and $usedCuts.ContainsKey($cutKey) -and -not (Test-BasicLandName $cutName $deckCards)) {
            $candidates = Get-CutCandidates $deckCards $protected ($usedCuts.Keys + @($usedCuts.Values))
            $alt = $candidates | Where-Object { -not $usedCuts.ContainsKey((Normalize-Name $_)) } | Select-Object -First 1
            if ($alt) {
                Set-SuggestionProperty $s 'replaces' @([ordered]@{ name = $alt; quantity = 1 })
                $cutKey = Normalize-Name $alt
                $global:ValidationReport.overlaps_resolved++
            } else {
                $global:ValidationReport.dropped_no_cut++
                continue
            }
        }
        if (-not $cutKey) {
            $global:ValidationReport.dropped_no_cut++
            continue
        }
        $protHit = $false
        foreach ($p in $protected) { if ((Normalize-Name $p) -eq $cutKey) { $protHit = $true } }
        if ($protHit) { $global:ValidationReport.dropped_no_cut++; continue }
        $usedCuts[$cutKey] = $s.replaces[0].name
        $kept.Add($s)
    }
    return @($kept)
}

function Build-SwapSuggestions($deckId, $swapQueue, $marvelLookup, $deckCards, $oldSwapBySlot) {
    $result = @()
    for ($i = 0; $i -lt $swapQueue.new_set_in.Count; $i++) {
        $inName = $swapQueue.new_set_in[$i]
        $outName = if ($i -lt $swapQueue.new_set_out.Count) { $swapQueue.new_set_out[$i] } else { $null }
        $cardObj = Get-QueueInCard $inName $deckCards $marvelLookup
        $oldMatch = $oldSwapBySlot[$inName]
        $rep = @()
        if ($outName) { $rep = @([ordered]@{ name = $outName; quantity = 1 }) }
        $rationale = if ($outName) {
            "Queued add — paired with $outName cut."
        } else {
            "Queued add — no Out paired; cut suggested from main deck."
        }
        $s = [ordered]@{
            action = 'replace'
            card = $cardObj
            quantity = 1
            roles_matched = if ($oldMatch -and $oldMatch.roles_matched) { @($oldMatch.roles_matched) } else { @('synergy') }
            confidence = if ($oldMatch -and $oldMatch.confidence) { $oldMatch.confidence } else { 'high' }
            rationale = if ($oldMatch -and $oldMatch.rationale -and $outName) { $oldMatch.rationale } else { $rationale }
            tags = if ($oldMatch -and $oldMatch.tags) { @($oldMatch.tags) } else { @('swap') }
            replaces = $rep
            fills_swap_slot = $inName
            priority_tier = 'swap'
            swap_source = 'queue_in'
        }
        $result += $s
        $global:ValidationReport.swap_regenerated++
    }
    return $result
}

function Build-QueueOutFillSuggestions($swapQueue, $marvelLookup, $oldDeck, $usedIncoming) {
    $result = @()
    $inCount = $swapQueue.new_set_in.Count
    for ($i = $inCount; $i -lt $swapQueue.new_set_out.Count; $i++) {
        $outName = $swapQueue.new_set_out[$i]
        $pick = $null
        if ($oldDeck -and $oldDeck.suggestions) {
            $sorted = $oldDeck.suggestions | Sort-Object { Get-ConfidenceRank $_.confidence }
            foreach ($os in $sorted) {
                if ($os.priority_tier -eq 'swap') { continue }
                $inKey = Normalize-Name $os.card.name
                if ($usedIncoming.ContainsKey($inKey)) { continue }
                if (Test-MarvelName $os.card.name $marvelLookup) {
                    $pick = $os
                    break
                }
            }
        }
        if (-not $pick) { continue }
        $usedIncoming[(Normalize-Name $pick.card.name)] = $true
        $key = Normalize-Name $pick.card.name
        $cardObj = ConvertTo-SuggestionCard $marvelLookup[$key]
        $s = [ordered]@{
            action = 'replace'
            card = $cardObj
            quantity = 1
            roles_matched = if ($pick.roles_matched) { @($pick.roles_matched) } else { @('synergy') }
            confidence = if ($pick.confidence) { $pick.confidence } else { 'medium' }
            rationale = "Unpaired Out slot — suggested Marvel add for $outName."
            tags = if ($pick.tags) { @($pick.tags) } else { @('marvel') }
            replaces = @([ordered]@{ name = $outName; quantity = 1 })
            priority_tier = 'swap'
            swap_source = 'queue_out_fill'
        }
        $result += $s
        $global:ValidationReport.swap_regenerated++
    }
    return $result
}

function Sort-Suggestions($suggestions, $rolePriority) {
    return $suggestions | Sort-Object {
        $tier = if ($_.priority_tier -eq 'swap') { 0 } else { 1 }
        $conf = Get-ConfidenceRank $_.confidence
        $roleP = 3
        if ($_.roles_matched -and $_.roles_matched.Count -gt 0) {
            $rid = $_.roles_matched[0]
            if ($rolePriority.ContainsKey($rid)) {
                switch ($rolePriority[$rid]) { 'high' { $roleP = 0 } 'medium' { $roleP = 1 } 'low' { $roleP = 2 } }
            }
        }
        [string]::Format('{0}-{1}-{2}-{3}', $tier, $conf, $roleP, $_.suggestion_id)
    }
}

function ReId-Suggestions($deckId, $suggestions) {
    $i = 1
    foreach ($s in $suggestions) {
        $s.suggestion_id = '{0}-{1:D3}' -f $deckId, $i
        $i++
    }
}

# --- main ---
$cache = Read-JsonFile $CachePath
$marvelLookup = Build-MarvelLookup $cache
$old = Read-JsonFile $OldPath
$oldById = @{}
foreach ($d in $old.decks) { $oldById[$d.deck_id] = $d }

$profileFiles = Get-ChildItem $ProfilesDir -Filter '*.yaml' | Where-Object { $_.BaseName -ne 'README' }
$decksOut = [System.Collections.Generic.List[object]]::new()
$swapChanges = @()
$perDeckCounts = @{}

foreach ($pf in ($profileFiles | Sort-Object Name)) {
    $profile = Get-Profile $pf.FullName
    $deckId = $profile.deck_id
    Write-Host "Processing $($profile.name) ($deckId)..."
    $aid = Get-DeckIdFromUrl $profile.archidekt_url
    $raw = Get-ArchidektDeck $aid
    $deckCards = Get-DeckCardsInfo $raw
    $swapQueue = Add-SwapQueueReconciliation (Get-SwapQueue $deckCards)

    $oldDeck = $oldById[$deckId]
    if ($oldDeck -and $oldDeck.analysis -and $oldDeck.analysis.swap_queue) {
        $oq = $oldDeck.analysis.swap_queue
        $sig = ($swapQueue.new_set_in -join '|') + '##' + ($swapQueue.new_set_out -join '|')
        $osig = ($oq.new_set_in -join '|') + '##' + ($oq.new_set_out -join '|')
        if ($sig -ne $osig) {
            $swapChanges += [ordered]@{
                deck_id = $deckId
                old_in = @($oq.new_set_in)
                new_in = @($swapQueue.new_set_in)
                old_out = @($oq.new_set_out)
                new_out = @($swapQueue.new_set_out)
            }
        }
    }

    $analysis = if ($oldDeck -and $oldDeck.analysis) {
        $a = [ordered]@{
            inferred_themes = @($oldDeck.analysis.inferred_themes)
            curve_summary = $oldDeck.analysis.curve_summary
            role_coverage = $oldDeck.analysis.role_coverage
        }
        if ($oldDeck.analysis.constraint_summary) { $a.constraint_summary = $oldDeck.analysis.constraint_summary }
        $a.swap_queue = $swapQueue
        $a
    } else {
        [ordered]@{
            inferred_themes = @()
            curve_summary = @{ '1-2' = 0; '3-4' = 0; '5+' = 0 }
            role_coverage = @{}
            swap_queue = $swapQueue
        }
    }

    $oldSwapBySlot = @{}
    if ($oldDeck -and $oldDeck.suggestions) {
        foreach ($os in $oldDeck.suggestions) {
            if ($os.priority_tier -eq 'swap' -and $os.fills_swap_slot) {
                $oldSwapBySlot[$os.fills_swap_slot] = $os
            }
        }
    }

    $suggestions = [System.Collections.Generic.List[object]]::new()
    foreach ($sw in (Build-SwapSuggestions $deckId $swapQueue $marvelLookup $deckCards $oldSwapBySlot)) {
        $suggestions.Add($sw)
    }

    $blocked = @{}; foreach ($b in $profile.blocked_cards) { $blocked[(Normalize-Name $b)] = $true }
    $swapIncoming = @{}
    foreach ($sw in $suggestions) { $swapIncoming[(Normalize-Name $sw.card.name)] = $true }
    foreach ($sw in (Build-QueueOutFillSuggestions $swapQueue $marvelLookup $oldDeck $swapIncoming)) {
        $suggestions.Add($sw)
    }

    if ($oldDeck -and $oldDeck.suggestions) {
        foreach ($os in $oldDeck.suggestions) {
            if ($os.priority_tier -eq 'swap') { continue }
            $inKey = Normalize-Name $os.card.name
            if ($blocked.ContainsKey($inKey)) { $global:ValidationReport.blocked_filtered++; continue }
            if ($swapIncoming.ContainsKey($inKey)) { continue }
            # clone as PSCustomObject deep enough
            $copy = $os | ConvertTo-Json -Depth 12 | ConvertFrom-Json
            if (-not $copy.tags -or @($copy.tags).Count -eq 0) { $copy.tags = @('marvel') }
            if (-not $copy.roles_matched -or @($copy.roles_matched).Count -eq 0) { $copy.roles_matched = @('synergy') }
            if (-not $copy.swap_source) { $copy | Add-Member -NotePropertyName swap_source -NotePropertyValue 'analysis' -Force }
            $suggestions.Add($copy)
        }
    }

    $list = @($suggestions)
    Ensure-Replaces $list $deckCards $swapQueue $profile.protected_cards
    $list = Resolve-Overlaps $list $deckCards $swapQueue $profile.protected_cards $profile.role_priority
    $list = Sort-Suggestions $list $profile.role_priority
    foreach ($s in $list) { Normalize-SuggestionArrays $s }
    ReId-Suggestions $deckId $list

    $perDeckCounts[$deckId] = $list.Count

    $decksOut.Add([ordered]@{
        deck_id = $deckId
        deck_name = $profile.name
        archidekt_url = $profile.archidekt_url
        format = if ($profile.format) { $profile.format } else { 'commander' }
        analysis = $analysis
        suggestions = @($list)
    })
}

$meta = $old.meta | ConvertTo-Json -Depth 6 | ConvertFrom-Json
$meta.generated_at = $GeneratedAt

$out = [ordered]@{
    meta = $meta
    decks = @($decksOut)
}

Write-JsonFile $OutPath $out 25
Repair-SuggestionsJsonFile $OutPath

$reportPath = [System.IO.Path]::ChangeExtension($OutPath, '.report.json')
Write-JsonFile $reportPath @{
    per_deck_counts = $perDeckCounts
    swap_queue_changes = $swapChanges
    validation = $global:ValidationReport
} 8

Write-Host "Wrote $OutPath ($((Get-Item $OutPath).Length) bytes)"
Write-Host "Report: $reportPath"
