// --------------------------
// MiniSoccer - Apps Script (Hardened)
// Final Code.gs (UPDATED)
// --------------------------

const SS_ID = '1RtxZVCHaYTetgIEOYwbOMWAzki4dAoGbDyh7jwVrTIU';
const SHEET_PLAYERS = 'Players';
const SHEET_KEEPERS = 'Keepers';
const SHEET_WAITING = 'Waiting';
const SHEET_META = 'Meta';
const SHEET_SETTINGS = 'Settings';

// security config
const ADMIN_LOCK_MAX_FAIL = 5;
const ADMIN_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ADMIN_PW_INIT = 'PasswordBaruYangKuat123!'; // ONLY used by INIT_ADMIN to create initial hash if none exists
const MAX_NAME_LEN = 80;
const MAX_PHONE_LEN = 30;
const MAX_PLACE_LEN = 250;
const MAX_TEAMNAME_LEN = 120;

// ---------- Utility: Admin hash + lockout stored in ScriptProperties ----------
function getProps(){ return PropertiesService.getScriptProperties(); }
function hash(text){
  if(!text) return '';
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text));
  return raw.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

// Call once (manually) from Apps Script editor to initialize admin hash if none.
// Example: INIT_ADMIN('your-strong-password')
function INIT_ADMIN(pw){
  if(!pw) throw new Error('provide pw');
  const props = getProps();
  if(props.getProperty('admin_hash')) throw new Error('admin already initialized');
  props.setProperty('admin_hash', hash(pw));
  return true;
}

function _getAdminHash(){
  return getProps().getProperty('admin_hash') || null;
}

function _incrementAdminFail(){
  const props = getProps();
  const fail = Number(props.getProperty('admin_fail_count') || '0') + 1;
  props.setProperty('admin_fail_count', String(fail));
  if(fail >= ADMIN_LOCK_MAX_FAIL){
    const until = Date.now() + ADMIN_LOCK_DURATION_MS;
    props.setProperty('admin_lock_until', String(until));
  }
}

function _resetAdminFail(){
  const props = getProps();
  props.deleteProperty('admin_fail_count');
  props.deleteProperty('admin_lock_until');
}

function _getAdminLockInfo(){
  const props = getProps();
  const until = Number(props.getProperty('admin_lock_until') || '0');
  const fail = Number(props.getProperty('admin_fail_count') || '0');
  return { until: until || null, failCount: fail };
}

// verifyAdmin now returns object { ok, message, lockedUntil }
function verifyAdmin(pw){
  const props = getProps();
  const adminHash = _getAdminHash();
  if(!adminHash){
    // if not initialized, create using ADMIN_PW_INIT (legacy convenience) and ask user to INIT_ADMIN properly
    props.setProperty('admin_hash', hash(ADMIN_PW_INIT));
  }
  const lockInfo = _getAdminLockInfo();
  if(lockInfo.until && Date.now() < lockInfo.until){
    return { ok:false, message:'Account locked due to too many failed attempts', lockedUntil: lockInfo.until };
  }
  const providedHash = hash(String(pw||''));
  if(providedHash === adminHash){
    _resetAdminFail();
    return { ok:true, message:'OK', lockedUntil: null };
  } else {
    _incrementAdminFail();
    const mut = _getAdminLockInfo().until;
    const msg = mut && Date.now() < mut ? 'Too many failed attempts. Locked.' : 'Invalid password';
    return { ok:false, message: msg, lockedUntil: mut || null };
  }
}

// ---------- Sanitization helpers ----------
function stripTags(s){
  if(s === null || s === undefined) return '';
  return String(s).replace(/<\/?[^>]+(>|$)/g, '');
}
function removeControlChars(s){
  return String(s).replace(/[\x00-\x1F\x7F]/g,'');
}
function sanitizeInput(s, maxLen){
  if(s === null || s === undefined) return '';
  let out = String(s);
  out = stripTags(out);
  out = removeControlChars(out);
  out = out.trim();
  if(maxLen && out.length > maxLen) out = out.substr(0, maxLen);
  return out;
}

function isValidUrl(u){
  try{
    if(!u) return false;
    u = String(u).trim();
    return /^https?:\/\//i.test(u) && u.length <= MAX_PLACE_LEN;
  }catch(e){ return false; }
}

