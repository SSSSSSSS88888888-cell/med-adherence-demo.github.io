/* ==== 超シンプル服薬カレンダー（ローカル保存） ==== */
const $ = (sel) => document.querySelector(sel);
const addForm = $('#addForm');
const planList = $('#planList');
const todayList = $('#todayList');
const historyDiv = $('#history');
const resetBtn = $('#resetBtn');
const notifyTestBtn = $('#notifyTest');
const snoozeAllBtn = $('#snoozeAll');
const exportPdfBtn = $('#exportPdf');
const pdfFrom = $('#pdfFrom');
const pdfTo = $('#pdfTo');
const installBtn = $('#installBtn');

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault(); deferredPrompt = e; installBtn.style.display='inline-block';
});
installBtn.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; installBtn.style.display='none';
});

/* ---- ストレージ ---- */
const load = (k, d) => JSON.parse(localStorage.getItem(k) || JSON.stringify(d));
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
let plans = load('plans', []);           // {id,name,time} 毎日繰り返し
let intakes = load('intakes', []);       // {id, date, name, time, takenAt?, snooze?}
const todayStr = () => new Date().toISOString().slice(0,10);

function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36);}

/* ---- 予定追加 ---- */
addForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const fd = new FormData(addForm);
  const name = (fd.get('name')||'').toString().trim();
  const time = fd.get('time');
  if(!name || !time) return;
  plans.push({id:uid(), name, time});
  save('plans', plans);
  addForm.reset();
  renderPlans(); scheduleToday(); renderToday(); renderHistory();
});

function removePlan(id){
  plans = plans.filter(p=>p.id!==id);
  save('plans', plans);
  renderPlans(); scheduleToday(); renderToday(); renderHistory();
}

/* ---- 今日の予定をスケジュール（通知＆項目作成） ---- */
async function requestNotif(){
  if(!('Notification' in window)) return false;
  if(Notification.permission === 'granted') return true;
  if(Notification.permission !== 'denied'){
    const res = await Notification.requestPermission();
    return res==='granted';
  }
  return false;
}

function mkIntake(date, name, time){
  const id = `${date}_${name}_${time}`;
  if(!intakes.find(x=>x.id===id)){
    intakes.push({id,date:name?date:todayStr(), name, time, date, snooze:0});
  }
}

function scheduleToday(){
  const d = todayStr();
  plans.forEach(p=>{
    mkIntake(d, p.name, p.time);
    // 簡易通知（タブが開いている間のみ）
    const [hh,mm]=p.time.split(':').map(Number);
    const target = new Date(); target.setHours(hh,mm,0,0);
    const now = new Date();
    let delay = target - now;
    if(delay < 0) delay = 0; // もう過ぎてたら即時（デモ）
    setTimeout(()=>showPlannedNotif(p.name, p.time), delay);
  });
  save('intakes', intakes);
}

async function showPlannedNotif(name,time){
  const ok = await requestNotif();
  const body = `${time} に ${name} の服薬予定です`;
  if(ok){ new Notification('服薬リマインド', {body}); }
  else { toast(body); }
  renderToday();
}

function toast(msg){
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style,{
    position:'fixed', left:'50%', transform:'translateX(-50%)',
    bottom:'16px', background:'#0f766e', color:'#fff', padding:'10px 14px',
    borderRadius:'12px', zIndex:9999
  });
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2500);
}

/* ---- UI描画 ---- */
function renderPlans(){
  planList.innerHTML = '';
  if(plans.length===0){ planList.innerHTML = '<li class="muted">未登録です</li>'; return;}
  plans.forEach(p=>{
    const li = document.createElement('li'); li.className='item';
    li.innerHTML = `<span><strong>${escapeHTML(p.name)}</strong> / <span class="badge">${p.time}</span></span>
      <span class="row"><button class="ghost" aria-label="削除">削除</button></span>`;
    li.querySelector('button').onclick = ()=>removePlan(p.id);
    planList.appendChild(li);
  });
}

function renderToday(){
  todayList.innerHTML = '';
  const d = todayStr();
  const todays = intakes.filter(x=>x.date===d);
  if(todays.length===0){ todayList.innerHTML='<li class="muted">本日の予定はありません</li>'; return;}
  todays.sort((a,b)=>a.time.localeCompare(b.time));
  todays.forEach(x=>{
    const done = !!x.takenAt;
    const li = document.createElement('li'); li.className='item';
    li.innerHTML = `
      <span><strong>${escapeHTML(x.name)}</strong> / <span class="badge">${x.time}</span></span>
      <span class="row">
        ${done ? `<span class="badge">記録済 ${fmtTime(x.takenAt)}</span>` : `<button class="primary" aria-label="服薬した">服薬した</button>`}
        <button class="secondary" aria-label="5分スヌーズ">5分後</button>
      </span>`;
    if(!done){
      li.querySelector('.primary').onclick = ()=>markTaken(x.id);
    }
    li.querySelector('.secondary').onclick = ()=>snooze(x.id);
    todayList.appendChild(li);
  });
}

