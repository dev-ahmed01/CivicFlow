param([ValidateSet('work','inspections','map','notifications','responsive')][string]$Flow = 'work')
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new()
$cli = 'C:/Users/Admin/AppData/Roaming/npm/agent-browser.cmd'
function Browser { & $cli --session engineer-correction @args; if ($LASTEXITCODE -ne 0) { throw "Browser command failed: $args" } }
function Evaluate([string]$code) {
  $raw = $code | & $cli --session engineer-correction eval --stdin
  if ($LASTEXITCODE -ne 0) { throw 'Browser evaluation failed' }
  return $raw | ConvertFrom-Json
}
function Audit([string]$name) {
  $result = Evaluate @'
JSON.stringify({url:location.pathname+location.search,selected:[...document.querySelectorAll('.engineer-stat-control[aria-pressed=true]')].map(e=>e.innerText),overflow:document.documentElement.scrollWidth>innerWidth,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.innerText),oldWorkTabs:!!document.querySelector('.engineer-my-work .engineer-work-tabs'),oldInspectionTabs:!!document.querySelector('.engineer-inspections .engineer-work-tabs'),oldInspectionFilters:!!document.querySelector('.engineer-inspection-toolbar'),mapExpanded:document.querySelector('.engineer-map-disclosure')?.getAttribute('aria-expanded'),mapCount:document.querySelector('.engineer-map-count')?.innerText,mapRows:document.querySelectorAll('#mapped-works > li').length,category:document.querySelector('.notification-filters .active')?.innerText,history:history.state?.cityConnectEngineerPrevious})
'@
  Add-Content -LiteralPath docs/engineer-ux-correction/audit.jsonl -Value (ConvertTo-Json @{name=$name;result=($result | ConvertFrom-Json)} -Compress -Depth 5)
  Write-Output "$name $result"
  $state = $result | ConvertFrom-Json
  if ($state.overflow -or $state.alerts.Count -or $state.oldWorkTabs -or $state.oldInspectionTabs -or $state.oldInspectionFilters) { throw "UI audit failed: $name" }
}
Browser set viewport 1440 900
if ($Flow -eq 'work') {
  Browser click "nav a[href='/engineer']"
  Browser wait '.engineer-today .engineer-stat-control'
  Browser click '.engineer-stat-control:nth-child(1)'
  Browser wait '.engineer-project-work-card'
  Audit 'Today Active Works'
  Browser click '.engineer-project-work-card h2 a'
  Browser wait '.detail-heading'
  Browser click '.back-link'
  Browser wait '.engineer-project-work-card'
  Audit 'Explicit Back to Active'
  Browser back
  Browser wait '.engineer-today'
  Audit 'Back to Today'
  Browser click '.engineer-stat-control:nth-child(2)'
  Browser wait '.engineer-project-work-card'
  Audit 'Needs Attention collection'
  Browser click '.engineer-project-work-card h2 a'
  Browser wait '.back-link'
  Browser back
  Browser wait '.engineer-project-work-card'
  Audit 'Assignment browser Back to Attention'
  Browser click '.engineer-project-work-card h2 a'
  Browser wait '.back-link'
  Browser click '.back-link'
  Browser wait '.engineer-project-work-card'
  Audit 'Assignment explicit Back to Attention'
  Browser back
  Browser wait '.engineer-today'
  Browser click '.engineer-stat-control:nth-child(3)'
  Browser wait '.engineer-dependencies-page'
  Audit 'Today Dependencies'
  Browser back
  Browser wait '.engineer-today'
  Browser click '.engineer-stat-control:nth-child(4)'
  Browser wait '.engineer-my-work'
  Audit 'Today Blocked'
  foreach ($index in 1..4) {
    Browser click ".engineer-work-summary .engineer-stat-control:nth-child($index)"
    Audit "Work lifecycle $index"
  }
  Browser screenshot docs/engineer-ux-correction/work-desktop.png
}
if ($Flow -eq 'inspections') {
  Browser click "nav a[href='/engineer/inspections']"
  Browser wait '.engineer-inspection-table'
  foreach ($index in 1..4) {
    Browser click ".engineer-inspection-summary .engineer-stat-control:nth-child($index)"
    Audit "Inspection lifecycle $index"
    Browser screenshot "docs/engineer-ux-correction/inspections-$index-desktop.png"
  }
  Browser click '.engineer-inspection-summary .engineer-stat-control:nth-child(1)'
  if ((Evaluate 'document.querySelectorAll(''.engineer-inspection-table article a'').length') -eq 0) { Write-Output 'Data limit: no Assigned inspections for detail-history verification.'; return }
  Browser click '.engineer-inspection-table article a'
  Browser wait '.back-link'
  Browser screenshot docs/engineer-ux-correction/inspection-detail.png
  Browser back
  Browser wait '.engineer-inspection-table'
  Audit 'Inspection browser Back to Assigned'
  Browser forward
  Browser wait '.back-link'
  Browser click '.back-link'
  Browser wait '.engineer-inspection-table'
  Audit 'Inspection explicit Back to Assigned'
  Browser reload
  Browser wait '.engineer-inspection-table'
  Audit 'Inspection refresh retains Assigned'
}
if ($Flow -eq 'map') {
  Browser click "nav a[href='/engineer/map']"
  Browser wait '.engineer-map-disclosure'
  Browser focus '.engineer-map-disclosure'
  Browser press Enter
  Browser wait '#mapped-works'
  Audit 'Map keyboard expand'
  Browser screenshot docs/engineer-ux-correction/map-expanded.png
  Browser click '#mapped-works li button'
  Browser wait '.work-detail-kicker'
  Audit 'Map selects real work'
  Browser snapshot -i
}
if ($Flow -eq 'notifications') {
  Browser click "nav a[href='/engineer/notifications']"
  Browser wait '.notification-list'
  Audit 'Notifications loaded'
  Browser screenshot docs/engineer-ux-correction/notifications-desktop.png
  Browser snapshot -i
}
if ($Flow -eq 'responsive') {
  foreach ($route in @('','/projects','/inspections','/map','/notifications')) {
    Browser set viewport 1440 900
    Browser open "http://localhost:3002/engineer$route"
    Browser wait '.portal-heading'
    $name = if ($route) { $route.TrimStart('/') } else { 'today' }
    Browser screenshot "docs/engineer-ux-correction/$name-1440.png"
    Audit "$name desktop"
    Browser set viewport 390 844
    Browser screenshot "docs/engineer-ux-correction/$name-390.png"
    Audit "$name mobile"
  }
}



