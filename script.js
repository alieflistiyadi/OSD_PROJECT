/* =========================================================
   Shared helpers
   ========================================================= */
const PALETTE = ["#5EEAD4","#E3B341","#F0656B","#8B9CF5","#4ADE9C","#F5A0C6","#7DD3FC","#D9A066"];
function colorFor(id){ return PALETTE[(id-1) % PALETTE.length]; }

/* =========================================================
   SCHEDULER TAB
   ========================================================= */
let processes = [
  {id:1, arrival:0, burst:5},
  {id:2, arrival:1, burst:3},
  {id:3, arrival:2, burst:8},
  {id:4, arrival:3, burst:6},
];
let nextId = 5;

function renderProcTable(){
  const tbody = document.getElementById('proc-tbody');
  tbody.innerHTML = '';
  processes.forEach(p=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pid-chip"><span class="swatch" style="background:${colorFor(p.id)}"></span>P${p.id}</span></td>
      <td><input type="number" min="0" value="${p.arrival}" data-field="arrival" data-id="${p.id}"></td>
      <td><input type="number" min="1" value="${p.burst}" data-field="burst" data-id="${p.id}"></td>
      <td><button class="btn small ghost" data-remove="${p.id}" title="Hapus">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('input', e=>{
      const id = Number(e.target.dataset.id);
      const field = e.target.dataset.field;
      const proc = processes.find(p=>p.id===id);
      let val = Number(e.target.value);
      if(isNaN(val) || val < (field==='burst'?1:0)) val = field==='burst'?1:0;
      proc[field] = val;
    });
  });
  tbody.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      const id = Number(e.target.dataset.remove);
      if(processes.length <= 2) return;
      processes = processes.filter(p=>p.id!==id);
      renderProcTable();
    });
  });
}

document.getElementById('add-proc').addEventListener('click', ()=>{
  if(processes.length >= 8) return;
  processes.push({id: nextId++, arrival: 0, burst: 4});
  renderProcTable();
});

const algoSelect = document.getElementById('algo-select');
const quantumField = document.getElementById('quantum-field');
const algoDescEl = document.getElementById('algo-desc');
const ALGO_DESC = {
  fcfs: "Proses dieksekusi berurutan sesuai waktu kedatangan (arrival time), tanpa interupsi.",
  sjf: "Proses dengan burst time terpendek yang sudah tiba dijalankan lebih dulu (non-preemptive).",
  rr: "Setiap proses mendapat giliran CPU selama satu time quantum secara bergantian (round-robin).",
};
algoSelect.addEventListener('change', ()=>{
  quantumField.style.display = algoSelect.value === 'rr' ? 'block' : 'none';
  algoDescEl.textContent = ALGO_DESC[algoSelect.value];
});
algoDescEl.textContent = ALGO_DESC.fcfs;

function fcfs(procs){
  const p = procs.map(x=>({...x})).sort((a,b)=>a.arrival-b.arrival || a.id-b.id);
  let time=0; const gantt=[]; const res=[];
  for(const proc of p){
    const start=Math.max(time, proc.arrival);
    const end=start+proc.burst;
    gantt.push({id:proc.id,start,end});
    time=end;
    res.push({id:proc.id,arrival:proc.arrival,burst:proc.burst,completion:end,
      waiting:start-proc.arrival, turnaround:end-proc.arrival});
  }
  res.sort((a,b)=>a.id-b.id);
  return {gantt,res};
}

function sjf(procs){
  const p = procs.map(x=>({...x, done:false}));
  const n=p.length; let time=Math.min(...p.map(x=>x.arrival));
  const gantt=[]; const res=[]; let completed=0;
  while(completed<n){
    const avail = p.filter(x=>!x.done && x.arrival<=time);
    if(avail.length===0){
      time = Math.min(...p.filter(x=>!x.done).map(x=>x.arrival));
      continue;
    }
    avail.sort((a,b)=>a.burst-b.burst || a.arrival-b.arrival || a.id-b.id);
    const proc = avail[0];
    const start=time; const end=start+proc.burst;
    gantt.push({id:proc.id,start,end});
    time=end; proc.done=true; completed++;
    res.push({id:proc.id,arrival:proc.arrival,burst:proc.burst,completion:end,
      waiting:start-proc.arrival, turnaround:end-proc.arrival});
  }
  res.sort((a,b)=>a.id-b.id);
  return {gantt,res};
}

