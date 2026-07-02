# =====================================================================
#  MonsterDay - Dashboard data engine
#  Baixa 2 planilhas Google (CSV export), cruza leads x queries do Meta,
#  calcula o Leadscore (A/B/C/D) e escreve data.js (window.MDAY) lido
#  pela pagina estatica (index.html). Roda local (PS 5.1) e no Actions.
#  Somente leitura - NAO altera nenhuma planilha.
# =====================================================================
param([ValidateSet('all')][string]$Mode='all')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$BR = [Globalization.CultureInfo]::GetCultureInfo('pt-BR')
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

# ---- Fontes (somente leitura) --------------------------------------
$LEADS_ID   = '13qqUwluHeOrhKQss_ZeVnzAsXvXbcQ-7sRCoX58IWjM'; $LEADS_GID   = '0'  # "extracao qualificada"
$QUERIES_ID = '19IHpDHbY21By6pC0JMvJ0BItsE1F3dDx4-98EDqhahw'; $QUERIES_GID = '0'  # "Queries | Meta Ads | MonsterDay"
$TAX = 1.1385   # imposto Meta (+13,85%) aplicado em TODO gasto

function Get-Sheet($id,$gid,$out){
  $url = "https://docs.google.com/spreadsheets/d/$id/gviz/tq?tqx=out:csv&gid=$gid"
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 120
  if((Get-Item $out).Length -lt 30){ throw "Download muito pequeno: $out" }
}
Add-Type -AssemblyName Microsoft.VisualBasic
function Read-Csv($path){
  $rows = New-Object System.Collections.Generic.List[object]
  $p = New-Object Microsoft.VisualBasic.FileIO.TextFieldParser($path,[System.Text.Encoding]::UTF8)
  $p.TextFieldType='Delimited'; $p.SetDelimiters(','); $p.HasFieldsEnclosedInQuotes=$true
  while(-not $p.EndOfData){ $rows.Add($p.ReadFields()) }
  $p.Close(); return $rows
}
function Norm($s){ if($null -eq $s){return ''}; return ($s -replace [char]0x200b,'').Trim() }
function MoneyBR($s){ $s=Norm $s; if($s -eq ''){return 0.0}; return [double]($s -replace '\.','' -replace ',','.') }
function ToInt($s){ $s=Norm $s; if($s -eq ''){return 0}; return [int]([double]($s -replace '\.','' -replace ',','.')) }
function HdrIndex($hdr,$name){ for($i=0;$i -lt $hdr.Count;$i++){ if((Norm $hdr[$i]) -eq $name){ return $i } }; return -1 }
function Deaccent($s){ if($null -eq $s){return ''}; $s=$s.Normalize([Text.NormalizationForm]::FormD); $sb=New-Object Text.StringBuilder
  foreach($c in $s.ToCharArray()){ if([Globalization.CharUnicodeInfo]::GetUnicodeCategory($c) -ne [Globalization.UnicodeCategory]::NonSpacingMark){ [void]$sb.Append($c) } }
  return $sb.ToString().ToLower() }
# dd-mm-yyyy -> yyyy-mm-dd
function LeadDate($s){ $s=Norm $s; if($s -match '^(\d{2})[-/](\d{2})[-/](\d{4})'){ return "$($Matches[3])-$($Matches[2])-$($Matches[1])" }; return '' }

# ---- Leadscore (regras do anexo do cliente) ------------------------
#   +3  Faturamento R$50k+/mes
#   +2  Papel operador/expert
#   +2  Vive de lancamento (dor central do evento)
#   +1  WhatsApp valido
#   -2  Comecando / so conhecendo
function LeadScore($fat,$atua,$fun,$tel){
  $f=Deaccent $fat; $a=Deaccent $atua; $u=Deaccent $fun; $t=($tel -replace '\D','')
  $s=0; $sig=New-Object System.Collections.Generic.List[string]
  if($f -match '50 a r\$100' -or $f -match '100 mil' -or $f -match '200 mil' -or $f -match 'acima'){ $s+=3; $sig.Add('fat50k') }
  if($a -match 'expert' -or $a -match 'operac'){ $s+=2; $sig.Add('operexpert') }
  if($u -match 'lanc'){ $s+=2; $sig.Add('lancamento') }
  if($t.Length -ge 12 -and $t.Length -le 13 -and $t.StartsWith('55')){ $s+=1; $sig.Add('wpp') }
  if($f -match 'comecando' -or $f -match 'ainda nao faturo'){ $s-=2; $sig.Add('comecando') }
  return [pscustomobject]@{ score=$s; sig=@($sig) }
}
function Tier($s){ if($s -ge 5){'A'} elseif($s -ge 3){'B'} elseif($s -ge 1){'C'} else {'D'} }