// ---------- Sheet setup ----------
function setupSheets(){
  const ss = SpreadsheetApp.openById(SS_ID);
  const required = [SHEET_PLAYERS, SHEET_KEEPERS, SHEET_WAITING, SHEET_META, SHEET_SETTINGS];
  required.forEach(name => {
    if(!ss.getSheetByName(name)) ss.insertSheet(name);
  });
  ensureHeader(ss.getSheetByName(SHEET_PLAYERS), ['id','timestamp','name','phone']);
  ensureHeader(ss.getSheetByName(SHEET_KEEPERS), ['id','timestamp','name','phone']);
  ensureHeader(ss.getSheetByName(SHEET_WAITING), ['id','timestamp','name','phone']);
  ensureHeader(ss.getSheetByName(SHEET_META), ['key','value']);
  ensureHeader(ss.getSheetByName(SHEET_SETTINGS), ['TeamName','Place','Kickoff','Date']);
}

function doGet() {
  setupSheets(); // keep
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Mini Soccer List')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT); // safer than ALLOWALL
}

function ensureHeader(sheet, headers){
  if(!sheet) return;
  try{
    const firstRow = sheet.getRange(1,1,1, Math.max(sheet.getMaxColumns(), headers.length)).getValues()[0];
    if(firstRow[0] !== headers[0]){
      sheet.clear();
      sheet.appendRow(headers);
    }
  }catch(e){
    sheet.clear();
    sheet.appendRow(headers);
  }
}

// ---------- Meta & Settings ----------
function getMeta(){
  setupSheets();
  const sh = SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_META);
  const values = sh.getDataRange().getValues();
  const res = {};
  for(let i=1;i<values.length;i++){
    const k = values[i][0]; const v = values[i][1]; if(k) res[k]=v;
  }
  return res;
}

function setMeta(obj, pw){
  setupSheets();
  const ok = verifyAdmin(pw);
  if(!ok.ok) throw new Error(ok.message || 'Unauthorized');
  const sh = SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_META);
  sh.clear(); sh.appendRow(['key','value']);
  for(const k in obj){
    sh.appendRow([String(k), String(obj[k])]);
  }
  return true;
}

function getSettings(){
  setupSheets();
  const sh = SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_SETTINGS);
  const values = sh.getDataRange().getValues();
  if(values.length <= 1) return { TeamName:'', Place:'', Kickoff:'', Date:'' };
  const row = values[1];
  return {
    TeamName: row[0] ? String(row[0]) : '',
    Place: row[1] ? String(row[1]) : '',
    Kickoff: row[2] ? String(row[2]) : '',
    Date: row[3] ? String(row[3]) : ''
  };
}

function setSettings(obj, pw){
  setupSheets();
  const ok = verifyAdmin(pw);
  if(!ok.ok) throw new Error(ok.message || 'Unauthorized');
  // sanitize inputs
  const team = sanitizeInput(obj.TeamName||'', MAX_TEAMNAME_LEN);
  let place = sanitizeInput(obj.Place||'', MAX_PLACE_LEN);
  if(place && !isValidUrl(place)){
    // allow plain text place but trim
    place = place.substr(0, MAX_PLACE_LEN);
  }
  const kickoff = sanitizeInput(obj.Kickoff||'', 50);
  const datev = sanitizeInput(obj.Date||'', 50);
  const sh = SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_SETTINGS);
  sh.clear(); sh.appendRow(['TeamName','Place','Kickoff','Date']);
  sh.appendRow([team, place, kickoff, datev]);
  return true;
}

// ---------- Data CRUD ----------
function normalizeRows(sheetName){
  const ss = SpreadsheetApp.openById(SS_ID);
  const sh = ss.getSheetByName(sheetName);
  if(!sh) return [];
  const raw = sh.getDataRange().getValues().slice(1);
  return raw.filter(r=>r[0]).map(r=>({
    id: String(r[0]),
    timestamp: r[1] ? String(r[1]) : '',
    name: r[2] ? String(r[2]) : '',
    phone: r[3] ? String(r[3]) : ''
  }));
}

function getAllData(){
  setupSheets();
  try{
    const players = normalizeRows(SHEET_PLAYERS);
    const keepers = normalizeRows(SHEET_KEEPERS);
    const waiting = normalizeRows(SHEET_WAITING);
    const settings = getSettings();
    const meta = getMeta();
    return { players, keepers, waiting, settings, meta };
  }catch(e){
    return { players:[], keepers:[], waiting:[], settings:{}, meta:{} };
  }
}

