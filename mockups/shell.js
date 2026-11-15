const I={
home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
check:'<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m8 12 3 3 5-6"/>',
school:'<path d="M2 9 12 4l10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v5"/>',
timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
chart:'<path d="M5 20V11M11 20V4M17 20v-6M3 20h18"/>',
note:'<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9 12h6M9 16h6M14 3v5h5"/>',
settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
camera:'<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
sparkle:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
plus:'<path d="M12 5v14M5 12h14"/>',right:'<path d="m9 6 6 6-6 6"/>',left:'<path d="m15 6-6 6 6 6"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
flame:'<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
moon:'<path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z"/>',
bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
send:'<path d="M12 19V5M6 11l6-6 6 6"/>',undo:'<path d="M4 9h10a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4"/>',
play:'<path d="M7 4v16l13-8z"/>',pause:'<path d="M8 5v14M16 5v14"/>',
music:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
x:'<path d="M6 6l12 12M18 6 6 18"/>',tick:'<path d="m5 12 5 5 9-10"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
book:'<path d="M5 4h13a1 1 0 0 1 1 1v15H6.5A1.5 1.5 0 0 1 5 18.5zM5 18.5A1.5 1.5 0 0 1 6.5 17H19"/>',
user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
skip:'<path d="M6 5l9 7-9 7zM18 5v14"/>',lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
tv:'<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>',heart:'<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.500-7 10-7 10z"/>',
drop:'<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/>'};
function ic(n,s){s=s||20;return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(I[n]||'')+'</svg>'}
const B=document.body,pg=B.dataset.page;
if(!B.classList.contains('bare')){
const N=[['dashboard','home','Dashboard'],['calendar','calendar','Calendar'],['tasks','check','Tasks'],['school','school','School'],['focus','timer','Focus'],['habits','target','Habits'],['insights','chart','Insights'],['notes','note','Notes']];
const s=document.createElement('aside');s.className='side';
s.innerHTML='<div class="logo"><b>'+ic('tick',18)+'</b>DayBoard</div>'+N.map(n=>'<div class="nav'+(n[0]==pg?' on':'')+'">'+ic(n[1])+n[2]+'</div>').join('')+
'<div class="nav'+(pg=='assistant'?' on':'')+'" style="margin-top:10px">'+ic('sparkle')+'Assistant</div><div class="sp"></div><div class="nav'+(pg=='settings'?' on':'')+'">'+ic('settings')+'Settings</div>'+
'<div class="me"><div class="av">AR</div><div><div class="b sm">Alex Rivera</div><div class="mu3" style="font-size:12px">Sophomore</div></div></div>';
B.prepend(s);
const m=document.querySelector('main'),t=document.createElement('div');t.className='top';
t.innerHTML='<div><h1>'+B.dataset.title+'</h1><div class="mu3 sm">'+(B.dataset.sub||'')+'</div></div><div class="add">'+ic('plus',18)+'<span>Add anything… “Chem exam Friday 9am”</span><div class="ib">'+ic('mic',17)+'</div><div class="ib">'+ic('camera',17)+'</div></div><div class="btn p">'+ic('sparkle',17)+'Ask</div>';
m.prepend(t);}
document.querySelectorAll('i[data-i]').forEach(e=>{e.outerHTML=ic(e.dataset.i,+e.dataset.s||20)});