function renderHistory(){
  historyDiv.innerHTML = '';
  const days = 7;
  for(let i=0;i<days;i++){
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = d.toISOString().slice(0,10);
    const row = document.createElement('div'); row.className='hist-row';
    const label = document.createElement('div');
    label.textContent = ds;
    const body = document.createElement('div');
    const items = intakes.filter(x=>x.date===ds).sort((a,b)=>a.time.localeCompare(b.time));
    if(items.length===0){ body.innerHTML = '<span class="muted">—</span>'; }
    else{
      items.forEach(it=>{
        const span = document.createElement('span');
        span.className = 'dot '+(it.takenAt?'ok':'miss');
        span.title = `${it.time} ${it.name} ${it.takenAt?'OK':'未'}`;
        body.appendChild(span);
      });
    }
    row.appendChild(label); row.appendChild(body);
    historyDiv.appendChild(row);
  }
}

/* ---- 服薬記録／スヌーズ ---- */
function markTaken(id){
  const it = intakes.find(x=>x.id===id); if(!it) return;
  it.takenAt = new Date().toISOString();
  save('intakes', intakes);
  renderToday(); renderHistory();
  toast('記録しました');
}
function snooze(id){
  const it = intakes.find(x=>x.id===id); if(!it) return;
  it.snooze = (it.snooze||0)+1; save('intakes', intakes);
  setTimeout(()=>showPlannedNotif(it.name, it.time), 5*60*1000);
  toast('5分後に再通知します');
}

/* ---- PDF出力 ---- */
function calcMAR(from,to){
  const inRange = intakes.filter(x=>x.date>=from && x.date<=to);
  const planned = inRange.length||1;
  const taken = inRange.filter(x=>x.takenAt).length;
  return Math.round((taken/planned)*100);
}
function exportPDF(){
  const { jsPDF } = window.jspdf;
  const from = pdfFrom.value || todayStr();
  const to = pdfTo.value || todayStr();
  const doc = new jsPDF({unit:'pt', format:'a4'});
  const margin = 40, line = 18;

  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('服薬記録レポート', margin, 50);
  doc.setFontSize(11); doc.setFont('helvetica','normal');
  doc.text(`期間: ${from} 〜 ${to}`, margin, 70);
  doc.text(`発行: ${new Date().toLocaleString()}`, margin, 70+line);

  const mar = calcMAR(from,to);
  doc.text(`総予定数: ${intakes.filter(x=>x.date>=from && x.date<=to).length} / 遵守率(MAR): ${mar}%`, margin, 70+line*2);

  // 日別×時間帯の簡易表
  const rows = [['日付','時刻','薬名','状態']];
  intakes
    .filter(x=>x.date>=from && x.date<=to)
    .sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time))
    .forEach(x=>{
      rows.push([x.date, x.time, x.name, x.takenAt?'○':'×']);
    });

  // 簡易テーブル描画
  let y = 70+line*4;
  rows.forEach((r,i)=>{
    const bold = i===0;
    if(bold) doc.setFont('helvetica','bold');
    else doc.setFont('helvetica','normal');
    const txt = r.join('   ');
    doc.text(txt, margin, y);
    y += line;
    if(y>760){ doc.addPage(); y=60; }
  });

  // 署名欄
  y += line;
  doc.setFont('helvetica','normal');
  doc.text('医師／薬剤師 署名：_________________________', margin, Math.min(y, 800));

  doc.save(`med-${from}-${to}.pdf`);
}

exportPdfBtn.addEventListener('click', exportPDF);

/* ---- 雑多 ---- */
notifyTestBtn.addEventListener('click', ()=> showPlannedNotif('テスト', new Date().toTimeString().slice(0,5)));
snoozeAllBtn.addEventListener('click', ()=>{
  intakes.filter(x=>x.date===todayStr() && !x.takenAt).forEach(x=>snooze(x.id));
});
resetBtn.addEventListener('click', ()=>{
  if(confirm('全データを削除します。よろしいですか？')){
    localStorage.removeItem('plans'); localStorage.removeItem('intakes');
    plans=[]; intakes=[]; renderPlans(); renderToday(); renderHistory();
  }
});

function fmtTime(iso){ return new Date(iso).toTimeString().slice(0,5); }
function escapeHTML(s){ return s.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* 初期化 */
function initDates(){
  const t = new Date().toISOString().slice(0,10);
  pdfFrom.value = t; pdfTo.value = t;
}
function boot(){
  renderPlans(); scheduleToday(); renderToday(); renderHistory(); initDates();
}
boot();