Write-Host "Baixando planilhas..."
$qCsv=Join-Path $dataDir 'queries.csv'; $lCsv=Join-Path $dataDir 'leads.csv'
Get-Sheet $QUERIES_ID $QUERIES_GID $qCsv
Get-Sheet $LEADS_ID   $LEADS_GID   $lCsv
$q = Read-Csv $qCsv; $qh=$q[0]; $qd=$q[1..($q.Count-1)]
$l = Read-Csv $lCsv; $lh=$l[0]; $ld=$l[1..($l.Count-1)]

# ---- indices de coluna ---------------------------------------------
$Q_DAY=HdrIndex $qh 'Day'; $Q_CAMP=HdrIndex $qh 'Campaign Name'; $Q_SET=HdrIndex $qh 'Ad Set Name'; $Q_AD=HdrIndex $qh 'Ad Name'
$Q_SPEND=HdrIndex $qh 'Amount Spent'; $Q_IMP=HdrIndex $qh 'Impressions'; $Q_CLK=HdrIndex $qh 'Link Clicks'
$Q_LPV=HdrIndex $qh 'Landing Page Views'; $Q_MLEAD=HdrIndex $qh 'Leads'; $Q_V3=HdrIndex $qh '3-Second Video Views'; $Q_V75=HdrIndex $qh 'Video Watches at 75%'

$L_DATE=HdrIndex $lh 'data'; $L_NAME=HdrIndex $lh 'nome'; $L_MAIL=HdrIndex $lh 'email'; $L_TEL=HdrIndex $lh 'telefone'
$L_FAT=HdrIndex $lh 'qual_seu_faturamento'; $L_ATUA=HdrIndex $lh 'como_voce_atua'; $L_FUN=HdrIndex $lh 'funil_venda'
$L_UCAMP=HdrIndex $lh 'utm_campaign'; $L_UMED=HdrIndex $lh 'utm_medium'; $L_UCONT=HdrIndex $lh 'utm_content'

# conjuntos de nomes reais das queries (p/ casar a atribuicao)
$campSet = @($qd | ForEach-Object { Norm $_[$Q_CAMP] } | Where-Object { $_ -ne '' } | Select-Object -Unique)
$adSet   = @($qd | ForEach-Object { Norm $_[$Q_AD]   } | Where-Object { $_ -ne '' } | Select-Object -Unique)
$adDeacc = @{}; foreach($a in $adSet){ $adDeacc[(Deaccent $a)]=$a }
$campDeacc = @{}; foreach($c in $campSet){ $campDeacc[(Deaccent $c)]=$c }

# ===================================================================
#  DAILY (totais do funil por dia) + GRAIN (dia|campanha|conjunto|anuncio)
# ===================================================================
$daily=@{}
function GetDay($d){ if(-not $daily.ContainsKey($d)){ $daily[$d]=[pscustomobject]@{date=$d;spend=0.0;impr=0;clicks=0;lpv=0;v3=0;v75=0;metaLeads=0;leads=0;A=0;B=0;C=0;D=0} }; return $daily[$d] }
$grain=@{}
function GetGrain($d,$c,$s,$a){ $key="$d`u$c`u$s`u$a"
  if(-not $grain.ContainsKey($key)){ $grain[$key]=[pscustomobject]@{date=$d;campaign=$c;adset=$s;ad=$a;spend=0.0;impr=0;clicks=0;lpv=0;v3=0;v75=0;metaLeads=0;leads=0;A=0;B=0;C=0;D=0} }
  return $grain[$key] }

