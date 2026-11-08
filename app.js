'use strict';
const trip=window.TRIP;
const $=s=>document.querySelector(s);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mapURL=place=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(place);
const storage={get(key,fallback=''){try{return localStorage.getItem(key)??fallback}catch{return fallback}},set(key,value){try{localStorage.setItem(key,value);return true}catch{return false}}};
// Store item IDs only, preserving updated wording when a new version is uploaded.
trip.days.forEach((d,di)=>d.items.forEach((item,i)=>{item.id ||= `d${di+1}-s${i+1}`;}));
const itemCatalog=new Map(trip.days.flatMap(d=>d.items.map(i=>[i.id,i])));
function applyOrder(order){
 if(!Array.isArray(order)||order.length!==trip.days.length||order.some(d=>!Array.isArray(d)))return false;
 const ids=order.flat();if(ids.length!==itemCatalog.size||new Set(ids).size!==itemCatalog.size||ids.some(id=>!itemCatalog.has(id)))return false;
 order.forEach((ids,i)=>{trip.days[i].items=ids.map(id=>itemCatalog.get(id));});return true;
}
try{applyOrder(JSON.parse(storage.get('shanghai-order-v2','null')));}catch{}
function moveStop(index,step){
 const items=trip.days[selected].items,target=index+step;
 if(!Number.isInteger(index)||![1,-1].includes(step)||!items[index]||target<0||target>=items.length)return false;
 [items[index],items[target]]=[items[target],items[index]];
 const ok=storage.set('shanghai-order-v2',JSON.stringify(trip.days.map(d=>d.items.map(i=>i.id))));
 renderDay();renderPrint();
 $('#schedule-state').textContent=ok?'已儲存新順序，原標示時間不變。僅儲存在這台裝置。':'已調整順序，但瀏覽器無法儲存，關閉頁面後可能恢復。';
 return true;
}
let selected=0,weather=null,weatherState='loading',weatherUpdated='',requestId=0;
const dateInShanghai=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function forecastStatus(day,today=dateInShanghai()){
 const diff=Math.round((Date.parse(day.date+'T00:00:00+08:00')-Date.parse(today+'T00:00:00+08:00'))/86400000);
 return diff<0?'past':diff>15?'future':'available';
}
function weatherDescription(code){
 if(code===0)return ['☀️','晴朗'];if([1,2].includes(code))return ['🌤️','晴時多雲'];if(code===3)return ['☁️','多雲'];if([45,48].includes(code))return ['🌫️','有霧'];if([51,53,55,56,57].includes(code))return ['🌦️','毛毛雨'];if([61,63,65,66,67,80,81,82].includes(code))return ['🌧️','有雨'];if([71,73,75,77,85,86].includes(code))return ['🌨️','有雪'];if([95,96,99].includes(code))return ['⛈️','雷雨'];return ['🌡️','天氣資料'];
}
function weatherMarkup(day){
 const state=forecastStatus(day),head=`<div class="weather-head"><span>${escapeHTML(day.city)} · ${day.date.slice(5).replace('-','/')} 天氣</span><button class="quiet" id="refresh-weather" type="button">更新 ↻</button></div>`;
 if(state==='future')return head+'<div class="weather-main"><span class="weather-icon">☁</span><p class="weather-status">尚未進入預報範圍</p></div><p>最長約16天預報；接近出發時，開啟網頁即可更新。現在不顯示推測氣溫。</p>';
 if(state==='past')return head+'<p class="weather-status">這一天已經走過了</p><p>旅程日期已過，本頁不將目前預報當作歷史天氣。</p>';
 if(weatherState==='loading')return head+'<p class="weather-status" role="status">正在取得當日預報…</p>';
 if(weatherState==='error')return head+'<p class="weather-status">暫時無法取得天氣</p><p>請確認網路後按「更新」重試；行程仍可正常查看。</p>';
 const daily=weather?.[selected]?.daily;const i=daily?.time?.indexOf(day.date)??-1;
 if(i<0)return head+'<p class="weather-status">當日預報尚未提供</p><p>稍後重新整理，或接近出發再查看。</p>';
 const [icon,label]=weatherDescription(daily.weather_code[i]);const num=v=>Number.isFinite(v)?Math.round(v):'—';
 return head+`<div class="weather-main"><span class="weather-icon" aria-hidden="true">${icon}</span><div><strong>${num(daily.temperature_2m_min[i])}° — ${num(daily.temperature_2m_max[i])}°</strong><div>${label}</div></div></div><p>降雨機率 ${num(daily.precipitation_probability_max[i])}% · 最大風速 ${num(daily.wind_speed_10m_max[i])} km/h</p><p>查詢時間 ${escapeHTML(weatherUpdated)} · Open-Meteo</p>`;
}
function stops(day,controls=false){return `<div class="timeline">${day.items.length?day.items.map((item,index)=>`<article class="stop"><div class="stop-time">${escapeHTML(item.time)}</div><div class="stop-content"><h4>${escapeHTML(item.title)}</h4><p>${escapeHTML(item.note)}</p><div class="stop-bottom"><span class="tag">${escapeHTML(item.type)}</span>${item.place?`<a class="text-link" href="${mapURL(item.place)}" target="_blank" rel="noopener noreferrer">地圖搜尋 ↗</a>`:''}</div></div>${controls?`<div class="stop-arrows"><button type="button" data-step="-1" data-index="${index}" aria-label="上移：${escapeHTML(item.title)}" title="上移" ${index===0?'disabled':''}>↑</button><button type="button" data-step="1" data-index="${index}" aria-label="下移：${escapeHTML(item.title)}" title="下移" ${index===day.items.length-1?'disabled':''}>↓</button></div>`:''}</article>`).join(''):'<p class="empty-day">這天目前沒有行程。</p>'}</div>`;}
function renderDay(){
 const day=trip.days[selected];
 document.querySelectorAll('.day-tab').forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===selected));tab.tabIndex=i===selected?0:-1;});
 $('#day-panel').setAttribute('aria-labelledby','tab-'+selected);
 $('#day-panel').innerHTML=`<div class="day-top"><div class="day-title"><p class="eyebrow">DAY ${String(selected+1).padStart(2,'0')} / ${escapeHTML(day.tag)}</p><h3>${escapeHTML(day.title)}</h3><p>${escapeHTML(day.summary)}</p></div><aside class="weather" aria-label="當日天氣" aria-live="polite">${weatherMarkup(day)}</aside></div>${stops(day,true)}<div class="note-box"><label class="note-label" for="day-note">這一天的小備註 <span>只存在本裝置，不會同步到家人手機</span></label><textarea id="day-note" placeholder="例如：訂位時間、想吃的菜、還想去的地方…"></textarea><p class="note-hint" id="note-state">備註只存在這台裝置。</p></div>`;
 const note=$('#day-note');note.value=storage.get('shanghai-note-'+day.date);note.addEventListener('input',()=>{const ok=storage.set('shanghai-note-'+day.date,note.value);$('#note-state').textContent=ok?'備註已儲存在本裝置。':'瀏覽器無法儲存，離開前請自行複製備註。';});
 $('#refresh-weather').addEventListener('click',fetchWeather);
 $('#day-panel').querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>{
  const index=Number(button.dataset.index),step=Number(button.dataset.step);
  if(!moveStop(index,step))return;
  const panel=$('#day-panel');
  const follow=panel.querySelector(`[data-index="${index+step}"][data-step="${step}"]:not(:disabled)`)||panel.querySelector(`[data-index="${index+step}"]:not(:disabled)`);
  follow?.focus({preventScroll:true});
 }));
}
async function fetchWeather(){
 const token=++requestId;weatherState='loading';renderDay();
 if(!trip.days.some(d=>forecastStatus(d)==='available')){weatherState='idle';return;}
 const url=new URL('https://api.open-meteo.com/v1/forecast');url.search=new URLSearchParams({latitude:trip.days.map(d=>d.lat).join(','),longitude:trip.days.map(d=>d.lon).join(','),daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',timezone:'Asia/Shanghai',forecast_days:'16'});
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);const payload=await response.json();if(!Array.isArray(payload)||payload.length!==trip.days.length||payload.some(p=>!Array.isArray(p.daily?.time)))throw Error('Invalid weather response');if(token!==requestId)return;weather=payload;weatherState='ready';weatherUpdated=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());}
 catch(error){if(token===requestId)weatherState='error';}
 finally{clearTimeout(timer);if(token===requestId)renderDay();}
}
$('#hotel-name').textContent=trip.hotel.name;$('#hotel-address').textContent=trip.hotel.address;$('#hotel-map').href=mapURL(trip.hotel.name+' '+trip.hotel.address);
$('#day-tabs').innerHTML=trip.days.map((d,i)=>`<button class="day-tab" id="tab-${i}" role="tab" aria-controls="day-panel" aria-selected="${i===0}" tabindex="${i===0?0:-1}" type="button"><small>DAY ${String(i+1).padStart(2,'0')}</small><strong>${d.date.slice(5).replace('-','/')}</strong><span>星期${d.week}</span></button>`).join('');
document.querySelectorAll('.day-tab').forEach((tab,i)=>{tab.addEventListener('click',()=>{selected=i;renderDay();});tab.addEventListener('keydown',event=>{let next=i;if(event.key==='ArrowRight')next=(i+1)%6;else if(event.key==='ArrowLeft')next=(i+5)%6;else if(event.key==='Home')next=0;else if(event.key==='End')next=5;else return;event.preventDefault();selected=next;renderDay();$('#tab-'+next).focus();});});
$('#flight-cards').innerHTML=trip.flights.map((f,i)=>`<article class="flight"><div class="flight-top"><span>${i===0?'去程 · 抵達浦東':'回程 · 從虹橋出發'}</span><span>${escapeHTML(f.date)}</span></div><div class="flight-body"><p class="flight-airline">${escapeHTML(f.code)} · ${escapeHTML(f.airline)}</p><div class="flight-route"><div class="airport"><strong>${f.depart}</strong><b>${escapeHTML(f.from)}</b><small>${escapeHTML(f.fromDetail)}</small></div><div class="flight-arrow">⟶<small>${escapeHTML(f.duration)}</small></div><div class="airport"><strong>${f.arrive}</strong><b>${escapeHTML(f.to)}</b><small>${escapeHTML(f.toDetail)}</small></div></div></div></article>`).join('');
const packing=['證件','手機、支付與網路','保暖外套','雨具','好走的鞋','個人常備用品'];
$('#packing').innerHTML=packing.map((label,i)=>`<label><input type="checkbox" data-pack="${i}" ${storage.get('shanghai-pack-'+i)==='1'?'checked':''}>${label}</label>`).join('');
document.querySelectorAll('[data-pack]').forEach(el=>el.addEventListener('change',()=>storage.set('shanghai-pack-'+el.dataset.pack,el.checked?'1':'0')));
const printDays=document.createElement('div');printDays.className='print-days';$('#journey').append(printDays);
function renderPrint(){printDays.innerHTML=trip.days.map((d,i)=>`<section class="print-day"><div class="day-title"><p>DAY ${i+1} · ${d.date} 星期${d.week}</p><h3>${escapeHTML(d.title)}</h3></div>${stops(d)}</section>`).join('');}
renderPrint();
$('#print').addEventListener('click',()=>window.print());
renderDay();fetchWeather();
