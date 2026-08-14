/* ============================================================
   HYPNOS CR — canlı çevrimiçi sayacı + canlı sohbet (Firebase)
   ============================================================
   Kurulum: Firebase Console > Project settings > Your apps > Web app
   içinden aldığın config objesini aşağıya, FIREBASE_CONFIG = {...}
   satırının içine yapıştır. Config boş kaldığı sürece bu dosya
   sessizce devre dışı kalır, siteyi bozmaz.
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAHU8Pk2kkV-V-neT6e6GJ6veNSJ59ioQo",
  authDomain: "hypnos-cr-arsiv.firebaseapp.com",
  databaseURL: "https://hypnos-cr-arsiv-default-rtdb.firebaseio.com",
  projectId: "hypnos-cr-arsiv",
  storageBucket: "hypnos-cr-arsiv.firebasestorage.app",
  messagingSenderId: "522601565884",
  appId: "1:522601565884:web:600abfa1f2f9f215ca8ab9",
};

/* ---------------- küfür / hakaret filtresi ---------------- */
const BAD_ROOTS = [
  'amk','aq','oç','orospu','piç','yavşak','ibne','göt','sik','sikik','siktir',
  'yarrak','yarak','pezevenk','kahpe','şerefsiz','gerizekalı','mal','salak',
  'aptal','dangalak','angut','ahmak','şıllık','kaltak','fahişe','pust','puşt',
  'dallama','dölyalağı','dölyalayan','ananı','anani','avradını','bacını',
  'fuck','shit','bitch','bastard','asshole','dick','pussy','whore','cunt',
  'nigger','retard','faggot'
];
function normalizeTr(s){
  return s.toLocaleLowerCase('tr')
    .replace(/0/g,'o').replace(/1/g,'i').replace(/3/g,'e').replace(/4/g,'a')
    .replace(/5/g,'s').replace(/7/g,'t').replace(/@/g,'a').replace(/\$/g,'s');
}
function censor(text){
  if(!text) return text;
  const words = text.split(/(\s+)/); // boşlukları koru
  return words.map(tok=>{
    if(/^\s+$/.test(tok)) return tok;
    const clean = normalizeTr(tok).replace(/[^a-zçğıöşü]/g,'');
    if(!clean) return tok;
    const hit = BAD_ROOTS.some(r=>clean.includes(r));
    if(hit) return tok.replace(/[^\s]/g,'*');
    return tok;
  }).join('');
}

/* ---------------- Firebase kurulu mu? ---------------- */
const fbReady = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL);

const onlineN = document.getElementById('onlineN');
const chatOnlineMini = document.getElementById('chatOnlineMini');
const chatLog = document.getElementById('chatLog');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatNameBar = document.getElementById('chatNameBar');
const chatNameInput = document.getElementById('chatNameInput');
const chatNameSave = document.getElementById('chatNameSave');
const chatFab = document.getElementById('chatFab');
const chatPanel = document.getElementById('chatPanel');
const chatClose = document.getElementById('chatClose');
const chatBadge = document.getElementById('chatBadge');

/* panel açma/kapama her zaman çalışsın (Firebase kurulu olmasa bile) */
let panelOpenAlways = false;
let unreadCount = 0;
chatFab.addEventListener('click', ()=>{
  panelOpenAlways = !panelOpenAlways;
  chatPanel.classList.toggle('open', panelOpenAlways);
  if(panelOpenAlways){
    unreadCount = 0;
    chatBadge.style.display = 'none';
    chatLog.scrollTop = chatLog.scrollHeight;
  }
});
chatClose.addEventListener('click', ()=>{
  panelOpenAlways = false;
  chatPanel.classList.remove('open');
});

if(!fbReady){
  if(onlineN) onlineN.textContent = '—';
  if(chatLog) chatLog.innerHTML = '<div class="chat-sys">Sohbet şu anda kapalı, çok yakında açılıyor 🚧</div>';
  if(chatForm) chatForm.style.display = 'none';
  if(chatNameBar) chatNameBar.style.display = 'none';
} else {
  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.database();
  let uid = null, myName = localStorage.getItem('hcr_chat_name') || '';
  let lastSent = 0;

  function esc(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
  function fmtTime(ts){ const d=new Date(ts); return d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}); }

  function appendMsg(m){
    const row = document.createElement('div');
    row.className = 'chat-msg';
    row.innerHTML = `<span class="n">${esc(m.name||'???')}</span><span class="t">${esc(m.text||'')}</span><span class="ts">${fmtTime(m.ts||Date.now())}</span>`;
    chatLog.appendChild(row);
    chatLog.scrollTop = chatLog.scrollHeight;
    if(!panelOpenAlways){
      unreadCount++;
      chatBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      chatBadge.style.display = 'flex';
    }
  }

  function initNameUI(){
    if(myName){
      chatNameBar.style.display = 'none';
      chatForm.style.display = 'flex';
    } else {
      chatNameBar.style.display = 'flex';
      chatForm.style.display = 'none';
    }
  }
  initNameUI();

  chatNameSave.addEventListener('click', ()=>{
    const v = (chatNameInput.value || '').trim().slice(0,18);
    if(!v) return;
    myName = censor(v);
    localStorage.setItem('hcr_chat_name', myName);
    initNameUI();
  });
  chatNameInput.addEventListener('keydown', e=>{ if(e.key==='Enter') chatNameSave.click(); });

  auth.signInAnonymously().catch(()=>{});
  auth.onAuthStateChanged(user=>{
    if(!user) return;
    uid = user.uid;

    /* ---- presence: kaç kişi çevrimiçi ---- */
    const myPresenceRef = db.ref('presence/' + uid);
    db.ref('.info/connected').on('value', snap=>{
      if(snap.val() === true){
        myPresenceRef.onDisconnect().remove();
        myPresenceRef.set({ ts: firebase.database.ServerValue.TIMESTAMP });
      }
    });
    db.ref('presence').on('value', snap=>{
      const n = snap.numChildren() || 1;
      if(onlineN) onlineN.textContent = n;
      if(chatOnlineMini) chatOnlineMini.textContent = n + ' çevrimiçi';
    });

    /* ---- sohbet mesajları ---- */
    const chatRef = db.ref('chat').limitToLast(50);
    let first = true;
    chatRef.on('child_added', snap=>{
      if(first) chatLog.innerHTML = '';
      first = false;
      appendMsg(snap.val());
    });
    chatRef.once('value', snap=>{
      if(!snap.exists()) chatLog.innerHTML = '<div class="chat-sys">Henüz mesaj yok, ilk yazan sen ol! 👋</div>';
    });
  });

  chatForm.addEventListener('submit', e=>{
    e.preventDefault();
    const raw = chatInput.value.trim();
    if(!raw || !uid) return;
    const now = Date.now();
    if(now - lastSent < 1500) return; // basit hız sınırı
    lastSent = now;
    const text = censor(raw).slice(0,220);
    db.ref('chat').push({
      uid, name: myName || 'Anonim',
      text, ts: firebase.database.ServerValue.TIMESTAMP
    });
    chatInput.value = '';
  });
}