// add entry with server-side sanitization and simple anti-spam (per name throttle)
function addEntry(role, name, phone /* note: ignore client maxPlayers/maxWaiting */) {
  setupSheets();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    name = sanitizeInput(name||'', MAX_NAME_LEN);
    phone = sanitizeInput(phone||'', MAX_PHONE_LEN);
    if(!name) return { status:'error', message:'name required' };

    // per-name throttle (server-side)
    const props = getProps();
    const key = 'last_join_' + name;
    const last = Number(props.getProperty(key) || '0');
    if(Date.now() - last < 3000){ // 3s throttle
      return { status:'rate_limited' };
    }
    props.setProperty(key, String(Date.now()));

    const ss = SpreadsheetApp.openById(SS_ID);
    const now = (new Date()).toISOString();

    // Read authoritative limits from meta / defaults
    const meta = getMeta();
    const maxP = Number(meta.maxPlayers || 28);
    const maxW = Number(meta.maxWaiting || 3);

    // Count actual players by checking non-empty ID cells in column A
    const playersSh = ss.getSheetByName(SHEET_PLAYERS);
    const playersIds = playersSh.getRange(2,1, Math.max(1, playersSh.getLastRow()-1), 1).getValues().flat().filter(v => String(v||'').trim() !== '');
    const playersCount = playersIds.length;

    if(role === 'keeper'){
      const sh = ss.getSheetByName(SHEET_KEEPERS);
      const id = Utilities.getUuid();
      sh.appendRow([id, now, name, phone]);
      return {status:'ok', where:'keepers', id:id};
    } else {
      if(playersCount >= maxP){
        // add to waiting if space
        const waitingSh = ss.getSheetByName(SHEET_WAITING);
        const waitingIds = waitingSh.getRange(2,1, Math.max(1, waitingSh.getLastRow()-1), 1).getValues().flat().filter(v => String(v||'').trim() !== '');
        const waitingCount = waitingIds.length;
        if(waitingCount >= maxW) return {status:'full_waiting'};
        const id = Utilities.getUuid();
        waitingSh.appendRow([id, now, name, phone]);
        return {status:'waiting', id:id};
      } else {
        const id = Utilities.getUuid();
        playersSh.appendRow([id, now, name, phone]);
        return {status:'ok', where:'players', id:id};
      }
    }
  } finally {
    try{ lock.releaseLock(); } catch(e){}
  }
}


function removeEntry(sheetName, id, pw){
  setupSheets();
  const auth = verifyAdmin(pw);
  if(!auth.ok) return { status:'unauthorized', message: auth.message || 'Unauthorized' };
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try{
    const ss = SpreadsheetApp.openById(SS_ID); const sh = ss.getSheetByName(sheetName);
    const data = sh.getDataRange().getValues(); let found=false;
    for(let i=1;i<data.length;i++){ if(String(data[i][0]) === String(id)){ sh.deleteRow(i+1); found=true; break; } }
    if(!found) return {status:'notfound'};
    if(sheetName === SHEET_PLAYERS){ promoteFromWaiting(); }
    return {status:'removed'};
  } finally { try{ lock.releaseLock(); }catch(e){} }
}

function promoteFromWaiting(){
  setupSheets();
  const ss = SpreadsheetApp.openById(SS_ID);
  const playersSh = ss.getSheetByName(SHEET_PLAYERS);
  const waitingSh = ss.getSheetByName(SHEET_WAITING);
  const playersCount = Math.max(0, playersSh.getDataRange().getValues().length - 1);
  const meta = getMeta(); const maxP = Number(meta.maxPlayers || 28);
  if(playersCount >= maxP) return false;
  const waitingData = waitingSh.getDataRange().getValues();
  if(waitingData.length <= 1) return false;
  const row = waitingData[1];
  waitingSh.deleteRow(2);
  playersSh.appendRow([row[0], (new Date()).toISOString(), row[2], row[3]]);
  return true;
}

function resetAll(pw){
  setupSheets();
  const ok = verifyAdmin(pw);
  if(!ok.ok) throw new Error(ok.message || 'Unauthorized');
  const ss = SpreadsheetApp.openById(SS_ID);
  [SHEET_PLAYERS,SHEET_KEEPERS,SHEET_WAITING].forEach(name=>{
    const sh = ss.getSheetByName(name); sh.clear(); sh.appendRow(['id','timestamp','name','phone']);
  });
  return true;
}

// export/import JSON
function exportJson(){ return getAllData(); }

function importJson(obj, pw){
  setupSheets();
  const ok = verifyAdmin(pw);
  if(!ok.ok) throw new Error(ok.message || 'Unauthorized');
  const ss = SpreadsheetApp.openById(SS_ID);
  resetAll(pw);
  const shPlayers = ss.getSheetByName(SHEET_PLAYERS);
  const shKeepers = ss.getSheetByName(SHEET_KEEPERS);
  const shWaiting = ss.getSheetByName(SHEET_WAITING);
  if(obj.players) obj.players.forEach(p=>{
    const id = p.id || Utilities.getUuid();
    const ts = p.timestamp || new Date().toISOString();
    const name = sanitizeInput(p.name||'', MAX_NAME_LEN);
    const phone = sanitizeInput(p.phone||'', MAX_PHONE_LEN);
    shPlayers.appendRow([id, ts, name, phone]);
  });
  if(obj.keepers) obj.keepers.forEach(k=>{
    const id = k.id || Utilities.getUuid();
    const ts = k.timestamp || new Date().toISOString();
    const name = sanitizeInput(k.name||'', MAX_NAME_LEN);
    const phone = sanitizeInput(k.phone||'', MAX_PHONE_LEN);
    shKeepers.appendRow([id, ts, name, phone]);
  });
  if(obj.waiting) obj.waiting.forEach(w=>{
    const id = w.id || Utilities.getUuid();
    const ts = w.timestamp || new Date().toISOString();
    const name = sanitizeInput(w.name||'', MAX_NAME_LEN);
    const phone = sanitizeInput(w.phone||'', MAX_PHONE_LEN);
    shWaiting.appendRow([id, ts, name, phone]);
  });
  if(obj.settings) setSettings(obj.settings, pw);
  if(obj.meta) setMeta(obj.meta, pw);
  return true;
}

