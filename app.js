(async () => {
'use strict';

const DATA = window.BUNDLED_DATA || {legacyLists:[],lexicon:[],sortingPuzzles:[],imageStories:[],defaultSyllables:[]};
const STORAGE_KEY = 'wortzeit_therapy_state_v1';
const AUDIO_DB = 'wortzeit_audio_v1';
const STATE_DB = 'wortzeit_state_v1';
const STATE_STORE = 'app';
const STATE_KEY = 'state';
const OFFLINE_CACHE = 'wortzeit-v0.8.3';
const OFFLINE_SHELL = ['./','./index.html','./app.html','./behandler.html','./patient.html','./styles.css?v=0.8.3','./data.js?v=0.8.3','./app.js?v=0.8.3','./manifest-patient.webmanifest','./manifest-therapist.webmanifest'];
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const cloneData = obj => typeof structuredClone==='function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
const uid = (prefix='id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const shuffle = arr => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const GAME_ROUTES = ['letters','memory','sorting','story','wheel','syllables','choiceStory','semantic'];
const LIST_GAME_ROUTES = ['letters','memory','wheel','syllables','choiceStory','semantic'];
const LIST_GAME_LABELS = {session:'Wortanzeige',letters:'Buchstaben',memory:'Memory',wheel:'Wortwalze',syllables:'Silben',choiceStory:'Geschichte bauen',semantic:'Wortnetz'};

const I18N = {
  de:{brandSubtitle:'Therapie',currentList:'Aktuelle Liste',patientMode:'Patientenmodus',navigation:'Navigation',chooseArea:'Bereich wählen',home:'Start',session:'Sitzung',lists:'Listen',games:'Spiele',patients:'Patienten',plans:'Therapiepläne',settings:'Einstellungen',localOnly:'Lokal gespeichert',localOnlyText:'Diese Version sendet keine Patienten- oder Listendaten an einen Server.'},
  en:{brandSubtitle:'Therapy',currentList:'Current list',patientMode:'Patient mode',navigation:'Navigation',chooseArea:'Choose area',home:'Home',session:'Session',lists:'Lists',games:'Games',patients:'Patients',plans:'Therapy plans',settings:'Settings',localOnly:'Stored locally',localOnlyText:'This version does not send patient or list data to a server.'}
};

const STORY_TITLE_CATALOG = [
  'Ein Geizhals','Gewohnheitstiere','Ein Plätzchen in der Sonne','Expedition ins Schilf','Der gute Fang','Ich schenk dir was','Ein erfindungsreicher Bettler','Fehlstart','Platz für alle','Der Mai ist gekommen','Herz mit Biss','1:0 für den Kaktus','Böses Erwachen','Spielfreude','Ferienerinnerung','Ein Leckerbissen','Dauergespräch','Achtung, Glatteis!','Gemeinsamer Weg','Zweimal Himbeereis','Ein wahrer Sportsmann','Prosit Neujahr!','Fotosafari','Hüpfspiel mit Tücke','Nächstenliebe','Der Bumerang','Vier Glückliche','Gute Nacht!','Feierabend','Yo-Yo nach Seemannsart','Nestbau – leicht gemacht','Ein unzuverlässiger Zeitungsträger','Kartenglück – Kartenpech','Backen macht Freude','Der Störenfried','Kaninchenfutter?','Mit vereinten Kräften','Freudige Begrüßung','Knalleffekt','Undank ist der Welt Lohn'
];

const defaultList = {
  id:'builtin_default_1000', title:'Standardwörter · 1000', category:'Integriert', kind:'list', bundled:true,
  items: DATA.lexicon.slice(0,1000).map((x,i)=>({id:`default_${i}`,text:x.word,syllables:x.syllables}))
};

const DEFAULT_STATE = {
  version:4,
  currentListId:null,
  userLists:[], patients:[], plans:[], storyTitleOverrides:{}, activeListIds:[], recentListIds:[],
  importReviewBatches:[], lastImportBatchId:null, listFolderOpen:{}, reviewMigrationVersion:0, duplicateIgnoreGroups:[],
  settings:{lang:'de',theme:'calm',brightness:55,sessionFontScale:50,itemsPerScreen:1,order:'random',unique:true,endless:false,interval:3,bpm:60,beats:4,instantAudio:false,reducedMotion:false,onboardingSeen:false},
  stats:{sortScore:0,storyScore:0,letterScore:0}
};

let state = await loadState();
normalizeAllUserLists(state);
migrateImportReviewState(state);
saveState();
let route = 'home';
let session = null;
let game = {};
let patientMode = new URLSearchParams(location.search).get('mode') === 'patient';
let importedPatientPackage = null;
let activePlanRun = null;
let toastTimer = null;
let navDepth = 0;
let navMaxDepth = 0;

function stateDb(){
  return new Promise((resolve,reject)=>{const req=indexedDB.open(STATE_DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STATE_STORE))req.result.createObjectStore(STATE_STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
async function idbStateGet(){const db=await stateDb();return await new Promise((res,rej)=>{const tx=db.transaction(STATE_STORE,'readonly'),r=tx.objectStore(STATE_STORE).get(STATE_KEY);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);});}
async function idbStateSet(value){const db=await stateDb();return await new Promise((res,rej)=>{const tx=db.transaction(STATE_STORE,'readwrite');tx.objectStore(STATE_STORE).put(value,STATE_KEY);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function idbStateClear(){try{const db=await stateDb();await new Promise((res,rej)=>{const tx=db.transaction(STATE_STORE,'readwrite');tx.objectStore(STATE_STORE).clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}catch{}}
function normalizeLoadedState(parsed){
  parsed=parsed&&typeof parsed==='object'?parsed:{};
  return {
    ...cloneData(DEFAULT_STATE), ...parsed,
    settings:{...DEFAULT_STATE.settings,...(parsed.settings||{})},
    stats:{...DEFAULT_STATE.stats,...(parsed.stats||{})},
    userLists:Array.isArray(parsed.userLists)?parsed.userLists:[],
    patients:Array.isArray(parsed.patients)?parsed.patients:[],
    plans:Array.isArray(parsed.plans)?parsed.plans:[],
    storyTitleOverrides:parsed.storyTitleOverrides && typeof parsed.storyTitleOverrides==='object'?parsed.storyTitleOverrides:{},
    activeListIds:Array.isArray(parsed.activeListIds)&&parsed.activeListIds.length?parsed.activeListIds:[parsed.currentListId||defaultList.id],
    recentListIds:Array.isArray(parsed.recentListIds)?parsed.recentListIds:[],
    importReviewBatches:Array.isArray(parsed.importReviewBatches)?parsed.importReviewBatches:[],
    lastImportBatchId:parsed.lastImportBatchId||null,
    listFolderOpen:parsed.listFolderOpen&&typeof parsed.listFolderOpen==='object'?parsed.listFolderOpen:{},
    reviewMigrationVersion:Number(parsed.reviewMigrationVersion)||0,
    duplicateIgnoreGroups:Array.isArray(parsed.duplicateIgnoreGroups)?parsed.duplicateIgnoreGroups:[]
  };
}
async function loadState(){
  let parsed=null;
  if(typeof indexedDB!=='undefined'){
    try{parsed=await idbStateGet();}catch(e){console.warn('IndexedDB state load failed',e);}
  }
  if(!parsed){
    try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)parsed=JSON.parse(raw);}catch(e){console.warn('Legacy state load failed',e);}
    if(parsed&&typeof indexedDB!=='undefined'){try{await idbStateSet(parsed);}catch(e){console.warn('State migration to IndexedDB failed',e);}}
  }
  return normalizeLoadedState(parsed);
}
let stateSaveTimer=null,stateSaveChain=Promise.resolve(),pendingStateSnapshot=null;
function writeLegacyFallback(snapshot){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot));return true;}catch(e){console.warn('localStorage fallback failed',e);return false;}
}
function persistStateSnapshot(snapshot){
  if(typeof indexedDB==='undefined'){writeLegacyFallback(snapshot);return Promise.resolve();}
  return idbStateSet(snapshot).then(()=>{
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:snapshot.version,settings:snapshot.settings,currentListId:snapshot.currentListId,activeListIds:snapshot.activeListIds,recentListIds:snapshot.recentListIds}));}catch{}
  }).catch(e=>{console.warn('IndexedDB state save failed',e);writeLegacyFallback(snapshot);});
}
function saveState(){
  pendingStateSnapshot=cloneData(state);
  clearTimeout(stateSaveTimer);
  stateSaveTimer=setTimeout(()=>{const snap=pendingStateSnapshot;pendingStateSnapshot=null;stateSaveChain=stateSaveChain.then(()=>persistStateSnapshot(snap));},40);
}
async function flushStateSave(){
  clearTimeout(stateSaveTimer);
  if(pendingStateSnapshot){const snap=pendingStateSnapshot;pendingStateSnapshot=null;stateSaveChain=stateSaveChain.then(()=>persistStateSnapshot(snap));}
  await stateSaveChain;
}
function listFolders(L){
  const raw=Array.isArray(L?.folders)?L.folders:[L?.category];
  const out=[...new Set(raw.map(x=>String(x||'').trim()).filter(Boolean))];
  return out.length?out:['Eigene Listen'];
}
function normalizeListStorage(L){
  if(!L||typeof L!=='object')return L;
  L.folders=listFolders(L);L.category=L.folders[0];
  if(typeof L.entrySeparator!=='string')L.entrySeparator='';
  if(!L.origin)L.origin=L.sourcePath?'imported':'created';
  if(!Array.isArray(L.aliases))L.aliases=[];
  return L;
}
function normalizeAllUserLists(s){(s.userLists||[]).forEach(normalizeListStorage);}
function setListFolders(L,folders){L.folders=[...new Set((folders||[]).map(x=>String(x||'').trim()).filter(Boolean))];if(!L.folders.length)L.folders=['Eigene Listen'];L.category=L.folders[0];}
function knownFolders(){return [...new Set(selectableLists().flatMap(listFolders))].sort((a,b)=>a.localeCompare(b,'de',{sensitivity:'base',numeric:true}));}
function addListToFolder(L,folder){folder=String(folder||'').trim();if(!L||!folder)return false;setListFolders(L,[...listFolders(L),folder]);return true;}
function removeFolderAssignment(folderSet,folder){
  folder=String(folder||'').trim();
  if(!folderSet?.has(folder))return {changed:false};
  folderSet.delete(folder);
  if(folderSet.size)return {changed:true};
  const fallback='Unsortiert';
  folderSet.add(fallback);
  return {changed:true,fallback};
}
function migrateImportReviewState(s){
  let changed=false;
  if(!Array.isArray(s.importReviewBatches)){s.importReviewBatches=[];changed=true;}
  if(!s.listFolderOpen||typeof s.listFolderOpen!=='object'||Array.isArray(s.listFolderOpen)){s.listFolderOpen={};changed=true;}
  if(!Number.isFinite(+s.reviewMigrationVersion))s.reviewMigrationVersion=0;
  if(+s.reviewMigrationVersion<1){
    const candidates=(s.userLists||[]).filter(L=>!L.review&&(L.sourcePath||/^Import/i.test(L.category||'')||String(L.category||'').includes('/')));
    if(candidates.length){
      const batchId='import_existing_v073';
      const now=new Date().toISOString();
      candidates.forEach(L=>{L.review={status:'new',batchId,importedAt:null,confidence:'unknown',separator:'unbekannt',warnings:['Vor v0.7.3 importiert – bitte einmal kurz prüfen.']};});
      if(!s.importReviewBatches.some(b=>b.id===batchId))s.importReviewBatches.unshift({id:batchId,createdAt:now,title:'Bereits importierte Listen',listIds:candidates.map(L=>L.id),failed:[],migrated:true});
      s.lastImportBatchId=batchId;changed=true;
    }
    s.reviewMigrationVersion=1;changed=true;
  }
  (s.userLists||[]).forEach(L=>{if(L.review&& !['new','warning','checked'].includes(L.review.status)){L.review.status='new';changed=true;}});
  return changed;
}
function listNeedsReview(L){return !!L?.review&&['new','warning'].includes(L.review.status);}
function listReviewStatusLabel(L){return L?.review?.status==='warning'?'PRÜFEN':L?.review?.status==='new'?'NEU':L?.review?.status==='checked'?'GEPRÜFT':'';}
function listKindLabel(L){return L?.kind==='pair'?'A/B':L?.kind==='choiceStory'?'Geschichte':'Liste';}
function confidenceLabel(v){return v==='high'?'Sicher':v==='medium'?'Wahrscheinlich':v==='low'?'Unklar':'Altimport';}
function markListReviewed(L,checked=true){if(!L?.review)return;L.review.status=checked?'checked':(L.review.warnings?.length?'warning':'new');L.review.checkedAt=checked?new Date().toISOString():null;saveState();}
function allLists(){ return [defaultList, ...DATA.legacyLists, ...state.userLists]; }
function selectableLists(){ return [...DATA.legacyLists, ...state.userLists]; }
function explicitListIds(){ return (state.activeListIds||[]).filter(id=>id!==defaultList.id && selectableLists().some(L=>L.id===id)); }
function hasExplicitMaterial(){ return explicitListIds().length>0; }
function currentList(){ return selectableLists().find(x=>x.id===state.currentListId) || selectableLists().find(x=>explicitListIds().includes(x.id)) || defaultList; }
function rememberList(id){if(id===defaultList.id)return;state.recentListIds=[id,...(state.recentListIds||[]).filter(x=>x!==id)].filter(x=>selectableLists().some(L=>L.id===x)).slice(0,8);}
function activeLists(){const ids=explicitListIds();return ids.length?ids.map(id=>selectableLists().find(L=>L.id===id)).filter(Boolean):[defaultList];}
function activeMaterialKey(){const ids=explicitListIds();return ids.length?ids.slice().sort().join('|'):'__default_fallback__';}
function activeMaterialTitle(){const ids=explicitListIds();if(!ids.length)return 'Keine Liste gewählt';const ls=ids.map(id=>selectableLists().find(L=>L.id===id)).filter(Boolean);return ls.length===1?ls[0].title:`${ls.length} Listen gemischt`; }
function activeItems(){const seen=new Set(),out=[];for(const L of activeLists()){for(const it of L.items||[]){const text=String(it.text||'').trim();if(!text)continue;const key=text.toLocaleLowerCase('de');if(seen.has(key))continue;seen.add(key);out.push({...it,sourceListId:L.id,sourceListTitle:L.title});}}return out;}
function activePairs(){const out=[];for(const L of activeLists())for(const pair of L.pairs||[])out.push({...pair,sourceListId:L.id});return out;}
function setCurrentList(id){ if(selectableLists().some(x=>x.id===id)){ state.currentListId=id; state.activeListIds=[id]; rememberList(id); saveState(); session=null; game={}; updateHeader(); toast(`Liste gewählt: ${currentList().title}`); } }
function clearCurrentLists(){state.currentListId=null;state.activeListIds=[];saveState();session=null;game={};updateHeader();}
function toggleActiveList(id){if(!selectableLists().some(x=>x.id===id))return;const ids=new Set(explicitListIds());if(ids.has(id)){ids.delete(id);}else{ids.add(id);state.currentListId=id;rememberList(id);}state.activeListIds=[...ids];if(!ids.size)state.currentListId=null;saveState();session=null;game={};updateHeader();}
function updateHeader(){ const el=$('#currentListTitle');if(el)el.textContent=activeMaterialTitle(); applyI18n(); applyTheme(); }
function t(key){ return (I18N[state.settings.lang]||I18N.de)[key] || I18N.de[key] || key; }
function applyI18n(){ $$('[data-i18n]').forEach(el=>{ const v=t(el.dataset.i18n); if(v) el.textContent=v; }); document.documentElement.lang=state.settings.lang; }
function applyTheme(){ document.body.dataset.theme=state.settings.theme || 'calm'; document.documentElement.style.colorScheme=['dark','contrast'].includes(state.settings.theme)?'dark':'light'; }
function toast(msg){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2300); }
let wakeLock=null;
async function requestWakeLock(){try{if('wakeLock' in navigator&&!wakeLock){wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}}catch{}}
async function releaseWakeLock(){try{if(wakeLock){await wakeLock.release();wakeLock=null;}}catch{}}

