param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [string[]]$ExpectedText = @(),
  [int]$TimeoutSeconds = 75
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Get-PrinterJobs {
  try {
    @(Get-PrintJob -PrinterName $PrinterName -ErrorAction Stop | ForEach-Object {
      [pscustomobject]@{ Id = $_.ID; JobStatus = [string]$_.JobStatus; SubmittedTime = $_.SubmittedTime; DocumentName = $_.DocumentName; Size = $_.Size }
    })
  } catch { @() }
}
function Find-Element([System.Windows.Automation.AutomationElement]$Root, [System.Windows.Automation.ControlType]$ControlType, [string]$NamePattern) {
  $condition = New-Object System.Windows.Automation.AndCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty.CreateCondition($ControlType),
    [System.Windows.Automation.AutomationElement]::NameProperty.CreateCondition($NamePattern, [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase)
  )
  $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendant, $condition)
}
function Find-FirstByType([System.Windows.Automation.AutomationElement]$Root, [System.Windows.Automation.ControlType]$ControlType) {
  $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendant, [System.Windows.Automation.AutomationElement]::ControlTypeProperty.CreateCondition($ControlType))
}
function Invoke-Element($Element) {
  if (-not $Element) { return $false }
  try { $pattern = $Element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern); $pattern.Invoke(); return $true } catch { return $false }
}
function Set-Text($Element, [string]$Value) {
  try { $pattern = $Element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $pattern.SetValue($Value); return $true } catch { return $false }
}

$beforeJobs = @(Get-PrinterJobs)
$root = [System.Windows.Automation.AutomationElement]::RootElement
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$dialog = $null
while ((Get-Date) -lt $deadline -and -not $dialog) {
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($window in $windows) {
    $name = [string]$window.Current.Name
    if ($name -match 'Print|طباعة|Drucken|Imprimir') { $dialog = $window; break }
  }
  if (-not $dialog) { Start-Sleep -Milliseconds 250 }
}
if (-not $dialog) {
  [pscustomobject]@{ status = 'NOT_TESTABLE'; detail = 'Native Windows Print Dialog UI was not exposed to UI Automation in the GitHub Actions session.'; printerName = $PrinterName; beforeJobs = $beforeJobs } | ConvertTo-Json -Depth 8 -Compress
  exit 0
}

$printerCombo = Find-FirstByType $dialog ([System.Windows.Automation.ControlType]::ComboBox)
$selectedPrinter = $false
if ($printerCombo) {
  try {
    $items = $printerCombo.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($item in $items) {
      if ([string]$item.Current.Name -eq $PrinterName) {
        $selection = $printerCombo.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern)
        $selection.Select($item)
        $selectedPrinter = $true
        break
      }
    }
  } catch { }
}
if (-not $selectedPrinter) {
  # Some Windows print dialogs expose the printer as a list item rather than a combo box.
  $item = Find-Element $dialog ([System.Windows.Automation.ControlType]::ListItem) $PrinterName
  if ($item) { $selectedPrinter = Invoke-Element $item }
}

$printButton = $null
foreach ($name in @('Print', 'طباعة', 'Drucken', 'Imprimir')) {
  $printButton = Find-Element $dialog ([System.Windows.Automation.ControlType]::Button) $name
  if ($printButton) { break }
}
$printButtonClicked = Invoke-Element $printButton
if (-not $printButtonClicked) {
  [pscustomobject]@{ status = 'NOT_TESTABLE'; detail = 'Windows Print Dialog was found but its Print button was not exposed to UI Automation.'; printerName = $PrinterName; dialogName = $dialog.Current.Name; selectedPrinter = $selectedPrinter; beforeJobs = $beforeJobs } | ConvertTo-Json -Depth 8 -Compress
  exit 0
}

# Microsoft Print to PDF asks for an output path after the print command.
$saveDeadline = (Get-Date).AddSeconds(15)
$saveDialog = $null
while ((Get-Date) -lt $saveDeadline -and -not $saveDialog) {
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($window in $windows) {
    if ([string]$window.Current.Name -match 'Save Print Output As|حفظ مخرجات الطباعة|Save As') { $saveDialog = $window; break }
  }
  if (-not $saveDialog) { Start-Sleep -Milliseconds 250 }
}
if ($saveDialog) {
  $edit = Find-FirstByType $saveDialog ([System.Windows.Automation.ControlType]::Edit)
  $set = Set-Text $edit $OutputPath
  $saveButton = $null
  foreach ($name in @('Save', 'حفظ', 'Speichern')) {
    $saveButton = Find-Element $saveDialog ([System.Windows.Automation.ControlType]::Button) $name
    if ($saveButton) { break }
  }
  $saved = Invoke-Element $saveButton
  if (-not $saved -and $set) {
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.SendKeys('{ENTER}')
  }
}