// export CSV (excel-friendly) for players/keepers/waiting combined
function exportCsv(){
  setupSheets();
  const data = getAllData();
  const rows = [];
  rows.push(['Players']); rows.push(['id','timestamp','name','phone']);
  data.players.forEach(r=> rows.push([r.id, r.timestamp, r.name, r.phone]));
  rows.push([]);
  rows.push(['Keepers']); rows.push(['id','timestamp','name','phone']);
  data.keepers.forEach(r=> rows.push([r.id, r.timestamp, r.name, r.phone]));
  rows.push([]);
  rows.push(['Waiting']); rows.push(['id','timestamp','name','phone']);
  data.waiting.forEach(r=> rows.push([r.id, r.timestamp, r.name, r.phone]));
  const csv = rows.map(r=> r.map(c => {
    if(c === null || c === undefined) return '';
    return `"${String(c).replace(/"/g,'""')}"`;
  }).join(',')).join('\r\n');
  return csv;
}

// For debugging
function debugSheets(){
  try{
    const ss = SpreadsheetApp.openById(SS_ID);
    Logger.log('Nama Spreadsheet: ' + ss.getName());
    Logger.log('Sheets: ' + ss.getSheets().map(s => s.getName()).join(', '));
  }catch(e){
    Logger.log('ERROR: ' + e.message);
  }
}

function cleanupSheetRows(sheetName){
  const ss = SpreadsheetApp.openById(SS_ID);
  const sh = ss.getSheetByName(sheetName);
  if(!sh) return { ok:false, message:'sheet not found' };
  const last = sh.getLastRow();
  if(last <= 1) return { ok:true, message:'no cleanup needed' };
  const data = sh.getRange(2,1,last-1, sh.getLastColumn()).getValues();
  const kept = data.filter(row => {
    return String(row[0] || '').trim() !== '' || String(row[2] || '').trim() !== ''; // keep if id or name exists
  });
  // rewrite
  sh.clearContents();
  // maintain header
  const headers = ['id','timestamp','name','phone'];
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  if(kept.length) sh.getRange(2,1,kept.length, kept[0].length).setValues(kept);
  return { ok:true, message:'cleaned', kept: kept.length };
}


function enforceCapacity(pw){
  const auth = verifyAdmin(pw);
  if(!auth.ok) throw new Error(auth.message || 'Unauthorized');
  const ss = SpreadsheetApp.openById(SS_ID);
  const meta = getMeta();
  const maxP = Number(meta.maxPlayers || 28);
  const maxW = Number(meta.maxWaiting || 3);
  const playersSh = ss.getSheetByName(SHEET_PLAYERS);
  const waitingSh = ss.getSheetByName(SHEET_WAITING);

  const playersData = playersSh.getDataRange().getValues().slice(1).filter(r => String(r[0]||'').trim() !== '');
  const waitingData = waitingSh.getDataRange().getValues().slice(1).filter(r => String(r[0]||'').trim() !== '');

  if(playersData.length <= maxP) return { ok:true, message:'no action' };

  // extras = players beyond maxP (oldest or newest? we'll keep earliest and move newest to waiting)
  const extras = playersData.slice(maxP);
  const kept = playersData.slice(0, maxP);

  // clear and rewrite players to kept
  playersSh.clearContents();
  playersSh.appendRow(['id','timestamp','name','phone']);
  kept.forEach(r => playersSh.appendRow(r));

  // append extras to waiting if space
  let waitingSpace = Math.max(0, maxW - waitingData.length);
  const moved = [];
  for(let i=0;i<extras.length && waitingSpace>0;i++){
    waitingSh.appendRow(extras[i]);
    moved.push(extras[i]);
    waitingSpace--;
  }
  // if still extras left and no waiting space, leave them removed (or you can append to waiting anyway)
  return { ok:true, moved: moved.length, removed: extras.length - moved.length };
}