function openDrawer(){ $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden','false'); $('#scrim').hidden=false; }
function closeDrawer(){ $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden','true'); $('#scrim').hidden=true; }
function syncNavigationButtons(){
  const backDisabled=navDepth<=0, forwardDisabled=navDepth>=navMaxDepth;
  const b=$('#navBackButton'),f=$('#navForwardButton');if(b)b.disabled=backDisabled;if(f)f.disabled=forwardDisabled;
  $$('.game-back-btn').forEach(x=>x.disabled=backDisabled && !(route==='memory'&&game.memoryStage==='play') && !(route==='choiceStory'&&game.choiceStory?.reading));
  $$('.game-forward-btn').forEach(x=>x.disabled=forwardDisabled);
}
function nav(to, opts={}){
  const changed=to!==route;
  if(!opts.fromHistory&&changed){
    navDepth+=1;navMaxDepth=navDepth;
    try{history.pushState({wz:true,route:to,depth:navDepth},'',location.href);}catch{}
  }
  route=to;closeDrawer();if(['session',...GAME_ROUTES].includes(to))requestWakeLock();else releaseWakeLock();render(opts);syncNavigationButtons();
}
function navigationBack(){
  if($('#modalRoot').innerHTML){closeModal();return;}
  if($('#drawer').classList.contains('open')){closeDrawer();return;}
  if(navDepth>0){history.back();return;}
  if(GAME_ROUTES.includes(route)&&route!=='games')nav('games');
}
function navigationForward(){if(navDepth<navMaxDepth)history.forward();}
function handleHistoryPop(e){
  const st=e.state;if(!st?.wz)return;
  route=st.route||'home';navDepth=Number.isFinite(st.depth)?st.depth:0;closeDrawer();closeModal();
  if(['session',...GAME_ROUTES].includes(route))requestWakeLock();else releaseWakeLock();render({fromHistory:true});syncNavigationButtons();
}
function applyRouteMode(){
  const isGame=GAME_ROUTES.includes(route);
  document.body.classList.toggle('game-mode',isGame);
  document.body.classList.toggle('session-mode',route==='session');
  document.body.dataset.game=isGame?route:'';
  GAME_ROUTES.forEach(g=>document.body.classList.toggle(`game-${g}`,route===g));
}
function exitGame(){
  try{stopWheel();}catch{}
  game={};
  if(activePlanRun){activePlanRun=null;if(patientMode){renderPatientMode();return;}}
  nav('games');
}
function gameBack(){
  if(route==='memory'&&game.memoryStage==='play'){game.memoryStage='setup';game.memory=null;renderMemory();syncNavigationButtons();return;}
  if(route==='choiceStory'&&game.choiceStory?.reading){game.choiceStory.reading=false;renderChoiceStory();syncNavigationButtons();return;}
  navigationBack();
}
function inferListGameTags(L){
  if(!L||L.id===defaultList.id)return [];
  if(Array.isArray(L.gameTags)&&L.gameTags.length)return [...new Set(L.gameTags.filter(x=>LIST_GAME_LABELS[x]))];
  const tags=['session'];
  const items=(L.items||[]).map(x=>String(x.text||'').trim()).filter(Boolean);
  const wordLike=items.filter(x=>!/[\s,.!?;:]/.test(x)&&x.length<=32).length;
  if(L.kind==='choiceStory'||(/feuerwerk|geschichte/i.test(L.title||'')&&items.length>=5&&items.length%5===0))tags.push('choiceStory');
  if(L.kind==='pair'||(L.pairs||[]).length)tags.push('memory');
  if(items.length>=4)tags.push('memory');
  if(wordLike>=Math.min(4,Math.ceil(items.length*.45))){tags.push('letters','wheel','semantic','syllables');}
  else if(items.length){tags.push('wheel');}
  return [...new Set(tags)];
}
function listGameTags(L){return inferListGameTags(L);}
function listSupportsGame(L,gameRoute){return gameRoute==='session'||listGameTags(L).includes(gameRoute);}
function compatibleLists(gameRoute){return selectableLists().filter(L=>listSupportsGame(L,gameRoute)).sort((a,b)=>a.title.localeCompare(b.title,'de',{sensitivity:'base',numeric:true}));}
function selectedMaterialSupports(gameRoute){const ids=explicitListIds();return !!ids.length&&ids.every(id=>{const L=selectableLists().find(x=>x.id===id);return L&&listSupportsGame(L,gameRoute);});}
function gameMaterialButton(){
  if(!LIST_GAME_ROUTES.includes(route)||patientMode)return '';
  const label=hasExplicitMaterial()?activeMaterialTitle():(game.allowDefaultForRoute===route?'Fallback aktiv':'Liste wählen');
  return `<button class="soft-btn game-material-btn" id="gameMaterialButton" title="Liste für dieses Spiel ändern"><span class="game-material-static">Liste</span><span class="game-material-name"> · ${esc(label)}</span> ▾</button>`;
}
function gameHeader(title,subtitle,controls='',centerControl=''){return `<div class="game-head"><div class="game-head-left"><div class="game-history-controls"><button class="icon-btn game-back-btn" aria-label="Zurück" title="Zurück">←</button><button class="icon-btn game-forward-btn" aria-label="Vor" title="Vor">→</button></div><div class="game-title"><h1>${esc(title)}</h1><p>${subtitle}</p></div></div>${centerControl?`<div class="game-center-control">${centerControl}</div>`:''}<div class="game-controls">${gameMaterialButton()}${controls}<button class="icon-btn game-help-btn" aria-label="Hilfe" title="Hilfe">?</button><button class="icon-btn game-exit-btn" aria-label="Spiel verlassen" title="Zur Spieleauswahl">×</button></div></div>`;}
function bindGameChrome(){ $('.game-back-btn')?.addEventListener('click',gameBack);$('.game-forward-btn')?.addEventListener('click',navigationForward);$('.game-help-btn')?.addEventListener('click',contextualHelp); $('.game-exit-btn')?.addEventListener('click',exitGame); $('#gameMaterialButton')?.addEventListener('click',()=>openGameMaterialPicker(route));syncNavigationButtons(); }
function applyGameMaterialSelection(ids,gameRoute){
  const valid=[...new Set(ids)].filter(id=>{const L=selectableLists().find(x=>x.id===id);return L&&listSupportsGame(L,gameRoute);});
  if(!valid.length)return;state.activeListIds=valid;state.currentListId=valid[0];valid.forEach(rememberList);saveState();session=null;
  const keep={memoryMode:game.memoryMode,memoryCount:game.memoryCount,memoryPlayers:game.memoryPlayers,memoryManualAdvance:game.memoryManualAdvance,wheelSpeed:game.wheelSpeed,wheelFontScaleV2:game.wheelFontScaleV2};
  game={...keep};updateHeader();closeModal();render();
}
function openGameMaterialPicker(gameRoute){
  const lists=compatibleLists(gameRoute),selected=new Set(explicitListIds().filter(id=>lists.some(L=>L.id===id)));
  const tag=LIST_GAME_LABELS[gameRoute]||'Übung';
  openModal(`<div class="modal-head"><div><div class="eyebrow">Material</div><h2>Liste für ${esc(tag)} wählen</h2></div><button class="icon-btn" data-close-modal>×</button></div><div class="field"><label>Liste suchen</label><input id="gameListSearch" type="search" placeholder="Name der Liste"></div><div id="gameListChoices" class="game-list-choices section"></div><div class="modal-foot"><button class="soft-btn" id="gameUseDefault">Ohne eigene Liste · Standardwörter</button><button class="primary-btn" id="gameUseLists" ${selected.size?'':'disabled'}>Mit Auswahl starten</button></div>`);
  const draw=(q='')=>{const n=q.trim().toLocaleLowerCase('de'),shown=lists.filter(L=>!n||`${L.title} ${listFolders(L).join(' ')}`.toLocaleLowerCase('de').includes(n));$('#gameListChoices').innerHTML=shown.length?shown.map(L=>`<button class="game-list-choice ${selected.has(L.id)?'selected':''}" data-game-list-choice="${esc(L.id)}"><span><strong>${esc(L.title)}</strong><small>${esc(listFolders(L).join(' · '))} · ${L.items?.length||0} Einträge</small></span><span class="game-list-check">${selected.has(L.id)?'✓':''}</span></button>`).join(''):'<div class="muted">Keine passende Liste gefunden.</div>';$$('[data-game-list-choice]').forEach(b=>b.onclick=()=>{const id=b.dataset.gameListChoice;if(selected.has(id))selected.delete(id);else selected.add(id);draw($('#gameListSearch').value);$('#gameUseLists').disabled=!selected.size;});};
  draw();$('#gameListSearch').oninput=e=>draw(e.target.value);$('#gameUseLists').onclick=()=>applyGameMaterialSelection([...selected],gameRoute);$('#gameUseDefault').onclick=()=>{state.activeListIds=[];state.currentListId=null;saveState();session=null;game={allowDefaultForRoute:gameRoute};closeModal();render();toast('Standardwörter werden nur als Fallback verwendet.');};
}
function renderGameMaterialGate(gameRoute){
  const label=LIST_GAME_LABELS[gameRoute]||'dieses Spiel',recent=(state.recentListIds||[]).map(id=>selectableLists().find(L=>L.id===id)).filter(L=>L&&listSupportsGame(L,gameRoute)).slice(0,5);
  $('#view').innerHTML=`<div class="game-shell">${gameHeader(label,'Wähle zuerst das Material. Danach startet das Spiel direkt.')}<div class="game-board game-material-gate"><div class="game-material-gate-card"><div class="material-gate-icon">≡</div><h2>Welche Liste möchtest du verwenden?</h2><p>Du musst dafür nicht erst zurück in die Listenverwaltung.</p>${recent.length?`<div class="recent-game-lists">${recent.map(L=>`<button class="recent-game-list" data-gate-list="${esc(L.id)}"><strong>${esc(L.title)}</strong><span>${L.items?.length||0} Einträge</span></button>`).join('')}</div>`:''}<div class="toolbar center-toolbar"><button class="primary-btn" id="gateChooseList">Listen auswählen</button><button class="soft-btn" id="gateDefault">Mit Standardwörtern testen</button></div></div></div></div>`;
  bindGameChrome();$$('[data-gate-list]').forEach(b=>b.onclick=()=>applyGameMaterialSelection([b.dataset.gateList],gameRoute));$('#gateChooseList').onclick=()=>openGameMaterialPicker(gameRoute);$('#gateDefault').onclick=()=>{state.activeListIds=[];state.currentListId=null;saveState();game.allowDefaultForRoute=gameRoute;render();};
}
function shouldGateGame(gameRoute){return LIST_GAME_ROUTES.includes(gameRoute)&&!patientMode&&!activePlanRun&&!selectedMaterialSupports(gameRoute)&&game.allowDefaultForRoute!==gameRoute;}

function helpModal(title, body){
  openModal(`<div class="modal-head"><div><div class="eyebrow">Hilfe</div><h2>${esc(title)}</h2></div><button class="icon-btn" data-close-modal>×</button></div><div class="help-text">${body}</div><div class="modal-foot"><button class="primary-btn" data-close-modal>Verstanden</button></div>`);
}
function openModal(html,modalClass=''){ $('#modalRoot').innerHTML=`<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="modal ${esc(modalClass)}">${html}</div></div>`; $$('[data-close-modal]').forEach(b=>b.onclick=closeModal); $('.modal-backdrop').addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop')) closeModal();}); }
function closeModal(){ $('#modalRoot').innerHTML=''; }
function downloadBlob(filename, blob){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000); }

function render(){
  applyRouteMode();
  if(patientMode && !activePlanRun) return renderPatientMode();
  if(shouldGateGame(route)){renderGameMaterialGate(route);updateHeader();$('#view').focus({preventScroll:true});return;}
  const v=$('#view');
  if(activePlanRun){ v.innerHTML=planRunBar(); }
  switch(route){
    case 'home': renderHome(); break;
    case 'session': renderSession(); break;
    case 'lists': renderLists(); break;
    case 'games': renderGames(); break;
    case 'patients': renderPatients(); break;
    case 'plans': renderPlans(); break;
    case 'settings': renderSettings(); break;
    case 'letters': renderLetters(); break;
    case 'memory': renderMemory(); break;
    case 'sorting': renderSorting(); break;
    case 'story': renderStory(); break;
    case 'wheel': renderWheel(); break;
    case 'syllables': renderSyllables(); break;
    case 'choiceStory': renderChoiceStory(); break;
    case 'semantic': renderSemantic(); break;
    default: renderHome();
  }
  updateHeader();
  $('#view').focus({preventScroll:true});
}
function viewAppend(html){ $('#view').insertAdjacentHTML('beforeend', html); }
function pageHead(kicker,title,desc,actions=''){ return `<div class="page-head"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${desc}</p></div><div class="page-actions">${actions}</div></div>`; }
function planRunBar(){ if(!activePlanRun) return ''; const total=activePlanRun.pkg.steps.length; const step=activePlanRun.index+1; const patient=patientMode&&!activePlanRun.local;return `<div class="plan-runbar"><div><strong>${patient?'Sprachkurs':'Therapieplan'}</strong> <span class="muted">· Übung ${step} von ${total}</span></div><div class="toolbar"><button class="soft-btn" id="planPrev" ${step<=1?'disabled':''}>←</button><button class="primary-btn" data-game-primary id="planNext">${patient?'Übung abschließen':step>=total?'Plan beenden':'Nächste Übung →'}</button></div></div>`; }
function showPatientCourseFinished(){activePlanRun=null;route='home';$('#view').innerHTML=`<div class="patient-gate"><div class="patient-panel patient-finish"><div class="brand-mark" style="margin:0 auto">WZ</div><h1>Sprachkurs abgeschlossen!</h1><p>Sehr gut. Du kannst die Übungen jetzt schließen oder noch einmal von vorne öffnen.</p><button class="primary-btn" id="patientDone">Fertig</button></div></div>`;$('#patientDone').onclick=renderPatientMode;}
function showPatientStepComplete(){
  if(!activePlanRun)return;const last=activePlanRun.index>=activePlanRun.pkg.steps.length-1;
  openModal(`<div class="modal-head"><div><div class="eyebrow">Sprachkurs</div><h2>Übung abgeschlossen</h2></div></div><div class="patient-complete-message"><div class="complete-mark">✓</div><p>${last?'Das war die letzte Übung.':'Wenn ihr fertig besprochen habt, geht es mit der nächsten Übung weiter.'}</p></div><div class="modal-foot"><button class="primary-btn" data-default-action id="patientStepContinue">${last?'Sprachkurs beenden':'Weiter'}</button></div>`);
  $('#patientStepContinue').onclick=()=>{closeModal();if(last)showPatientCourseFinished();else{activePlanRun.index++;launchPlanStep();}};
}
function bindPlanBar(){ if(!activePlanRun) return; $('#planPrev')?.addEventListener('click',()=>{ if(activePlanRun.index>0){activePlanRun.index--; launchPlanStep();}}); $('#planNext')?.addEventListener('click',()=>{ if(patientMode&&!activePlanRun.local){showPatientStepComplete();return;}if(activePlanRun.index>=activePlanRun.pkg.steps.length-1){activePlanRun=null; nav('home'); toast('Therapieplan beendet');}else{activePlanRun.index++; launchPlanStep();}}); }

function showWelcome(){
  openModal(`<div class="modal-head"><div><div class="eyebrow">Willkommen</div><h2>WortZeit in drei Schritten</h2></div><button class="icon-btn" data-close-modal>×</button></div>
  <div class="welcome-steps">
    <div class="welcome-step"><span>1</span><div><strong>Einfach anfangen</strong><p>Wähle zuerst, was du machen möchtest: Wörter anzeigen oder ein Spiel starten. Fehlt dafür Material, fragt WortZeit direkt nach einer passenden Liste. Du musst dir keinen festen Menüweg merken.</p></div></div>
    <div class="welcome-step"><span>2</span><div><strong>Material dort wechseln, wo du es brauchst</strong><p>In Spielen kannst du die Liste oben direkt wechseln. Unter "Listen" kannst du Material importieren, bearbeiten, mehreren Therapie-Ordnern zuweisen und neue Importe in Ruhe prüfen. Das ? erklärt immer den aktuellen Bildschirm.</p></div></div>
    <div class="welcome-step"><span>3</span><div><strong>Sichern oder für Patienten vorbereiten</strong><p>Unter "Therapiepläne" stellst du Übungen zusammen und exportierst eine .speechpack-Datei. Unter "Einstellungen → Daten & Geräte" sicherst du dagegen deinen kompletten WortZeit-Arbeitsstand als Datenpaket oder überträgst ihn auf ein anderes Gerät.</p></div></div>
  </div>
  <div class="modal-foot"><button class="soft-btn" id="welcomeLater">Später</button><button class="primary-btn" id="welcomeDone">Verstanden</button></div>`);
  $('#welcomeLater')?.addEventListener('click',closeModal);
  $('#welcomeDone')?.addEventListener('click',()=>{state.settings.onboardingSeen=true;saveState();closeModal();});
}

function renderHome(){
  const explicit=explicitListIds().map(id=>selectableLists().find(L=>L.id===id)).filter(Boolean),recent=(state.recentListIds||[]).map(id=>selectableLists().find(L=>L.id===id)).filter(Boolean).slice(0,4);
  $('#view').innerHTML = pageHead('WortZeit','Was möchtest du machen?','Die wichtigsten Dinge stehen oben. Vorbereitung und Verwaltung bleiben darunter.',`<button class="soft-btn" id="showIntro">?</button>`)+`
  <div class="home-quick-grid">
    <button class="home-quick-card primary" data-route="session"><span class="home-quick-icon">Aa</span><span><strong>Wörter anzeigen</strong><small>${explicit.length?esc(activeMaterialTitle()):'Standardwörter als Fallback'}</small></span></button>
    <button class="home-quick-card" data-route="games"><span class="home-quick-icon">◇</span><span><strong>Spiel starten</strong><small>Liste wird bei Bedarf direkt im Spiel gewählt</small></span></button>
    <button class="home-quick-card" data-route="lists"><span class="home-quick-icon">≡</span><span><strong>Liste wählen</strong><small>${explicit.length?`${activeItems().length} Einträge aktiv`:'Noch keine eigene Liste gewählt'}</small></span></button>
  </div>
  ${recent.length?`<div class="section"><div class="eyebrow">Zuletzt benutzt</div><div class="recent-list-row home-recent-row">${recent.map(L=>`<button class="recent-list-card" data-home-list="${esc(L.id)}"><strong>${esc(L.title)}</strong><span>${L.items?.length||0} Einträge</span></button>`).join('')}</div></div>`:''}
  <div class="section"><div class="eyebrow">Vorbereiten</div><div class="home-manage-row"><button class="soft-btn" data-route="lists">Listen verwalten</button><button class="soft-btn" data-route="patients">Patienten</button><button class="soft-btn" data-route="plans">Therapiepläne</button><button class="soft-btn" data-route="settings">Einstellungen</button></div></div>`;
  $('#showIntro')?.addEventListener('click',showWelcome);$$('[data-home-list]').forEach(b=>b.onclick=()=>{setCurrentList(b.dataset.homeList);nav('session');});
  bindRouteButtons(); bindPlanBar();
  if(!state.settings.onboardingSeen&&!patientMode&&!$('#modalRoot').innerHTML)setTimeout(showWelcome,120);
}

function bindRouteButtons(){ $$('[data-route]').forEach(b=>b.onclick=()=>nav(b.dataset.route)); }

// ---------- Session ----------
function buildSession(){
  const items=activeItems();
  let order=items.map((_,i)=>i);
  if(state.settings.order==='random') order=shuffle(order);
  session={materialKey:activeMaterialKey(),items,order,pos:0,history:[],future:[],timer:null,cycle:1};
}
function sessionCurrentIndices(){
  if(!session || session.materialKey!==activeMaterialKey()) buildSession();
  const count=clamp(+state.settings.itemsPerScreen||1,1,6);
  const ids=[];
  for(let k=0;k<count;k++){
    let p=session.pos+k;
    if(p>=session.order.length){ if(state.settings.endless && session.order.length){ p%=session.order.length; } else break; }
    ids.push(session.order[p]);
  }
  return ids;
}
function sessionNext(){
  if(!session) buildSession();
  const step=clamp(+state.settings.itemsPerScreen||1,1,6);
  session.history.push(session.pos); session.future=[]; session.pos+=step;
  if(session.pos>=session.order.length){
    if(state.settings.endless && session.order.length){
      const lastIdx=session.order[session.order.length-1];
      session.order=state.settings.order==='random'?shuffle(session.order):session.order;
      if(session.order.length>1 && session.order[0]===lastIdx){[session.order[0],session.order[1]]=[session.order[1],session.order[0]];}
      session.pos=0;session.cycle++;
    }else{ session.pos=Math.max(0,session.order.length-step); stopAutoplay(); if(patientMode&&activePlanRun&&!activePlanRun.local)setTimeout(showPatientStepComplete,60);else toast('Ende der Liste'); }
  }
  renderSession();
}
function sessionPrev(){ if(session?.history.length){ session.future.push(session.pos); session.pos=session.history.pop(); renderSession(); } }
function sessionRedo(){ if(session?.future.length){ session.history.push(session.pos); session.pos=session.future.pop(); renderSession(); } }
function stopAutoplay(){ if(session?.timer){clearInterval(session.timer);session.timer=null;} }
function toggleAutoplay(){
  if(!session) buildSession();
  if(session.timer){stopAutoplay();renderSession();return;}
  const sec=Math.max(.4,+state.settings.interval||3);
  session.timer=setInterval(()=>sessionNext(),sec*1000); renderSession();
}
async function maybeAutoplayRecording(){
  if(!state.settings.instantAudio || !session) return;
  const idx=sessionCurrentIndices()[0]; if(idx==null)return;
  const item=session.items[idx]; const blob=await audioGet(`${item.sourceListId||state.currentListId}:${item.id}`); if(blob) playBlob(blob);
}
function sessionPalette(brightness){
  brightness=clamp(+brightness||0,0,100);
  const bg=brightness<50?`rgb(${Math.round(8+brightness*2.3)},${Math.round(16+brightness*2.4)},${Math.round(21+brightness*2.5)})`:`rgb(${Math.round(123+(brightness-50)*2.5)},${Math.round(139+(brightness-50)*2.2)},${Math.round(145+(brightness-50)*2.1)})`;
  return {bg,ink:brightness<48?'#f7fbfc':'#172126'};
}
function applySessionBrightness(value,save=true){
  const b=clamp(+value||0,0,100),pal=sessionPalette(b),stage=$('.session-stage');
  if(stage){stage.style.setProperty('--session-bg',pal.bg);stage.style.setProperty('--session-ink',pal.ink);}
  if(save){state.settings.brightness=b;saveState();}
}
function sessionToStart(){if(!session)return;stopAutoplay();session.pos=0;session.history=[];session.future=[];session.cycle=1;renderSession();}
function renderSession(){
  if(!session || session.materialKey!==activeMaterialKey()) buildSession();
  const ids=sessionCurrentIndices();
  const texts=ids.map(i=>session.items[i]?.text).filter(Boolean);
  const done=!texts.length;
  const brightness=clamp(+state.settings.brightness||55,0,100),fontScale=clamp(+state.settings.sessionFontScale||50,25,100),pal=sessionPalette(brightness);
  $('#view').innerHTML=`${activePlanRun?planRunBar():''}<div class="session-stage" style="--session-bg:${pal.bg};--session-ink:${pal.ink}">
    <div class="session-top"><button class="soft-btn" id="sessionOptions">☰ Optionen</button><div class="session-quick-sliders"><label class="session-brightness" title="Hintergrundhelligkeit"><span aria-hidden="true">☀</span><input id="quickBrightness" type="range" min="0" max="100" value="${brightness}" aria-label="Hintergrundhelligkeit"></label><label class="session-font-scale" title="Schriftgröße"><span aria-hidden="true">Aa</span><input id="quickSessionFont" type="range" min="25" max="100" step="5" value="${fontScale}" aria-label="Schriftgröße"></label></div><div class="toolbar"><button class="soft-btn" id="sessionStart" title="Zum Anfang der aktuellen Reihenfolge">↺ Anfang</button><button class="icon-btn" id="undoBtn" title="Zurück" ${!session.history.length?'disabled':''}>←</button><button class="icon-btn" id="redoBtn" title="Vor" ${!session.future.length?'disabled':''}>→</button></div></div>
    <div class="session-word-wrap" id="wordTap" role="button" tabindex="0" aria-label="Nächstes Wort"><div class="session-word ${texts.length>1?'multi':''}">${done?'Fertig':texts.map(esc).join('<br>')}</div></div>
    <div class="session-bottom"><div class="toolbar"><span class="session-counter">${Math.min(session.pos+1,session.order.length)} / ${session.order.length}</span><button class="soft-btn" id="audioBtn">● Audio</button></div><button class="round-play" id="playBtn" title="Automatisch abspielen">${session.timer?'Ⅱ':'▶'}</button></div>
  </div>`;
  $('#wordTap').onclick=sessionNext; $('#wordTap').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();sessionNext();}};
  $('#undoBtn').onclick=sessionPrev; $('#redoBtn').onclick=sessionRedo; $('#playBtn').onclick=toggleAutoplay;$('#sessionStart').onclick=sessionToStart;
  $('#quickBrightness').oninput=e=>applySessionBrightness(e.target.value,true);$('#quickSessionFont').oninput=e=>{state.settings.sessionFontScale=+e.target.value;saveState();fitSessionText();};
  $('#sessionOptions').onclick=openSessionOptions; $('#audioBtn').onclick=openAudioDialog;
  bindPlanBar(); requestAnimationFrame(fitSessionText); maybeAutoplayRecording();
}
function openSessionOptions(){
  openModal(`<div class="modal-head"><div><div class="eyebrow">Sitzung</div><h2>Anzeige einstellen</h2></div><button class="icon-btn" data-close-modal>×</button></div>
  <div class="grid">
    <div class="form-row">
      <div class="field"><label>Reihenfolge</label><select id="optOrder"><option value="random">Zufällig</option><option value="inorder">In Reihenfolge</option></select></div>
      <div class="field"><label>Wörter gleichzeitig</label><select id="optAmount">${[1,2,3,4,5,6].map(n=>`<option>${n}</option>`).join('')}</select></div>
      <label class="toggle"><input id="optEndless" type="checkbox"> Endlos</label>
      <label class="toggle"><input id="optAudio" type="checkbox"> Aufnahme automatisch</label>
    </div>
    <div class="form-row"><div class="field grow"><label>Intervall in Sekunden</label><input id="optInterval" type="range" min="0.5" max="15" step="0.5"><div class="small muted"><span id="intervalValue"></span> s</div></div><div class="field grow"><label>Hintergrundhelligkeit</label><input id="optBright" type="range" min="0" max="100"><div class="small muted"><span id="brightValue"></span>%</div></div><div class="field grow"><label>Schriftgröße</label><input id="optSessionFont" type="range" min="25" max="100" step="5"><div class="small muted"><span id="sessionFontValue"></span>% · 50% = bisherige Größe</div></div></div>
    <div class="card"><div class="section-title"><h3>Rhythmus-Hilfe</h3><span class="muted small">setzt das Intervall</span></div><div class="form-row"><div class="field"><label>BPM</label><input id="optBpm" type="number" min="20" max="300"></div><div class="field"><label>Beats pro Wort</label><input id="optBeats" type="number" min="1" max="16"></div><button class="soft-btn" id="applyBeat">Aus BPM übernehmen</button><button class="soft-btn" id="tapTempo">Tap BPM</button></div></div>
  </div><div class="modal-foot"><button class="primary-btn" id="saveSessionOpts">Übernehmen</button></div>`);
  $('#optOrder').value=state.settings.order; $('#optAmount').value=state.settings.itemsPerScreen; $('#optEndless').checked=state.settings.endless; $('#optAudio').checked=state.settings.instantAudio; $('#optInterval').value=state.settings.interval; $('#optBright').value=state.settings.brightness; $('#optSessionFont').value=state.settings.sessionFontScale||50; $('#optBpm').value=state.settings.bpm; $('#optBeats').value=state.settings.beats;
  $('#intervalValue').textContent=state.settings.interval; $('#brightValue').textContent=state.settings.brightness;$('#sessionFontValue').textContent=state.settings.sessionFontScale||50;
  $('#optInterval').oninput=e=>$('#intervalValue').textContent=e.target.value; $('#optBright').oninput=e=>{$('#brightValue').textContent=e.target.value;applySessionBrightness(e.target.value,false);};$('#optSessionFont').oninput=e=>{$('#sessionFontValue').textContent=e.target.value;state.settings.sessionFontScale=+e.target.value;fitSessionText();};
  $('#applyBeat').onclick=()=>{const bpm=Math.max(20,+$('#optBpm').value||60),beats=Math.max(1,+$('#optBeats').value||1);const seconds=60/bpm*beats;$('#optInterval').value=clamp(seconds,.5,15);$('#intervalValue').textContent=(Math.round(seconds*100)/100);};
  let taps=[]; $('#tapTempo').onclick=()=>{const now=performance.now();taps.push(now);taps=taps.filter(x=>now-x<5000).slice(-8);if(taps.length>1){const diffs=taps.slice(1).map((x,i)=>x-taps[i]);const avg=diffs.reduce((a,b)=>a+b,0)/diffs.length;$('#optBpm').value=Math.round(60000/avg);}};
  $('#saveSessionOpts').onclick=()=>{state.settings.order=$('#optOrder').value;state.settings.itemsPerScreen=+$('#optAmount').value;state.settings.endless=$('#optEndless').checked;state.settings.instantAudio=$('#optAudio').checked;state.settings.interval=+$('#optInterval').value;state.settings.brightness=+$('#optBright').value;state.settings.sessionFontScale=+$('#optSessionFont').value;state.settings.bpm=+$('#optBpm').value;state.settings.beats=+$('#optBeats').value;saveState();stopAutoplay();buildSession();closeModal();renderSession();};
}