$jobSeen = $false
$jobSnapshots = @()
$completeDeadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $completeDeadline) {
  $jobs = @(Get-PrinterJobs)
  $jobSnapshots += @($jobs)
  if (@($jobs | Where-Object { $_.Id -notin @($beforeJobs | ForEach-Object Id) }).Count -gt 0) { $jobSeen = $true }
  if (Test-Path -LiteralPath $OutputPath) { break }
  Start-Sleep -Milliseconds 500
}
$outputExists = Test-Path -LiteralPath $OutputPath
$outputBytes = if ($outputExists) { (Get-Item -LiteralPath $OutputPath).Length } else { 0 }
$afterJobs = @(Get-PrinterJobs)
$pdfInfoAvailable = $false
$pageCount = $null
$pageSize = $null
$pageSizePass = $false
$textToolAvailable = $false
$expectedTextPresent = $false
$textDetail = 'No PDF text extraction tool was available on the runner.'
if ($outputExists -and (Get-Command pdfinfo.exe -ErrorAction SilentlyContinue)) {
  $pdfInfoAvailable = $true
  $info = & pdfinfo.exe $OutputPath 2>$null | Out-String
  $pageMatch = [regex]::Match($info, '(?m)^Pages:\s+(\d+)')
  $sizeMatch = [regex]::Match($info, '(?m)^Page size:\s+([0-9.]+) x ([0-9.]+) pts')
  if ($pageMatch.Success) { $pageCount = [int]$pageMatch.Groups[1].Value }
  if ($sizeMatch.Success) {
    $pageSize = "$($sizeMatch.Groups[1].Value) x $($sizeMatch.Groups[2].Value) pt"
    $widthMm = [double]$sizeMatch.Groups[1].Value * 25.4 / 72
    $heightMm = [double]$sizeMatch.Groups[2].Value * 25.4 / 72
    $pageSizePass = [Math]::Abs($widthMm - 150) -lt 1.5 -and [Math]::Abs($heightMm - 210) -lt 1.5
    $pageSize = "$pageSize ($([Math]::Round($widthMm, 2)) x $([Math]::Round($heightMm, 2)) mm)"
  }
}
if ($outputExists -and (Get-Command pdftotext.exe -ErrorAction SilentlyContinue)) {
  $textToolAvailable = $true
  $textPath = "$OutputPath.txt"
  & pdftotext.exe -layout $OutputPath $textPath 2>$null
  $text = if (Test-Path $textPath) { Get-Content -Raw $textPath } else { '' }
  $missing = @($ExpectedText | Where-Object { $text -notmatch [regex]::Escape($_) })
  $expectedTextPresent = $missing.Count -eq 0
  $textDetail = if ($expectedTextPresent) { "All expected text found: $($ExpectedText -join ', ')" } else { "Missing expected text: $($missing -join ', ')" }
}
$newJobIds = @($jobSnapshots | ForEach-Object { $_ } | Where-Object { $_.Id -notin @($beforeJobs | ForEach-Object Id) } | Select-Object -ExpandProperty Id -Unique)
$status = if ($outputExists -and $outputBytes -gt 0) { 'PASS' } else { 'FAIL' }
[pscustomobject]@{
  status = $status
  printerName = $PrinterName
  dialogName = $dialog.Current.Name
  selectedPrinter = $selectedPrinter
  printButtonClicked = $printButtonClicked
  outputPath = $OutputPath
  outputFileExists = $outputExists
  outputFileBytes = $outputBytes
  printJobSeen = $jobSeen
  jobIds = $newJobIds
  pdfInfoAvailable = $pdfInfoAvailable
  pageCount = $pageCount
  pageSize = $pageSize
  pageSizePass = $pageSizePass
  textToolAvailable = $textToolAvailable
  expectedTextPresent = $expectedTextPresent
  textDetail = $textDetail
  beforeJobs = $beforeJobs
  jobSnapshots = $jobSnapshots
  afterJobs = $afterJobs
  completedAt = (Get-Date).ToString('o')
} | ConvertTo-Json -Depth 10 -Compress
if ($status -ne 'PASS') { exit 1 }