function roundRobin(procs, quantum){
  const sorted = procs.map(x=>({...x})).sort((a,b)=>a.arrival-b.arrival || a.id-b.id);
  const n=sorted.length;
  const remaining = sorted.map(x=>x.burst);
  const completionTime = new Array(n).fill(null);
  let i=0, time=0, completed=0;
  const queue=[];
  const pushArrivals = ()=>{ while(i<n && sorted[i].arrival<=time){ queue.push(i); i++; } };
  pushArrivals();
  if(queue.length===0 && i<n){ time = sorted[i].arrival; pushArrivals(); }
  const gantt=[];
  let guard = 0;
  while(completed<n && guard < 5000){
    guard++;
    if(queue.length===0){
      if(i<n){ time = sorted[i].arrival; pushArrivals(); continue; }
      else break;
    }
    const idx = queue.shift();
    const start = time;
    const exec = Math.min(quantum, remaining[idx]);
    time += exec;
    remaining[idx]-=exec;
    const last = gantt[gantt.length-1];
    if(last && last.id === sorted[idx].id && last.end === start){
      last.end = time;
    } else {
      gantt.push({id:sorted[idx].id, start, end:time});
    }
    pushArrivals();
    if(remaining[idx] > 0){ queue.push(idx); }
    else { completed++; completionTime[idx]=time; }
  }
  const res = sorted.map((proc,idx)=>({
    id:proc.id, arrival:proc.arrival, burst:proc.burst,
    completion:completionTime[idx],
    waiting: completionTime[idx]-proc.arrival-proc.burst,
    turnaround: completionTime[idx]-proc.arrival
  })).sort((a,b)=>a.id-b.id);
  return {gantt,res};
}

/* ---------------------------------------------------------
   Gantt chart rendering
   FIX: lebar tiap segmen & posisi label sumbu waktu sekarang
   dihitung dalam PERSEN dari total durasi, bukan piksel tetap.
   Dengan begitu total lebar chart selalu 100% dari panel dan
   tidak akan pernah butuh scroll horizontal.
   --------------------------------------------------------- */