// ---------- Audio DB / dialog ----------
function audioDb(){ return new Promise((resolve,reject)=>{const req=indexedDB.open(AUDIO_DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('audio'))req.result.createObjectStore('audio');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); }
async function audioSet(key,blob){const db=await audioDb();return new Promise((res,rej)=>{const tx=db.transaction('audio','readwrite');tx.objectStore('audio').put(blob,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function audioGet(key){try{const db=await audioDb();return await new Promise((res,rej)=>{const tx=db.transaction('audio','readonly');const r=tx.objectStore('audio').get(key);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);});}catch{return null;}}
async function audioDelete(key){const db=await audioDb();return new Promise((res,rej)=>{const tx=db.transaction('audio','readwrite');tx.objectStore('audio').delete(key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function audioAllEntries(){try{const db=await audioDb();return await new Promise((res,rej)=>{const out=[];const tx=db.transaction('audio','readonly');const req=tx.objectStore('audio').openCursor();req.onsuccess=()=>{const c=req.result;if(!c){res(out);return;}out.push([String(c.key),c.value]);c.continue();};req.onerror=()=>rej(req.error);});}catch{return [];}}
async function audioClearAll(){try{const db=await audioDb();return await new Promise((res,rej)=>{const tx=db.transaction('audio','readwrite');tx.objectStore('audio').clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}catch{}}
function playBlob(blob){const url=URL.createObjectURL(blob);const a=new Audio(url);a.onended=()=>URL.revokeObjectURL(url);a.play().catch(()=>URL.revokeObjectURL(url));}
function openAudioDialog(){
  if(!session) return; const idx=sessionCurrentIndices()[0]; if(idx==null)return; const item=session.items[idx];
  openModal(`<div class="modal-head"><div><div class="eyebrow">Audio</div><h2>${esc(item.text)}</h2></div><button class="icon-btn" data-close-modal>×</button></div><p class="help-text">Eine eigene Aufnahme wird nur lokal in diesem Browser gespeichert und kann beim Anzeigen des Wortes automatisch abgespielt werden.</p><div class="form-row"><button class="primary-btn" id="recStart">● Aufnahme starten</button><button class="secondary-btn" id="recStop" disabled>■ Stop</button><button class="soft-btn" id="recPlay">▶ Vorhandene Aufnahme</button><button class="danger-btn" id="recDelete">Löschen</button></div><div id="recStatus" class="small muted" style="margin-top:12px">Bereit</div>`);
  let rec=null,chunks=[];
  $('#recStart').onclick=async()=>{try{if(!navigator.mediaDevices?.getUserMedia||!('MediaRecorder' in window))throw new Error('Aufnahme wird von diesem Browser nicht unterstützt');const stream=await navigator.mediaDevices.getUserMedia({audio:true});rec=new MediaRecorder(stream);chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=async()=>{const blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'});await audioSet(`${item.sourceListId||state.currentListId}:${item.id}`,blob);stream.getTracks().forEach(t=>t.stop());$('#recStatus').textContent='Aufnahme gespeichert.';toast('Audio gespeichert');};rec.start();$('#recStatus').textContent='Aufnahme läuft …';$('#recStart').disabled=true;$('#recStop').disabled=false;}catch(e){$('#recStatus').textContent=`Mikrofon nicht verfügbar: ${e?.message||'Bitte Berechtigung prüfen.'}`;}};
  $('#recStop').onclick=()=>{if(rec&&rec.state!=='inactive'){rec.stop();$('#recStop').disabled=true;$('#recStart').disabled=false;}};
  $('#recPlay').onclick=async()=>{const b=await audioGet(`${item.sourceListId||state.currentListId}:${item.id}`);if(b)playBlob(b);else toast('Noch keine Aufnahme gespeichert');};
  $('#recDelete').onclick=async()=>{await audioDelete(`${item.sourceListId||state.currentListId}:${item.id}`);$('#recStatus').textContent='Aufnahme gelöscht.';};
}

// ---------- Lists / legacy import ----------
function renderLists(){
  const lists=selectableLists();
  const recent=(state.recentListIds||[]).map(id=>lists.find(L=>L.id===id)).filter(Boolean).slice(0,6);
  const activeIds=new Set(explicitListIds());
  const activeExplicit=explicitListIds().map(id=>lists.find(L=>L.id===id)).filter(Boolean);
  const pending=lists.filter(listNeedsReview);
  const lastBatch=(state.importReviewBatches||[]).find(b=>b.id===state.lastImportBatchId)||null;
  $('#view').innerHTML=pageHead('Material','Listen','Listen einmal sauber einordnen – danach findest du in jedem Spiel nur das passende Material.',`<button class="primary-btn" id="newList">+ Neue Liste</button><button class="secondary-btn" id="importFile">Datei importieren</button><button class="secondary-btn" id="importFolder">Ordner importieren</button>`)+`
  <div class="active-material card">
    <div><div class="eyebrow">Für die nächsten Übungen</div><strong>${activeExplicit.length?esc(activeMaterialTitle()):'Keine Liste gewählt'}</strong><div class="muted small">${activeExplicit.length?`${activeItems().length} eindeutige Einträge`:'Ohne Auswahl stehen die Standardwörter nur als stiller Fallback bereit.'}</div></div>
    <div class="active-list-chips">${activeExplicit.map(L=>`<button class="active-list-chip" data-remove-active="${esc(L.id)}" title="Aus Mischung entfernen">${esc(L.title)} <span>×</span></button>`).join('')}</div>
  </div>
  ${recent.length?`<div class="recent-lists"><div class="eyebrow">Zuletzt benutzt</div><div class="recent-list-row">${recent.map(L=>`<button class="recent-list-card" data-recent-list="${esc(L.id)}"><strong>${esc(L.title)}</strong><span>${L.items?.length||0} Einträge</span></button>`).join('')}</div></div>`:''}
  <div class="list-browser">
    <div class="card list-tree">
      <div class="field"><label>Liste suchen</label><input id="listSearch" type="search" placeholder="z. B. K-Wörter"></div>
      <div class="list-tree-tools">
        <button class="soft-btn compact-btn" id="collapseAllFolders">▸ Alle schließen</button>
        ${pending.length?`<button class="review-summary-btn" id="openPendingReview">Import prüfen <span>${pending.length}</span></button><button class="soft-btn compact-btn" id="openPendingFolders">Nur ungeprüfte öffnen</button>`:''}
        ${lastBatch?`<button class="soft-btn compact-btn" id="openLastImport">Letzter Import</button>`:''}
        <button class="soft-btn compact-btn" id="checkDuplicates">Duplikate prüfen</button>
      </div>
      <div class="small muted" style="margin-top:8px">Ordner sind zunächst geschlossen. Klick auf einen Ordner klappt ihn auf oder wieder zu. Klick auf einen Listennamen = auswählen, ✓ = zur Mischübung hinzufügen.</div>
      <div id="listTree" class="section"></div>
    </div>
    <div class="card" id="listDetail"></div>
  </div>
  <input id="filePicker" type="file" accept=".rtf,.txt,.csv,.json,.odt,.ods" hidden multiple>
  <input id="folderPicker" type="file" webkitdirectory directory multiple hidden>`;
  const renderTree=(q='')=>{
    const norm=q.trim().toLocaleLowerCase('de');
    const filtered=lists.filter(x=>!norm || `${x.title} ${(x.aliases||[]).join(' ')} ${listFolders(x).join(' ')} ${listGameTags(x).map(t=>LIST_GAME_LABELS[t]).join(' ')}`.toLocaleLowerCase('de').includes(norm));
    const groups=new Map();filtered.forEach(L=>{for(const cat of listFolders(L)){if(!groups.has(cat))groups.set(cat,[]);groups.get(cat).push(L);}});groups.forEach(arr=>arr.sort((a,b)=>a.title.localeCompare(b.title,'de',{sensitivity:'base',numeric:true})));
    const entries=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],'de',{sensitivity:'base',numeric:true}));
    $('#listTree').innerHTML=entries.map(([cat,arr])=>{
      const open=!!norm||!!state.listFolderOpen?.[cat],unreviewed=arr.filter(listNeedsReview).length;
      return `<div class="list-folder-group"><button class="list-folder-toggle ${open?'open':''}" data-folder-toggle="${esc(cat)}" data-folder-drop="${esc(cat)}" aria-expanded="${open?'true':'false'}"><span class="folder-arrow">${open?'▾':'▸'}</span><span class="folder-name">${esc(cat)}</span><span class="folder-count">${arr.length}</span>${unreviewed?`<span class="folder-review-count">${unreviewed} neu</span>`:''}</button>${open?`<div class="list-folder-content">${arr.map(L=>{const status=listReviewStatusLabel(L);return `<div class="list-item-row" draggable="${L.bundled?'false':'true'}" data-list-drag="${esc(L.id)}"><button class="list-item ${L.id===state.currentListId?'active':''}" data-list-id="${esc(L.id)}"><div class="list-item-title-line"><strong>${esc(L.title)}</strong>${status&&L.review?.status!=='checked'?`<span class="list-review-pill ${L.review.status}">${status}</span>`:''}</div><small>${L.items?.length||0} Einträge${L.kind==='pair'?' · A/B':''}</small><span class="list-game-mini">${listGameTags(L).filter(x=>x!=='session').slice(0,4).map(x=>esc(LIST_GAME_LABELS[x])).join(' · ')}</span></button><button class="mix-check ${activeIds.has(L.id)?'checked':''}" data-mix-list="${esc(L.id)}" aria-label="${activeIds.has(L.id)?'Aus Mischung entfernen':'Zur Mischung hinzufügen'}" title="${activeIds.has(L.id)?'In Mischübung aktiv':'Zur Mischübung hinzufügen'}">${activeIds.has(L.id)?'✓':'+'}</button></div>`}).join('')}</div>`:''}</div>`;
    }).join('')||'<p class="muted">Keine Treffer.</p>';
    $$('[data-folder-toggle]').forEach(b=>b.onclick=()=>{const cat=b.dataset.folderToggle;state.listFolderOpen=state.listFolderOpen||{};state.listFolderOpen[cat]=!state.listFolderOpen[cat];saveState();renderTree($('#listSearch').value);});
    $$('[data-list-id]').forEach(b=>b.onclick=()=>{setCurrentList(b.dataset.listId);renderLists();});
    $$('[data-mix-list]').forEach(b=>b.onclick=()=>{toggleActiveList(b.dataset.mixList);renderLists();});
    $$('[data-list-drag]').forEach(row=>{if(row.getAttribute('draggable')!=='true')return;row.ondragstart=e=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('text/wortzeit-list-id',row.dataset.listDrag);};});
    $$('[data-folder-drop]').forEach(folder=>{folder.ondragover=e=>{if(e.dataTransfer.types.includes('text/wortzeit-list-id')){e.preventDefault();folder.classList.add('drag-over');}};folder.ondragleave=()=>folder.classList.remove('drag-over');folder.ondrop=e=>{e.preventDefault();folder.classList.remove('drag-over');const id=e.dataTransfer.getData('text/wortzeit-list-id'),L=state.userLists.find(x=>x.id===id);if(!L)return toast('Integrierte Listen zuerst als Kopie bearbeiten.');if(addListToFolder(L,folder.dataset.folderDrop)){saveState();renderLists();toast(`„${L.title}“ zusätzlich „${folder.dataset.folderDrop}“ zugeordnet`);}};});
  };
  const renderDetail=()=>{
    const L=lists.find(x=>x.id===state.currentListId)||activeExplicit[0]||null;
    if(!L){$('#listDetail').innerHTML=`<div class="empty-list-detail"><div class="material-gate-icon">≡</div><h2>Liste auswählen</h2><p class="muted">Wähle links eine vorhandene Liste oder importiere einen Ordner. Die integrierten Standardwörter werden hier absichtlich nicht als normale Liste angezeigt.</p></div>`;return;}
    const preview=(L.items||[]).slice(0,160),tags=listGameTags(L),review=L.review;
    $('#listDetail').innerHTML=`<div class="section-title"><div><div class="eyebrow">${esc(listFolders(L).join(' · '))}</div><h2>${esc(L.title)}</h2></div><div class="toolbar"><button class="primary-btn" data-route="session">Verwenden</button><button class="soft-btn" id="mixThis">${activeIds.has(L.id)?'✓ In Mischung':'＋ Zur Mischung'}</button><button class="soft-btn" id="recordBank">Aufnahmebank</button><button class="soft-btn" id="editList">${L.bundled?'Kopie bearbeiten':'Liste bearbeiten'}</button><button class="soft-btn" id="exportList">Export</button>${review&&listNeedsReview(L)?`<button class="review-done-btn" id="markReviewed">✓ Geprüft</button>`:''}${L.bundled?'':`<button class="danger-btn" id="deleteList">Löschen</button>`}</div></div>
      <p class="muted">${L.items?.length||0} Einträge · ${L.kind==='pair'?'A/B-Paare':L.kind==='choiceStory'?'Auswahlgeschichte':'Wort-/Textliste'}</p>
      ${review?`<div class="list-review-detail ${esc(review.status)}"><strong>${esc(listReviewStatusLabel(L)||'Import')}</strong><span>Erkennung: ${esc(confidenceLabel(review.confidence))}${review.separator?` · Trennung: ${esc(review.separator)}`:''}</span>${review.warnings?.length?`<span>${review.warnings.map(esc).join(' · ')}</span>`:''}</div>`:''}
      <div class="list-game-tags"><span class="muted small">Geeignet für:</span>${tags.map(t=>`<span class="list-game-tag">${esc(LIST_GAME_LABELS[t]||t)}</span>`).join('')}</div>
      <div class="item-preview editable-preview">${preview.map((x,i)=>`<button class="preview-row preview-edit-row" data-edit-item="${i}" title="Eintrag bearbeiten"><span class="muted small">${i+1}.</span><span>${esc(x.sourceText||x.text)}</span><span class="preview-edit-mark">✎</span></button>`).join('')}${(L.items?.length||0)>preview.length?`<div class="preview-row muted">… und ${(L.items.length-preview.length)} weitere</div>`:''}</div><div class="divider"></div><div class="small muted">Quelle: ${esc(L.sourcePath||'lokal angelegt')}</div>`;
    bindRouteButtons();
    $('#mixThis').onclick=()=>{toggleActiveList(L.id);renderLists();};
    $('#recordBank').onclick=()=>openRecordingBank(L);
    $('#editList').onclick=()=>openListEditor(L);
    $$('[data-edit-item]').forEach(b=>b.onclick=()=>openItemEditor(L,+b.dataset.editItem));
    $('#markReviewed')?.addEventListener('click',()=>{markListReviewed(L,true);renderLists();toast('Liste als geprüft markiert');});
    $('#exportList').onclick=()=>downloadBlob(`${safeFilename(L.title)}.wortliste.json`,new Blob([JSON.stringify({format:'wortzeit-list',version:2,list:{...L,gameTags:listGameTags(L)}},null,2)],{type:'application/json'}));
    $('#deleteList')?.addEventListener('click',()=>{if(confirm(`Liste „${L.title}“ wirklich löschen?`)){state.userLists=state.userLists.filter(x=>x.id!==L.id);state.activeListIds=explicitListIds().filter(id=>id!==L.id);if(state.currentListId===L.id)state.currentListId=state.activeListIds[0]||null;saveState();session=null;game={};renderLists();}});
  };
  renderTree();renderDetail();
  $('#listSearch').oninput=e=>renderTree(e.target.value);
  $('#collapseAllFolders').onclick=()=>{state.listFolderOpen={};saveState();renderTree($('#listSearch').value);};
  $('#openPendingFolders')?.addEventListener('click',()=>{const next={};lists.filter(listNeedsReview).forEach(L=>listFolders(L).forEach(f=>next[f]=true));state.listFolderOpen=next;saveState();renderTree($('#listSearch').value);});
  $('#openPendingReview')?.addEventListener('click',()=>openImportReview('pending'));
  $('#openLastImport')?.addEventListener('click',()=>openImportReview(state.lastImportBatchId));
  $('#checkDuplicates')?.addEventListener('click',()=>openDuplicateReview());
  $('#newList').onclick=openNewListModal;
  $('#importFile').onclick=()=>$('#filePicker').click(); $('#filePicker').onchange=e=>importFiles([...e.target.files]);
  $('#importFolder').onclick=()=>{const picker=$('#folderPicker');if('webkitdirectory' in picker){picker.click();}else{toast('Dieser Browser kann keinen ganzen Ordner auswählen. Bitte mehrere Dateien markieren.');$('#filePicker').click();}}; $('#folderPicker').onchange=e=>importFiles([...e.target.files],true);
  $$('[data-recent-list]').forEach(b=>b.onclick=()=>{setCurrentList(b.dataset.recentList);renderLists();});
  $$('[data-remove-active]').forEach(b=>b.onclick=()=>{toggleActiveList(b.dataset.removeActive);renderLists();});
  bindPlanBar();
}
function safeFilename(s){return String(s).replace(/[\\/:*?"<>|]+/g,'_').trim()||'Datei';}
function openNewListModal(){
  openModal(`<div class="modal-head"><div><div class="eyebrow">Neue Liste</div><h2>Wörter einfügen</h2></div><button class="icon-btn" data-close-modal>×</button></div><div class="grid"><div class="form-row"><div class="field grow"><label>Listenname</label><input id="nlName" placeholder="z. B. Tiere"></div><div class="field"><label>Trennzeichen zwischen Einträgen</label><input id="nlSep" value="-" maxlength="5"></div><div class="field"><label>Silbentrenner <span class="muted">(optional)</span></label><input id="nlSyllSep" value="·" maxlength="3" placeholder="z. B. ·"></div><label class="toggle"><input id="nlPair" type="checkbox"> A/B-Paare</label><label class="toggle"><input id="nlChoiceStory" type="checkbox"> Auswahlgeschichte</label></div><div class="field"><label>Inhalt</label><textarea id="nlText" placeholder="Hund-Katze-Maus-…"></textarea></div><div class="small muted">Für eigene Silben kannst du z. B. als Eintrags-Trennzeichen <strong>;</strong> und als Silbentrenner <strong>-</strong> verwenden: <strong>Ba-na-ne;To-ma-te;Ka-me-ra</strong>.<br>Für eine <strong>Auswahlgeschichte</strong> werden immer 5 Einträge als Gruppe gelesen: 1 Satzanfang + 4 Möglichkeiten.</div></div><div class="modal-foot"><button class="primary-btn" id="nlSave">Liste speichern</button></div>`);
  $('#nlSave').onclick=()=>{const name=$('#nlName').value.trim()||'Neue Liste';const text=$('#nlText').value;const sep=$('#nlSep').value;const syllSep=$('#nlSyllSep').value;if(sep&&syllSep&&sep===syllSep)return toast('Eintrags-Trennzeichen und Silbentrenner müssen verschieden sein');const pieces=parsePlainList(text,sep);if(!pieces.length)return toast('Keine Einträge gefunden');if($('#nlChoiceStory').checked&&pieces.length%5!==0)return toast('Auswahlgeschichten brauchen immer Gruppen aus 5 Einträgen.');const L=makeUserList(name,pieces,'Eigene Listen','',syllSep,sep);if($('#nlPair').checked){L.kind='pair';L.pairs=[];for(let i=0;i<L.items.length-1;i+=2)L.pairs.push({id:uid('pair'),a:L.items[i].text,b:L.items[i+1].text});}if($('#nlChoiceStory').checked)L.kind='choiceStory';L.gameTags=inferListGameTags(L);state.userLists.push(L);state.currentListId=L.id;state.activeListIds=[L.id];rememberList(L.id);saveState();session=null;game={};closeModal();renderLists();toast('Liste gespeichert');};
}
function makeUserList(title,pieces,category='Eigene Listen',sourcePath='',syllableSeparator='',entrySeparator=''){
  const items=pieces.map((raw,i)=>{const source=String(raw).trim();if(!source)return null;if(syllableSeparator&&source.includes(syllableSeparator)){const syllables=source.split(syllableSeparator).map(x=>x.trim()).filter(Boolean);return {id:uid(`i${i}`),text:syllables.join(''),syllables,sourceText:source};}return {id:uid(`i${i}`),text:source};}).filter(Boolean);
  return {id:uid('list'),title,category,folders:[category||'Eigene Listen'],kind:'list',sourcePath,bundled:false,origin:sourcePath?'imported':'created',syllableSeparator:syllableSeparator||'',entrySeparator:entrySeparator||'',items,aliases:[]};
}
function rebuildListPairs(L){
  if(L.kind!=='pair'){delete L.pairs;return;}
  L.pairs=[];for(let i=0;i<(L.items||[]).length-1;i+=2)L.pairs.push({id:uid('pair'),a:L.items[i].text,b:L.items[i+1].text});
}
function editListTarget(L){
  if(!L.bundled)return L;
  const copy=normalizeListStorage({...cloneData(L),id:uid('list'),bundled:false,category:`Eigene Kopie · ${L.category||'Liste'}`,folders:[`Eigene Kopie · ${L.category||'Liste'}`],title:`${L.title} · Kopie`,sourcePath:`Kopie von ${L.sourcePath||L.title}`,origin:'copied',aliases:[],gameTags:listGameTags(L)});
  copy.items=(copy.items||[]).map((it,i)=>({...it,id:uid(`i${i}`)}));rebuildListPairs(copy);state.userLists.push(copy);state.currentListId=copy.id;state.activeListIds=[copy.id];rememberList(copy.id);saveState();return copy;
}
function listEditorFormattedText(L,items=L.items||[]){
  if(L.kind==='pair'){
    const rows=[];for(let i=0;i<items.length;i+=2)rows.push(`${items[i]?.sourceText||items[i]?.text||''} | ${items[i+1]?.sourceText||items[i+1]?.text||''}`.trim());return rows.join('\n');
  }
  return items.map(it=>it.sourceText||it.text||'').join('\n');
}
function listEditorRawText(L,items=L.items||[],entrySep=L.entrySeparator||''){
  const sep=entrySep||'\n';return items.map(it=>it.sourceText||it.text||'').join(sep);
}
function editorValuesToItems(L,values,syllSep){
  const old=L.items||[];
  return values.map((raw,i)=>{const prev=old[i],source=String(raw||'').trim();if(!source)return null;if(syllSep&&source.includes(syllSep)){const syllables=source.split(syllSep).map(x=>x.trim()).filter(Boolean);return {id:prev?.id||uid(`i${i}`),text:syllables.join(''),syllables,sourceText:source};}return {id:prev?.id||uid(`i${i}`),text:source,sourceText:source};}).filter(Boolean);
}
function parseEditorItems(L,text,syllSep,mode='formatted',entrySep=''){
  if(mode==='raw')return editorValuesToItems(L,parsePlainList(text,entrySep),syllSep);
  if(L.kind==='pair'){
    const lines=String(text||'').replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean),vals=[];
    for(const line of lines){const parts=line.split('|').map(x=>x.trim()).filter(Boolean);if(parts.length>=2)vals.push(parts[0],parts.slice(1).join(' | '));else vals.push(line);}
    return editorValuesToItems(L,vals,syllSep);
  }
  return editorValuesToItems(L,String(text||'').replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean),syllSep);
}
function gameTagCheckboxes(selected){return Object.entries(LIST_GAME_LABELS).map(([id,label])=>`<label class="game-tag-check"><input type="checkbox" value="${id}" ${selected.includes(id)?'checked':''}><span>${esc(label)}</span></label>`).join('');}
function openListEditor(sourceList,returnReviewScope=null){
  const L=normalizeListStorage(editListTarget(sourceList)),selected=listGameTags(L),kind=L.kind||'list';
  let editorMode='formatted',folderSet=new Set(listFolders(L));
  const folderOptions=knownFolders().map(f=>`<option value="${esc(f)}"></option>`).join('');
  openModal(`<div class="modal-head"><div><div class="eyebrow">Liste bearbeiten</div><h2>${esc(L.title)}</h2></div><button class="icon-btn" data-close-modal>×</button></div>
    <div class="form-row"><div class="field grow"><label>Listenname</label><input id="leTitle" value="${esc(L.title)}"></div><div class="field"><label>Typ</label><select id="leKind"><option value="list">Normale Liste</option><option value="pair">A/B-Paare</option><option value="choiceStory">Auswahlgeschichte</option></select></div><div class="field"><label>Eintrags-Trennzeichen</label><input id="leEntrySep" value="${esc(L.entrySeparator||'')}" placeholder="leer = Zeilenumbruch" maxlength="5"></div><div class="field"><label>Silbentrenner</label><input id="leSyllSep" value="${esc(L.syllableSeparator||'')}" placeholder="z. B. -" maxlength="3"></div></div>
    <div class="section"><div class="eyebrow">Ordner · eine Liste darf in mehreren Ordnern erscheinen</div><div id="leFolderChips" class="folder-assignment-chips"></div><div class="form-row folder-assignment-row"><div class="field grow"><label>Weiteren Ordner zuweisen</label><input id="leFolderInput" list="leFolderSuggestions" placeholder="Ordner wählen oder neuen Namen eingeben"><datalist id="leFolderSuggestions">${folderOptions}</datalist></div><button class="soft-btn" id="leFolderAdd">+ Zuweisen</button></div><p class="small muted">Das × entfernt nur diese Ordnerzuordnung – die Liste selbst bleibt erhalten. Ist es der letzte Ordner, landet die Liste sicher unter „Unsortiert“. „Liste löschen“ ist davon getrennt und bleibt eine eigene rote Aktion.</p></div>
    <div class="section"><div class="eyebrow">In welchen Übungen soll die Liste auftauchen?</div><div class="game-tag-grid" id="leGameTags">${gameTagCheckboxes(selected)}</div><p class="small muted">Diese Zuordnung kannst du jederzeit ändern. So zeigt ein Spiel später nur passende Listen an.</p></div>
    <div class="field section"><div class="list-editor-modebar"><label>Einträge</label><div class="segmented"><button type="button" class="seg-btn active" id="leModeFormatted">Aufgelistet</button><button type="button" class="seg-btn" id="leModeRaw">Unformatiert</button></div></div><textarea id="leText" class="list-editor-text">${esc(listEditorFormattedText(L))}</textarea><div class="small muted" id="leModeHelp">Ein Eintrag pro Zeile${kind==='pair'?' · A | B pro Zeile':''}. Für große Einfügungen kannst du auf „Unformatiert“ wechseln.</div></div>
    <div class="modal-foot">${returnReviewScope?`<button class="soft-btn" id="leBackReview">← Importprüfung</button>`:''}<button class="soft-btn" id="leDownload">Bearbeitete Liste exportieren</button><button class="primary-btn" id="leSave">Änderungen speichern</button></div>`);
  $('#leKind').value=kind;
  const renderFolders=()=>{
    $('#leFolderChips').innerHTML=[...folderSet].map(f=>`<span class="folder-assignment-chip"><span class="folder-assignment-name">${esc(f)}</span><button type="button" class="folder-assignment-remove" data-remove-folder="${esc(f)}" aria-label="Aus Ordner ${esc(f)} entfernen" title="Nur aus diesem Ordner entfernen">×</button></span>`).join('');
    $$('[data-remove-folder]').forEach(b=>b.onclick=()=>{const result=removeFolderAssignment(folderSet,b.dataset.removeFolder);if(!result.changed)return;renderFolders();if(result.fallback)toast('Ordnerzuordnung entfernt · Liste bleibt unter „Unsortiert“ erhalten');});
  };renderFolders();
  $('#leFolderAdd').onclick=()=>{const f=$('#leFolderInput').value.trim();if(!f)return;folderSet.add(f);$('#leFolderInput').value='';renderFolders();};
  const convertMode=next=>{if(next===editorMode)return;const entrySep=$('#leEntrySep').value,syllSep=$('#leSyllSep').value;const tempItems=parseEditorItems({...L,kind:$('#leKind').value},$('#leText').value,syllSep,editorMode,entrySep);const temp={...L,kind:$('#leKind').value,items:tempItems,entrySeparator:entrySep};$('#leText').value=next==='raw'?listEditorRawText(temp,tempItems,entrySep):listEditorFormattedText(temp,tempItems);editorMode=next;$('#leModeFormatted').classList.toggle('active',next==='formatted');$('#leModeRaw').classList.toggle('active',next==='raw');$('#leModeHelp').textContent=next==='raw'?`Rohansicht · Trennung: ${entrySep||'Zeilenumbruch'}. Hier kannst du lange Blöcke direkt einfügen.`:`Ein Eintrag pro Zeile${temp.kind==='pair'?' · A | B pro Zeile':''}.`;};
  $('#leModeFormatted').onclick=()=>convertMode('formatted');$('#leModeRaw').onclick=()=>convertMode('raw');
  $('#leSave').onclick=()=>{L.title=$('#leTitle').value.trim()||L.title;L.kind=$('#leKind').value;L.entrySeparator=$('#leEntrySep').value;L.syllableSeparator=$('#leSyllSep').value.trim();L.items=parseEditorItems(L,$('#leText').value,L.syllableSeparator,editorMode,L.entrySeparator);rebuildListPairs(L);setListFolders(L,[...folderSet]);L.gameTags=$$('#leGameTags input:checked').map(x=>x.value);if(!L.gameTags.includes('session'))L.gameTags.unshift('session');if(L.review){L.review.status='checked';L.review.checkedAt=new Date().toISOString();}saveState();session=null;game={};closeModal();renderLists();toast('Liste aktualisiert');if(returnReviewScope)setTimeout(()=>openImportReview(returnReviewScope),30);};
  $('#leDownload').onclick=()=>{const tempItems=parseEditorItems({...L,kind:$('#leKind').value},$('#leText').value,$('#leSyllSep').value,editorMode,$('#leEntrySep').value);const text=editorMode==='raw'?listEditorRawText({...L,entrySeparator:$('#leEntrySep').value},tempItems,$('#leEntrySep').value):listEditorFormattedText({...L,kind:$('#leKind').value},tempItems);downloadBlob(`${safeFilename($('#leTitle').value||L.title)}.txt`,new Blob([text],{type:'text/plain;charset=utf-8'}));};
  $('#leBackReview')?.addEventListener('click',()=>{closeModal();renderLists();setTimeout(()=>openImportReview(returnReviewScope),20);});
}
function openItemEditor(sourceList,index){
  const L=editListTarget(sourceList),it=L.items?.[index];if(!it)return;
  openModal(`<div class="modal-head"><div><div class="eyebrow">Eintrag ${index+1}</div><h2>Eintrag bearbeiten</h2></div><button class="icon-btn" data-close-modal>×</button></div><div class="field"><label>Text</label><input id="ieText" value="${esc(it.text||'')}"></div><div class="field section"><label>Silben <span class="muted">(optional, mit - trennen)</span></label><input id="ieSyll" value="${esc((it.syllables||[]).join('-'))}" placeholder="Ba-na-ne"></div><div class="modal-foot"><button class="danger-btn" id="ieDelete">Eintrag löschen</button><button class="primary-btn" id="ieSave">Speichern</button></div>`);
  $('#ieSave').onclick=()=>{const text=$('#ieText').value.trim();if(!text)return toast('Bitte Text eingeben');const syl=$('#ieSyll').value.split('-').map(x=>x.trim()).filter(Boolean);it.text=text;if(syl.length>1){it.syllables=syl;it.sourceText=syl.join(L.syllableSeparator||'-');}else{delete it.syllables;it.sourceText=text;}rebuildListPairs(L);L.gameTags=L.gameTags||inferListGameTags(L);saveState();session=null;game={};closeModal();renderLists();toast('Eintrag gespeichert');};
  $('#ieDelete').onclick=()=>{if(confirm('Diesen Eintrag wirklich löschen?')){L.items.splice(index,1);rebuildListPairs(L);saveState();session=null;game={};closeModal();renderLists();}};
}
function parsePlainList(text,sep){
  text=String(text||'').replace(/\r/g,'');
  if(sep){return text.split(sep).map(x=>x.trim()).filter(Boolean);}
  const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);if(lines.length>1)return lines;
  return text.split(/[;,\n]+/).map(x=>x.trim()).filter(Boolean);
}
function detectImportSeparator(text,filename=''){
  const clean=String(text||'').replace(/\r/g,'');
  const lines=clean.split('\n').map(x=>x.trim()).filter(Boolean);
  const count=ch=>clean.split(ch).length-1;
  const tabs=count('\t'),semis=count(';'),pipes=count('|'),commas=count(','),hyphens=count('-');
  if(tabs>=2)return '\t';
  if(semis>=2 && semis>=commas)return ';';
  if(pipes>=2)return '|';
  const lineEndHyphens=lines.filter(line=>/-\s*$/.test(line)).length;
  if(hyphens>=3 && (hyphens>=Math.max(4,lines.length) || lineEndHyphens>=Math.max(2,Math.ceil(lines.length*.25))))return '-';
  if(String(filename).toLowerCase().endsWith('.csv') && commas>=2)return ',';
  return '';
}
function decodeRtfBrowser(text){
  return String(text).replace(/\\'([0-9a-fA-F]{2})/g,(_,h)=>{try{return new TextDecoder('windows-1252').decode(Uint8Array.of(parseInt(h,16)));}catch{return ''}}).replace(/\\u(-?\d+)\??/g,(_,n)=>String.fromCharCode((+n+65536)%65536)).replace(/\\par[d]?/g,'\n').replace(/\\line/g,'\n').replace(/\\tab/g,'\t').replace(/\\[a-zA-Z]+-?\d* ?/g,'').replace(/[{}]/g,'').replace(/\\/g,'').replace(/\0/g,'').split('\n').filter(line=>!/^\s*(Times New Roman|Calibri|DejaVu Serif|\*?Riched\d+)/i.test(line)).join('\n').trim();
}
async function unzipEntryFromBuffer(buffer,targetName){
  const dv=new DataView(buffer),u=new Uint8Array(buffer);let eocd=-1;
  for(let i=Math.max(0,u.length-65557);i<=u.length-22;i++){if(dv.getUint32(i,true)===0x06054b50)eocd=i;}
  if(eocd<0)throw new Error('ZIP-Ende nicht gefunden');
  const total=dv.getUint16(eocd+10,true),central=dv.getUint32(eocd+16,true);let off=central;
  for(let n=0;n<total&&off+46<=u.length;n++){
    if(dv.getUint32(off,true)!==0x02014b50)break;
    const method=dv.getUint16(off+10,true),compSize=dv.getUint32(off+20,true),nameLen=dv.getUint16(off+28,true),extraLen=dv.getUint16(off+30,true),commentLen=dv.getUint16(off+32,true),localOff=dv.getUint32(off+42,true);
    const name=new TextDecoder('utf-8').decode(u.slice(off+46,off+46+nameLen));
    if(name===targetName){
      if(dv.getUint32(localOff,true)!==0x04034b50)throw new Error('ZIP-Eintrag beschädigt');
      const localName=dv.getUint16(localOff+26,true),localExtra=dv.getUint16(localOff+28,true),start=localOff+30+localName+localExtra,data=u.slice(start,start+compSize);
      if(method===0)return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
      if(method===8&&'DecompressionStream' in window){const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return await new Response(stream).arrayBuffer();}
      throw new Error('ODT-Kompression wird von diesem Browser nicht unterstützt');
    }
    off+=46+nameLen+extraLen+commentLen;
  }
  throw new Error(`${targetName} nicht gefunden`);
}
async function readOdtText(file){
  const buf=await file.arrayBuffer(),xmlBuf=await unzipEntryFromBuffer(buf,'content.xml'),xml=new TextDecoder('utf-8').decode(xmlBuf),doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.querySelector('parsererror'))throw new Error('ODT-Inhalt konnte nicht gelesen werden');
  const nodeText=node=>{let out='';for(const c of node.childNodes){if(c.nodeType===3)out+=c.nodeValue||'';else if(c.nodeType===1){if(c.localName==='line-break')out+='\n';else if(c.localName==='tab')out+='\t';else out+=nodeText(c);}}return out;};
  const blocks=[...doc.getElementsByTagName('*')].filter(el=>['p','h'].includes(el.localName)).map(el=>nodeText(el).replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').trim()).filter(Boolean);
  return blocks.join('\n');
}
async function readFileText(file){
  const buf=await file.arrayBuffer();
  if(buf.byteLength>=2){const u=new Uint8Array(buf);if(u[0]===0xff&&u[1]===0xfe)return new TextDecoder('utf-16le').decode(buf);if(u[0]===0xfe&&u[1]===0xff)return new TextDecoder('utf-16be').decode(buf);}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{return new TextDecoder('windows-1252').decode(buf);}
}
function importSeparatorLabel(sep,clean=''){
  if(sep==='\t')return 'TAB';
  if(sep)return sep;
  return String(clean||'').replace(/\r/g,'').split('\n').filter(x=>x.trim()).length>1?'Zeilen':'Auto';
}
function createImportReview(L,{batchId,clean='',separator='',warnings=[]}={}){
  const notes=[...warnings];
  if((L.items||[]).length<2)notes.push('Nur ein Eintrag erkannt.');
  if(L.kind==='pair'&&(L.items||[]).length%2!==0)notes.push('Ungerade Anzahl für A/B-Paare.');
  if((L.items||[]).some(it=>String(it.text||'').length>260))notes.push('Mindestens ein sehr langer Eintrag – Trennung prüfen.');
  let confidence='high';
  if(separator==='-'||L.kind==='pair')confidence='medium';
  if(notes.length)confidence='low';
  return {status:notes.length?'warning':'new',batchId,importedAt:new Date().toISOString(),confidence,separator:importSeparatorLabel(separator,clean),warnings:[...new Set(notes)]};
}

function exactListContentKey(L){
  // Deliberately excludes title, folders, source path, game tags and IDs.
  // Two lists are duplicates only when their stored therapeutic content and order match exactly.
  const items=(L.items||[]).map(it=>({text:String(it.text||''),syllables:Array.isArray(it.syllables)?it.syllables.map(x=>String(x)):[]}));
  const pairs=L.kind==='pair'?(L.pairs||[]).map(p=>({a:String(p.a||''),b:String(p.b||'')})):[];
  return JSON.stringify({kind:L.kind||'list',items,pairs});
}
function duplicateGroupId(group){return group.map(L=>L.id).sort().join('|');}
function findExactDuplicateGroups({includeIgnored=false}={}){
  const buckets=new Map();
  for(const L of state.userLists||[]){
    const key=exactListContentKey(L);if(!key||!(L.items||[]).length)continue;
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(L);
  }
  const ignored=new Set(state.duplicateIgnoreGroups||[]);
  return [...buckets.values()].filter(g=>g.length>1).filter(g=>includeIgnored||!ignored.has(duplicateGroupId(g))).sort((a,b)=>b[0].items.length-a[0].items.length||a[0].title.localeCompare(b[0].title,'de'));
}
function replaceListReference(oldId,newId){
  if(oldId===newId)return;
  if(state.currentListId===oldId)state.currentListId=newId;
  state.activeListIds=[...new Set((state.activeListIds||[]).map(id=>id===oldId?newId:id))];
  state.recentListIds=[...new Set((state.recentListIds||[]).map(id=>id===oldId?newId:id))];
  for(const p of state.patients||[])p.listIds=[...new Set((p.listIds||[]).map(id=>id===oldId?newId:id))];
  for(const plan of state.plans||[])for(const step of plan.steps||[]){
    if(step.listId===oldId)step.listId=newId;
    if(Array.isArray(step.listIds))step.listIds=[...new Set(step.listIds.map(id=>id===oldId?newId:id))];
  }
  for(const batch of state.importReviewBatches||[])batch.listIds=[...new Set((batch.listIds||[]).map(id=>id===oldId?newId:id))];
}
async function duplicateAudioInfo(group){
  const entries=await audioAllEntries(),byKey=new Map(entries);
  let recordings=0,conflicts=0;
  for(let i=0;i<(group[0]?.items||[]).length;i++){
    const present=[];
    for(const L of group){const it=L.items?.[i];if(!it)continue;const key=`${L.id}:${it.id}`;if(byKey.has(key)){present.push([key,byKey.get(key)]);recordings++;}}
    if(present.length>1)conflicts++;
  }
  return {byKey,recordings,conflicts};
}
async function mergeExactDuplicateGroup(group,keepId){
  const keep=group.find(L=>L.id===keepId);if(!keep)throw new Error('Zielliste nicht gefunden');
  if(group.some(L=>exactListContentKey(L)!==exactListContentKey(keep)))throw new Error('Listen sind nicht mehr 1:1 identisch. Bitte erneut prüfen.');
  const audio=await duplicateAudioInfo(group);if(audio.conflicts)throw new Error(`Nicht zusammengeführt: ${audio.conflicts} Position(en) enthalten Aufnahmen in mehreren Kopien. Bitte beide Listen behalten oder die Audio-Dopplung zuerst manuell klären.`);
  keep.aliases=[...new Set([...(keep.aliases||[]),...group.filter(L=>L.id!==keep.id).flatMap(L=>[L.title,...(L.aliases||[])])])].filter(x=>x&&x!==keep.title);
  setListFolders(keep,[...new Set(group.flatMap(listFolders))]);
  keep.gameTags=[...new Set(group.flatMap(listGameTags))];if(!keep.gameTags.includes('session'))keep.gameTags.unshift('session');
  for(const L of group){
    if(L.id===keep.id)continue;
    for(let i=0;i<(L.items||[]).length;i++){
      const src=L.items[i],dst=keep.items[i];if(!src||!dst)continue;
      const srcKey=`${L.id}:${src.id}`,dstKey=`${keep.id}:${dst.id}`,blob=audio.byKey.get(srcKey);
      if(blob&&!audio.byKey.has(dstKey)){await audioSet(dstKey,blob);audio.byKey.set(dstKey,blob);}
      if(blob)await audioDelete(srcKey);
    }
    replaceListReference(L.id,keep.id);
  }
  const removed=new Set(group.filter(L=>L.id!==keep.id).map(L=>L.id));
  state.userLists=state.userLists.filter(L=>!removed.has(L.id));
  state.duplicateIgnoreGroups=(state.duplicateIgnoreGroups||[]).filter(id=>{const members=new Set(String(id).split('|'));return !group.some(L=>members.has(L.id));});
  saveState();await flushStateSave();return keep;
}
async function openDuplicateReview(){
  let showIgnored=false;
  openModal('<div id="duplicateReviewRoot"></div>','duplicate-review-modal');
  const draw=async()=>{
    const all=findExactDuplicateGroups({includeIgnored:true}),ignoredSet=new Set(state.duplicateIgnoreGroups||[]),groups=showIgnored?all:all.filter(g=>!ignoredSet.has(duplicateGroupId(g)));
    const root=$('#duplicateReviewRoot');if(!root)return;
    root.innerHTML=`<div class="modal-head"><div><div class="eyebrow">Bibliothek aufräumen</div><h2>Exakte Duplikate prüfen</h2><p class="muted">Es werden nur Listen gruppiert, deren gespeicherter Inhalt, Reihenfolge, Typ und Silbeninformation 1:1 übereinstimmen. Name, Ordner und Spielzuordnung dürfen verschieden sein.</p></div><button class="icon-btn" data-close-duplicates>×</button></div>
      <div class="duplicate-toolbar"><span><strong>${all.length}</strong> Duplikatgruppe${all.length===1?'':'n'} gefunden</span><label class="toggle"><input id="showIgnoredDuplicates" type="checkbox" ${showIgnored?'checked':''}> bewusst behaltene zeigen</label></div>
      <div class="duplicate-list">${groups.length?groups.map((group,gi)=>{const gid=duplicateGroupId(group),ignored=ignoredSet.has(gid),keep=group[0];return `<section class="duplicate-group ${ignored?'ignored':''}" data-dup-group="${gi}"><div class="duplicate-group-head"><div><strong>${group.length} identische Listen</strong><span>${keep.items.length} Einträge · ${ignored?'bewusst behalten':'Prüfung offen'}</span></div>${ignored?`<button class="soft-btn compact-btn" data-dup-unignore="${esc(gid)}">Wieder prüfen</button>`:''}</div><div class="duplicate-rows">${group.map((L,i)=>`<label class="duplicate-row"><input type="radio" name="dupkeep_${gi}" value="${esc(L.id)}" ${i===0?'checked':''}><span class="duplicate-row-main"><strong>${esc(L.title)}</strong><small>${esc(listFolders(L).join(' · '))}</small><small>${L.sourcePath?esc(L.sourcePath):'Im Programm erstellt'}${(L.aliases||[]).length?` · Suchnamen: ${esc(L.aliases.join(', '))}`:''}</small></span><span>${L.items.length} Einträge</span></label>`).join('')}</div>${ignored?'':`<div class="duplicate-actions"><span class="small muted">Beim Zusammenführen bleiben die ausgewählte Liste, alle Ordner, Spielzuordnungen und Verknüpfungen erhalten. Abweichende Audioaufnahmen werden niemals still überschrieben.</span><button class="soft-btn" data-dup-ignore="${esc(gid)}">Bewusst beide behalten</button><button class="primary-btn" data-dup-merge="${gi}">Ausgewählte behalten & zusammenführen</button></div>`}</section>`}).join(''):`<div class="import-review-empty"><strong>Keine offenen exakten Duplikate.</strong><span>${all.length?'Alle gefundenen Gruppen wurden bewusst als getrennte Listen bestätigt.':'Die Bibliothek enthält aktuell keine 1:1 identischen Listen.'}</span></div>`}</div>
      <div class="modal-foot"><span class="small muted">Es wird niemals automatisch gelöscht oder zusammengeführt.</span><button class="primary-btn" data-close-duplicates>Fertig</button></div>`;
    $$('[data-close-duplicates]').forEach(b=>b.onclick=()=>{closeModal();renderLists();});
    $('#showIgnoredDuplicates')?.addEventListener('change',e=>{showIgnored=e.target.checked;draw();});
    $$('[data-dup-ignore]').forEach(b=>b.onclick=()=>{state.duplicateIgnoreGroups=[...new Set([...(state.duplicateIgnoreGroups||[]),b.dataset.dupIgnore])];saveState();draw();toast('Diese identischen Listen bleiben bewusst getrennt');});
    $$('[data-dup-unignore]').forEach(b=>b.onclick=()=>{state.duplicateIgnoreGroups=(state.duplicateIgnoreGroups||[]).filter(x=>x!==b.dataset.dupUnignore);saveState();draw();});
    $$('[data-dup-merge]').forEach(b=>b.onclick=async()=>{const gi=+b.dataset.dupMerge,group=groups[gi];if(!group)return;const selected=$(`input[name="dupkeep_${gi}"]:checked`)?.value||group[0].id;const keep=group.find(L=>L.id===selected);if(!keep)return;if(!confirm(`Diese ${group.length} inhaltlich identischen Listen zusammenführen?\n\nBehalten: ${keep.title}\n\nOrdner und Verknüpfungen werden vereinigt. Keine nicht-identischen Inhalte werden angerührt.`))return;b.disabled=true;b.textContent='Wird sicher zusammengeführt …';try{await mergeExactDuplicateGroup(group,selected);toast(`Duplikate zusammengeführt · „${keep.title}“ bleibt erhalten`);await draw();}catch(err){console.warn(err);toast(err.message||'Duplikate konnten nicht zusammengeführt werden');await draw();}});
  };
  await draw();
}

function openImportReview(scope=state.lastImportBatchId||'pending'){
  const batch=scope&&scope!=='pending'?(state.importReviewBatches||[]).find(b=>b.id===scope):null;
  const ids=batch?batch.listIds||[]:state.userLists.filter(listNeedsReview).map(L=>L.id);
  const target=ids.map(id=>state.userLists.find(L=>L.id===id)).filter(Boolean);
  let filter='all';
  openModal('<div id="importReviewRoot"></div>','import-review-modal');
  $('.modal-backdrop').onclick=e=>{if(e.target.classList.contains('modal-backdrop')){closeModal();renderLists();}};
  const draw=()=>{
    const pendingCount=target.filter(listNeedsReview).length,warningCount=target.filter(L=>L.review?.status==='warning').length,checkedCount=target.filter(L=>L.review?.status==='checked').length;
    let shown=target;
    if(filter==='pending')shown=target.filter(listNeedsReview);
    if(filter==='warning')shown=target.filter(L=>L.review?.status==='warning');
    if(filter==='checked')shown=target.filter(L=>L.review?.status==='checked');
    const root=$('#importReviewRoot');if(!root)return;
    root.innerHTML=`<div class="modal-head"><div><div class="eyebrow">${batch?'Letzter Import':'Importkontrolle'}</div><h2>${esc(batch?.title||'Ungeprüfte Listen')}</h2><p class="muted">${target.length} Listen · ${pendingCount} noch zu prüfen${warningCount?` · ${warningCount} mit Hinweis`:''}</p></div><button class="icon-btn" data-close-review>×</button></div>
      <div class="import-review-summary"><button class="review-filter ${filter==='all'?'active':''}" data-review-filter="all">Alle <strong>${target.length}</strong></button><button class="review-filter ${filter==='pending'?'active':''}" data-review-filter="pending">Ungeprüft <strong>${pendingCount}</strong></button><button class="review-filter ${filter==='warning'?'active':''}" data-review-filter="warning">Warnungen <strong>${warningCount}</strong></button><button class="review-filter ${filter==='checked'?'active':''}" data-review-filter="checked">Geprüft <strong>${checkedCount}</strong></button></div>
      ${batch?.failed?.length?`<div class="error-banner"><strong>${batch.failed.length} Dateien konnten nicht gelesen werden.</strong><br>${batch.failed.slice(0,8).map(x=>`${esc(x.name)} · ${esc(x.reason)}`).join('<br>')}${batch.failed.length>8?'<br>…':''}</div>`:''}
      <div class="import-review-table"><div class="import-review-head"><span>Liste / Ordner</span><span>Typ</span><span>Trennung</span><span>Einträge</span><span>Übungen</span><span>Erkennung</span><span>Aktion</span></div>
      ${shown.length?shown.map(L=>{const r=L.review||{},tags=listGameTags(L).filter(x=>x!=='session');return `<div class="import-review-row ${esc(r.status||'')}"><div class="review-list-main"><strong>${esc(L.title)}</strong><small>${esc(listFolders(L).join(' · '))}</small>${r.warnings?.length?`<small class="review-warning-text">${r.warnings.map(esc).join(' · ')}</small>`:''}</div><div data-label="Typ">${esc(listKindLabel(L))}</div><div data-label="Trennung"><code>${esc(r.separator||'–')}</code></div><div data-label="Einträge">${L.items?.length||0}</div><div data-label="Übungen" class="review-game-cell">${tags.length?tags.slice(0,5).map(t=>`<span>${esc(LIST_GAME_LABELS[t]||t)}</span>`).join(''):'<span>Wortanzeige</span>'}</div><div data-label="Erkennung"><span class="review-confidence ${esc(r.confidence||'unknown')}">${esc(confidenceLabel(r.confidence))}</span><br><span class="list-review-pill ${esc(r.status||'new')}">${esc(listReviewStatusLabel(L)||'NEU')}</span></div><div class="review-row-actions">${r.status==='checked'?`<button class="soft-btn compact-btn" data-review-reopen="${esc(L.id)}">Nochmal prüfen</button>`:`<button class="review-done-btn compact-btn" data-review-done="${esc(L.id)}">✓ Geprüft</button>`}<button class="soft-btn compact-btn" data-review-edit="${esc(L.id)}">Bearbeiten</button></div></div>`}).join(''):`<div class="import-review-empty"><strong>Für diesen Filter ist nichts mehr offen.</strong><span>Du kannst das Fenster schließen oder einen anderen Filter wählen.</span></div>`}</div>
      <div class="modal-foot import-review-foot"><span class="muted small">Prüfstatus, Ordnerzustand und Zuordnungen werden im WortZeit-Datenpaket mitgesichert.</span><button class="soft-btn" id="reviewDuplicates">Duplikate prüfen</button>${pendingCount?`<button class="review-done-btn" id="reviewAllDone">✓ Alle ${pendingCount} als geprüft markieren</button>`:''}<button class="primary-btn" data-close-review>Fertig</button></div>`;
    $$('[data-close-review]').forEach(b=>b.onclick=()=>{closeModal();renderLists();});
    $$('[data-review-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.reviewFilter;draw();});
    $$('[data-review-done]').forEach(b=>b.onclick=()=>{const L=state.userLists.find(x=>x.id===b.dataset.reviewDone);if(L)markListReviewed(L,true);draw();});
    $$('[data-review-reopen]').forEach(b=>b.onclick=()=>{const L=state.userLists.find(x=>x.id===b.dataset.reviewReopen);if(L)markListReviewed(L,false);draw();});
    $$('[data-review-edit]').forEach(b=>b.onclick=()=>{const L=state.userLists.find(x=>x.id===b.dataset.reviewEdit);if(!L)return;state.currentListId=L.id;saveState();closeModal();renderLists();setTimeout(()=>openListEditor(L,scope),20);});
    $('#reviewDuplicates')?.addEventListener('click',()=>{closeModal();setTimeout(()=>openDuplicateReview(),20);});
    $('#reviewAllDone')?.addEventListener('click',()=>{target.filter(listNeedsReview).forEach(L=>{L.review.status='checked';L.review.checkedAt=new Date().toISOString();});saveState();draw();toast('Import als geprüft markiert');});
  };
  draw();
}
async function importFiles(files,folder=false){
  let imported=0; const patientMap=new Map(),failed=[],batchId=uid('import'),batchListIds=[];
  for(const file of files){
    const lower=file.name.toLowerCase(); if(!/\.(rtf|txt|csv|json|odt|ods)$/.test(lower))continue;
    try{
      const txt=/\.od[ts]$/.test(lower)?await readOdtText(file):await readFileText(file);
      const rel=file.webkitRelativePath||file.name;
      if(lower.endsWith('.json')){
        const obj=JSON.parse(txt.replace(/^\uFEFF/,''));
        if(obj?.format==='wortzeit-list'&&obj.list){const L=normalizeListStorage({...obj.list,id:uid('list'),bundled:false,origin:'imported',sourcePath:obj.list.sourcePath||rel});L.review=createImportReview(L,{batchId,clean:'',separator:'WortZeit'});state.userLists.push(L);batchListIds.push(L.id);imported++;continue;}
      }
      const clean=lower.endsWith('.rtf')?decodeRtfBrowser(txt):txt;
      const likelySep=detectImportSeparator(clean,lower);
      const pieces=parsePlainList(clean,likelySep).filter(x=>!/^\*?Riched/i.test(x));
      if(!pieces.length)continue;
      const pathParts=rel.split('/');const idx=pathParts.findIndex(x=>x.toLowerCase()==='patienten');let category='Importiert';
      if(pathParts.length>1) category=pathParts.slice(0,-1).join(' / ');
      const L=makeUserList(file.name.replace(/\.[^.]+$/,''),pieces,category,rel,'',likelySep||'');
      if(/(^|\/)memory(\/|$)|memo/i.test(rel)){L.kind='pair';L.pairs=[];for(let i=0;i<pieces.length-1;i+=2)L.pairs.push({id:uid('pair'),a:pieces[i],b:pieces[i+1]});}
      if(/feuerwerk|geschichte.*auswahl|auswahl.*geschichte/i.test(`${L.title} ${rel}`)&&L.items.length%5===0)L.kind='choiceStory';
      L.gameTags=inferListGameTags(L);L.review=createImportReview(L,{batchId,clean,separator:likelySep});state.userLists.push(L);batchListIds.push(L.id);imported++;
      if(idx>=0&&pathParts[idx+1]){const patientName=pathParts[idx+1];if(!patientMap.has(patientName))patientMap.set(patientName,[]);patientMap.get(patientName).push(L.id);}
    }catch(e){console.warn('Import failed',file.name,e);failed.push({name:file.name,reason:e?.message||'nicht lesbar'});}
  }
  patientMap.forEach((ids,name)=>{let p=state.patients.find(x=>x.name===name);if(!p){p={id:uid('patient'),name,listIds:[],note:''};state.patients.push(p);}p.listIds=[...new Set([...(p.listIds||[]),...ids])];});
  if(imported||failed.length){const batch={id:batchId,createdAt:new Date().toISOString(),title:folder?'Ordnerimport':'Dateiimport',listIds:batchListIds,failed};state.importReviewBatches=[batch,...(state.importReviewBatches||[]).filter(b=>b.id!==batchId)].slice(0,30);state.lastImportBatchId=batchId;state.listFolderOpen={};}
  saveState();renderLists();toast(`${imported} Datei${imported===1?'':'en'} importiert${failed.length?` · ${failed.length} nicht gelesen`:''}`);
  if(imported||failed.length)setTimeout(()=>openImportReview(batchId),80);
}

function openRecordingBank(L){
  let idx=0,rec=null,chunks=[],stream=null;
  const show=()=>{
    const item=(L.items||[])[idx];
    if(!item)return;
    openModal(`<div class="modal-head"><div><div class="eyebrow">Aufnahmebank · ${idx+1}/${L.items.length}</div><h2>${esc(item.text)}</h2></div><button class="icon-btn" data-close-modal>×</button></div><p class="help-text">So können die Wörter der Liste nacheinander aufgenommen werden. Die Aufnahme bleibt lokal und ist direkt mit diesem Eintrag verknüpft.</p><div class="form-row"><button class="soft-btn" id="bankPrev" ${idx<=0?'disabled':''}>← Vorheriges</button><button class="soft-btn" id="bankNext" ${idx>=L.items.length-1?'disabled':''}>Nächstes →</button></div><div class="divider"></div><div class="form-row"><button class="primary-btn" id="bankRec">● Aufnahme starten</button><button class="secondary-btn" id="bankStop" disabled>■ Stop</button><button class="soft-btn" id="bankPlay">▶ Anhören</button><button class="danger-btn" id="bankDelete">Löschen</button></div><div id="bankStatus" class="small muted" style="margin-top:12px">Bereit</div>`);
    const key=`${L.id}:${item.id}`;
    $('#bankPrev').onclick=()=>{idx=Math.max(0,idx-1);show();};$('#bankNext').onclick=()=>{idx=Math.min(L.items.length-1,idx+1);show();};
    $('#bankRec').onclick=async()=>{try{if(!navigator.mediaDevices?.getUserMedia||!('MediaRecorder' in window))throw new Error('Aufnahme wird von diesem Browser nicht unterstützt');stream=await navigator.mediaDevices.getUserMedia({audio:true});rec=new MediaRecorder(stream);chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=async()=>{const blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'});await audioSet(key,blob);stream?.getTracks().forEach(t=>t.stop());$('#bankStatus').textContent='Gespeichert. Mit „Nächstes“ direkt weiter.';};rec.start();$('#bankStatus').textContent='Aufnahme läuft …';$('#bankRec').disabled=true;$('#bankStop').disabled=false;}catch(e){$('#bankStatus').textContent=`Mikrofon nicht verfügbar: ${e?.message||'Bitte Berechtigung prüfen.'}`;}};
    $('#bankStop').onclick=()=>{if(rec&&rec.state!=='inactive')rec.stop();$('#bankStop').disabled=true;$('#bankRec').disabled=false;};
    $('#bankPlay').onclick=async()=>{const b=await audioGet(key);if(b)playBlob(b);else toast('Noch keine Aufnahme gespeichert');};
    $('#bankDelete').onclick=async()=>{await audioDelete(key);$('#bankStatus').textContent='Aufnahme gelöscht.';};
    $$('[data-close-modal]').forEach(b=>b.onclick=()=>{try{if(rec&&rec.state!=='inactive')rec.stop();stream?.getTracks().forEach(t=>t.stop());}catch{}closeModal();});
  };
  show();
}

// ---------- Games hub ----------
function renderGames(){
  $('#view').innerHTML=pageHead('Spiele','Übungen',`Wähle eine Übung. Wortbasierte Spiele verwenden ${activeLists().length>1?`die ${activeLists().length} aktiv gemischten Listen`:'die aktive Liste'}.`)+`
  <div class="grid cards">
    <button class="action-card" data-route="letters"><span class="action-icon">A B C</span><strong>Buchstaben</strong><span>Ein Wort aus einzelnen Buchstaben zusammensetzen.</span></button>
    <button class="action-card" data-route="memory"><span class="action-icon">▦</span><strong>Memory</strong><span>Memory-Art, Kartenzahl und Spieler zuerst ruhig auswählen.</span></button>
    <button class="action-card" data-route="sorting"><span class="action-icon">⇅</span><strong>Sortieren</strong><span>Hinweise lesen und Begriffe an die passenden Stellen setzen.</span></button>
    <button class="action-card" data-route="story"><span class="action-icon">▧</span><strong>Bildergeschichte</strong><span>Vier Bilder in die richtige zeitliche Reihenfolge bringen.</span></button>
    <button class="action-card" data-route="choiceStory"><span class="action-icon">…?</span><strong>Geschichte bauen</strong><span>Aus vier Möglichkeiten eine eigene fortlaufende Geschichte entstehen lassen.</span></button>
    <button class="action-card" data-route="wheel"><span class="action-icon">↻</span><strong>Wortwalze</strong><span>Eine große Wortwalze drehen lassen und Wörter für Sätze oder Geschichten sammeln.</span></button>
    <button class="action-card" data-route="syllables"><span class="action-icon">⬡</span><strong>Silben</strong><span>Silben an festen Eckpunkten auswählen und oben zu Wörtern zusammensetzen.</span></button>
    <button class="action-card" data-route="semantic"><span class="action-icon">◎</span><strong>Wortnetz</strong><span>Einen Begriff gemeinsam über Kategorie, Ort, Funktion und Eigenschaften erschließen.</span></button>
  </div>`;
  bindRouteButtons(); bindPlanBar();
}

// ---------- Letters ----------
function newLetterRound(){
  const items=activeItems().filter(x=>/^[A-Za-zÄÖÜäöüß]{2,24}$/.test(x.text.trim()));
  if(!items.length){game.letters=null;return;}
  const used=game.letterUsed||new Set();let choices=items.filter(x=>!used.has(x.id));if(!choices.length){used.clear();choices=items;}
  const item=choices[Math.floor(Math.random()*choices.length)];used.add(item.id);game.letterUsed=used;
  const chars=[...item.text.toUpperCase()];let bank=shuffle(chars.map((c,i)=>({id:`l${i}_${Math.random().toString(36).slice(2,7)}`,c})));if(bank.map(x=>x.c).join('')===chars.join('')&&bank.length>1)bank=shuffle(bank);
  game.letters={item,target:chars,bank,placed:Array(chars.length).fill(null),message:'',materialKey:activeMaterialKey()};
}
function letterEvaluate(g){
  if(!g.placed.every(Boolean)){g.message='';return false;}
  const got=g.placed.map(x=>x.c).join(''),target=g.target.join('');
  if(got===target){g.message='Richtig!';state.stats.letterScore++;saveState();setTimeout(()=>{newLetterRound();renderLetters();},650);return true;}
  g.message='Noch nicht ganz. Du kannst die Buchstaben oben direkt umsortieren.';return false;
}
function renderLetters(){
  if(!game.letters||game.letters.materialKey!==activeMaterialKey())newLetterRound();
  const g=game.letters;
  const controls=`<div class="score-box">Punkte ${state.stats.letterScore}</div><button class="soft-btn" id="letterReset">Reset</button>`;
  $('#view').innerHTML=`${activePlanRun?planRunBar():''}<div class="game-shell">${gameHeader('Buchstaben','Baue das Wort. Antippen oder einen Buchstaben direkt an die gewünschte Stelle ziehen.',controls)}<div class="game-board">${!g?'<div class="error-banner">Diese Liste enthält keine einzelnen Wörter, die sich für diese Übung eignen.</div>':`<div class="center muted">${g.target.length} Buchstaben</div><div class="letter-targets" id="letterTargets">${g.target.map((_,i)=>{const x=g.placed[i];return `<div class="letter-slot ${x?'filled':''}" data-slot="${i}" draggable="${x?'true':'false'}">${esc(x?.c||'')}</div>`}).join('')}</div><div class="letter-bank" id="letterBank">${g.bank.map((x,i)=>{const used=g.placed.some(p=>p?.id===x.id);return `<button class="letter-tile ${used?'used':''}" draggable="${used?'false':'true'}" data-letter="${i}" ${used?'disabled':''}>${esc(x.c)}</button>`}).join('')}</div>${g.message?`<div class="section center ${g.message==='Richtig!'?'success-banner':'error-banner'}">${esc(g.message)}</div>`:''}`}</div></div>`;
  bindPlanBar();bindGameChrome();if(!g)return;
  const put=(bankIndex,slotIndex)=>{const tile=g.bank[bankIndex];if(!tile)return;const oldSlot=g.placed.findIndex(p=>p?.id===tile.id);if(oldSlot>=0)g.placed[oldSlot]=null;g.placed[slotIndex]=tile;letterEvaluate(g);renderLetters();};
  $$('[data-letter]').forEach(b=>{b.onclick=()=>{const first=g.placed.findIndex(x=>!x);if(first>=0)put(+b.dataset.letter,first);};b.ondragstart=e=>e.dataTransfer.setData('text/plain',`bank:${b.dataset.letter}`);});
  $$('.letter-slot').forEach((slot,i)=>{
    slot.onclick=()=>{if(g.placed[i]){g.placed[i]=null;g.message='';renderLetters();}};
    slot.ondragstart=e=>{if(g.placed[i])e.dataTransfer.setData('text/plain',`slot:${i}`);};
    slot.ondragover=e=>{e.preventDefault();slot.classList.add('drag-over');};slot.ondragleave=()=>slot.classList.remove('drag-over');
    slot.ondrop=e=>{e.preventDefault();slot.classList.remove('drag-over');const raw=e.dataTransfer.getData('text/plain');if(raw.startsWith('bank:'))put(+raw.split(':')[1],i);else if(raw.startsWith('slot:')){const from=+raw.split(':')[1];if(from!==i){[g.placed[from],g.placed[i]]=[g.placed[i],g.placed[from]];letterEvaluate(g);renderLetters();}}};
  });
  $('#letterBank').ondragover=e=>e.preventDefault();$('#letterBank').ondrop=e=>{e.preventDefault();const raw=e.dataTransfer.getData('text/plain');if(raw.startsWith('slot:')){g.placed[+raw.split(':')[1]]=null;g.message='';renderLetters();}};
  $('#letterReset').onclick=()=>{g.placed=Array(g.target.length).fill(null);g.message='';renderLetters();};
}

// ---------- Memory ----------
async function createMemoryRound(){
  const requested=clamp(+game.memoryCount||12,8,24); const pairCount=Math.floor(requested/2); const mode=game.memoryMode||'normal';
  let cards=[];
  if(mode==='image'){
    const imgs=DATA.imageStories.flatMap(s=>s.pieces).slice(); const chosen=shuffle(imgs).slice(0,pairCount);
    chosen.forEach((src,i)=>{cards.push({pair:i,type:'image',value:src},{pair:i,type:'image',value:src});});
  }else if(mode==='ab'){
    let pairs=activePairs();
    if(!pairs.length){const items=activeItems().filter(x=>x.text).slice(0,pairCount);pairs=items.map(x=>({a:x.text,b:x.text}));}
    pairs=shuffle(pairs).slice(0,pairCount);
    pairs.forEach((p,i)=>cards.push({pair:i,type:'text',value:p.a},{pair:i,type:'text',value:p.b}));
  }else if(mode==='audio'){
    const items=shuffle(activeItems().filter(x=>x.text)); const available=[];
    for(const it of items){if(await audioGet(`${it.sourceListId||state.currentListId}:${it.id}`))available.push(it);if(available.length>=pairCount)break;}
    if(available.length<pairCount){game.memoryAudioWarning=`Für ${requested} Karten werden ${pairCount} aufgenommene Wörter benötigt. Gefunden: ${available.length}. Wähle weniger Karten oder nimm weitere Wörter in der Aufnahmebank auf.`;game.memoryStage='setup';game.memory=null;return;}
    game.memoryAudioWarning='';available.slice(0,pairCount).forEach((it,i)=>cards.push({pair:i,type:'text',value:it.text},{pair:i,type:'audio',value:'🔊',audioKey:`${it.sourceListId||state.currentListId}:${it.id}`}));
  }else{
    const items=shuffle(activeItems().filter(x=>x.text)).slice(0,pairCount);
    if(items.length<pairCount){toast(`Für ${requested} Karten sind nur ${items.length*2} Karten aus dem Material möglich.`);}
    items.forEach((it,i)=>cards.push({pair:i,type:'text',value:it.text},{pair:i,type:'text',value:it.text}));
  }
  game.memory={cards:shuffle(cards).map((c,i)=>({...c,id:i,revealed:mode==='inverse',matched:false})),first:null,lock:false,pending:null,players:+game.memoryPlayers||1,currentPlayer:0,scores:[0,0],turns:0,mode,manualAdvance:!!game.memoryManualAdvance,materialKey:activeMaterialKey(),justDealt:true,lastFlipped:null};
}
function memoryModeLabel(mode){return ({normal:'Normal',inverse:'Offen',ab:'A/B',audio:'Audio',image:'Bilder'})[mode]||mode;}
function renderMemorySetup(){
  game.memoryStage='setup';
  const mode=game.memoryMode||'normal',count=+game.memoryCount||12,players=+game.memoryPlayers||1;
  $('#view').innerHTML=`${activePlanRun?planRunBar():''}<div class="game-shell memory-setup-shell">${gameHeader('Memory','Erst auswählen, dann startet das Spiel ruhig und übersichtlich.')}<div class="game-board memory-setup-board"><div class="memory-setup-panel"><div><div class="eyebrow">Memory-Art</div><div class="memory-choice-row">${[
    ['normal','Normal','Karten verdeckt'],['inverse','Offen','Wörter bleiben sichtbar'],['ab','A/B','Zusammengehörende Begriffe'],['audio','Audio','Wort und Aufnahme'],['image','Bilder','Bildpaare']
  ].map(([id,t,d])=>`<button class="memory-choice ${mode===id?'selected':''}" data-memory-mode="${id}"><strong>${t}</strong><span>${d}</span></button>`).join('')}</div></div><div><div class="eyebrow">Kartenzahl</div><div class="memory-count-row">${[8,12,16,24].map(n=>`<button class="memory-count-card ${count===n?'selected':''}" data-memory-count="${n}">${n}</button>`).join('')}</div></div><div><div class="eyebrow">Spieler</div><div class="memory-player-row"><button class="memory-choice compact ${players===1?'selected':''}" data-memory-players="1"><strong>1 Spieler</strong></button><button class="memory-choice compact ${players===2?'selected':''}" data-memory-players="2"><strong>2 Spieler</strong></button></div></div>${mode==='audio'&&game.memoryAudioWarning?`<div class="error-banner memory-audio-warning">${esc(game.memoryAudioWarning)}</div>`:''}<button class="primary-btn memory-start-btn" data-game-primary id="memoryStart">Memory starten</button></div></div></div>`;
  bindPlanBar();bindGameChrome();
  $$('[data-memory-mode]').forEach(b=>b.onclick=()=>{game.memoryMode=b.dataset.memoryMode;game.memoryAudioWarning='';renderMemorySetup();});
  $$('[data-memory-count]').forEach(b=>b.onclick=()=>{game.memoryCount=+b.dataset.memoryCount;game.memoryAudioWarning='';renderMemorySetup();});
  $$('[data-memory-players]').forEach(b=>b.onclick=()=>{game.memoryPlayers=+b.dataset.memoryPlayers;renderMemorySetup();});
  $('#memoryStart').onclick=()=>{const panel=$('.memory-setup-panel');panel?.classList.add('leaving');setTimeout(async()=>{game.memoryStage='play';await createMemoryRound();renderMemory();},150);};
}
function memoryGridShape(count,boardW=window.innerWidth,boardH=window.innerHeight,gap=10){
  const landscape=boardW>=boardH;
  if(count===8)return landscape?{cols:4,rows:2}:{cols:2,rows:4};
  if(count===12)return landscape?{cols:6,rows:2}:{cols:3,rows:4};
  const candidates=[];
  for(let rows=2;rows<=count;rows++){
    if(count%rows)continue;const cols=count/rows;
    if(landscape&&cols<rows)continue;if(!landscape&&rows<cols)continue;
    const size=Math.min((boardW-gap*(cols-1))/cols,(boardH-gap*(rows-1))/rows);
    candidates.push({cols,rows,size});
  }
  if(!candidates.length){const cols=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/cols);return {cols,rows};}
  candidates.sort((a,b)=>b.size-a.size || (landscape?b.cols-a.cols:b.rows-a.rows));
  return candidates[0];
}
function fitMemoryBoard(){
  const board=$('body.game-memory .memory-board'),grid=$('body.game-memory .memory-grid'),g=game.memory;
  if(!board||!grid||!g)return;
  const gap=clamp(Math.round(Math.min(board.clientWidth,board.clientHeight)*.014),5,12);
  const availableW=Math.max(1,board.clientWidth-8),availableH=Math.max(1,board.clientHeight-8);
  const {cols,rows}=memoryGridShape(g.cards.length,availableW,availableH,gap);
  const size=Math.max(1,Math.floor(Math.min((availableW-gap*(cols-1))/cols,(availableH-gap*(rows-1))/rows)));
  grid.style.setProperty('--memory-card-size',`${size}px`);
  grid.style.setProperty('--memory-gap',`${gap}px`);
  grid.style.gridTemplateColumns=`repeat(${cols}, ${size}px)`;
  grid.style.gridAutoRows=`${size}px`;
}
function renderMemory(){
  if(!game.memoryStage||game.memoryStage==='setup')return renderMemorySetup();
  if(!game.memory||game.memory.materialKey!==activeMaterialKey()){createMemoryRound().then(renderMemory);$('#view').innerHTML='<div class="card">Memory wird vorbereitet …</div>';return;}
  const g=game.memory;
  const continueBtn=g.pending?`<button class="primary-btn game-check-btn" data-game-primary id="memoryContinue">Weiter</button>`:'';
  const controls=`<div class="score-box">Versuche ${g.turns}</div>${g.players===2?`<div class="score-box">P1 ${g.scores[0]} · P2 ${g.scores[1]}</div><div class="score-box">Am Zug ${g.currentPlayer+1}</div>`:`<div class="score-box">Paare ${g.scores[0]}</div>`}<button class="soft-btn memory-hold-toggle ${g.manualAdvance?'active':''}" id="memoryHold">Paar halten ${g.manualAdvance?'AN':'AUS'}</button>${continueBtn}<button class="soft-btn" id="newMemory">Neue Runde</button>`;
  $('#view').innerHTML=`${activePlanRun?planRunBar():''}<div class="game-shell">${gameHeader('Memory',`${memoryModeLabel(g.mode)} · ${g.cards.length} Karten · ${g.players===2?'2 Spieler':'1 Spieler'}`,controls)}<div class="game-board memory-board"><div class="memory-grid">${g.cards.map((c,i)=>`<button class="memory-card ${(c.revealed||c.matched||g.mode==='inverse')?'revealed':''} ${g.mode==='inverse'?'inverse':''} ${c.matched?'matched':''} ${g.justDealt?'dealing':''}" style="--deal:${i}" data-card="${c.id}"><span class="memory-card-inner"><span class="memory-face memory-back">?</span><span class="memory-face memory-front">${memoryCardContent(c)}</span></span></button>`).join('')}</div></div></div>`;
  bindPlanBar();bindGameChrome();requestAnimationFrame(fitMemoryBoard);
  $('#newMemory').onclick=async()=>{await createMemoryRound();renderMemory();};
  $('#memoryHold').onclick=()=>{game.memoryManualAdvance=!g.manualAdvance;g.manualAdvance=game.memoryManualAdvance;renderMemory();};
  $('#memoryContinue')?.addEventListener('click',resolveMemoryPair);
  $$('[data-card]').forEach(b=>b.onclick=()=>flipMemory(+b.dataset.card));
  requestAnimationFrame(()=>{if(game.memory===g)g.justDealt=false;});
}
function memoryCardContent(c){if(c.type==='image')return `<img src="${esc(c.value)}" alt="Bildkarte">`;if(c.type==='audio')return `<span class="audio-memory-face"><span aria-hidden="true">🔊</span><small>AUFNAHME</small></span>`;return esc(c.value);}
async function flipMemory(id){
  const g=game.memory;if(!g||g.lock)return;const c=g.cards.find(x=>x.id===id);if(!c||c.matched)return;if(g.mode!=='inverse'&&c.revealed)return;
  c.revealed=true;g.lastFlipped=id;if(c.type==='audio'&&c.audioKey){const blob=await audioGet(c.audioKey);if(blob)playBlob(blob);}
  if(g.first==null){g.first=id;renderMemory();return;}if(g.first===id)return;
  g.turns++;const a=g.cards.find(x=>x.id===g.first);g.pending={aId:a.id,bId:c.id,isMatch:a.pair===c.pair};g.lock=true;renderMemory();
  if(!g.manualAdvance)setTimeout(()=>{if(game.memory===g&&g.pending)resolveMemoryPair();},g.pending.isMatch?480:900);
}
function resolveMemoryPair(){
  const g=game.memory;if(!g?.pending)return;const {aId,bId,isMatch}=g.pending,a=g.cards.find(x=>x.id===aId),b=g.cards.find(x=>x.id===bId);
  if(isMatch){if(a)a.matched=true;if(b)b.matched=true;g.scores[g.currentPlayer]++;}
  else{if(g.mode!=='inverse'){if(a)a.revealed=false;if(b)b.revealed=false;}if(g.players===2)g.currentPlayer=1-g.currentPlayer;}
  g.first=null;g.pending=null;g.lock=false;renderMemory();
  if(g.cards.length&&g.cards.every(x=>x.matched))toast(g.players===2?(g.scores[0]===g.scores[1]?'Memory fertig – unentschieden':`Memory fertig – Spieler ${g.scores[0]>g.scores[1]?1:2} gewinnt`):'Memory geschafft');
}

// ---------- Sorting puzzles ----------
function newSortingPuzzle(direction=1){
  if(!game.sortOrder||!game.sortOrder.length)game.sortOrder=shuffle(DATA.sortingPuzzles.map((_,i)=>i));
  if(game.sortPos==null)game.sortPos=0;
  else{
    const delta=direction===false?0:direction===true?1:Number(direction)||0;
    if(delta)game.sortPos=(game.sortPos+delta+game.sortOrder.length)%game.sortOrder.length;
  }
  const p=DATA.sortingPuzzles[game.sortOrder[game.sortPos]]; game.sort={p,placed:p.attributes.map(()=>Array(p.solutions.length).fill(null)),selected:null,message:''};
}
function renderSorting(){
  if(!game.sort)newSortingPuzzle(false);const g=game.sort,p=g.p,cols=p.solutions.length;
  const candidateGroups=p.attributes.map((attr,ai)=>({attr,values:shuffle(p.solutions.map(r=>r[ai]))}));
  if(!g.candidateGroups)g.candidateGroups=candidateGroups;
  const currentPuzzleIndex=DATA.sortingPuzzles.indexOf(p);const puzzlePicker=`<label class="sorting-puzzle-picker"><span>Übung</span><select id="sortPuzzleSelect" aria-label="Sortierübung auswählen">${DATA.sortingPuzzles.map((q,i)=>`<option value="${i}" ${i===currentPuzzleIndex?'selected':''}>${esc(q.title||`Aufgabe ${i+1}`)}</option>`).join('')}</select></label>`;
  const controls=`${puzzlePicker}<div class="score-box">Punkte ${state.stats.sortScore}</div><button class="soft-btn" id="sortPrev" title="Vorherige Aufgabe">← Aufgabe</button><button class="soft-btn" id="sortReset">Reset</button><button class="soft-btn" id="sortNext">Nächstes</button>`;
  const primary=`<button class="primary-btn game-check-btn" data-game-primary id="sortCheck">Prüfen</button>`;
  $('#view').innerHTML=`${activePlanRun?planRunBar():''}<div class="game-shell">${gameHeader(p.title,`${esc(p.question)}${p.difficulty?` · Schwierigkeit ${p.difficulty}`:''}`,controls,primary)}<div class="game-board"><div class="sort-layout"><div class="card sort-hints"><h3>Hinweise</h3><ol class="hint-list">${p.hints.map(h=>`<li>${esc(h)}</li>`).join('')}</ol></div><div class="sort-interaction"><div class="card sort-targets"><div class="sort-grid">${p.attributes.map((attr,ai)=>`<div class="sort-row" style="--cols:${cols}"><div class="sort-label">${esc(attr)}</div>${g.placed[ai].map((v,ci)=>`<button class="sort-cell" data-cell="${ai}:${ci}" draggable="${v!=null?'true':'false'}">${esc(v||'')}</button>`).join('')}</div>`).join('')}</div>${g.message?`<div class="sort-message ${g.message==='Richtig!'?'success-banner':'error-banner'}">${esc(g.message)}</div>`:''}</div><div class="card sort-candidates"><h3>Auswahl</h3><div class="sort-candidate-groups">${g.candidateGroups.map((cg,ai)=>`<div class="candidate-group"><h4>${esc(cg.attr)}</h4><div class="candidate-bank">${cg.values.map((v,vi)=>{const occurrenceBefore=cg.values.slice(0,vi).filter(x=>x===v).length;const usedCount=g.placed[ai].filter(x=>x===v).length;const used=usedCount>occurrenceBefore;const sel=g.selected&&g.selected.ai===ai&&g.selected.vi===vi;return `<button class="candidate ${sel?'selected':''} ${used?'used':''}" data-candidate="${ai}:${vi}" draggable="${used?'false':'true'}" ${used?'disabled':''}>${esc(v)}</button>`}).join('')}</div></div>`).join('')}</div></div></div></div></div></div>`;
  bindPlanBar();bindGameChrome();
  const assign=(ai,vi,ci)=>{if(ai<0||vi<0||ci<0)return;const value=g.candidateGroups[ai]?.values[vi];if(value==null)return;g.placed[ai][ci]=value;g.selected=null;g.message='';renderSorting();};
  $$('[data-candidate]').forEach(b=>{b.onclick=()=>{const [ai,vi]=b.dataset.candidate.split(':').map(Number);g.selected={ai,vi};renderSorting();};b.ondragstart=e=>e.dataTransfer.setData('text/plain',`candidate:${b.dataset.candidate}`);});
  $$('[data-cell]').forEach(b=>{
    const [ai,ci]=b.dataset.cell.split(':').map(Number);
    b.onclick=()=>{if(g.selected&&g.selected.ai===ai){assign(ai,g.selected.vi,ci);}else if(g.placed[ai][ci]!=null){g.placed[ai][ci]=null;g.message='';renderSorting();}};
    b.ondragstart=e=>{if(g.placed[ai][ci]!=null)e.dataTransfer.setData('text/plain',`cell:${ai}:${ci}`);};
    b.ondragover=e=>{e.preventDefault();b.classList.add('drag-over');};b.ondragleave=()=>b.classList.remove('drag-over');
    b.ondrop=e=>{e.preventDefault();b.classList.remove('drag-over');const raw=e.dataTransfer.getData('text/plain');if(raw.startsWith('candidate:')){const [,a,v]=raw.split(':');if(+a===ai)assign(ai,+v,ci);else toast('Dieser Begriff gehört in eine andere Zeile.');}else if(raw.startsWith('cell:')){const [,a,c]=raw.split(':');if(+a===ai&&+c!==ci){[g.placed[ai][+c],g.placed[ai][ci]]=[g.placed[ai][ci],g.placed[ai][+c]];g.message='';renderSorting();}}};
  });
  $('#sortPuzzleSelect').onchange=e=>{const idx=+e.target.value;if(!Number.isInteger(idx)||!DATA.sortingPuzzles[idx])return;let pos=game.sortOrder.indexOf(idx);if(pos<0){game.sortOrder.push(idx);pos=game.sortOrder.length-1;}game.sortPos=pos;newSortingPuzzle(false);renderSorting();};
  $('#sortPrev').onclick=()=>{newSortingPuzzle(-1);renderSorting();};
  $('#sortReset').onclick=()=>{g.placed=p.attributes.map(()=>Array(cols).fill(null));g.selected=null;g.message='';renderSorting();};
  $('#sortNext').onclick=()=>{newSortingPuzzle(1);renderSorting();};
  $('#sortCheck').onclick=()=>{let ok=true;for(let ai=0;ai<p.attributes.length;ai++)for(let ci=0;ci<cols;ci++)if(g.placed[ai][ci]!==p.solutions[ci][ai])ok=false;g.message=ok?'Richtig!':'Noch nicht richtig.';if(ok){state.stats.sortScore++;saveState();}renderSorting();};
}

// ---------- Image stories ----------
function storyDisplayTitle(story){return state.storyTitleOverrides?.[story.id]||`Bildergeschichte ${String(story.sequenceNumber||1).padStart(2,'0')}`;}
function newStory(direction=1){if(!game.storyOrder||!game.storyOrder.length)game.storyOrder=shuffle(DATA.imageStories.map((_,i)=>i));if(game.storyPos==null)game.storyPos=0;else{const delta=direction===false?0:direction===true?1:Number(direction)||0;if(delta)game.storyPos=(game.storyPos+delta+game.storyOrder.length)%game.storyOrder.length;}const s=DATA.imageStories[game.storyOrder[game.storyPos]];let order=shuffle([0,1,2,3]);if(order.join('')==='0123')order=[1,0,3,2];game.story={s,order,selected:null,message:''};}
function fitStoryBoard(){
  const board=$('body.game-story .story-board'),grid=$('body.game-story .story-grid');
  if(!board||!grid)return;
  const gap=clamp(Math.round(Math.min(board.clientWidth,board.clientHeight)*.018),6,14);
  const size=Math.max(160,Math.floor(Math.min(board.clientWidth-20,board.clientHeight-20)));
  grid.style.setProperty('width',`${size}px`,'important');grid.style.setProperty('height',`${size}px`,'important');grid.style.setProperty('gap',`${gap}px`,'important');
}
function storyMarkComplete(g){
  if(g.complete)return;g.complete=true;g.message='Richtig! Nehmt euch Zeit, die Geschichte noch einmal gemeinsam zu erzählen.';state.stats.storyScore++;saveState();
}
function storyCheckAuto(g){if(g.order.join('')==='0123')storyMarkComplete(g);}
function renderStory(){
  if(!game.story)newStory(false);const g=game.story,title=storyDisplayTitle(g.s);
  const controls=`<div class="score-box">Punkte ${state.stats.storyScore}</div><button class="soft-btn" id="storyPrev" title="Vorherige Bildergeschichte">← Aufgabe</button><button class="soft-btn" id="storyReset">Mischen</button>`;
  const primary=g.complete?`<button class="primary-btn game-check-btn" data-game-primary id="storyContinue">Weiter</button>`:`<button class="primary-btn game-check-btn" data-game-primary id="storyCheck">Prüfen</button>`;
  $('#view').innerHTML=`${activePlanRun?planRunBar():''}<div class="game-shell">${gameHeader('Bildergeschichte',`<strong>${esc(title)}</strong> · Bringe die vier Bilder in die richtige Reihenfolge.`,controls,primary)}<div class="game-board story-board"><div class="story-grid">${g.order.map((piece,pos)=>`<button class="story-tile ${g.selected===pos?'selected':''}" draggable="true" data-story-pos="${pos}"><img src="${esc(g.s.pieces[piece])}" alt="Bild ${pos+1}"></button>`).join('')}</div>${g.message?`<div class="game-floating-message ${g.complete?'success-banner':'error-banner'}">${esc(g.message)}</div>`:''}</div></div>`;
  bindPlanBar();bindGameChrome();requestAnimationFrame(fitStoryBoard);
  $$('[data-story-pos]').forEach(b=>{b.onclick=()=>selectStory(+b.dataset.storyPos);b.ondragstart=e=>e.dataTransfer.setData('text/plain',b.dataset.storyPos);b.ondragover=e=>{e.preventDefault();b.classList.add('drag-over')};b.ondragleave=()=>b.classList.remove('drag-over');b.ondrop=e=>{e.preventDefault();b.classList.remove('drag-over');if(g.complete)return;const a=+e.dataTransfer.getData('text/plain'),c=+b.dataset.storyPos;if(Number.isFinite(a)&&a!==c){[g.order[a],g.order[c]]=[g.order[c],g.order[a]];g.message='';storyCheckAuto(g);renderStory();}};});
  $('#storyPrev').onclick=()=>{newStory(-1);renderStory();};
  $('#storyReset').onclick=()=>{g.order=shuffle([0,1,2,3]);if(g.order.join('')==='0123')g.order=[1,0,3,2];g.selected=null;g.message='';g.complete=false;renderStory();};
  $('#storyContinue')?.addEventListener('click',()=>{newStory(1);renderStory();});
  $('#storyCheck')?.addEventListener('click',()=>{const ok=g.order.join('')==='0123';if(ok)storyMarkComplete(g);else g.message='Noch nicht richtig.';renderStory();});
}
function selectStory(pos){const g=game.story;if(g.complete)return;if(g.selected==null){g.selected=pos;}else if(g.selected===pos){g.selected=null;}else{[g.order[g.selected],g.order[pos]]=[g.order[pos],g.order[g.selected]];g.selected=null;g.message='';storyCheckAuto(g);}renderStory();}

// ---------- Word wheel ----------
function wheelWords(){
  const items=activeItems().map(x=>String(x.text||'').trim()).filter(x=>x&&x.length<90);
  const words=[...new Set(items)];return words.length?words:defaultList.items.map(x=>x.text);
}
function randomWheelWord(g,avoid=''){if(!g?.words?.length)return '';let w=g.words[Math.floor(Math.random()*g.words.length)];for(let i=0;i<6&&w===avoid&&g.words.length>1;i++)w=g.words[Math.floor(Math.random()*g.words.length)];return w;}
function initWheel(){const words=wheelWords();const g={spinning:false,raf:null,speed:game.wheelSpeed||38,fontScale:game.wheelFontScaleV2??50,rows:[],selected:[],words,offset:0,lastFrame:0,materialKey:activeMaterialKey()};for(let i=0;i<12;i++)g.rows.push(randomWheelWord(g,g.rows.at(-1)));game.wheel=g;}
function wheelRowHeight(){return $('.wheel-row')?.getBoundingClientRect().height||96;}
function fitWheelGeometry(){
  const g=game.wheel,stage=$('#wheelStage');if(!g||!stage)return;
  // 50% intentionally reproduces the readable v0.7.1 size. Larger settings
  // reduce the number of visible bands, so the type can genuinely grow.
  const pct=clamp(Number(g.fontScale)||50,25,150);
  const visibleRows=clamp(5-((pct-50)/100)*2.2,2.8,5.8);
  const rowH=clamp(Math.floor(stage.clientHeight/visibleRows),52,300);
  stage.style.setProperty('--wheel-row-h',`${rowH}px`);fitWheelRows();updateWheelTransform();
}
function fitWheelRows(){
  const g=game.wheel;$$('.wheel-row').forEach(el=>{const rowH=el.getBoundingClientRect().height||96;const pct=clamp(Number(g?.fontScale)||50,25,150);const relative=clamp(pct/50,.5,3);const maxVertical=Math.floor(rowH*.92),base=clamp(Math.round(rowH*.78*Math.min(relative,1.18)),24,maxVertical),min=Math.max(20,Math.floor(rowH*.34));let size=base;el.style.fontSize=`${size}px`;while(size>min&&el.scrollWidth>el.clientWidth-36){size-=2;el.style.fontSize=`${size}px`;}});
}
function updateWheelRows(){const g=game.wheel;if(!g)return;$$('.wheel-row').forEach((el,i)=>{el.textContent=g.rows[i]||'';});fitWheelRows();}
function updateWheelTransform(){const g=game.wheel,track=$('.wheel-track');if(!g||!track)return;const h=wheelRowHeight();track.style.transform=`translate3d(0,${g.offset-h}px,0)`;}
function wheelFrame(now){
  const g=game.wheel;if(!g?.spinning)return;const h=wheelRowHeight();const dt=Math.min(50,now-(g.lastFrame||now));g.lastFrame=now;const pxPerSecond=55+(+g.speed*11.5);g.offset+=pxPerSecond*(dt/1000);
  let changed=false;while(g.offset>=h){g.offset-=h;g.rows.pop();g.rows.unshift(randomWheelWord(g,g.rows[0]));changed=true;}if(changed)updateWheelRows();updateWheelTransform();g.raf=requestAnimationFrame(wheelFrame);
}
function startWheel(){const g=game.wheel;if(!g||g.spinning)return;g.spinning=true;g.lastFrame=performance.now();renderWheel();g.raf=requestAnimationFrame(wheelFrame);}
function stopWheel(){const g=game.wheel;if(!g)return;if(g.raf)cancelAnimationFrame(g.raf);g.raf=null;g.spinning=false;g.lastFrame=0;if(route==='wheel')renderWheel();}
function updateWheelSelected(){const g=game.wheel;if(!g)return;$$('[data-selected-slot]').forEach((el,i)=>{el.textContent=g.selected[i]||'';el.classList.toggle('filled',!!g.selected[i]);});}
function addWheelWord(word){const g=game.wheel;if(!g||!word)return;if(g.selected.length>=6)return toast('Oben sind bereits sechs Wörter.');g.selected.push(word);updateWheelSelected();}
function moveWheelSelected(from,to){
  const g=game.wheel;if(!g||from<0||from>=g.selected.length)return;to=clamp(to,0,Math.max(0,g.selected.length-1));if(from===to)return;
  const [moved]=g.selected.splice(from,1);g.selected.splice(to,0,moved);renderWheel();
}
function renderWheel(){
  if(!game.wheel||game.wheel.materialKey!==activeMaterialKey())initWheel();const g=game.wheel;
  const controls=`<button class="soft-btn" id="wheelReset">Reset</button>`;
  $('#view').innerHTML=`${activePlanRun?planRunBar():''}<div class="game-shell">${gameHeader('Wortwalze','Die große Walze läuft von oben nach unten. Beim Loslassen wird das Wort unter dem Zeiger übernommen.',controls)}<div class="game-board"><div class="wheel-selected">${Array.from({length:6},(_,i)=>`<button class="wheel-slot ${g.selected[i]?'filled':''}" data-selected-slot="${i}" draggable="${g.selected[i]?'true':'false'}" title="Ziehen zum Umsortieren · anklicken zum Entfernen">${esc(g.selected[i]||'')}</button>`).join('')}</div><div class="wheel-stage" id="wheelStage" aria-label="Wortwalze"><div class="wheel-track" style="transform:translate3d(0,calc(${g.offset}px - 84px),0)">${g.rows.map((w,i)=>`<div class="wheel-row" data-wheel-row="${i}">${esc(w)}</div>`).join('')}</div></div><div class="wheel-controls"><div class="field"><label>Drehgeschwindigkeit</label><input id="wheelSpeed" type="range" min="1" max="100" value="${g.speed}"></div><div class="field"><label>Schriftgröße <strong id="wheelFontValue">${g.fontScale}%</strong></label><input id="wheelFont" type="range" min="25" max="150" step="5" value="${g.fontScale}"></div><button class="primary-btn wheel-spin-btn" id="wheelSpin">${g.spinning?'STOPP':'DREHEN'}</button></div></div></div>`;
  bindPlanBar();bindGameChrome();requestAnimationFrame(fitWheelGeometry);
  $('#wheelSpeed').oninput=e=>{g.speed=+e.target.value;game.wheelSpeed=g.speed;};
  $('#wheelFont').oninput=e=>{g.fontScale=+e.target.value;game.wheelFontScaleV2=g.fontScale;$('#wheelFontValue').textContent=`${g.fontScale}%`;fitWheelGeometry();};
  $('#wheelSpin').onclick=()=>g.spinning?stopWheel():startWheel();
  $('#wheelReset').onclick=()=>{if(g.raf)cancelAnimationFrame(g.raf);g.raf=null;g.spinning=false;g.selected=[];g.offset=0;g.rows=[];for(let i=0;i<12;i++)g.rows.push(randomWheelWord(g,g.rows.at(-1)));renderWheel();};
  $('#wheelStage').addEventListener('pointerup',e=>{const under=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('.wheel-row');if(under&&$('#wheelStage').contains(under))addWheelWord(under.textContent.trim());});
  let wheelPointer=null;
  const clearWheelDragVisual=()=>$$('[data-selected-slot]').forEach(x=>x.classList.remove('drag-over','dragging'));
  $$('[data-selected-slot]').forEach(b=>{
    const i=+b.dataset.selectedSlot;
    // Pointer-based reordering works with mouse, pen and touch and therefore
    // does not depend on browser-specific HTML5 drag support.
    b.onpointerdown=e=>{if(!g.selected[i])return;wheelPointer={from:i,x:e.clientX,y:e.clientY,moved:false};game.wheelJustDragged=false;b.classList.add('dragging');try{b.setPointerCapture(e.pointerId);}catch{}e.preventDefault();};
    b.onpointermove=e=>{if(!wheelPointer||wheelPointer.from!==i)return;const dx=e.clientX-wheelPointer.x,dy=e.clientY-wheelPointer.y;if(Math.hypot(dx,dy)>7)wheelPointer.moved=true;$$('[data-selected-slot]').forEach(x=>x.classList.remove('drag-over'));if(wheelPointer.moved){const target=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-selected-slot]');if(target)target.classList.add('drag-over');}};
    b.onpointerup=e=>{if(!wheelPointer||wheelPointer.from!==i)return;const state=wheelPointer;wheelPointer=null;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-selected-slot]');clearWheelDragVisual();if(state.moved&&target){game.wheelJustDragged=true;const to=+target.dataset.selectedSlot;if(Number.isFinite(to)&&to!==state.from)moveWheelSelected(state.from,to);setTimeout(()=>{game.wheelJustDragged=false;},160);return;}if(!state.moved&&g.selected[state.from]){g.selected.splice(state.from,1);renderWheel();}};
    b.onpointercancel=()=>{wheelPointer=null;clearWheelDragVisual();};
    // Desktop fallback for browsers that expose native drag/drop better than pointer capture.
    b.ondragstart=e=>{if(!g.selected[i]){e.preventDefault();return;}game.wheelDragFrom=i;b.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/x-wortzeit-wheel',String(i));};
    b.ondragover=e=>{if(game.wheelDragFrom==null)return;e.preventDefault();e.dataTransfer.dropEffect='move';b.classList.add('drag-over');};
    b.ondragleave=()=>b.classList.remove('drag-over');
    b.ondrop=e=>{e.preventDefault();b.classList.remove('drag-over');const from=Number(e.dataTransfer.getData('text/x-wortzeit-wheel'));game.wheelDragFrom=null;game.wheelJustDragged=true;setTimeout(()=>{game.wheelJustDragged=false;},160);if(Number.isFinite(from)&&from!==i)moveWheelSelected(from,i);};
    b.ondragend=()=>{game.wheelDragFrom=null;clearWheelDragVisual();};
  });
}


function fitSyllableBoard(){
  const wrap=document.querySelector('.hex-wrap'), frame=document.querySelector('.hex-frame');
  if(!wrap||!frame)return;
  const r=wrap.getBoundingClientRect();
  if(r.width<40||r.height<40)return;
  const buttons=[...wrap.querySelectorAll('.hex-syllable')];
  const bw=Math.max(74,...buttons.map(b=>Math.min(170,Math.max(74,b.getBoundingClientRect().width||0))));
  const bh=Math.max(48,...buttons.map(b=>Math.min(80,Math.max(48,b.getBoundingClientRect().height||0))));
  const reserveX=bw+14, reserveY=bh+14;
  const ratio=1.154700538;
  let w=Math.min(560,Math.max(120,r.width-2*reserveX),Math.max(120,(r.height-2*reserveY)*ratio));
  if(!Number.isFinite(w))return;
  w=Math.max(150,w);
  const h=w/ratio;
  frame.style.width=`${w}px`;frame.style.height=`${h}px`;
}
function fitSessionText(){
  const wrap=document.querySelector('.session-word-wrap'), el=document.querySelector('.session-word');
  if(!wrap||!el)return;
  const wr=wrap.getBoundingClientRect();if(wr.width<20||wr.height<20)return;
  const multi=el.classList.contains('multi');
  const factor=clamp((+state.settings.sessionFontScale||50)/50,.5,2);let size=Math.min((multi?96:140)*factor, Math.max(28, wr.height*(multi ? .30 : .42)*factor), Math.max(28,wr.width*(multi ? .09 : .115)*factor));
  el.style.fontSize=`${size}px`;
  el.style.lineHeight='1.08';
  const fits=()=>el.scrollHeight<=wrap.clientHeight-8 && el.scrollWidth<=wrap.clientWidth-8;
  while(size>12&&!fits()){size-=2;el.style.fontSize=`${size}px`;}
}

// ---------- Syllable hex ----------
function normalizeWordForSyllables(x){return String(x||'').toLocaleLowerCase('de').replace(/[^a-zäöüß]/g,'');}
function syllableWordCandidates(){
  const lexByNorm=new Map(DATA.lexicon.map(x=>[normalizeWordForSyllables(x.word),x]));const out=[],seen=new Set();
  const add=(word,syllables,priority=false)=>{const clean=String(word||'').trim(),norm=normalizeWordForSyllables(clean);const syl=(syllables||[]).map(x=>String(x).trim()).filter(Boolean);if(!norm||seen.has(norm)||syl.length<2||syl.length>4||clean.length>24)return;seen.add(norm);out.push({word:clean,syllables:syl,priority});};
  for(const it of activeItems()){
    let syl=Array.isArray(it.syllables)?it.syllables:null;const norm=normalizeWordForSyllables(it.text);const lex=lexByNorm.get(norm);if(!syl&&lex)syl=lex.syllables;
    if(!syl&&String(it.text||'').includes('·'))syl=String(it.text).split('·');
    if(!syl&&String(it.text||'').includes('-')&&/^[A-Za-zÄÖÜäöüß-]+$/.test(String(it.text||'')))syl=String(it.text).split('-');
    if(syl)add(lex?.word||String(it.text||'').replace(/[·-]/g,''),syl,true);
  }
  for(const x of DATA.lexicon)add(x.word,x.syllables,false);
  return out;
}
function findSyllableWordSet(candidates){
  const preferred=shuffle(candidates.filter(x=>x.priority&&x.syllables.length>=2&&x.syllables.length<=4));
  const rest=shuffle(candidates.filter(x=>x.syllables.length>=2&&x.syllables.length<=4));
  const starters=preferred.length?preferred.slice(0,100):rest.slice(0,180);
  for(const first of starters){
    const need=6-first.syllables.length;if(need<2)continue;
    const seconds=rest.filter(x=>x.word!==first.word&&x.syllables.length<=need);
    for(const second of seconds.slice(0,240)){
      const left=need-second.syllables.length;if(left===0)return [first,second];
      const third=rest.find(x=>x.word!==first.word&&x.word!==second.word&&x.syllables.length===left);if(third)return [first,second,third];
    }
  }
  const triples=rest.filter(x=>x.syllables.length===3);if(triples.length>=2)return triples.slice(0,2);
  const doubles=rest.filter(x=>x.syllables.length===2);if(doubles.length>=3)return doubles.slice(0,3);
  return [];
}
function buildSyllableRound(){
  const candidates=syllableWordCandidates();let words=findSyllableWordSet(candidates);
  if(!words.length)words=[{word:'Banane',syllables:['Ba','na','ne']},{word:'Tomate',syllables:['To','ma','te']}];
  game.syllables={options:shuffle(words.flatMap(x=>x.syllables).slice(0,6)),built:[],validWords:words,targetWord:words[0].word,targetSyllables:words[0].syllables,message:'',materialKey:activeMaterialKey()};
}
function recognizedSyllableWord(built,g){
  const norm=normalizeWordForSyllables(built);if(!norm)return '';
  const round=(g.validWords||[]).find(x=>normalizeWordForSyllables(x.word)===norm);if(round)return round.word;
  const sources=[...activeItems(),...DATA.lexicon.map((x,i)=>({id:`lex_${i}`,text:x.word})),...DATA.legacyLists.flatMap(L=>(L.items||[]))];
  for(const it of sources){const text=String(it.text||it.word||'').trim();if(!text||text.length>32||/[\s,.!?;:]/.test(text))continue;if(normalizeWordForSyllables(text)===norm)return text.replace(/[·]/g,'');}
  return '';
}
function evaluateSyllables(g){
  const builtRaw=g.built.join(''),built=normalizeWordForSyllables(builtRaw);if(!built){g.message='';g.hitWord='';return;}
  const hit=recognizedSyllableWord(builtRaw,g);g.hitWord=hit||'';g.message=hit?'Wort erkannt':'';
}
function renderSyllables(){
  if(!game.syllables||game.syllables.materialKey!==activeMaterialKey())buildSyllableRound();const g=game.syllables;
  const controls=`<button class="soft-btn" id="syllableReset">Reset</button><button class="soft-btn" id="syllableNew">Mischen</button>`;
  const vertices=[[25,0,-50,-100],[75,0,-50,-100],[100,50,0,-50],[75,100,-50,0],[25,100,-50,0],[0,50,-100,-50]];
  $('#view').innerHTML=`${activePlanRun?planRunBar():''}<div class="game-shell">${gameHeader('Silben','Wähle Silben an den sechs Ecken und setze sie oben zusammen. Die sechs Silben bilden immer vollständige Wörter.',controls)}<div class="game-board"><div class="syllable-workspace" aria-label="Arbeitsbereich" id="syllableWorkspace">${g.built.length?g.built.map((sy,i)=>`<button class="syllable-piece" draggable="true" data-built="${i}" title="Antippen zum Entfernen">${esc(String(sy).toLocaleUpperCase('de'))}</button>`).join(''):'<span class="muted">SILBEN HIER ZUSAMMENSETZEN</span>'}</div><div class="hex-wrap"><div class="hex-frame"><div class="hex-shape"><div class="syllable-result ${g.hitWord?'recognized':''}">${esc((g.hitWord||(g.built.length?g.built.join(''):'SILBEN')).toLocaleUpperCase('de'))}</div></div>${g.options.map((sy,i)=>{const v=vertices[i];return `<button class="hex-syllable" style="--hx:${v[0]}%;--hy:${v[1]}%;--tx:${v[2]}%;--ty:${v[3]}%" data-syllable="${i}" draggable="true">${esc(String(sy).toLocaleUpperCase('de'))}</button>`}).join('')}</div></div></div></div>`;
  bindPlanBar();bindGameChrome();requestAnimationFrame(fitSyllableBoard);
  const addOption=i=>{const sy=g.options[i];if(!sy)return;g.built.push(sy);evaluateSyllables(g);renderSyllables();};
  $$('[data-syllable]').forEach(b=>{b.onclick=()=>addOption(+b.dataset.syllable);b.ondragstart=e=>e.dataTransfer.setData('text/plain',`option:${b.dataset.syllable}`);});
  const ws=$('#syllableWorkspace');ws.ondragover=e=>e.preventDefault();ws.ondrop=e=>{e.preventDefault();const raw=e.dataTransfer.getData('text/plain');if(raw.startsWith('option:'))addOption(+raw.split(':')[1]);};
  $$('[data-built]').forEach((b,i)=>{b.onclick=()=>{g.built.splice(i,1);evaluateSyllables(g);renderSyllables();};b.ondragstart=e=>e.dataTransfer.setData('text/plain',`built:${i}`);b.ondragover=e=>{e.preventDefault();b.classList.add('drag-over')};b.ondragleave=()=>b.classList.remove('drag-over');b.ondrop=e=>{e.preventDefault();b.classList.remove('drag-over');const raw=e.dataTransfer.getData('text/plain');if(raw.startsWith('built:')){const from=+raw.split(':')[1];if(from!==i){const [moved]=g.built.splice(from,1);const to=from<i?i-1:i;g.built.splice(to,0,moved);evaluateSyllables(g);renderSyllables();}}else if(raw.startsWith('option:')){const sy=g.options[+raw.split(':')[1]];if(sy){g.built.splice(i,0,sy);evaluateSyllables(g);renderSyllables();}}};});
  $('#syllableReset').onclick=()=>{g.built=[];g.message='';g.hitWord='';renderSyllables();};$('#syllableNew').onclick=()=>{buildSyllableRound();renderSyllables();};
}

// ---------- Choice stories ----------
let _choiceStoriesCache=null;
function listToChoiceStory(L){
  if(!L||!Array.isArray(L.items)||L.items.length<5||L.items.length%5!==0)return null;
  const steps=[];for(let i=0;i<L.items.length;i+=5){const prompt=String(L.items[i]?.text||'').trim(),options=L.items.slice(i+1,i+5).map(x=>String(x?.text||'').trim()).filter(Boolean);if(!prompt||options.length!==4)return null;steps.push({prompt,options});}
  return {id:`list:${L.id}`,title:L.title,source:'Eigene oder vorbereitete Liste',steps};
}
function buildChoiceStories(){
  const stories=[];
  const firefighter=DATA.legacyLists.find(L=>L.title==='Feuerwehr Geschichte');const fireStory=listToChoiceStory(firefighter);if(fireStory){fireStory.id='feuerwehr';fireStory.title='Feuerwehrgeschichte';stories.push(fireStory);}
  stories.push({id:'ausflug',title:'Der überraschende Ausflug',source:'Zusatzgeschichte',steps:[
    {prompt:'Frau Berger stand am Sonntagmorgen auf und fühlte sich',options:['voller Tatendrang.','ein wenig müde.','wie eine Königin im Urlaub.','ungefähr so rund wie ein Koffer.']},
    {prompt:'Beim Frühstück beschloss sie ganz spontan, heute',options:['einen Ausflug zu machen.','erst einmal gar nichts zu tun.','ihre Nachbarin anzurufen.','einen Regenschirm zum Frühstück einzuladen.']},
    {prompt:'Vor der Haustür bemerkte sie, dass das Wetter',options:['herrlich sonnig war.','ziemlich ungemütlich aussah.','sie sofort besser gelaunt machte.','offenbar seine eigenen Pläne hatte.']},
    {prompt:'Trotzdem packte sie in ihre Tasche',options:['etwas zu trinken und ein Brot.','nur das Allernötigste.','eine Kamera für schöne Bilder.','vorsichtshalber einen Kochlöffel.']},
    {prompt:'An der Bushaltestelle wartete bereits',options:['ein freundlicher älterer Herr.','eine sehr ungeduldige Frau.','jemand mit einem riesigen Blumenstrauß.','ein Hund, der offenbar den Fahrplan studierte.']},
    {prompt:'Als der Bus endlich kam, setzte sie sich',options:['ans Fenster.','ganz nach hinten.','neben den Blumenstrauß.','auf den Platz mit der besten Aussicht auf die Welt.']},
    {prompt:'Am Ziel angekommen, führte der erste Weg',options:['zum See.','in ein kleines Café.','auf einen ruhigen Spazierweg.','zu einem Schild, das niemand verstand.']},
    {prompt:'Dort passierte etwas, womit sie nicht gerechnet hatte:',options:['Sie traf eine alte Bekannte.','Es begann plötzlich zu regnen.','Ein Kind schenkte ihr eine Blume.','Eine Ente lief entschlossen mit ihrer Tasche davon.']},
    {prompt:'Nach diesem Erlebnis war sie',options:['sehr gut gelaunt.','etwas erschöpft.','überrascht und neugierig.','sicher, dass Sonntage eigene Regeln haben.']},
    {prompt:'Am Abend erzählte sie zu Hause',options:['von ihrem schönen Ausflug.','von den merkwürdigen Begegnungen.','besonders gern von dem überraschenden Moment.','eine Geschichte, die jedes Mal ein bisschen verrückter wurde.']}
  ]});
  stories.push({id:'schluessel',title:'Der verschwundene Schlüssel',source:'Zusatzgeschichte',steps:[
    {prompt:'Herr Kramer wollte gerade das Haus verlassen, als er bemerkte:',options:['Der Schlüssel war weg.','Er hatte es plötzlich sehr eilig.','Seine Jacke war noch offen.','Der Schlüssel spielte offenbar Verstecken.']},
    {prompt:'Zuerst suchte er',options:['auf dem Flurtisch.','in allen Jackentaschen.','ganz ruhig im Wohnzimmer.','unter einem Blumentopf, der völlig unschuldig aussah.']},
    {prompt:'Als er dort nichts fand, wurde er',options:['langsam ungeduldig.','noch konzentrierter.','ein wenig ratlos.','zu einem Detektiv mit sehr ernster Miene.']},
    {prompt:'Seine Frau schlug vor, noch einmal',options:['in Ruhe nachzudenken.','die Taschen zu kontrollieren.','den letzten Weg zurückzugehen.','den Schlüssel einfach beim Namen zu rufen.']},
    {prompt:'Da erinnerte er sich, dass er zuvor',options:['den Müll hinausgebracht hatte.','im Keller gewesen war.','die Post geholt hatte.','mit beiden Händen gleichzeitig etwas ganz Wichtiges getragen hatte.']},
    {prompt:'Im nächsten Moment entdeckte er den Schlüssel',options:['auf dem Schuhregal.','in seiner anderen Jacke.','neben der Zeitung.','an einem Ort, an dem er schon dreimal vorbeigelaufen war.']},
    {prompt:'Herr Kramer musste',options:['über sich selbst lachen.','erleichtert aufatmen.','seiner Frau recht geben.','dem Schlüssel eine kleine Standpauke halten.']},
    {prompt:'Danach beschloss er, den Schlüssel künftig',options:['immer an denselben Platz zu legen.','an einen Haken zu hängen.','bewusster abzulegen.','nur noch mit schriftlicher Anmeldung zu verlieren.']}
  ]});
  stories.push({id:'markt',title:'Ein Vormittag auf dem Markt',source:'Zusatzgeschichte',steps:[
    {prompt:'Am Samstag ging Frau Neumann auf den Wochenmarkt, weil sie',options:['frisches Gemüse kaufen wollte.','Lust auf einen Spaziergang hatte.','Besuch erwartete.','der Meinung war, Tomaten könnten ihre Stimmung verbessern.']},
    {prompt:'Am ersten Stand roch es besonders',options:['nach frischem Brot.','nach Kräutern und Gewürzen.','angenehm und vertraut.','so gut, dass ihr Einkaufszettel kurz unwichtig wurde.']},
    {prompt:'Der Verkäufer begrüßte sie',options:['freundlich.','mit einem breiten Lächeln.','etwas hektisch.','als wäre sie seine hundertste Lieblingskundin.']},
    {prompt:'Frau Neumann entschied sich schließlich für',options:['Äpfel und Birnen.','Tomaten und Gurken.','etwas Käse.','eine Einkaufstasche, die viel größer war als ihr Plan.']},
    {prompt:'Plötzlich stellte sie fest, dass',options:['sie noch Bargeld brauchte.','ihr Einkaufszettel fehlte.','die Tasche schon ziemlich schwer war.','sie ausgerechnet den wichtigsten Stand übersehen hatte.']},
    {prompt:'Zum Glück konnte sie',options:['ruhig weiter einkaufen.','mit Karte bezahlen.','sich an fast alles erinnern.','die Verkäuferin mit ihrer Geschichte zum Lachen bringen.']},
    {prompt:'Auf dem Heimweg fühlte sie sich',options:['zufrieden.','etwas müde.','gut versorgt.','wie die Gewinnerin eines sehr kleinen Markt-Abenteuers.']}
  ]});
  for(const L of allLists()){
    if(L.id===firefighter?.id)continue;
    if(L.kind==='choiceStory'||/geschichte/i.test(L.title||'')){
      const story=listToChoiceStory(L);if(story&&!stories.some(x=>x.title===story.title))stories.push(story);
    }
  }
  return stories;
}
function sentenceFromChoice(step,choice){const a=String(step.prompt||'').trim(),b=String(choice||'').trim();return `${a}${a&&b?' ':''}${b}`.replace(/\s+([,.!?;:])/g,'$1').replace(/\.\./g,'.');}
function initChoiceStory(storyId){const stories=buildChoiceStories();const story=stories.find(x=>x.id===storyId)||stories[0];game.choiceStory={storyId:story.id,index:0,currentChoice:null,chosen:[],reading:false,readPage:0};}
function renderChoiceStory(){
  const stories=buildChoiceStories();if(!game.choiceStory)initChoiceStory(stories[0]?.id);const g=game.choiceStory,story=stories.find(x=>x.id===g.storyId)||stories[0];if(!story)return;
  if(g.reading)return renderChoiceStoryReading(story,g);
  const step=story.steps[g.index];if(!step)return;
  const sentence=g.currentChoice==null?step.prompt:sentenceFromChoice(step,step.options[g.currentChoice]);
  const controls=`<select id="choiceStorySelect" aria-label="Geschichte">${stories.map(x=>`<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('')}</select><button class="soft-btn" id="choiceReset">↺ Anfang</button>`;
  const center=`<button class="primary-btn choice-next-top" data-game-primary id="choiceNext" ${g.currentChoice==null?'disabled':''}>${g.index>=story.steps.length-1?'Geschichte lesen':'Weiter →'}</button>`;
  $('#view').innerHTML=`${activePlanRun?planRunBar():''}<div class="game-shell">${gameHeader('Geschichte bauen',`${esc(story.title)} · Es gibt kein Richtig oder Falsch.`,controls,center)}<div class="game-board"><div class="choice-progress">${g.index+1} / ${story.steps.length}</div><div class="choice-stage"><div class="choice-prompt ${g.currentChoice!=null?'has-choice':''}">${esc(sentence)}</div><div class="choice-options">${step.options.map((o,i)=>`<button class="choice-option ${g.currentChoice===i?'selected':''}" data-choice="${i}">${esc(o)}</button>`).join('')}</div></div><div class="choice-story-trail" aria-label="Bisherige Geschichte">${g.chosen.length?g.chosen.slice(-3).map((choice,i)=>{const idx=g.chosen.length-Math.min(3,g.chosen.length)+i;return `<div>${esc(sentenceFromChoice(story.steps[idx],story.steps[idx].options[choice]))}</div>`}).join(''):'<span class="muted">Die gewählten Sätze sammeln sich hier zu einer Geschichte.</span>'}</div></div></div>`;
  $('#choiceStorySelect').value=story.id;$('#choiceStorySelect').onchange=e=>{initChoiceStory(e.target.value);renderChoiceStory();};
  $('#choiceReset').onclick=()=>{initChoiceStory(story.id);renderChoiceStory();};
  $('#choiceNext').onclick=()=>{if(g.currentChoice==null)return;g.chosen[g.index]=g.currentChoice;if(g.index>=story.steps.length-1){g.reading=true;g.readPage=0;renderChoiceStory();return;}g.index++;g.currentChoice=g.chosen[g.index]??null;renderChoiceStory();};
  $$('[data-choice]').forEach(b=>b.onclick=()=>{g.currentChoice=+b.dataset.choice;renderChoiceStory();});
  bindPlanBar();bindGameChrome();
}
function renderChoiceStoryReading(story,g){
  const sentences=g.chosen.map((choice,i)=>sentenceFromChoice(story.steps[i],story.steps[i].options[choice]));const perPage=5,pages=Math.max(1,Math.ceil(sentences.length/perPage));g.readPage=clamp(g.readPage||0,0,pages-1);const page=sentences.slice(g.readPage*perPage,g.readPage*perPage+perPage);
  const controls=`<button class="soft-btn" id="choiceStoryAgain">↺ Neu</button>`;
  const center=`<div class="story-read-nav"><button class="soft-btn" id="readPrev" ${g.readPage<=0?'disabled':''}>←</button><strong>${g.readPage+1} / ${pages}</strong><button class="soft-btn" id="readNext" ${g.readPage>=pages-1?'disabled':''}>→</button></div>`;
  $('#view').innerHTML=`${activePlanRun?planRunBar():''}<div class="game-shell">${gameHeader('Unsere Geschichte',esc(story.title),controls,center)}<div class="game-board choice-reading-board"><div class="choice-reading-page">${page.map((x,i)=>`<p><span>${g.readPage*perPage+i+1}.</span> ${esc(x)}</p>`).join('')}</div></div></div>`;
  $('#choiceStoryAgain').onclick=()=>{initChoiceStory(story.id);renderChoiceStory();};$('#readPrev').onclick=()=>{g.readPage--;renderChoiceStory();};$('#readNext').onclick=()=>{g.readPage++;renderChoiceStory();};bindPlanBar();bindGameChrome();
}

// ---------- Semantic word network ----------
function newSemanticRound(){
  const explicit=hasExplicitMaterial();
  const source=explicit?activeItems():defaultList.items.map(x=>({...x,sourceListId:defaultList.id,sourceListTitle:'Fallback'}));
  const items=source.filter(x=>{const text=String(x.text||'').trim();return /^[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)?$/.test(text)&&text.length>=2&&text.length<=32;});
  if(!items.length){game.semantic=null;return;}
  const used=game.semanticUsed||new Set();let choices=items.filter(x=>!used.has(`${x.sourceListId}:${x.id}`));if(!choices.length){used.clear();choices=items;}
  const item=choices[Math.floor(Math.random()*choices.length)];used.add(`${item.sourceListId}:${item.id}`);game.semanticUsed=used;
  game.semantic={item,marked:new Set(),materialKey:activeMaterialKey()};
}
function renderSemantic(){
  if(!game.semantic||game.semantic.materialKey!==activeMaterialKey())newSemanticRound();const g=game.semantic;
  const controls=`<button class="soft-btn" id="semanticReset">Zurücksetzen</button><button class="primary-btn" data-game-primary id="semanticNext">Nächstes Wort</button>`;
  const prompts=[
    ['Kategorie','Was ist es?'],['Verwendung','Wofür braucht man es?'],['Ort','Wo findet man es?'],['Eigenschaften','Wie ist es?'],['Aussehen / Teile','Wie sieht es aus oder woraus besteht es?'],['Verbindungen','Was passt dazu?']
  ];
  $('#view').innerHTML=`${activePlanRun?planRunBar():''}<div class="game-shell">${gameHeader('Wortnetz','Den Begriff gemeinsam von verschiedenen Seiten beschreiben. Es gibt keine automatische Bewertung.',controls)}<div class="game-board semantic-board">${!g?'<div class="error-banner">Die gewählte Liste enthält keine passenden einzelnen Wörter. Wähle oben eine andere Liste.</div>':`<div class="semantic-network"><div class="semantic-target">${esc(g.item.text)}</div>${prompts.map(([a,b],i)=>`<button class="semantic-prompt ${g.marked.has(i)?'done':''}" data-semantic="${i}"><strong>${a}</strong><span>${b}</span></button>`).join('')}</div>`}</div></div>`;
  bindPlanBar();bindGameChrome();
  $$('[data-semantic]').forEach(b=>b.onclick=()=>{const i=+b.dataset.semantic;if(g.marked.has(i))g.marked.delete(i);else g.marked.add(i);renderSemantic();});
  $('#semanticReset')?.addEventListener('click',()=>{g.marked.clear();renderSemantic();});$('#semanticNext')?.addEventListener('click',()=>{newSemanticRound();renderSemantic();});
}

// ---------- Patients ----------
function renderPatients(){
  $('#view').innerHTML=pageHead('Organisation','Patienten','Nur die Informationen speichern, die für die Übungszuordnung nötig sind. Die Daten bleiben in dieser Testversion lokal im Browser.',`<button class="primary-btn" id="addPatient">+ Patient</button>`)+`<div class="patient-list">${state.patients.length?state.patients.map(p=>`<div class="patient-row"><div><strong>${esc(p.name)}</strong><div class="tag-row" style="margin-top:7px">${(p.listIds||[]).map(id=>allLists().find(x=>x.id===id)).filter(Boolean).slice(0,5).map(L=>`<span class="tag">${esc(L.title)}</span>`).join('')}${(p.listIds||[]).length>5?`<span class="tag">+${p.listIds.length-5}</span>`:''}</div></div><div class="toolbar"><button class="soft-btn" data-edit-patient="${esc(p.id)}">Bearbeiten</button><button class="danger-btn" data-delete-patient="${esc(p.id)}">Löschen</button></div></div>`).join(''):'<div class="card"><strong>Noch keine Patienten angelegt.</strong><p>Mit „+ Patient“ kann ein Anzeigename angelegt und vorhandenen Listen zugewiesen werden.</p></div>'}</div>`;
  $('#addPatient').onclick=()=>openPatientEditor();$$('[data-edit-patient]').forEach(b=>b.onclick=()=>openPatientEditor(state.patients.find(p=>p.id===b.dataset.editPatient)));$$('[data-delete-patient]').forEach(b=>b.onclick=()=>{const p=state.patients.find(x=>x.id===b.dataset.deletePatient);if(p&&confirm(`„${p.name}“ löschen?`)){state.patients=state.patients.filter(x=>x.id!==p.id);saveState();renderPatients();}});bindPlanBar();
}
function openPatientEditor(patient=null){
  const p=patient||{id:uid('patient'),name:'',listIds:[],note:''};const lists=[...selectableLists()].sort((a,b)=>a.title.localeCompare(b.title,'de',{sensitivity:'base',numeric:true}));
  openModal(`<div class="modal-head"><div><div class="eyebrow">Patient</div><h2>${patient?'Bearbeiten':'Neu anlegen'}</h2></div><button class="icon-btn" data-close-modal>×</button></div><div class="grid"><div class="field"><label>Anzeigename</label><input id="patientName" value="${esc(p.name)}" placeholder="z. B. Herr M."></div><div><div class="section-title"><h3>Listen zuweisen</h3><span class="muted small">Mehrfachauswahl</span></div><div class="item-preview">${lists.map(L=>`<label class="preview-row" style="display:flex;gap:10px;align-items:center"><input type="checkbox" data-p-list="${esc(L.id)}" ${(p.listIds||[]).includes(L.id)?'checked':''}><span><strong>${esc(L.title)}</strong><br><span class="muted small">${esc(L.category||'')}</span></span></label>`).join('')}</div></div><div class="field"><label>Optionale lokale Notiz</label><textarea id="patientNote" style="min-height:90px">${esc(p.note||'')}</textarea></div></div><div class="modal-foot"><button class="primary-btn" id="savePatient">Speichern</button></div>`);
  $('#savePatient').onclick=()=>{const name=$('#patientName').value.trim();if(!name)return toast('Bitte einen Namen eingeben');p.name=name;p.note=$('#patientNote').value.trim();p.listIds=$$('[data-p-list]:checked').map(x=>x.dataset.pList);if(!patient)state.patients.push(p);saveState();closeModal();renderPatients();};
}

// ---------- Therapy plans ----------
const ACTIVITY_LABELS={session:'Wortanzeige',letters:'Buchstaben',memory:'Memory',sorting:'Sortieren',story:'Bildergeschichte',choiceStory:'Geschichte bauen',wheel:'Wortwalze',syllables:'Silben',semantic:'Wortnetz'};
function renderPlans(){
  $('#view').innerHTML=pageHead('Vorbereitung','Therapiepläne','Mehrere Übungen zu einer ruhigen Schritt-für-Schritt-Abfolge verbinden. Ein Export enthält nur die dafür benötigten Listen-Snapshots und Einstellungen.',`<button class="primary-btn" id="newPlan">+ Neuer Plan</button><button class="secondary-btn" id="importPack">.speechpack öffnen</button>`)+`<div class="grid">${state.plans.length?state.plans.map(p=>`<div class="card"><div class="section-title"><div><div class="eyebrow">${p.steps.length} Schritte</div><h2>${esc(p.title)}</h2></div><div class="toolbar"><button class="soft-btn" data-run-plan="${esc(p.id)}">Starten</button><button class="soft-btn" data-edit-plan="${esc(p.id)}">Bearbeiten</button><button class="primary-btn" data-export-plan="${esc(p.id)}">Exportieren</button><button class="danger-btn" data-delete-plan="${esc(p.id)}">Löschen</button></div></div><div class="plan-steps">${p.steps.map((s,i)=>`<div class="plan-step"><div class="plan-index">${i+1}</div><div><strong>${esc(ACTIVITY_LABELS[s.activity]||s.activity)}</strong><div class="muted small">${esc((s.listIds?.length>1?`${s.listIds.length} Listen gemischt`:(allLists().find(L=>L.id===s.listId)||{}).title)||'Eigenes Übungsset')}</div></div></div>`).join('')}</div></div>`).join(''):'<div class="card"><strong>Noch kein Therapieplan.</strong><p>Ein Plan kann z. B. Wortanzeige → Silben → Memory → Wortwalze enthalten.</p></div>'}</div><input id="packPicker" type="file" accept=".speechpack,.json" hidden>`;
  $('#newPlan').onclick=()=>openPlanEditor();$('#importPack').onclick=()=>$('#packPicker').click();$('#packPicker').onchange=e=>{const f=e.target.files[0];if(f)loadSpeechpackFile(f,true);};$$('[data-edit-plan]').forEach(b=>b.onclick=()=>openPlanEditor(state.plans.find(p=>p.id===b.dataset.editPlan)));$$('[data-export-plan]').forEach(b=>b.onclick=()=>exportPlan(state.plans.find(p=>p.id===b.dataset.exportPlan)));$$('[data-run-plan]').forEach(b=>b.onclick=()=>startLocalPlan(state.plans.find(p=>p.id===b.dataset.runPlan)));$$('[data-delete-plan]').forEach(b=>b.onclick=()=>{const p=state.plans.find(x=>x.id===b.dataset.deletePlan);if(p&&confirm(`Plan „${p.title}“ löschen?`)){state.plans=state.plans.filter(x=>x.id!==p.id);saveState();renderPlans();}});bindPlanBar();
}
function openPlanEditor(plan=null){
  const work=cloneData(plan||{id:uid('plan'),title:'Neuer Therapieplan',steps:[]});
  const modalHtml=()=>`<div class="modal-head"><div><div class="eyebrow">Therapieplan</div><h2>Plan zusammenstellen</h2></div><button class="icon-btn" data-close-modal>×</button></div><div class="field"><label>Planname</label><input id="planTitle" value="${esc(work.title)}"></div><div class="section"><div class="section-title"><h3>Schritte</h3><button class="soft-btn" id="addPlanStep">+ Übung</button></div><div class="plan-steps" id="planEditorSteps">${work.steps.map((s,i)=>planEditorStep(s,i)).join('')||'<div class="muted">Noch keine Übung hinzugefügt.</div>'}</div></div><div class="modal-foot"><button class="primary-btn" id="savePlan">Plan speichern</button></div>`;
  openModal(modalHtml());
  function rebind(){
    $('#addPlanStep').onclick=()=>{work.title=$('#planTitle').value;const ids=explicitListIds();work.steps.push({activity:'session',listId:ids[0]||selectableLists()[0]?.id||null,listIds:ids.length?ids:(selectableLists()[0]?[selectableLists()[0].id]:[]),options:{}});openModal(modalHtml());rebind();};
    $$('[data-step-activity]').forEach(x=>x.onchange=()=>{work.title=$('#planTitle').value;const st=work.steps[+x.dataset.stepActivity];st.activity=x.value;const candidates=(x.value==='sorting'||x.value==='story')?[]:(x.value==='session'?selectableLists():compatibleLists(x.value));if(candidates.length&&!candidates.some(L=>L.id===st.listId)){st.listId=candidates[0].id;st.listIds=[st.listId];}openModal(modalHtml());rebind();});$$('[data-step-list]').forEach(x=>x.onchange=()=>{const st=work.steps[+x.dataset.stepList];if(x.value==='__mix__'){st.listIds=activeLists().map(L=>L.id);st.listId=st.listIds[0]||state.currentListId;}else{st.listId=x.value;st.listIds=[x.value];}});
    $$('[data-step-up]').forEach(b=>b.onclick=()=>{work.title=$('#planTitle').value;const i=+b.dataset.stepUp;if(i>0){[work.steps[i-1],work.steps[i]]=[work.steps[i],work.steps[i-1]];}openModal(modalHtml());rebind();});
    $$('[data-step-down]').forEach(b=>b.onclick=()=>{work.title=$('#planTitle').value;const i=+b.dataset.stepDown;if(i<work.steps.length-1){[work.steps[i+1],work.steps[i]]=[work.steps[i],work.steps[i+1]];}openModal(modalHtml());rebind();});
    $$('[data-step-remove]').forEach(b=>b.onclick=()=>{work.title=$('#planTitle').value;work.steps.splice(+b.dataset.stepRemove,1);openModal(modalHtml());rebind();});
    $('#savePlan').onclick=()=>{work.title=$('#planTitle').value.trim()||'Therapieplan';if(plan){Object.assign(plan,work);}else state.plans.push(work);saveState();closeModal();renderPlans();};
    $$('[data-close-modal]').forEach(b=>b.onclick=closeModal);
  }
  rebind();
}
function planEditorStep(s,i){
  const needsList=!['sorting','story'].includes(s.activity),sorted=(needsList?(s.activity==='session'?selectableLists():compatibleLists(s.activity)):[]).sort((a,b)=>a.title.localeCompare(b.title,'de',{sensitivity:'base',numeric:true}));
  const mixIds=explicitListIds().filter(id=>sorted.some(L=>L.id===id)),hasMix=mixIds.length>1,selectedMix=(s.listIds||[]).length>1;
  const listOptions=!needsList?`<option value="">Integriertes Spielmaterial</option>`:(hasMix?`<option value="__mix__" ${selectedMix?'selected':''}>Aktive Mischung · ${mixIds.length} Listen</option>`:'')+sorted.map(L=>`<option value="${esc(L.id)}" ${!selectedMix&&L.id===s.listId?'selected':''}>${esc(L.title)}</option>`).join('');
  const actOptions=Object.entries(ACTIVITY_LABELS).map(([k,v])=>`<option value="${k}" ${k===s.activity?'selected':''}>${esc(v)}</option>`).join('');
  return `<div class="plan-step"><div class="plan-index">${i+1}</div><div class="form-row"><div class="field"><label>Übung</label><select data-step-activity="${i}">${actOptions}</select></div><div class="field grow"><label>Material</label><select data-step-list="${i}" ${needsList?'':'disabled'}>${listOptions||'<option>Keine passende Liste vorhanden</option>'}</select></div></div><div class="plan-step-actions"><button class="icon-btn" data-step-up="${i}" title="Nach oben">↑</button><button class="icon-btn" data-step-down="${i}" title="Nach unten">↓</button><button class="icon-btn" data-step-remove="${i}" title="Entfernen">×</button></div></div>`;
}
function packageFromPlan(plan){
  const listIds=[...new Set(plan.steps.flatMap(s=>(s.listIds?.length?s.listIds:[s.listId]).filter(Boolean)))];const snapshots=listIds.map(id=>allLists().find(L=>L.id===id)).filter(Boolean).map(L=>({id:L.id,title:L.title,category:L.category,folders:listFolders(L),kind:L.kind,items:L.items,pairs:L.pairs||[],gameTags:listGameTags(L),entrySeparator:L.entrySeparator||'',syllableSeparator:L.syllableSeparator||''}));
  return {format:'wortzeit-speechpack',version:2,title:plan.title,createdAt:new Date().toISOString(),steps:plan.steps.map(s=>({...s})),lists:snapshots,settings:{lang:state.settings.lang,theme:state.settings.theme,brightness:state.settings.brightness,instantAudio:state.settings.instantAudio,itemsPerScreen:state.settings.itemsPerScreen,order:state.settings.order,endless:state.settings.endless,interval:state.settings.interval,bpm:state.settings.bpm,beats:state.settings.beats}};
}
async function exportPlan(plan){if(!plan)return;const pkg=packageFromPlan(plan);pkg.audio={};for(const L of pkg.lists||[]){for(const it of L.items||[]){const blob=await audioGet(`${L.id}:${it.id}`);if(blob){pkg.audio[`${L.id}:${it.id}`]={type:blob.type||'audio/webm',data:await blobToBase64(blob)};}}}downloadBlob(`${safeFilename(plan.title)}.speechpack`,new Blob([JSON.stringify(pkg,null,2)],{type:'application/json'}));toast('Therapiepaket erstellt');}
function blobToBase64(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(r.error);r.readAsDataURL(blob);});}
function base64ToBlob(data,type='application/octet-stream'){const bin=atob(data);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new Blob([bytes],{type});}
function startLocalPlan(plan){if(!plan||!plan.steps.length)return toast('Der Plan enthält noch keine Schritte');activePlanRun={pkg:packageFromPlan(plan),index:0,local:true};launchPlanStep();}
function launchPlanStep(){
  if(!activePlanRun)return;const step=activePlanRun.pkg.steps[activePlanRun.index];const ids=(step.listIds?.length?step.listIds:[step.listId]).filter(Boolean);
  for(const id of ids){const list=activePlanRun.pkg.lists.find(L=>L.id===id);if(list&&!allLists().find(L=>L.id===list.id))state.userLists.push(normalizeListStorage({...list,bundled:false,origin:'package',category:`Paket · ${activePlanRun.pkg.title}`}));}
  if(ids.length){state.currentListId=ids[0];state.activeListIds=ids;ids.forEach(rememberList);saveState();}
  game={};session=null;route=step.activity||'session';render();
}

// ---------- Settings ----------
function renderSettings(){
  const s=state.settings;
  $('#view').innerHTML=pageHead('System','Einstellungen','Hier stellst du nur Dinge ein, die für die ganze App gelten. Mit ? wird jeder Bereich in einfachen Worten erklärt.')+`
  <div class="settings-grid">
    <div class="card"><button class="icon-btn card-help" data-settings-help="language" aria-label="Hilfe zu Sprache">?</button><h2>Sprache</h2><p>Welche Sprache die Bedienoberfläche verwendet.</p><div class="field"><label>Sprache der App</label><select id="setLang"><option value="de">Deutsch</option><option value="en">English</option></select></div></div>
    <div class="card"><button class="icon-btn card-help" data-settings-help="design" aria-label="Hilfe zu Design">?</button><h2>Design</h2><p>Wähle die Darstellung, die sich am angenehmsten lesen lässt. Die Änderung ist sofort sichtbar.</p><div class="theme-picks">${[['calm','Ruhig'],['light','Hell'],['dark','Dunkel'],['contrast','Schwarz / Gelb'],['warm','Warm']].map(([k,v])=>`<button class="theme-pick ${s.theme===k?'active':''}" data-theme-pick="${k}">${v}</button>`).join('')}</div></div>
    <div class="card"><button class="icon-btn card-help" data-settings-help="session" aria-label="Hilfe zu Sitzungsstandard">?</button><h2>Sitzungsstandard</h2><p>Diese Werte werden vorgeschlagen, wenn eine neue Wort-Sitzung beginnt.</p><div class="field"><label>Wörter gleichzeitig</label><select id="setAmount">${[1,2,3,4,5,6].map(n=>`<option>${n}</option>`).join('')}</select></div><label class="toggle"><input id="setEndless" type="checkbox"> Nach dem letzten Wort wieder von vorne beginnen</label></div>
    <div class="card"><button class="icon-btn card-help" data-settings-help="stories" aria-label="Hilfe zu Bildergeschichten">?</button><h2>Bildergeschichten</h2><p>Die Bilddateien hatten keine eindeutigen Dateinamen. Hier kannst du die richtigen Titel einmal zuordnen.</p><div class="toolbar"><button class="secondary-btn" id="storyTitles">Titel zuordnen</button></div></div>
    <div class="card"><button class="icon-btn card-help" data-settings-help="data" aria-label="Hilfe zu Daten">?</button><h2>Daten & Geräte</h2><p>Ein <strong>WortZeit-Datenpaket</strong> ist gleichzeitig vollständige lokale Sicherung und Geräteübertragung. Es enthält <strong>alle im Programm erstellten und importierten Listen</strong>, Ordnerzuordnungen, Patienten, Pläne, Einstellungen, Prüfstatus und Aufnahmen.</p><div class="data-inventory"><strong>${state.userLists.length}</strong><span>eigene Listen gesamt</span><strong>${state.userLists.filter(L=>(L.origin||(!L.sourcePath?'created':'imported'))==='created').length}</strong><span>davon manuell erstellt</span><strong>${state.userLists.reduce((n,L)=>n+(L.items?.length||0),0)}</strong><span>Einträge</span><strong>${knownFolders().length}</strong><span>Ordner</span><strong>${state.patients.length}</strong><span>Patienten</span><strong>${state.plans.length}</strong><span>Therapiepläne</span></div><div class="offline-readiness" id="offlineReadiness"><strong>Offline</strong><span>${navigator.onLine?'Online geöffnet · Offline-Kopie kann vorbereitet werden':'Du arbeitest gerade offline'}</span></div><div class="toolbar"><button class="secondary-btn" id="showIntroSettings">Kurze Einführung</button><button class="secondary-btn" id="browserCheck">Browser prüfen</button><button class="secondary-btn" id="offlinePrepare">Offline vorbereiten</button><button class="secondary-btn" id="backupState">Datenpaket speichern</button><button class="secondary-btn" id="shareState">Datenpaket teilen</button><button class="secondary-btn" id="restoreState">Datenpaket öffnen</button><button class="danger-btn" id="resetState">Testdaten zurücksetzen</button></div><input id="restoreStatePicker" type="file" accept=".wortzeit,.json" hidden></div>
  </div>`;
  $('#setLang').value=s.lang;$('#setAmount').value=s.itemsPerScreen;$('#setEndless').checked=s.endless;
  $('#setLang').onchange=e=>{s.lang=e.target.value;saveState();applyI18n();renderSettings();};
  $('#setAmount').onchange=e=>{s.itemsPerScreen=+e.target.value;saveState();};
  $('#setEndless').onchange=e=>{s.endless=e.target.checked;saveState();};
  $$('[data-theme-pick]').forEach(b=>b.onclick=()=>{s.theme=b.dataset.themePick;saveState();applyTheme();renderSettings();});
  $$('[data-settings-help]').forEach(b=>b.onclick=()=>settingsHelp(b.dataset.settingsHelp));
  $('#storyTitles').onclick=openStoryTitleEditor;
  $('#showIntroSettings')?.addEventListener('click',showWelcome);
  $('#browserCheck')?.addEventListener('click',()=>{
    const checks=[
      ['Therapiepakete öffnen',typeof FileReader!=='undefined'],
      ['Dauerhafte lokale Datenbank',typeof indexedDB!=='undefined'],
      ['Audio aufnehmen',!!navigator.mediaDevices?.getUserMedia&&'MediaRecorder' in window],
      ['Offline-Zwischenspeicher','serviceWorker' in navigator],
      ['OpenDocument direkt importieren','DecompressionStream' in window],
      ['Ganzen Ordner auswählen','webkitdirectory' in document.createElement('input')]
    ];
    helpModal('Browser prüfen',`<p>Die Kernfunktionen laufen in modernen Browsern. Einzelne Komfortfunktionen können je nach Browser fehlen.</p><div class="browser-check-list">${checks.map(([n,ok])=>`<div class="browser-check-row"><strong>${ok?'✓':'–'} ${esc(n)}</strong><span>${ok?'verfügbar':'Fallback verwenden'}</span></div>`).join('')}</div><p class="small muted">Wenn „Ganzen Ordner auswählen“ fehlt, kannst du mehrere Dateien gleichzeitig markieren. Wenn OpenDocument fehlt, importiere ODT/ODS einmal auf einem anderen aktuellen Browser oder speichere die Datei als RTF/TXT.</p>`);
  });
  const listOriginKind=L=>L.origin||(!L.sourcePath?'created':(/^Kopie von /.test(L.sourcePath||'')?'copied':'imported'));
  const stateManifest=snapshot=>({
    stateVersion:snapshot.version||0,
    listCount:snapshot.userLists.length,
    manualListCount:snapshot.userLists.filter(L=>listOriginKind(L)==='created').length,
    importedListCount:snapshot.userLists.filter(L=>listOriginKind(L)==='imported').length,
    copiedListCount:snapshot.userLists.filter(L=>listOriginKind(L)==='copied').length,
    itemCount:snapshot.userLists.reduce((n,L)=>n+(L.items?.length||0),0),
    contentChars:snapshot.userLists.reduce((n,L)=>n+(L.items||[]).reduce((m,it)=>m+String(it.text||'').length,0),0),
    folderCount:[...new Set(snapshot.userLists.flatMap(listFolders))].length,
    folderAssignmentCount:snapshot.userLists.reduce((n,L)=>n+listFolders(L).length,0),
    patientCount:snapshot.patients.length,
    planCount:snapshot.plans.length,
    reviewBatchCount:(snapshot.importReviewBatches||[]).length,
    ignoredDuplicateGroupCount:(snapshot.duplicateIgnoreGroups||[]).length,
    audioCount:0
  });
  const verifyPackageObject=(payload,expected)=>{
    if(!payload?.state||!Array.isArray(payload.state.userLists))throw new Error('Datenpaket konnte intern nicht verifiziert werden.');
    const actual=stateManifest(payload.state);actual.audioCount=Object.keys(payload.audio||{}).length;
    for(const key of ['listCount','manualListCount','importedListCount','copiedListCount','itemCount','contentChars','folderCount','folderAssignmentCount','patientCount','planCount','audioCount'])if(Object.prototype.hasOwnProperty.call(expected,key)&&Number(expected[key]||0)!==Number(actual[key]||0))throw new Error(`Datenpaket-Prüfung fehlgeschlagen (${key}).`);
    const ids=payload.state.userLists.map(L=>L.id);if(new Set(ids).size!==ids.length)throw new Error('Datenpaket enthält doppelte interne Listen-IDs.');
    return actual;
  };
  const makeDataPackage=async()=>{
    await flushStateSave();
    const entries=await audioAllEntries(),audio={};for(const [key,blob] of entries){if(blob instanceof Blob)audio[key]={type:blob.type||'audio/webm',data:await blobToBase64(blob)};}
    const snapshot=cloneData(state);normalizeAllUserLists(snapshot);const manifest=stateManifest(snapshot);manifest.audioCount=Object.keys(audio).length;
    const payload={format:'wortzeit-local-backup',version:4,createdAt:new Date().toISOString(),manifest,state:snapshot,audio};
    const raw=JSON.stringify(payload,null,2),roundTrip=JSON.parse(raw);verifyPackageObject(roundTrip,manifest);
    return {payload,raw,blob:new Blob([raw],{type:'application/json'}),manifest};
  };
  const dataPackageFilename=()=>`WortZeit_Datenpaket_${new Date().toISOString().slice(0,10)}.wortzeit`;
  const packageSummary=(m,bytes=0)=>`${m.listCount} Listen (${m.manualListCount||0} manuell) · ${m.itemCount} Einträge · ${m.folderCount} Ordner · ${m.patientCount||0} Patienten · ${m.planCount||0} Pläne · ${m.audioCount} Aufnahmen${bytes?` · ${(bytes/1024/1024).toFixed(bytes>1024*1024?1:2)} MB`:''}`;
  $('#backupState').onclick=async()=>{const btn=$('#backupState'),label=btn.textContent;btn.disabled=true;btn.textContent='Datenpaket wird erstellt …';try{const pack=await makeDataPackage();downloadBlob(dataPackageFilename(),pack.blob);toast(`Datenpaket gespeichert · ${packageSummary(pack.manifest,pack.blob.size)}`);}catch(err){console.warn(err);toast('Datenpaket konnte nicht erstellt werden');}finally{btn.disabled=false;btn.textContent=label;}};
  $('#shareState').onclick=async()=>{const btn=$('#shareState'),label=btn.textContent;btn.disabled=true;btn.textContent='Wird vorbereitet …';try{const pack=await makeDataPackage(),file=new File([pack.blob],dataPackageFilename(),{type:'application/json'});if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:'WortZeit Datenpaket',text:'WortZeit-Daten auf ein anderes Gerät übertragen',files:[file]});toast(`Datenpaket bereit · ${packageSummary(pack.manifest,pack.blob.size)}`);}else{downloadBlob(file.name,pack.blob);toast('Direktes Teilen unterstützt dieser Browser nicht. Das Datenpaket wurde stattdessen gespeichert.');}}catch(err){if(err?.name!=='AbortError'){console.warn(err);toast('Datenpaket konnte nicht geteilt werden');}}finally{btn.disabled=false;btn.textContent=label;}};
  $('#offlinePrepare').onclick=async()=>{const btn=$('#offlinePrepare'),label=btn.textContent;btn.disabled=true;btn.textContent='Offline wird vorbereitet …';try{if(!('serviceWorker' in navigator)||!('caches' in window))throw new Error('Dieser Browser unterstützt den Offline-Speicher nicht.');const reg=await navigator.serviceWorker.ready;await reg.update().catch(()=>{});if(navigator.storage?.persist){try{await navigator.storage.persist();}catch{}}const cache=await caches.open(OFFLINE_CACHE);await cache.addAll(OFFLINE_SHELL);const checks=await Promise.all(OFFLINE_SHELL.map(u=>cache.match(u)));if(checks.some(x=>!x))throw new Error('Nicht alle App-Dateien wurden gespeichert.');$('#offlineReadiness').innerHTML='<strong>Offline bereit</strong><span>WortZeit kann in diesem Browser nach dem ersten Online-Start auch ohne Internet geöffnet werden.</span>';toast('Offline-Kopie vollständig vorbereitet');}catch(err){console.warn(err);toast(err.message||'Offline-Kopie konnte nicht vorbereitet werden');}finally{btn.disabled=false;btn.textContent=label;}};
  $('#restoreState').onclick=()=>$('#restoreStatePicker').click();
  $('#restoreStatePicker').onchange=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      const obj=JSON.parse((await readFileText(file)).replace(/^\uFEFF/,''));if(obj?.format!=='wortzeit-local-backup'||!obj.state)throw new Error('Kein WortZeit-Datenpaket');
      const parsed=obj.state,actualLists=Array.isArray(parsed.userLists)?parsed.userLists.length:0,actualItems=(parsed.userLists||[]).reduce((n,L)=>n+(L.items?.length||0),0);
      const summary=obj.manifest||{...stateManifest(normalizeLoadedState(parsed)),audioCount:Object.keys(obj.audio||{}).length};
      if(obj.manifest){const checkState=normalizeLoadedState(parsed);normalizeAllUserLists(checkState);verifyPackageObject({state:checkState,audio:obj.audio||{}},obj.manifest);}
      if(actualLists!==summary.listCount||actualItems!==summary.itemCount)throw new Error('Das Datenpaket ist unvollständig oder beschädigt.');
      if(!confirm(`Dieses WortZeit-Datenpaket laden?\n\n${packageSummary(summary,file.size)}\n\nDie lokalen WortZeit-Daten dieses Browsers werden durch diesen Stand ersetzt.`))return;
      const next=normalizeLoadedState(parsed);normalizeAllUserLists(next);migrateImportReviewState(next);
      let restoredAudio=0;if(obj.version>=2&&obj.audio&&typeof obj.audio==='object'){await audioClearAll();for(const [key,a] of Object.entries(obj.audio)){try{await audioSet(key,base64ToBlob(a.data,a.type));restoredAudio++;}catch(err){console.warn('Audio restore failed',key,err);}}}
      state=next;await persistStateSnapshot(cloneData(state));session=null;game={};applyTheme();updateHeader();renderSettings();toast(`Datenpaket geladen · ${state.userLists.length} Listen · ${state.userLists.reduce((n,L)=>n+(L.items?.length||0),0)} Einträge · ${restoredAudio} Aufnahmen`);
    }catch(err){console.warn(err);toast(err.message||'Datenpaket konnte nicht gelesen werden');}finally{e.target.value='';}
  };
  $('#resetState').onclick=async()=>{if(confirm('Eigene Listen, Patienten, Therapiepläne und Aufnahmen dieses Browsers wirklich zurücksetzen?')){localStorage.removeItem(STORAGE_KEY);await idbStateClear();await audioClearAll();state=cloneData(DEFAULT_STATE);session=null;game={};saveState();applyTheme();renderSettings();toast('Zurückgesetzt');}};
  bindPlanBar();
}
function settingsHelp(which){
  const info={
    language:['Sprache','Hier stellst du ein, in welcher Sprache die Knöpfe, Menüs und Erklärungen der App angezeigt werden. Deine eigenen Wortlisten werden dadurch nicht verändert.'],
    design:['Design','Hier änderst du nur das Aussehen der App. Tippe auf ein Design und du siehst die Änderung sofort. Wähle einfach die Variante, die für dich und den Patienten am angenehmsten zu lesen ist.'],
    session:['Sitzungsstandard','Hier legst du fest, mit wie vielen Wörtern eine neue Wort-Sitzung normalerweise startet. „Wieder von vorne“ bedeutet: Nach dem letzten Wort beginnt die Liste erneut. Du kannst diese Werte später in jeder Sitzung noch ändern.'],
    stories:['Bildergeschichten','Die gelieferten Bilder heißen nur nach Aufnahmedatum. Deshalb zeigt die App zunächst neutrale Namen wie „Bildergeschichte 01“. Mit „Titel zuordnen“ kannst du anhand der Bildvorschau den passenden Titel auswählen. Die Zuordnung wird gespeichert.'],
    data:['Daten & Geräte','„Datenpaket speichern“ erstellt eine vollständige portable WortZeit-Datei mit allen manuell erstellten und importierten eigenen Listen, Mehrfach-Ordnerzuordnungen, Spielzuordnungen, Import-Prüfstatus, Duplikatentscheidungen, Patienten, Therapieplänen, Einstellungen und Aufnahmen. Genau dieselbe Datei kannst du auf Laptop, Handy oder Tablet über „Datenpaket öffnen“ laden. „Offline vorbereiten“ speichert die App-Dateien dieses Browsers, damit WortZeit nach einem erfolgreichen ersten Online-Start auch ohne Internet geöffnet werden kann. Browser-Berechtigungen wie Mikrofonfreigabe gehören nicht zum Datenpaket.']
  };
  const [title,body]=info[which]||['Einstellungen','Hier kannst du die App an deine Arbeitsweise anpassen.'];
  helpModal(title,`<p>${body}</p>`);
}
function openStoryTitleEditor(){
  const rows=DATA.imageStories.map((story,i)=>{
    const current=state.storyTitleOverrides[story.id]||'';
    return `<div class="story-title-row"><div class="story-mini" aria-label="Vorschau Bildergeschichte ${i+1}">${(story.pieces||[]).map((src,n)=>`<img src="${esc(src)}" alt="Teil ${n+1}">`).join('')}</div><div><strong>Bildergeschichte ${String(i+1).padStart(2,'0')}</strong><div class="muted small">Titel auswählen</div></div><select data-story-title="${esc(story.id)}" aria-label="Titel für Bildergeschichte ${i+1}"><option value="">Noch nicht zugeordnet</option>${STORY_TITLE_CATALOG.map(t=>`<option value="${esc(t)}" ${current===t?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
  }).join('');
  openModal(`<div class="modal-head"><div><div class="eyebrow">Bildergeschichten</div><h2>Titel zuordnen</h2><p class="muted">Sieh dir die Vorschau an und wähle den passenden Titel. Du musst nicht alles auf einmal machen.</p></div><button class="icon-btn" data-close-modal>×</button></div><div class="story-title-editor">${rows}</div><div class="modal-foot"><button class="soft-btn" id="clearStoryTitles">Zuordnungen löschen</button><button class="primary-btn" id="saveStoryTitles">Speichern</button></div>`);
  $('#saveStoryTitles').onclick=()=>{const sels=$$('[data-story-title]');const used=sels.map(x=>x.value).filter(Boolean);const duplicate=used.find((x,i)=>used.indexOf(x)!==i);if(duplicate)return toast(`„${duplicate}“ wurde mehrfach ausgewählt`);sels.forEach(sel=>{if(sel.value)state.storyTitleOverrides[sel.dataset.storyTitle]=sel.value;else delete state.storyTitleOverrides[sel.dataset.storyTitle];});saveState();closeModal();toast('Bildertitel gespeichert');};
  $('#clearStoryTitles').onclick=()=>{if(confirm('Alle selbst zugeordneten Bildertitel wieder auf neutral setzen?')){state.storyTitleOverrides={};saveState();closeModal();toast('Zuordnungen gelöscht');}};
}

// ---------- Patient player ----------
function enterPatientMode(){patientMode=true;route='home';document.body.classList.add('patient-mode');applyRouteMode();closeDrawer();renderPatientMode();}
function leavePatientMode(){const local=location.hostname==='127.0.0.1'||location.hostname==='localhost'||location.protocol==='file:';if(!local){location.href='./behandler.html';return;}patientMode=false;document.body.classList.remove('patient-mode');importedPatientPackage=null;activePlanRun=null;nav('home');}
function renderPatientMode(){
  const v=$('#view');
  v.innerHTML=`<div class="patient-gate"><div class="patient-panel"><div class="brand-mark" style="margin:0 auto">WZ</div><h1>Übung öffnen</h1><p>Öffne die Datei, die du für deine Übungen bekommen hast.</p><div class="drop-zone" id="patientDrop"><strong style="font-size:20px">.speechpack hier ablegen</strong><p>oder</p><button class="primary-btn" id="patientPick">Datei auswählen</button><input id="patientPackFile" type="file" accept=".speechpack,.json" hidden></div></div></div>`;
  $('#patientPick').onclick=()=>$('#patientPackFile').click();$('#patientPackFile').onchange=e=>{const f=e.target.files[0];if(f)loadSpeechpackFile(f,false);};const d=$('#patientDrop');d.ondragover=e=>{e.preventDefault();d.classList.add('drag-over')};d.ondragleave=()=>d.classList.remove('drag-over');d.ondrop=e=>{e.preventDefault();d.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f)loadSpeechpackFile(f,false);};
}
function renderPatientWelcome(pkg){
  $('#view').innerHTML=`<div class="patient-gate"><div class="patient-panel patient-welcome"><div class="brand-mark" style="margin:0 auto">WZ</div><div class="eyebrow">WortZeit</div><h1>Willkommen zum Sprachkurs!</h1><h2>${esc(pkg.title||'Deine Übungen')}</h2><p>${pkg.steps?.length||0} Übung${pkg.steps?.length===1?'':'en'} sind vorbereitet.</p><button class="primary-btn patient-start-course" data-default-action id="patientStartCourse">Anfangen</button></div></div>`;
  $('#patientStartCourse').onclick=()=>{activePlanRun={pkg,index:0,local:false};launchPlanStep();};
}
async function loadSpeechpackFile(file,addToPlans=false){
  try{const text=await file.text();const pkg=JSON.parse(text.replace(/^\uFEFF/,''));if(pkg.format!=='wortzeit-speechpack'||!Array.isArray(pkg.steps))throw new Error('wrong format');
    if(pkg.audio){for(const [key,a] of Object.entries(pkg.audio)){try{await audioSet(key,base64ToBlob(a.data,a.type));}catch{}}}
    if(addToPlans){const listIdMap=new Map();for(const L of pkg.lists||[]){let existing=allLists().find(x=>x.id===L.id);if(!existing){state.userLists.push(normalizeListStorage({...L,bundled:false,origin:'package',category:`Import · ${pkg.title}`}));existing=L;}listIdMap.set(L.id,existing.id);}const plan={id:uid('plan'),title:pkg.title||'Importierter Plan',steps:pkg.steps.map(s=>{const ids=(s.listIds?.length?s.listIds:[s.listId]).filter(Boolean).map(id=>listIdMap.get(id)||id);return {...s,listId:ids[0]||s.listId,listIds:ids};})};state.plans.push(plan);saveState();renderPlans();toast('Therapieplan importiert');return;}
    importedPatientPackage=pkg;patientMode=true;document.body.classList.add('patient-mode');if(pkg.settings){state.settings={...state.settings,...pkg.settings};applyTheme();}activePlanRun=null;renderPatientWelcome(pkg);
  }catch(e){console.error(e);toast('Diese Datei ist kein gültiges WortZeit-Therapiepaket.');}
}

// ---------- Global help ----------
function contextualHelp(){
  const map={
    home:['Start','Wähle eine Liste oder starte direkt mit den Standardwörtern. Danach kannst du eine Wort-Sitzung, ein Spiel oder einen vorbereiteten Therapieplan öffnen.'],
    session:['Sitzung','Das große Wort oder der Satz ist die Übung. Tippe auf die Wortfläche für den nächsten Eintrag; mit ← und → gehst du innerhalb der aktuellen Reihenfolge zurück oder vor. „↺ Anfang“ springt zum Beginn dieser Runde, ▶ startet die automatische Anzeige. Oben kannst du Helligkeit und mit „Aa“ die gewünschte Schriftgröße direkt verändern. WortZeit verkleinert sehr lange Texte trotzdem automatisch so weit, dass nichts abgeschnitten wird.'],
    lists:['Listen','Hier wählst und pflegst du dein Material. Ordner bleiben zunächst geschlossen und lassen sich durch Anklicken auf- und zuklappen. Nach einem Import zeigt „Import prüfen“ genau die neuen Listen mit erkanntem Typ, Trennzeichen, Eintragszahl und passenden Spielen. Neu oder unklar erkannte Listen bleiben markiert, bis du sie bestätigst. „Alle schließen“ bringt die Ansicht jederzeit wieder in einen ruhigen Zustand. Öffne eine Liste und wähle „Liste bearbeiten“, um Text, A/B-Typ, Eintrags- und Silbentrenner, Spielzuordnungen und mehrere Therapie-Ordner zu ändern. Das × an einem Ordner entfernt nur diese Zuordnung; die Liste selbst bleibt erhalten und landet beim letzten entfernten Ordner unter „Unsortiert“. Eine Liste kann gleichzeitig in mehreren Ordnern erscheinen und auch per Drag & Drop einem weiteren Ordner zugewiesen werden. „Aufgelistet“ eignet sich zum einzelnen Korrigieren, „Unformatiert“ zum Einfügen größerer Textblöcke. „Duplikate prüfen“ meldet nur Listen, deren gespeicherter therapeutischer Inhalt 1:1 identisch ist. Es wird niemals automatisch gelöscht. Beim manuellen Zusammenführen werden Ordner, Spielzuordnungen, Patienten- und Therapieplan-Verknüpfungen auf die behaltene Liste übernommen; konkurrierende Aufnahmen werden nicht still überschrieben. Manuell im Programm erstellte Listen werden genauso wie importierte Listen im WortZeit-Datenpaket gesichert.'],
    games:['Spiele','Wähle einfach ein Spiel. Wenn noch keine passende Liste gewählt ist, fragt WortZeit direkt beim Öffnen danach – du musst nicht erst zurück in die Listenverwaltung. Im Spiel kannst du die Liste oben jederzeit wieder wechseln. ? erklärt das Spiel, × oder Escape beendet es.'],
    patients:['Patienten','Hier kannst du einen einfachen Anzeigenamen anlegen und passende Listen zuordnen. So findest du das vorbereitete Material später schneller wieder.'],
    plans:['Therapiepläne','Ein Therapieplan verbindet mehrere Übungen in einer festen Reihenfolge. Du kannst ihn selbst starten oder als .speechpack-Datei für den Patientenplayer weitergeben. Benötigte Listen und vorhandene Aufnahmen der verwendeten Einträge werden in das Therapiepaket übernommen. Mit den Pfeilen änderst du die Reihenfolge der Schritte. Das .speechpack ist nur die vorbereitete Patientenübung – dein kompletter WortZeit-Arbeitsstand wird separat unter „Daten & Geräte“ als Datenpaket gesichert.'],
    letters:['Buchstaben','Baue das gesuchte Wort aus den Buchstaben unten. Du kannst einen Buchstaben antippen oder direkt auf eine beliebige freie Stelle ziehen. Bereits gesetzte Buchstaben lassen sich oben per Drag & Drop tauschen. Antippen entfernt einen gesetzten Buchstaben wieder. „Reset“ leert nur die aktuelle Lösung.<br><br><strong>Wofür gedacht:</strong> Wörter bewusst Buchstabe für Buchstabe zusammensetzen und ihre Reihenfolge bearbeiten.'],
    memory:['Memory','Zuerst wählst du Memory-Art, 8/12/16/24 Karten und 1 oder 2 Spieler. Danach startet das Spielfeld mit möglichst großen quadratischen Karten. Bei Audio-Memory wird das Wort mit der bereits in der Aufnahmebank gespeicherten Aufnahme gepaart und beim Umdrehen abgespielt. Mit „Paar halten AN“ bleiben zwei Karten offen, bis du „Weiter“ drückst.<br><br><strong>Wofür gedacht:</strong> Begriffe, Bilder oder gehörte Wörter miteinander in Beziehung setzen und wiedererkennen.'],
    sorting:['Sortieren','Links bleiben die Hinweise. Rechts ist der Arbeitsbereich: oben die Zielkategorien, direkt darunter die verfügbaren Antworten. Tippe eine Antwort an und danach das passende Feld – oder ziehe sie direkt dorthin. Bereits gesetzte Antworten kannst du wieder verschieben. Der große hervorgehobene „Prüfen“-Knopf oben ist die Hauptaktion. Über „Übung“ kannst du ein bestimmtes Rätsel direkt auswählen; mit „← Aufgabe“ springst du zur vorherigen Aufgabe zurück. Reset leert nur die aktuelle Lösung.<br><br><strong>Wofür gedacht:</strong> Hinweise nacheinander aufnehmen, Zusammenhänge herstellen und Informationen passend zuordnen.'],
    story:['Bildergeschichte','Bringe die vier Bilder in die richtige Reihenfolge. Du kannst zwei Bilder antippen oder sie ziehen. Sobald die Reihenfolge stimmt, erkennt WortZeit das automatisch – die Geschichte bleibt stehen, bis du den großen „Weiter“-Knopf drückst. Mit „← Aufgabe“ kannst du auch zur vorherigen Bildergeschichte zurückspringen und sie noch einmal besprechen.<br><br><strong>Wofür gedacht:</strong> Eine Handlung zeitlich ordnen und anschließend in eigenen Worten beschreiben oder erzählen.'],
    choiceStory:['Geschichte bauen','Lies den Satzanfang und wähle eine der vier Möglichkeiten. Es gibt hier bewusst kein Richtig oder Falsch. Deine Auswahl wird direkt an den Satz angefügt und bleibt Teil der Geschichte. Mit „Weiter“ gehst du zum nächsten Satz. Am Ende könnt ihr eure komplette Geschichte noch einmal lesen.<br><br><strong>Wofür gedacht:</strong> Sprache, Entscheidungen, Humor und gemeinsames Erzählen in einer fortlaufenden Situation verbinden.'],
    wheel:['Wortwalze','Drücke „Drehen“. Die Wörter laufen von oben nach unten durch die große Walze. Tempo und Schriftgröße sind frei einstellbar; die bisherige große Standardschrift liegt ungefähr in der Mitte des Reglers. Entscheidend ist das Loslassen: Das Wort unter dem Zeiger wird oben gesammelt. Die gesammelten Wörter kannst du mit Maus, Finger oder Stift per Ziehen untereinander umsortieren; ein kurzes Antippen entfernt ein Wort wieder.<br><br><strong>Wofür gedacht:</strong> Aus zufällig auftauchenden Begriffen spontan Sätze, Zusammenhänge oder kleine Geschichten bilden und ihre Reihenfolge gemeinsam verändern.'],
    syllables:['Silben','Die sechs Silben liegen groß und in Großbuchstaben an den sechs Punkten des Hexagons. Tippe oder ziehe sie in den Arbeitsbereich und ordne sie dort bei Bedarf neu. Eine bekannte gültige Kombination wird als großes Wort in der Mitte erkannt. Kennt WortZeit eine andere sinnvolle Kombination nicht, wird sie deshalb nicht als falsch bewertet. Reset leert nur deine Auswahl, Mischen erzeugt eine neue Runde.<br><br><strong>Wofür gedacht:</strong> Silben in einer stabilen räumlichen Anordnung auswählen und schrittweise zu Wörtern zusammensetzen.'],
    semantic:['Wortnetz','In der Mitte steht ein Begriff aus der aktuell gewählten Liste. Wenn eine eigene Liste aktiv ist, verwendet Wortnetz keine heimlichen Zufallswörter aus dem Fallback. Die sechs Felder außen geben Gesprächsimpulse: Kategorie, Verwendung, Ort, Eigenschaften, Aussehen/Teile und Verbindungen. Tippt die Felder an, wenn ihr sie gemeinsam bearbeitet habt. Über die Materialauswahl oben kannst du die Liste direkt wechseln. Es gibt keine automatische Bewertung.<br><br><strong>Wofür gedacht:</strong> Einen Begriff über seine Bedeutung und Beziehungen ausführlich beschreiben und dadurch verschiedene sprachliche Zugänge anbieten.'],
    settings:['Einstellungen','Hier stellst du Sprache, Aussehen und Startwerte ein. „Design“ verändert die App sofort. „Sitzungsstandard“ bestimmt, wie eine neue Wort-Sitzung normalerweise beginnt. Unter „Daten & Geräte“ siehst du vor dem Export die Zahl deiner eigenen Listen, Einträge, Ordner, Patienten und Therapiepläne. Das WortZeit-Datenpaket sichert den kompletten lokalen Arbeitsstand einschließlich manuell erstellter und importierter Listen, Mehrfach-Ordnerzuordnungen, Prüf- und Duplikatentscheidungen, Einstellungen und Aufnahmen. Beim Erstellen und Öffnen prüft WortZeit die enthaltenen Mengen auf Vollständigkeit. Mit derselben Datei kannst du den Stand auf Laptop, Handy oder Tablet übertragen. „Offline vorbereiten“ macht die App nach erfolgreicher Vorbereitung im selben Browser auch ohne Internet startbar.']
  };
  const [title,body]=map[route]||map.home;
  helpModal(title,`<p>${body}</p>`);
}

function clickDefaultAction(){
  const modalAction=$('#modalRoot [data-default-action]:not([disabled])');if(modalAction){modalAction.click();return true;}
  if(GAME_ROUTES.includes(route)){const btn=$('.game-shell [data-game-primary]:not([disabled])');if(btn){btn.click();return true;}}
  return false;
}

// ---------- Service worker ----------
if('serviceWorker' in navigator && location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js?v=0.8.3',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});}

// ---------- Global events/init ----------
try{history.replaceState({wz:true,route:'home',depth:0},'',location.href);}catch{}
$('#menuButton').onclick=openDrawer;$('#closeDrawer').onclick=closeDrawer;$('#scrim').onclick=closeDrawer;$('#helpButton').onclick=contextualHelp;$('#patientModeButton').onclick=enterPatientMode;$('.brand').onclick=()=>{if(!patientMode)nav('home');};$('.brand').onkeydown=e=>{if(!patientMode&&(e.key==='Enter'||e.key===' '))nav('home');};$$('.drawer-nav [data-route]').forEach(b=>b.onclick=()=>nav(b.dataset.route));$('#currentListButton').onclick=()=>nav('lists');
$('#navBackButton')?.addEventListener('click',navigationBack);$('#navForwardButton')?.addEventListener('click',navigationForward);window.addEventListener('popstate',handleHistoryPop);
window.addEventListener('keydown',e=>{const typing=e.target.matches('input,textarea,select,button,a')||e.target.isContentEditable;if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();navigationBack();return;}if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();navigationForward();return;}if(e.key==='Escape'){if($('#modalRoot').innerHTML)closeModal();else if($('#drawer').classList.contains('open'))closeDrawer();else if(GAME_ROUTES.includes(route)){e.preventDefault();gameBack();}return;}if(!typing&&(e.key==='Enter'||e.key===' ')){if($('#modalRoot').innerHTML&&clickDefaultAction()){e.preventDefault();return;}if(GAME_ROUTES.includes(route)&&clickDefaultAction()){e.preventDefault();return;}}if(route==='session'&&!typing){if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();sessionNext();}if(e.key==='ArrowLeft'){e.preventDefault();sessionPrev();}}});
window.addEventListener('beforeunload',()=>{stopAutoplay();if(pendingStateSnapshot){const snap=pendingStateSnapshot;pendingStateSnapshot=null;persistStateSnapshot(snap);}});
window.addEventListener('resize',()=>{if(route==='memory'&&game.memoryStage==='play')fitMemoryBoard();if(route==='story')fitStoryBoard();if(route==='wheel')fitWheelGeometry();if(route==='syllables')fitSyllableBoard();if(route==='session')fitSessionText();});

if(patientMode)document.body.classList.add('patient-mode');
updateHeader();render();syncNavigationButtons();
})();