foreach($r in $qd){ $d=Norm $r[$Q_DAY]; if($d -notmatch '^\d{4}-\d{2}-\d{2}$'){continue}
  $sp=(MoneyBR $r[$Q_SPEND])*$TAX; $im=ToInt $r[$Q_IMP]; $ck=ToInt $r[$Q_CLK]; $lp=ToInt $r[$Q_LPV]
  $v3=ToInt $r[$Q_V3]; $v75=ToInt $r[$Q_V75]; $ml=ToInt $r[$Q_MLEAD]
  $o=GetDay $d; $o.spend+=$sp; $o.impr+=$im; $o.clicks+=$ck; $o.lpv+=$lp; $o.v3+=$v3; $o.v75+=$v75; $o.metaLeads+=$ml
  $g=GetGrain $d (Norm $r[$Q_CAMP]) (Norm $r[$Q_SET]) (Norm $r[$Q_AD])
  $g.spend+=$sp; $g.impr+=$im; $g.clicks+=$ck; $g.lpv+=$lp; $g.v3+=$v3; $g.v75+=$v75; $g.metaLeads+=$ml }

# ---- leads: pontua, classifica e atribui ---------------------------
$leadRows=New-Object System.Collections.Generic.List[object]
$scoreHist=@{}   # score -> contagem
$distFat=@{}; $distAtua=@{}; $distFun=@{}   # distribuicoes dos QUALIFICADOS (A+B)
foreach($r in $ld){
  if($r.Count -le $L_FAT){continue}
  $d=LeadDate $r[$L_DATE]; if($d -eq ''){ $d='sem-data' }
  $sc=LeadScore $r[$L_FAT] $r[$L_ATUA] $r[$L_FUN] $r[$L_TEL]
  $tier=Tier $sc.score
  if(-not $scoreHist.ContainsKey($sc.score)){$scoreHist[$sc.score]=0}; $scoreHist[$sc.score]++
  # atribuicao: utm_campaign -> Campaign Name ; utm_content/medium -> Ad Name
  $uc=Norm $r[$L_UCAMP]; $ucD=Deaccent $uc
  $isMacro = ($uc -match '\{\{|\}\}')
  $camp='SEM_RASTREIO'
  if(-not $isMacro){ if($campSet -contains $uc){ $camp=$uc } elseif($campDeacc.ContainsKey($ucD)){ $camp=$campDeacc[$ucD] } }
  $ad='SEM_RASTREIO'
  foreach($cand in @((Norm $r[$L_UCONT]),(Norm $r[$L_UMED]))){
    if($cand -eq ''){continue}
    if($adSet -contains $cand){ $ad=$cand; break }
    $cd=Deaccent $cand; if($adDeacc.ContainsKey($cd)){ $ad=$adDeacc[$cd]; break } }
  $adset = if($camp -eq 'SEM_RASTREIO'){ 'SEM_RASTREIO' } else { $ad }
  if($d -ne 'sem-data'){ $o=GetDay $d; $o.leads++; $o.$tier++ }
  $g=GetGrain $d $camp $adset $ad; $g.leads++; $g.$tier++
  if($tier -eq 'A' -or $tier -eq 'B'){
    $fk=Norm $r[$L_FAT];  if($fk -ne ''){ if(-not $distFat.ContainsKey($fk)){$distFat[$fk]=0}; $distFat[$fk]++ }
    $ak=Norm $r[$L_ATUA]; if($ak -ne ''){ if(-not $distAtua.ContainsKey($ak)){$distAtua[$ak]=0}; $distAtua[$ak]++ }
    $uk=Norm $r[$L_FUN];  if($uk -ne ''){ if(-not $distFun.ContainsKey($uk)){$distFun[$uk]=0}; $distFun[$uk]++ }
  }
  $leadRows.Add([pscustomobject]@{date=$d;tier=$tier;score=$sc.score;camp=$camp;ad=$ad}) }