function renderGantt(gantt){
  const container = document.getElementById('gantt-container');
  container.innerHTML = '';

  const totalStart = gantt[0].start;
  const totalEnd = gantt[gantt.length-1].end;
  const totalTime = Math.max(1, totalEnd - totalStart);

  const wrap = document.createElement('div');
  wrap.className = 'gantt-wrap';

  const ganttEl = document.createElement('div');
  ganttEl.className = 'gantt';
  gantt.forEach((seg, idx)=>{
    const el = document.createElement('div');
    el.className = 'gantt-seg';
    const widthPct = ((seg.end - seg.start) / totalTime) * 100;
    el.style.width = widthPct + '%';
    el.style.background = colorFor(seg.id);
    el.style.animationDelay = (idx*0.05) + 's';
    el.textContent = 'P' + seg.id;
    el.title = `P${seg.id}: ${seg.start} - ${seg.end}`;
    ganttEl.appendChild(el);
  });
  wrap.appendChild(ganttEl);

  const axis = document.createElement('div');
  axis.className = 'gantt-axis';
  const positions = [];
  gantt.forEach(seg=>{
    positions.push({ t: seg.start, x: ((seg.start - totalStart) / totalTime) * 100 });
  });
  positions.push({ t: totalEnd, x: 100 });

  const seen = new Set();
  positions.forEach(p=>{
    if(seen.has(p.t)) return;
    seen.add(p.t);
    const span = document.createElement('span');
    // Clamp so the first/last labels don't get clipped outside the panel
    const clamped = Math.min(99, Math.max(1, p.x));
    span.style.left = clamped + '%';
    span.textContent = p.t;
    axis.appendChild(span);
  });
  wrap.appendChild(axis);
  container.appendChild(wrap);

  const legend = document.createElement('div');
  legend.className = 'legend';
  const ids = [...new Set(gantt.map(s=>s.id))].sort((a,b)=>a-b);
  ids.forEach(id=>{
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="swatch" style="background:${colorFor(id)}"></span> P${id}`;
    legend.appendChild(item);
  });
  container.appendChild(legend);
}

function renderResults(res){
  const panel = document.getElementById('result-panel');
  panel.style.display = 'block';
  const table = document.getElementById('result-table');
  const avgWait = res.reduce((a,r)=>a+r.waiting,0)/res.length;
  const avgTurn = res.reduce((a,r)=>a+r.turnaround,0)/res.length;
  table.innerHTML = `
    <thead>
      <tr><th>Proses</th><th>Arrival</th><th>Burst</th><th>Completion</th><th>Waiting</th><th>Turnaround</th></tr>
    </thead>
    <tbody>
      ${res.map(r=>`<tr>
        <td><span class="pid-chip"><span class="swatch" style="background:${colorFor(r.id)}"></span>P${r.id}</span></td>
        <td>${r.arrival}</td><td>${r.burst}</td><td>${r.completion}</td><td>${r.waiting}</td><td>${r.turnaround}</td>
      </tr>`).join('')}
    </tbody>
  `;
  const statRow = document.getElementById('stat-row');
  statRow.innerHTML = `
    <div class="stat"><span class="num">${avgWait.toFixed(2)}</span><span class="lbl">Rata-rata waiting time</span></div>
    <div class="stat"><span class="num">${avgTurn.toFixed(2)}</span><span class="lbl">Rata-rata turnaround time</span></div>
  `;
}

document.getElementById('run-scheduler').addEventListener('click', ()=>{
  const algo = algoSelect.value;
  let result;
  if(algo === 'fcfs') result = fcfs(processes);
  else if(algo === 'sjf') result = sjf(processes);
  else result = roundRobin(processes, Number(document.getElementById('quantum-input').value) || 1);
  renderGantt(result.gantt);
  renderResults(result.res);
});

/* =========================================================
   DEADLOCK TAB — shared tab switching
   ========================================================= */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('section.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-'+btn.dataset.tab).classList.add('active');
  });
});
document.querySelectorAll('.subtab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.subtab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('sub-bankers').style.display = btn.dataset.sub==='bankers' ? 'block':'none';
    document.getElementById('sub-detect').style.display = btn.dataset.sub==='detect' ? 'block':'none';
  });
});

/* =========================================================
   BANKER'S ALGORITHM
   ========================================================= */
let bankAlloc = [[0,1,0],[2,0,0],[3,0,2],[2,1,1],[0,0,2]];
let bankMax   = [[7,5,3],[3,2,2],[9,0,2],[2,2,2],[4,3,3]];
let bankAvail = [3,3,2];

function buildMatrixInput(wrapId, rows, cols, dataRef, isVector){
  const wrap = document.getElementById(wrapId);
  const table = document.createElement('table');
  table.className = 'matrix';
  let thead = '<tr><th></th>';
  for(let j=0;j<cols;j++) thead += `<th>R${j+1}</th>`;
  thead += '</tr>';
  let body = '';
  if(isVector){
    body += '<tr><td></td>';
    for(let j=0;j<cols;j++){
      body += `<td><input type="number" min="0" value="${dataRef[j]}" data-vec="${j}"></td>`;
    }
    body += '</tr>';
  } else {
    for(let i=0;i<rows;i++){
      body += `<tr><td style="font-weight:600;color:var(--text-dim);">P${i+1}</td>`;
      for(let j=0;j<cols;j++){
        body += `<td><input type="number" min="0" value="${dataRef[i][j]}" data-row="${i}" data-col="${j}"></td>`;
      }
      body += '</tr>';
    }
  }
  table.innerHTML = thead + body;
  wrap.innerHTML = '';
  wrap.appendChild(table);
  table.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('input', e=>{
      let val = Number(e.target.value); if(isNaN(val) || val<0) val = 0;
      if(isVector){ dataRef[Number(e.target.dataset.vec)] = val; }
      else { dataRef[Number(e.target.dataset.row)][Number(e.target.dataset.col)] = val; }
    });
  });
}

function rebuildBankTables(){
  const n = Math.max(2, Math.min(6, Number(document.getElementById('bank-n').value) || 5));
  const m = Math.max(1, Math.min(4, Number(document.getElementById('bank-m').value) || 3));
  document.getElementById('bank-n').value = n;
  document.getElementById('bank-m').value = m;

  const resize2D = (arr, rows, cols, fillMax)=>{
    const out = [];
    for(let i=0;i<rows;i++){
      const row = [];
      for(let j=0;j<cols;j++){
        row.push(arr[i] && arr[i][j] !== undefined ? arr[i][j] : (fillMax ? 3 : 1));
      }
      out.push(row);
    }
    return out;
  };
  const resizeVec = (arr, len, fill)=>{
    const out = [];
    for(let j=0;j<len;j++) out.push(arr[j] !== undefined ? arr[j] : fill);
    return out;
  };

  bankAlloc = resize2D(bankAlloc, n, m, false);
  bankMax = resize2D(bankMax, n, m, true);
  bankAvail = resizeVec(bankAvail, m, 2);

  buildMatrixInput('bank-alloc-wrap', n, m, bankAlloc, false);
  buildMatrixInput('bank-max-wrap', n, m, bankMax, false);
  buildMatrixInput('bank-avail-wrap', n, m, bankAvail, true);
}
document.getElementById('bank-rebuild').addEventListener('click', rebuildBankTables);
rebuildBankTables();

function bankersAlgorithm(n, m, allocation, max, available){
  const need = allocation.map((row,i)=> row.map((a,j)=> max[i][j]-a));
  let work = available.slice();
  const finish = new Array(n).fill(false);
  const safeSeq = [];
  const steps = [];
  let progress = true;
  while(progress){
    progress = false;
    for(let i=0;i<n;i++){
      if(!finish[i]){
        const canRun = need[i].every((v,j)=> v <= work[j]);
        if(canRun){
          const workBefore = work.slice();
          work = work.map((v,j)=> v+allocation[i][j]);
          finish[i]=true;
          safeSeq.push(i);
          steps.push({process:i, workBefore, workAfter: work.slice()});
          progress=true;
        }
      }
    }
  }
  const safe = finish.every(Boolean);
  return {safe, safeSeq, need, steps, stuck: finish.map((f,i)=>f?null:i).filter(x=>x!==null)};
}

document.getElementById('run-bankers').addEventListener('click', ()=>{
  const n = bankAlloc.length, m = bankAvail.length;
  const result = bankersAlgorithm(n, m, bankAlloc, bankMax, bankAvail);
  const container = document.getElementById('bankers-result');
  container.innerHTML = '';

  const banner = document.createElement('div');
  if(result.safe){
    banner.className = 'banner safe';
    banner.innerHTML = `<div>
      <span class="banner-title">Sistem dalam keadaan AMAN (safe state)</span>
      <span class="banner-body">Urutan aman ditemukan: ${result.safeSeq.map(i=>'P'+(i+1)).join(' → ')}. Semua proses dapat menyelesaikan eksekusinya tanpa terjadi deadlock.</span>
    </div>`;
  } else {
    banner.className = 'banner unsafe';
    banner.innerHTML = `<div>
      <span class="banner-title">Sistem dalam keadaan TIDAK AMAN (unsafe state)</span>
      <span class="banner-body">Proses ${result.stuck.map(i=>'P'+(i+1)).join(', ')} tidak dapat dijamin selesai dengan resource yang tersedia saat ini — berpotensi terjadi deadlock.</span>
    </div>`;
  }
  container.appendChild(banner);

  if(result.steps.length){
    const stepList = document.createElement('div');
    stepList.className = 'step-list';
    result.steps.forEach((s, idx)=>{
      const div = document.createElement('div');
      div.className = 'step-item';
      div.style.animationDelay = (idx*0.08)+'s';
      div.innerHTML = `Langkah ${idx+1}: <b>P${s.process+1}</b> dapat dipenuhi (Need ≤ Work = [${s.workBefore.join(', ')}]) → Work diperbarui menjadi [${s.workAfter.join(', ')}]`;
      stepList.appendChild(div);
    });
    container.appendChild(stepList);
  }
});

/* =========================================================
   DEADLOCK DETECTION (Resource Allocation Graph)
   ========================================================= */
let detHolds = [["R1"], []];
let detReqs = [[], ["R1"]];

function rebuildDetectForm(){
  const n = Math.max(2, Math.min(6, Number(document.getElementById('det-n').value) || 2));
  const m = Math.max(1, Math.min(5, Number(document.getElementById('det-m').value) || 2));
  document.getElementById('det-n').value = n;
  document.getElementById('det-m').value = m;

  while(detHolds.length < n) detHolds.push([]);
  while(detReqs.length < n) detReqs.push([]);
  detHolds = detHolds.slice(0,n);
  detReqs = detReqs.slice(0,n);

  const rowsWrap = document.getElementById('det-rows');
  rowsWrap.innerHTML = `<div class="graph-row"><div></div><label>Holds (dimiliki)</label><label>Requests (diminta)</label></div>`;
  for(let i=0;i<n;i++){
    const row = document.createElement('div');
    row.className = 'graph-row';
    row.innerHTML = `
      <div class="pid-label">P${i+1}</div>
      <input type="text" data-hold="${i}" value="${detHolds[i].join(',')}" placeholder="mis. R1,R2">
      <input type="text" data-req="${i}" value="${detReqs[i].join(',')}" placeholder="mis. R2">
    `;
    rowsWrap.appendChild(row);
  }
  rowsWrap.querySelectorAll('[data-hold]').forEach(inp=>{
    inp.addEventListener('input', e=>{
      const i = Number(e.target.dataset.hold);
      detHolds[i] = e.target.value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
    });
  });
  rowsWrap.querySelectorAll('[data-req]').forEach(inp=>{
    inp.addEventListener('input', e=>{
      const i = Number(e.target.dataset.req);
      detReqs[i] = e.target.value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
    });
  });
}
document.getElementById('det-rebuild').addEventListener('click', rebuildDetectForm);
rebuildDetectForm();

function detectCycle(nodes, edges){
  const adj = {};
  nodes.forEach(n=>adj[n]=[]);
  edges.forEach(e=>adj[e.from].push(e.to));
  const visited={}, inStack={}, path=[];
  let cycle=null;
  function dfs(u){
    visited[u]=true; inStack[u]=true; path.push(u);
    for(const v of adj[u]){
      if(cycle) return true;
      if(!visited[v]){
        if(dfs(v)) return true;
      } else if(inStack[v]){
        const idx = path.indexOf(v);
        cycle = path.slice(idx).concat(v);
        return true;
      }
    }
    inStack[u]=false; path.pop();
    return false;
  }
  for(const n of nodes){
    if(!visited[n]){ if(dfs(n)) break; }
  }
  return cycle;
}

function renderRAG(nodes, edges, cycle){
  const container = document.getElementById('rag-container');
  container.innerHTML = '';
  const cycleEdgeSet = new Set();
  const cycleNodeSet = new Set(cycle || []);
  if(cycle){
    for(let i=0;i<cycle.length-1;i++) cycleEdgeSet.add(cycle[i]+'->'+cycle[i+1]);
  }

  const W = 560, H = 360, cx = W/2, cy = H/2, radius = Math.min(W,H)/2 - 60;
  const nodePos = {};
  nodes.forEach((id, idx)=>{
    const angle = (idx / nodes.length) * Math.PI * 2 - Math.PI/2;
    nodePos[id] = { x: cx + radius*Math.cos(angle), y: cy + radius*Math.sin(angle) };
  });

  let svg = `<svg class="rag" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#5B6579"></path>
      </marker>
      <marker id="arrow-cycle" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#F0656B"></path>
      </marker>
    </defs>`;

  edges.forEach(e=>{
    const a = nodePos[e.from], b = nodePos[e.to];
    const isCycle = cycleEdgeSet.has(e.from+'->'+e.to);
    const nodeR = 22;
    const dx = b.x-a.x, dy = b.y-a.y;
    const dist = Math.sqrt(dx*dx+dy*dy) || 1;
    const startX = a.x + (dx/dist)*nodeR;
    const startY = a.y + (dy/dist)*nodeR;
    const endX = b.x - (dx/dist)*(nodeR+8);
    const endY = b.y - (dy/dist)*(nodeR+8);
    svg += `<line class="rag-edge${isCycle?' cycle':''}" x1="${startX.toFixed(1)}" y1="${startY.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${endY.toFixed(1)}" marker-end="url(#${isCycle?'arrow-cycle':'arrow'})"></line>`;
  });

  nodes.forEach(id=>{
    const pos = nodePos[id];
    const isProc = id.startsWith('P');
    const isCyc = cycleNodeSet.has(id);
    if(isProc){
      svg += `<circle class="rag-node-p${isCyc?' cycle':''}" cx="${pos.x}" cy="${pos.y}" r="22"></circle>`;
    } else {
      svg += `<rect class="rag-node-r${isCyc?' cycle':''}" x="${pos.x-20}" y="${pos.y-20}" width="40" height="40" rx="6"></rect>`;
    }
    svg += `<text class="rag-label" x="${pos.x}" y="${pos.y+1}">${id}</text>`;
  });

  svg += `</svg>`;
  container.innerHTML = svg;
}

document.getElementById('run-detect').addEventListener('click', ()=>{
  const n = detHolds.length;
  const resourceSet = new Set();
  detHolds.forEach(list=>list.forEach(r=>resourceSet.add(r)));
  detReqs.forEach(list=>list.forEach(r=>resourceSet.add(r)));
  const m = Number(document.getElementById('det-m').value) || 2;
  for(let j=1;j<=m;j++) resourceSet.add('R'+j);

  const processNodes = Array.from({length:n}, (_,i)=>'P'+(i+1));
  const resourceNodes = Array.from(resourceSet).sort();
  const nodes = [...processNodes, ...resourceNodes];

  const edges = [];
  detHolds.forEach((list,i)=>{
    list.forEach(r=>{ if(resourceSet.has(r)) edges.push({from:r, to:'P'+(i+1)}); });
  });
  detReqs.forEach((list,i)=>{
    list.forEach(r=>{ if(resourceSet.has(r)) edges.push({from:'P'+(i+1), to:r}); });
  });

  const cycle = detectCycle(nodes, edges);
  renderRAG(nodes, edges, cycle);

  const bannerWrap = document.getElementById('detect-banner');
  if(cycle){
    bannerWrap.innerHTML = `<div class="banner unsafe">
      <div>
        <span class="banner-title">Deadlock terdeteksi</span>
        <span class="banner-body">Ditemukan siklus: ${cycle.join(' → ')}. Proses yang terlibat saling menunggu resource yang dipegang satu sama lain.</span>
      </div>
    </div>`;
  } else {
    bannerWrap.innerHTML = `<div class="banner safe">
      <div>
        <span class="banner-title">Tidak ada deadlock</span>
        <span class="banner-body">Tidak ditemukan siklus pada resource-allocation graph. Semua permintaan resource berpotensi dapat dipenuhi.</span>
      </div>
    </div>`;
  }
});

/* ---- Initial renders ---- */
renderProcTable();