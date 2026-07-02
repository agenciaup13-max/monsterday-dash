/* MonsterDay dashboard — render puro (sem libs, SVG na mão) sobre window.MDAY */
(function(){
'use strict';
var D = window.MDAY || {};
var arr = function(x){ return Array.isArray(x) ? x : (x ? [x] : []); };
var clamp = function(x){ return Math.max(0, Math.min(1, x)); };

// ---- formatadores pt-BR ----
var nf0 = new Intl.NumberFormat('pt-BR');
var nf1 = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
var nf2 = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
var money = function(v){ return 'R$ ' + nf2.format(v||0); };
var money0 = function(v){ return 'R$ ' + nf0.format(Math.round(v||0)); };
var intf = function(v){ return nf0.format(Math.round(v||0)); };
var pct = function(v){ return nf1.format(v||0) + '%'; };
var div = function(a,b){ return b>0 ? a/b : 0; };
function fmtBR(iso){ if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; var p=iso.split('-'); return p[2]+'/'+p[1]; }
function el(id){ return document.getElementById(id); }

var daily = arr(D.daily);
var grain = arr(D.grain);
var isDate = function(x){ return /^\d{4}-\d{2}-\d{2}$/.test(x); };
var allDates = daily.map(function(d){return d.date;}).filter(isDate).sort();
var maxDate = D.dateMax || allDates[allDates.length-1] || '';
var minDate = D.dateMin || allDates[0] || '';

function addDays(iso,n){ var p=iso.split('-'); var dt=new Date(Date.UTC(+p[0],+p[1]-1,+p[2])); dt.setUTCDate(dt.getUTCDate()+n); return dt.toISOString().slice(0,10); }
function inRange(dt,r){ return dt>=r[0] && dt<=r[1]; }

var PRESETS = [
  {k:'hoje',  label:'Hoje'},
  {k:'ontem', label:'Ontem'},
  {k:'7d',    label:'7 dias'},
  {k:'30d',   label:'30 dias'},
  {k:'leads', label:'Período dos leads'},
  {k:'tudo',  label:'Tudo'}
];
var period = 'tudo';
function rangeFor(k){
  if(k==='tudo')  return [minDate, maxDate];
  if(k==='hoje')  return [maxDate, maxDate];
  if(k==='ontem'){ var y=addDays(maxDate,-1); return [y,y]; }
  if(k==='7d')    return [addDays(maxDate,-6),  maxDate];
  if(k==='30d')   return [addDays(maxDate,-29), maxDate];
  if(k==='leads') return [D.leadDateMin||minDate, D.leadDateMax||maxDate];
  return [minDate, maxDate];
}

var METS = ['spend','impr','clicks','lpv','v3','v75','metaLeads','leads','A','B','C','D'];
function aggDaily(rng){
  var o={spendLead:0,leadDays:0,days:0}; METS.forEach(function(k){o[k]=0;});
  daily.forEach(function(d){
    if(!inRange(d.date,rng)) return;
    o.days++;
    METS.forEach(function(k){ o[k]+=(d[k]||0); });
    if((d.leads||0)>0){ o.leadDays++; o.spendLead+=(d.spend||0); }
  });
  return o;
}

/* ---------- gauge donut ---------- */
function donut(frac, color, centerVal, centerLab, size){
  size = size||150; var sw=14; var r=(size-sw)/2; var cx=size/2; var c=2*Math.PI*r;
  var off=c*(1-clamp(frac));
  return '<div class="gauge" style="width:'+size+'px;height:'+size+'px">'
    + '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'
    + '<circle cx="'+cx+'" cy="'+cx+'" r="'+r+'" fill="none" stroke="#20202a" stroke-width="'+sw+'"/>'
    + '<circle cx="'+cx+'" cy="'+cx+'" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="'+sw+'" '
    + 'stroke-linecap="round" stroke-dasharray="'+c+'" stroke-dashoffset="'+off+'" transform="rotate(-90 '+cx+' '+cx+')"/>'
    + '</svg>'
    + '<div class="gauge-num"><span class="g-val" style="color:'+color+'">'+centerVal+'</span>'
    + '<span class="g-lab" style="color:'+color+'">'+centerLab+'</span></div></div>';
}

/* =================== HEALTH =================== */
function health(a){
  var q=a.A+a.B, parts=[];
  if(a.leads>0){ var r=div(q,a.leads); parts.push({k:'Taxa qualif (A+B)',w:28,s:clamp(r/0.40),v:pct(r*100)}); }
  if(q>0){ var cq=div(a.spend,q); parts.push({k:'CPL qualificado',w:22,s:clamp((400-cq)/(400-80)),v:money0(cq)}); }
  if(a.impr>0){ var ct=div(a.clicks,a.impr); parts.push({k:'CTR (link)',w:18,s:clamp(ct/0.015),v:pct(ct*100)}); }
  if(a.impr>0){ var hk=div(a.v3,a.impr); parts.push({k:'Hook rate (3s)',w:16,s:clamp(hk/0.25),v:pct(hk*100)}); }
  if(a.lpv>0 && a.leads>0){ var cv=div(a.leads,a.lpv); parts.push({k:'Conv. LP→Lead',w:16,s:clamp(cv/0.08),v:pct(cv*100)}); }
  var tw=0,acc=0; parts.forEach(function(p){tw+=p.w;acc+=p.w*p.s;});
  var score = tw>0 ? Math.round(acc/tw*100) : 0;
  return {score:score, parts:parts, has:tw>0};
}
function band(s){
  if(s>=75) return {l:'Excelente',c:'#33d69f'};
  if(s>=58) return {l:'Saudável', c:'#ff1e63'};
  if(s>=42) return {l:'Atenção',  c:'#ffab2e'};
  return {l:'Crítico', c:'#ff4d6d'};
}
function renderHealth(a){
  var h=health(a), b=band(h.score);
  if(!h.has){ el('healthGauge').innerHTML = donut(0,'#6b6b76','—','sem dados'); el('healthLegend').innerHTML='<div class="empty">Sem tráfego no período.</div>'; return; }
  el('healthGauge').innerHTML = donut(h.score/100, b.c, h.score, b.l);
  el('healthLegend').innerHTML = h.parts.map(function(p){
    return '<div class="hl-row"><span class="hl-k">'+p.k+'</span>'
      + '<span class="hl-bar"><span style="width:'+Math.round(p.s*100)+'%;background:'+b.c+'"></span></span>'
      + '<span class="hl-v">'+p.v+'</span></div>';
  }).join('');
}

/* =================== KPIs =================== */
function kpi(cls,label,val,sub){ return '<div class="kpi '+(cls||'')+'"><div class="kpi-l">'+label+'</div><div class="kpi-v">'+val+'</div>'+(sub?'<div class="kpi-s">'+sub+'</div>':'')+'</div>'; }
function renderKpis(a){
  var q=a.A+a.B;
  var taxaQ = div(q,a.leads)*100;
  var ctr   = div(a.clicks,a.impr)*100;
  var cpm   = div(a.spend,a.impr)*1000;
  var hook  = div(a.v3,a.impr)*100;
  var convLP= div(a.leads,a.lpv)*100;
  var cpl   = div(a.spend,a.leads);
  var cplQ  = div(a.spend,q);
  var html = ''
    + kpi('hl','Investimento (c/ imposto)', money(a.spend), 'gasto Meta ×'+nf2.format(D.taxMultiplier||1.1385))
    + kpi('','Leads', intf(a.leads), 'Meta pixel: '+intf(a.metaLeads))
    + kpi('hl','Qualificados A+B', intf(q), 'taxa de qualificação '+pct(taxaQ))
    + kpi('','Taxa de qualificação', pct(taxaQ), 'A='+a.A+' · B='+a.B)
    + kpi('','CPL', money(cpl), 'custo por lead')
    + kpi('hl','CPL qualificado', q>0?money(cplQ):'—', 'custo por lead A+B')
    + kpi('','Impressões', intf(a.impr), 'CPM '+money(cpm))
    + kpi('','Cliques no link', intf(a.clicks), 'CTR '+pct(ctr))
    + kpi('','LP Views', intf(a.lpv), 'conv. LP→Lead '+pct(convLP))
    + kpi('','CTR (link)', pct(ctr), intf(a.clicks)+' cliques')
    + kpi('','Hook rate (3s)', pct(hook), intf(a.v3)+' views 3s')
    + kpi('','Conv. LP→Lead', pct(convLP), a.lpv?intf(a.lpv)+' LPV':'—');
  el('kpis').innerHTML = html;
}

/* =================== FUNNEL =================== */
function fbar(label,val,base,prevVal,prevLabel,isQ){
  var w = base>0 ? Math.max(3, val/base*100) : 3;
  var p = (prevVal!=null && prevVal>0) ? nf1.format(val/prevVal*100)+'% '+prevLabel : '';
  return '<div class="fbar"><div class="fbar-l">'+label+'</div>'
    + '<div class="fbar-track"><div class="fbar-fill'+(isQ?' q':'')+'" style="width:'+w+'%"><span class="fbar-v">'+intf(val)+'</span></div></div>'
    + '<div class="fbar-p">'+p+'</div></div>';
}
function renderFunnel(a){
  var q=a.A+a.B; var base=a.impr||1;
  var html = ''
    + fbar('Impressões', a.impr, base, null, '')
    + fbar('Cliques link', a.clicks, base, a.impr, 'das impr.')
    + fbar('LP Views', a.lpv, base, a.clicks, 'dos cliques')
    + fbar('Leads', a.leads, base, a.lpv, 'das LPV')
    + fbar('Qualif. A+B', q, base, a.leads, 'dos leads', true);
  el('funnel').innerHTML = html;
}

/* =================== DAILY TABLE =================== */
function renderDaily(rng){
  var rows = daily.filter(function(d){ return inRange(d.date,rng) && isDate(d.date); }).sort(function(x,y){ return y.date.localeCompare(x.date); });
  var maxLeads = Math.max.apply(null, rows.map(function(r){return r.leads||0;}).concat([1]));
  var head = '<thead><tr><th>Dia</th><th>Invest.</th><th>Impr</th><th>Cliques</th><th>LPV</th><th>Leads</th><th>A</th><th>B</th><th>Qualif</th><th>CPL</th><th>CPL Qualif</th></tr></thead>';
  var body = rows.map(function(r){
    var q=(r.A||0)+(r.B||0); var taxaQ=div(q,r.leads)*100;
    var heat = r.leads>0 ? 'style="background:rgba(255,30,99,'+(0.08+0.32*(r.leads/maxLeads)).toFixed(3)+')" ' : '';
    return '<tr><td>'+fmtBR(r.date)+'</td>'
      + '<td class="num">'+money0(r.spend)+'</td>'
      + '<td class="num">'+intf(r.impr)+'</td>'
      + '<td class="num">'+intf(r.clicks)+'</td>'
      + '<td class="num">'+intf(r.lpv)+'</td>'
      + '<td class="num"><span class="heat" '+heat+'>'+intf(r.leads)+'</span></td>'
      + '<td class="num">'+(r.A?'<span class="pillA">'+r.A+'</span>':'·')+'</td>'
      + '<td class="num">'+(r.B?'<span class="pillB">'+r.B+'</span>':'·')+'</td>'
      + '<td class="num qcell">'+(r.leads?pct(taxaQ):'—')+'</td>'
      + '<td class="num">'+(r.leads?money0(div(r.spend,r.leads)):'—')+'</td>'
      + '<td class="num">'+(q?money0(div(r.spend,q)):'—')+'</td></tr>';
  }).join('');
  if(!rows.length) body='<tr><td colspan="11" class="empty">Sem dados no período.</td></tr>';
  el('dailyTbl').innerHTML = head+'<tbody>'+body+'</tbody>';
}

/* =================== OTIMIZAÇÃO (árvore) =================== */
function prettyCamp(c){
  if(c==='SEM_RASTREIO') return '— sem rastreio —';
  if(c.indexOf('|')>=0){ var parts=c.split('|'); return parts[parts.length-1].trim(); }
  return c;
}
function prettyAd(a){ return a==='SEM_RASTREIO' ? '— sem rastreio —' : a; }
function newNode(name,full){ return {name:name, full:full, spend:0,impr:0,clicks:0,lpv:0,v3:0,leads:0,A:0,B:0,C:0,D:0, kids:{}}; }
function accum(n,r){ n.spend+=r.spend||0;n.impr+=r.impr||0;n.clicks+=r.clicks||0;n.lpv+=r.lpv||0;n.v3+=r.v3||0;n.leads+=r.leads||0;n.A+=r.A||0;n.B+=r.B||0;n.C+=r.C||0;n.D+=r.D||0; }
function buildTree(rows){
  var camps={};
  rows.forEach(function(r){
    var c = camps[r.campaign] || (camps[r.campaign]=newNode(prettyCamp(r.campaign), r.campaign));
    accum(c,r);
    var s = c.kids[r.adset] || (c.kids[r.adset]=newNode(prettyAd(r.adset), r.adset));
    accum(s,r);
    var a = s.kids[r.ad] || (s.kids[r.ad]=newNode(prettyAd(r.ad), r.ad));
    accum(a,r);
  });
  return camps;
}
var expanded = {}; var treeInited = false;
function metricsCells(n){
  var q=n.A+n.B; var cplQ=div(n.spend,q); var taxaQ=div(q,n.leads)*100;
  return '<td class="num">'+money0(n.spend)+'</td>'
    + '<td class="num">'+intf(n.impr)+'</td>'
    + '<td class="num">'+intf(n.clicks)+'</td>'
    + '<td class="num">'+intf(n.lpv)+'</td>'
    + '<td class="num">'+intf(n.leads)+'</td>'
    + '<td class="num">'+(n.A?'<span class="pillA">'+n.A+'</span>':'·')+'</td>'
    + '<td class="num">'+(n.B?'<span class="pillB">'+n.B+'</span>':'·')+'</td>'
    + '<td class="num qcell">'+(n.leads?intf(q)+' · '+pct(taxaQ):'·')+'</td>'
    + '<td class="num">'+(q?money0(cplQ):'—')+'</td>';
}
function treeRow(n, lvl, key, hasKids){
  var caret = hasKids ? '<span class="caret'+(expanded[key]?' open':'')+'">▶</span>' : '<span class="caret" style="opacity:.25">•</span>';
  var cls = 'lvl'+lvl+(hasKids?' parent':'');
  return '<tr class="'+cls+'" data-key="'+encodeURIComponent(key)+'" data-haskids="'+(hasKids?1:0)+'">'
    + '<td>'+caret+'<span class="name" title="'+(n.full||n.name).replace(/"/g,'&quot;')+'">'+n.name+'</span></td>'
    + metricsCells(n)+'</tr>';
}
function renderTree(rng){
  var rows = grain.filter(function(r){ return inRange(r.date,rng); });
  var camps = buildTree(rows);
  var order = Object.keys(camps).sort(function(x,y){ return (camps[y].A+camps[y].B)-(camps[x].A+camps[x].B) || camps[y].spend-camps[x].spend; });
  if(!treeInited){ order.forEach(function(cK){ expanded['c:'+cK]=true; }); treeInited=true; }
  var head = '<thead><tr><th>Campanha / Conjunto / Anúncio</th><th>Invest.</th><th>Impr</th><th>Cliques</th><th>LPV</th><th>Leads</th><th>A</th><th>B</th><th>Qualif (A+B)</th><th>CPL Qualif</th></tr></thead>';
  var out=[];
  order.forEach(function(cK){
    var c=camps[cK]; var cKey='c:'+cK; var cHas=Object.keys(c.kids).length>0;
    out.push(treeRow(c,0,cKey,cHas));
    if(expanded[cKey]){
      var sOrder=Object.keys(c.kids).sort(function(x,y){ return (c.kids[y].A+c.kids[y].B)-(c.kids[x].A+c.kids[x].B) || c.kids[y].spend-c.kids[x].spend; });
      sOrder.forEach(function(sK){
        var s=c.kids[sK]; var sKey=cKey+'|s:'+sK; var sHas=Object.keys(s.kids).length>0;
        out.push(treeRow(s,1,sKey,sHas));
        if(expanded[sKey]){
          var aOrder=Object.keys(s.kids).sort(function(x,y){ return (s.kids[y].A+s.kids[y].B)-(s.kids[x].A+s.kids[x].B) || s.kids[y].spend-s.kids[x].spend; });
          aOrder.forEach(function(aK){ out.push(treeRow(s.kids[aK],2,sKey+'|a:'+aK,false)); });
        }
      });
    }
  });
  if(!out.length) out.push('<tr><td colspan="10" class="empty">Sem dados no período.</td></tr>');
  el('treeTbl').innerHTML = head+'<tbody>'+out.join('')+'</tbody>';
  el('treeLegend').innerHTML = '<span><span class="dot" style="background:var(--A)"></span>Leadscore A (quente)</span>'
    + '<span><span class="dot" style="background:var(--B)"></span>Leadscore B (morno)</span>'
    + '<span><span class="dot" style="background:var(--pink2)"></span>Qualif = A+B</span>'
    + '<span style="color:var(--muted2)">Ordenado por quem traz mais lead qualificado</span>';
  // bind expand/collapse
  Array.prototype.forEach.call(el('treeTbl').querySelectorAll('tr.parent'), function(tr){
    tr.addEventListener('click', function(){
      var k=decodeURIComponent(tr.getAttribute('data-key')); expanded[k]=!expanded[k]; renderTree(rangeFor(period));
    });
  });
}

/* =================== LEADSCORE TAB =================== */
function renderScoreTab(a){
  var q=a.A+a.B; var total=a.leads;
  var qFrac=div(q,total);
  el('scoreGauge').innerHTML = donut(qFrac, '#ff1e63', total?pct(qFrac*100):'—', 'qualif A+B', 150);
  var tiers=[['A','Quente',a.A,'var(--A)'],['B','Morno',a.B,'var(--B)'],['C','Frio',a.C,'var(--C)'],['D','Desq.',a.D,'var(--D)']];
  var maxT=Math.max.apply(null,tiers.map(function(t){return t[2];}).concat([1]));
  el('scoreBars').innerHTML = '<div style="flex:1">'+tiers.map(function(t){
    var w = t[2]>0 ? Math.max(4, t[2]/maxT*100) : 0;
    return '<div class="hl-row"><span class="hl-k" style="width:96px"><b style="color:'+t[3]+'">'+t[0]+'</b> '+t[1]+'</span>'
      + '<span class="hl-bar"><span style="width:'+w+'%;background:'+t[3]+'"></span></span>'
      + '<span class="hl-v">'+intf(t[2])+(total?' · '+pct(div(t[2],total)*100):'')+'</span></div>';
  }).join('')+'</div>';

  // regras (estáticas)
  el('scoringRules').innerHTML = arr(D.scoring).map(function(s){
    var pos = s.pts>=0; var sign=pos?'+':'';
    return '<div class="rule"><span>'+s.label+'</span><span class="pts '+(pos?'pos':'neg')+'">'+sign+s.pts+'</span></div>';
  }).join('');
  el('tierRules').innerHTML = '<div class="tier-rules">'+arr(D.tiers).map(function(t){
    var col={A:'var(--A)',B:'var(--B)',C:'var(--C)',D:'var(--D)'}[t.tier];
    var rng = t.tier==='D' ? '≤ 0' : (t.tier==='A'?'≥ '+t.min:t.min+' a '+({A:99,B:4,C:2}[t.tier]));
    return '<div class="tier-chip"><div class="t" style="color:'+col+'">'+t.tier+'</div><div class="l">'+t.label+'</div><div class="r">'+rng+' pts</div></div>';
  }).join('')+'</div>';

  // breakdown qualificados (base completa)
  el('qualifBreak').innerHTML =
      qbBlock('Faturamento mensal', arr(D.qualifFat))
    + qbBlock('Como atua', arr(D.qualifAtua))
    + qbBlock('Funil de venda', arr(D.qualifFun));

  // ranking de anúncios por A+B (período)
  renderAdRank(rangeFor(period));
}
function qbBlock(title, list){
  var max=Math.max.apply(null, list.map(function(x){return x.n;}).concat([1]));
  var bars = list.length ? list.map(function(x){
    return '<div class="qbar"><div class="qbar-top"><span class="l" title="'+String(x.label).replace(/"/g,'&quot;')+'">'+x.label+'</span><span class="n">'+x.n+'</span></div>'
      + '<div class="qbar-track"><span style="width:'+Math.max(6,x.n/max*100)+'%"></span></div></div>';
  }).join('') : '<div class="empty">Sem qualificados ainda.</div>';
  return '<div><div class="qb-h">'+title+'</div>'+bars+'</div>';
}
function renderAdRank(rng){
  var rows = grain.filter(function(r){ return inRange(r.date,rng) && r.ad!=='SEM_RASTREIO'; });
  var ads={};
  rows.forEach(function(r){
    var k=r.ad+'##'+r.campaign;
    var n = ads[k] || (ads[k]={ad:prettyAd(r.ad),camp:prettyCamp(r.campaign),spend:0,leads:0,A:0,B:0});
    n.spend+=r.spend||0;n.leads+=r.leads||0;n.A+=r.A||0;n.B+=r.B||0;
  });
  var list=Object.keys(ads).map(function(k){return ads[k];}).filter(function(n){return n.leads>0;})
    .sort(function(x,y){ return (y.A+y.B)-(x.A+x.B) || y.A-x.A; });
  var head='<thead><tr><th>Anúncio</th><th>Campanha</th><th>Invest.</th><th>Leads</th><th>A</th><th>B</th><th>Qualif</th><th>CPL Qualif</th></tr></thead>';
  var body=list.map(function(n){
    var q=n.A+n.B;
    return '<tr><td>'+n.ad+'</td><td style="color:var(--muted)">'+n.camp+'</td>'
      + '<td class="num">'+money0(n.spend)+'</td>'
      + '<td class="num">'+intf(n.leads)+'</td>'
      + '<td class="num">'+(n.A?'<span class="pillA">'+n.A+'</span>':'·')+'</td>'
      + '<td class="num">'+(n.B?'<span class="pillB">'+n.B+'</span>':'·')+'</td>'
      + '<td class="num qcell">'+intf(q)+'</td>'
      + '<td class="num">'+(q?money0(div(n.spend,q)):'—')+'</td></tr>';
  }).join('');
  if(!list.length) body='<tr><td colspan="8" class="empty">Nenhum lead rastreado no período.</td></tr>';
  el('adRankTbl').innerHTML=head+'<tbody>'+body+'</tbody>';
}

/* =================== CHROME (period + tabs) =================== */
function renderPeriods(){
  el('periods').innerHTML = PRESETS.map(function(p){
    return '<button data-k="'+p.k+'" class="'+(p.k===period?'on':'')+'">'+p.label+'</button>';
  }).join('');
  Array.prototype.forEach.call(el('periods').querySelectorAll('button'), function(b){
    b.addEventListener('click', function(){ period=b.getAttribute('data-k'); renderPeriods(); renderAll(); });
  });
}
function renderAll(){
  var rng=rangeFor(period); var a=aggDaily(rng);
  renderHealth(a); renderKpis(a); renderFunnel(a); renderDaily(rng);
  renderTree(rng); renderScoreTab(a);
}
function activateTab(id){
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(x){ x.classList.toggle('active', x.getAttribute('data-tab')===id); });
  ['funil','otim','score'].forEach(function(k){ el('tab-'+k).classList.toggle('hidden', k!==id); });
}
function initTabs(){
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(t){
    t.addEventListener('click', function(){ var id=t.getAttribute('data-tab'); activateTab(id); if(history.replaceState) history.replaceState(null,'','#'+id); });
  });
  var h=(location.hash||'').replace('#','');
  if(h==='otim'||h==='score'||h==='funil') activateTab(h);
  window.addEventListener('hashchange', function(){ var k=(location.hash||'').replace('#',''); if(k==='otim'||k==='score'||k==='funil') activateTab(k); });
}
function initCoverage(){
  el('updated').textContent = D.generatedAtBR || '—';
  el('taxf').textContent = nf2.format(D.taxMultiplier||1.1385);
  var cov = 'Leads registrados: <b>'+fmtBR(D.leadDateMin||'')+' → '+fmtBR(D.leadDateMax||'')+'</b>'
    + ' · Tráfego/gasto: <b>'+fmtBR(minDate)+' → '+fmtBR(maxDate)+'</b>'
    + ' — a planilha de leads começa em '+fmtBR(D.leadDateMin||'')+'; em períodos anteriores há gasto sem leads (CPL fica "—").';
  el('coverage').innerHTML = cov;
}

if(!daily.length && !grain.length){
  el('coverage').innerHTML='<b>Sem dados.</b> Rode o build.ps1 para gerar o data.js.';
} else {
  initCoverage(); renderPeriods(); initTabs(); renderAll();
}
})();
