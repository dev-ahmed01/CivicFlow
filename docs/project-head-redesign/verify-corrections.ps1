param([switch]$TodayFixture)
$browserCli = 'C:/Users/Admin/AppData/Roaming/npm/agent-browser.cmd'
$OutputEncoding = [System.Text.UTF8Encoding]::new()
$auditPath = 'docs/project-head-redesign/correction-audit.jsonl'
if ($TodayFixture) {
  & $browserCli --session ph-correction open http://localhost:3002/project-head | Out-Null
  & $browserCli --session ph-correction wait '.ph-attention-card' | Out-Null
  # Browser-only response fixture. No API mutation, database changes, or authentication bypass.
  $fixture = @'
window.originalCorrectionFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await window.originalCorrectionFetch(...args);
  const url = String(args[0]);
  if (url.includes('/tickets?page=')) return new Response(JSON.stringify({tickets:[
    {id:'fixture-ticket-01',referenceNumber:'202608010',title:'Road Damage near 1815',state:'ROUTED_TO_AGENCY',ward:{name:'Jayanagar'},category:{name:'Road Damage'}},
    {id:'fixture-ticket-02',referenceNumber:'202608009',title:'Road Damage near 8',state:'INSPECTION_DUE',ward:{name:'BTM Layout'},category:{name:'Road Damage'}}
  ]}),{status:200,headers:{'Content-Type':'application/json'}});
  if (url.includes('/projects?page=')) {
    const data = await response.clone().json();
    const completion = data.projects.find(p=>p.title.includes('Complete pothole patching'));
    const coordination = data.projects.find(p=>p.title==='Planned resurfacing on Segment X');
    if (!completion || !coordination) throw Error('Required real work examples missing');
    return new Response(JSON.stringify({...data,projects:[{...completion,state:'COMPLETED'},{...coordination,conflictCount:1,roadConflictCount:0,coordinationCount:0}],pagination:{...data.pagination,totalPages:1}}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  return response;
};
window.dispatchEvent(new Event('civicos:portal-data-changed'));
'@
  $fixture | & $browserCli --session ph-correction eval --stdin | Out-Null
  & $browserCli --session ph-correction wait --text 'Road Damage near 1815' | Out-Null
  $pages = @('today-fixture')
} else { $pages = @('work','today') }
foreach ($pageName in $pages) {
  if (!$TodayFixture) {
    $suffix = if ($pageName -eq 'work') { '/projects' } else { '' }
    & $browserCli --session ph-correction open ('http://localhost:3002/project-head' + $suffix) | Out-Null
    $selector = if ($pageName -eq 'work') { '.ph-registry-row' } else { '.ph-attention-card' }
    & $browserCli --session ph-correction wait $selector | Out-Null
  }
  foreach ($size in @(@(1536,864),@(1440,900),@(1280,800),@(390,844))) {
    & $browserCli --session ph-correction set viewport $size[0] $size[1] | Out-Null
    & $browserCli --session ph-correction screenshot "docs/project-head-redesign/correction-$pageName-$($size[0]).png" | Out-Null
    $audit = @'
JSON.stringify((()=>{
const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
const tabs=document.querySelector('.ph-work-tabs');
const cards=[...document.querySelectorAll('.ph-attention-card')].map(card=>{
  const identity=box(card.querySelector('.ph-attention-identity')),status=box(card.querySelector('.cv-status-chip')),action=box(card.querySelector('.ph-attention-action'));
  const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
  return {text:card.innerText,identity,status,action,collision:overlap(identity,status)||overlap(identity,action)||overlap(status,action),horizontal:Math.abs(status.y+status.height/2-action.y-action.height/2)<2};
});
return {path:location.pathname,width:innerWidth,fixture:!!window.originalCorrectionFetch,overflow:document.documentElement.scrollWidth>innerWidth,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent),tabs:tabs?{overflowX:getComputedStyle(tabs).overflowX,overflowY:getComputedStyle(tabs).overflowY,clientHeight:tabs.clientHeight,scrollHeight:tabs.scrollHeight,items:[...tabs.children].map(e=>({text:e.textContent,...box(e)}))}:null,cards};
})())
'@
    $result = ($audit | & $browserCli --session ph-correction eval --stdin) | ConvertFrom-Json
    Add-Content -LiteralPath $auditPath -Value $result
    $parsed = $result | ConvertFrom-Json
    if ($parsed.overflow -or $parsed.alerts.Count -or ($parsed.cards | Where-Object collision)) { throw "Layout failed for $pageName at $($size[0])" }
    if ($parsed.tabs -and ($parsed.tabs.overflowY -ne 'visible' -or ($size[0] -gt 760 -and ($parsed.tabs.items.y | Select-Object -Unique).Count -ne 1))) { throw 'Lifecycle tab layout failed' }
    Write-Output "$pageName $($size[0])x$($size[1]): passed"
  }
}
if ($TodayFixture) {
  'window.fetch=window.originalCorrectionFetch; delete window.originalCorrectionFetch; window.dispatchEvent(new Event("civicos:portal-data-changed"));' | & $browserCli --session ph-correction eval --stdin | Out-Null
}