# ---- arrays finais -------------------------------------------------
$dailyArr = @($daily.Values | Sort-Object date)
$grainArr = @($grain.Values | Where-Object { $_.spend -gt 0 -or $_.leads -gt 0 } | Sort-Object date)
$dates = @($dailyArr | Where-Object { $_.date -match '^\d{4}-\d{2}-\d{2}$' } | ForEach-Object { $_.date } | Sort-Object)
$leadDates = @($leadRows | Where-Object { $_.date -match '^\d{4}-\d{2}-\d{2}$' } | ForEach-Object { $_.date } | Sort-Object)

function DistArr($h){ $out=@(); foreach($e in ($h.GetEnumerator()|Sort-Object Value -Descending)){ $out+=[pscustomobject]@{label=$e.Key;n=$e.Value} }; return ,@($out) }
$scoreArr=@(); foreach($e in ($scoreHist.GetEnumerator()|Sort-Object {[int]$_.Key} -Descending)){ $scoreArr+=[pscustomobject]@{score=[int]$e.Key;n=$e.Value;tier=(Tier ([int]$e.Key))} }

# totais gerais (all-time)
$tot=[pscustomobject]@{
  spend=(($dailyArr|Measure-Object spend -Sum).Sum); impr=(($dailyArr|Measure-Object impr -Sum).Sum)
  clicks=(($dailyArr|Measure-Object clicks -Sum).Sum); lpv=(($dailyArr|Measure-Object lpv -Sum).Sum)
  metaLeads=(($dailyArr|Measure-Object metaLeads -Sum).Sum); leads=$leadRows.Count
  A=(@($leadRows|Where-Object{$_.tier -eq 'A'}).Count); B=(@($leadRows|Where-Object{$_.tier -eq 'B'}).Count)
  C=(@($leadRows|Where-Object{$_.tier -eq 'C'}).Count); D=(@($leadRows|Where-Object{$_.tier -eq 'D'}).Count)
  attributed=(@($leadRows|Where-Object{$_.camp -ne 'SEM_RASTREIO'}).Count)
}

$nowIso = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$nowBR  = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'E. South America Standard Time').ToString('dd/MM/yyyy HH:mm')
$utf8 = [System.Text.UTF8Encoding]::new($false)

$payload=[pscustomobject]@{
  generatedAt=$nowIso; generatedAtBR=$nowBR; taxMultiplier=$TAX
  dateMin=$(if($dates.Count){$dates[0]}else{''}); dateMax=$(if($dates.Count){$dates[-1]}else{''})
  leadDateMin=$(if($leadDates.Count){$leadDates[0]}else{''}); leadDateMax=$(if($leadDates.Count){$leadDates[-1]}else{''})
  scoring=@(
    [pscustomobject]@{label='Faturamento R$50k+/mes';pts=3}
    [pscustomobject]@{label='Papel operador/expert';pts=2}
    [pscustomobject]@{label='Vive de lancamento (dor central)';pts=2}
    [pscustomobject]@{label='WhatsApp valido';pts=1}
    [pscustomobject]@{label='"Comecando / so conhecendo"';pts=-2}
  )
  tiers=@(
    [pscustomobject]@{tier='A';label='Quente';min=5}
    [pscustomobject]@{tier='B';label='Morno';min=3}
    [pscustomobject]@{tier='C';label='Frio';min=1}
    [pscustomobject]@{tier='D';label='Desqualificado';min=-99}
  )
  totals=$tot; scoreHist=@($scoreArr)
  qualifFat=(DistArr $distFat); qualifAtua=(DistArr $distAtua); qualifFun=(DistArr $distFun)
  daily=@($dailyArr); grain=@($grainArr)
}
$json = $payload | ConvertTo-Json -Depth 9 -Compress
[IO.File]::WriteAllText((Join-Path $root 'data.js'), ("window.MDAY="+$json+";"), $utf8)
Write-Host ("OK  dias={0}  grain={1}  leads={2}  A={3} B={4} C={5} D={6}  spend+imp=R$ {7}" -f $dailyArr.Count,$grainArr.Count,$tot.leads,$tot.A,$tot.B,$tot.C,$tot.D,($tot.spend.ToString('N2',$BR)))
