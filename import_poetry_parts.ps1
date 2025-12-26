$ErrorActionPreference = "Stop"
$files = Get-ChildItem "data/poetry_part_*.ndjson" | Sort-Object Name
foreach ($f in $files) {
  Write-Host "Importing $($f.Name)..."
  & curl.exe -s -X POST "http://127.0.0.1:7700/indexes/poetry/documents" `
    -H "Content-Type: application/x-ndjson" `
    --data-binary "@$($f.FullName)"
}

