param([string[]]$Pages = @('today','work','coordination','team','insights','notifications'))
$browserCli = 'C:/Users/Admin/AppData/Roaming/npm/agent-browser.cmd'
$routes = @{ today=''; work='/projects'; coordination='/dependencies'; team='/teams'; insights='/reports'; notifications='/notifications'; schedule='/work-calendar'; registration='/projects/new' }
$OutputEncoding = [System.Text.UTF8Encoding]::new()
foreach ($pageName in $Pages) {
  & $browserCli --session ph-final open ('http://localhost:3002/project-head' + $routes[$pageName]) | Out-Null
  & $browserCli --session ph-final wait --load networkidle | Out-Null
  if ($pageName -eq 'insights') {
    & $browserCli --session ph-final find role button click --name 'Run report' | Out-Null
    & $browserCli --session ph-final wait --load networkidle | Out-Null
  }
  foreach ($size in @(@(1536,864),@(1440,900),@(1280,800),@(390,844))) {
    & $browserCli --session ph-final set viewport $size[0] $size[1] | Out-Null
    & $browserCli --session ph-final screenshot "docs/project-head-redesign/$pageName-$($size[0]).png" --full | Out-Null
    $script = @'
JSON.stringify({path:location.pathname,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,title:document.querySelector('h1')?.textContent,titleSize:document.querySelector('h1')?getComputedStyle(document.querySelector('h1')).fontSize:null,overflow:document.documentElement.scrollWidth>innerWidth,overlay:!!document.querySelector('[data-nextjs-dialog]'),alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent)})
'@
    $auditResult = $script | & $browserCli --session ph-final eval --stdin
    $auditResult | ConvertFrom-Json | Add-Content -LiteralPath 'docs/project-head-redesign/layout-audit.jsonl'
    Write-Output $auditResult
  }
}
