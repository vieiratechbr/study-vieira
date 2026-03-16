import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import { createClient } from "@supabase/supabase-js";

const _SB_URL = import.meta.env?.VITE_SUPABASE_URL;
const _SB_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY;
const USE_SUPABASE = !!(_SB_URL && _SB_KEY && _SB_URL.startsWith("https"));
const sb = USE_SUPABASE ? createClient(_SB_URL, _SB_KEY) : null;

/* Modal via Portal — renderizado direto no <body>, nunca cortado por nenhum container */
function Modal({ children, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div className="mo" onClick={onClose}>
      <div className="mo-inner">
        {children}
      </div>
    </div>,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STORAGE LAYER
// ═══════════════════════════════════════════════════════════════════════════════
// ── Smart DB: reads from localStorage, mirrors writes to Supabase async ────────
const _LS = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)) ?? null; } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

// Map localStorage keys to Supabase tables for auto-sync
const _SB_MAP = {
  // key prefix → { table, transform }
  "sv5_posts":       { table:"posts",      toSB:(v)=>v.map(p=>({id:p.id,title:p.title||null,body:p.body||null,img:p.img||null,tag:p.tag,pinned:!!p.pinned,author_name:p.authorName,author_email:p.authorEmail})) },
  "sv5_communities": { table:"communities",toSB:(v)=>v.map(c=>({id:c.id,name:c.name,type:c.type,description:c.desc||null,icon:c.icon||"🏫",created_by:c.createdBy})) },
  "sv5_memberships": { table:"memberships",toSB:(v)=>v.map(m=>({user_id:m.userId,community_id:m.communityId})) },
  "sv5_follows":     { table:"follows",    toSB:(v)=>v.map(f=>({follower_id:f.followerId,following_id:f.followingId})) },
  "sv5_bans":        { table:"bans",       toSB:(v)=>v.map(b=>({user_id:b.userId,reason:b.reason,banned_by:b.bannedBy,expires_at:b.expiresAt?new Date(b.expiresAt).toISOString():null,type:b.type})) },
  "sv5_admins":      { table:"admins",     toSB:(v)=>v.map(e=>({email:e})) },
};

const DB = {
  get: (k) => _LS.get(k),
  set: (k, v) => {
    _LS.set(k, v);
    // Mirror to Supabase async (fire-and-forget)
    if (USE_SUPABASE && sb && v) {
      _sbMirror(k, v).catch(e=>console.warn('[SB]',e?.message));
    }
  },
};

// Async mirror — called after every DB.set
const _sbMirror = async (key, value) => {
  if (!USE_SUPABASE || !sb) return;
  try {
  const uid = _currentUserId;
  if (!uid && !key.startsWith("sv5_posts") && !key.startsWith("sv5_comm") && !key.startsWith("sv5_bans") && !key.startsWith("sv5_admins")) return;

  // Subject data: sv5_subj_{uid}
  if (key.startsWith("sv5_subj_") && Array.isArray(value)) {
    const userId = key.replace("sv5_subj_","");
    for (const s of value) {
      await sb.from("subjects").upsert({
        id:s.id, user_id:userId, name:s.name, description:s.desc||null,
        color_id:s.color?.id, color_dot:s.color?.dot, color_glow:s.color?.glow, color_tint:s.color?.tint,
        category:s.cat||"faculdade"
      });
    }
    return;
  }

  // Contents: sv5_cont_{uid}_{sid}
  if (key.startsWith("sv5_cont_") && Array.isArray(value)) {
    const parts = key.split("_"); const sid = parts[parts.length-1];
    for (const c of value) {
      await sb.from("contents").upsert({
        id:c.id, subject_id:sid, title:c.title, type:c.type||"aula",
        date:c.date||null, description:c.desc||null, done:!!c.done
      });
    }
    return;
  }

  // Notes: sv5_note_{uid}_{sid}
  if (key.startsWith("sv5_note_") && Array.isArray(value)) {
    const parts = key.split("_"); const sid = parts[parts.length-1];
    for (const n of value) {
      await sb.from("notes").upsert({ id:n.id, subject_id:sid, title:n.title, body:n.body||null });
    }
    return;
  }

  // Provas: sv5_prov_{uid}_{sid}
  if (key.startsWith("sv5_prov_") && Array.isArray(value)) {
    const parts = key.split("_"); const sid = parts[parts.length-1];
    for (const p of value) {
      await sb.from("provas").upsert({
        id:p.id, subject_id:sid, title:p.title, date:p.date,
        weight:p.weight||null, notes:p.notes||null, grade:p.grade||null
      });
    }
    return;
  }

  // Profile: sv5_prof_{uid}
  if (key.startsWith("sv5_prof_") && value && typeof value === "object") {
    const userId = key.replace("sv5_prof_","");
    const users = _LS.get("sv5_users") || {};
    const userEmail = Object.values(users).find(u=>u.id===userId)?.email;
    if (userEmail || uid) {
      await sb.from("profiles").upsert({
        id: userId,
        name: (Object.values(users).find(u=>u.id===userId)?.name) || "Usuário",
        email: userEmail || "",
        bio: value.bio||null, avatar_url: value.avatar||null,
        banner: value.banner||null, banner_img: value.bannerImg||null,
        gender: value.gender||null, age: value.age||null, course: value.course||null
      });
    }
    return;
  }

  // Community posts: sv5_cposts
  if (key === K.cposts && Array.isArray(value)) {
    for (const p of value) {
      await sb.from("community_posts").upsert({
        id:p.id, community_id:p.communityId, title:p.title||null, body:p.body||null,
        img:p.img||null, tag:p.tag, pinned:!!p.pinned, author_name:p.authorName
      });
    }
    return;
  }

  // Posts, communities, etc — use the map
  const mapEntry = Object.entries(_SB_MAP).find(([k])=>key===k);
  if (mapEntry && Array.isArray(value)) {
    const [, {table, toSB}] = mapEntry;
    const rows = toSB(value);
    if (rows.length > 0) await sb.from(table).upsert(rows);
  }
  } catch(e) { console.warn('[SB mirror]', key, e?.message); }
};

// Track current user id for profile sync
let _currentUserId = null;

// Direct localStorage set (no Supabase mirror) — for internal cache writes
DB._ls_set = (k, v) => _LS.set(k, v);

// Full sync from Supabase to localStorage
const _syncFromSupabase = async (userId) => {
  if (!USE_SUPABASE || !sb || !userId) return;
  try {
    // Subjects + their children
    const {data:subjs} = await sb.from("subjects").select("*").eq("user_id",userId);
    if (subjs) {
      const mapped = subjs.map(s=>({id:s.id,name:s.name,desc:s.description,color:{id:s.color_id,dot:s.color_dot,glow:s.color_glow,tint:s.color_tint},cat:s.category,createdAt:s.created_at?.slice(0,10)}));
      _LS.set(K.subjects(userId), mapped);
      await Promise.all(subjs.map(async s=>{
        const sid=s.id;
        const [{data:conts},{data:notes},{data:provs}] = await Promise.all([
          sb.from("contents").select("*").eq("subject_id",sid),
          sb.from("notes").select("*").eq("subject_id",sid),
          sb.from("provas").select("*").eq("subject_id",sid),
        ]);
        if(conts) _LS.set(K.contents(userId,sid), conts.map(c=>({id:c.id,title:c.title,type:c.type,date:c.date,desc:c.description,done:c.done})));
        if(notes) _LS.set(K.notes(userId,sid), notes.map(n=>({id:n.id,title:n.title,body:n.body,createdAt:n.created_at})));
        if(provs) _LS.set(K.provas(userId,sid), provs.map(p=>({id:p.id,title:p.title,date:p.date,weight:p.weight,notes:p.notes,grade:p.grade})));
      }));
    }
    // Follows
    const [{data:following},{data:followers}] = await Promise.all([
      sb.from("follows").select("following_id").eq("follower_id",userId),
      sb.from("follows").select("follower_id").eq("following_id",userId),
    ]);
    const follows=[
      ...(following||[]).map(f=>({followerId:userId,followingId:f.following_id,ts:Date.now()})),
      ...(followers||[]).map(f=>({followerId:f.follower_id,followingId:userId,ts:Date.now()})),
    ];
    _LS.set(K.follows, follows);
    // Communities + memberships
    const [{data:comms},{data:membs}] = await Promise.all([
      sb.from("communities").select("*"),
      sb.from("memberships").select("*"),
    ]);
    if(comms) _LS.set(K.communities, comms.map(c=>({id:c.id,name:c.name,type:c.type,desc:c.description,icon:c.icon,createdBy:c.created_by,createdAt:c.created_at})));
    if(membs) _LS.set(K.memberships, membs.map(m=>({userId:m.user_id,communityId:m.community_id,joinedAt:Date.now()})));
    // Posts
    const {data:posts} = await sb.from("posts").select("*").order("created_at",{ascending:false});
    if(posts) _LS.set(K.posts, posts.map(p=>({id:p.id,title:p.title,body:p.body,img:p.img,tag:p.tag,pinned:p.pinned,authorName:p.author_name,authorEmail:p.author_email,createdAt:new Date(p.created_at).getTime()})));
    // Bans
    const {data:bans} = await sb.from("bans").select("*");
    if(bans) _LS.set(K.bans, bans.map(b=>({userId:b.user_id,reason:b.reason,bannedBy:b.banned_by,bannedAt:Date.now(),expiresAt:b.expires_at?new Date(b.expires_at).getTime():null,type:b.type})));
    // Admins
    const {data:admins} = await sb.from("admins").select("email");
    if(admins) _LS.set(K.admins, admins.map(a=>a.email));
    // All users (profiles)
    const {data:profiles} = await sb.from("profiles").select("id,name,email");
    if(profiles){const m={};profiles.forEach(p=>{m[p.email]={id:p.id,name:p.name,email:p.email};});_LS.set(K.users,m);}
    // Community posts
    const {data:cposts} = await sb.from("community_posts").select("*").order("created_at",{ascending:false});
    if(cposts) _LS.set(K.cposts, cposts.map(p=>({id:p.id,communityId:p.community_id,title:p.title,body:p.body,img:p.img,tag:p.tag,pinned:p.pinned,authorName:p.author_name,createdAt:new Date(p.created_at).getTime()})));
  } catch(e) { console.warn("Supabase sync error:", e.message); }
};
const K = {
  users:       "sv5_users",
  session:     "sv5_session",
  admins:      "sv5_admins",
  posts:       "sv5_posts",        // global posts
  follows:     "sv5_follows",
  bans:        "sv5_bans",         // [{userId, reason, bannedBy, bannedAt, expiresAt, type}]
  communities: "sv5_communities",  // [{id, name, type, desc, icon, createdBy, createdAt}]
  memberships: "sv5_memberships",  // [{userId, communityId, joinedAt}]
  cposts:      "sv5_cposts",       // community posts [{id, communityId, title, body, tag, pinned, authorName, createdAt}]
  subjects:    (u) => `sv5_subj_${u}`,
  contents:    (u, s) => `sv5_cont_${u}_${s}`,
  notes:       (u, s) => `sv5_note_${u}_${s}`,
  provas:      (u, s) => `sv5_prov_${u}_${s}`,
  profile:     (u) => `sv5_prof_${u}`,
};

// ── Constants ─────────────────────────────────────────────────────────────────
const FOUNDER      = "admin@studyvieira.com";
const FOUNDER_PASS = "SV@Admin2025!";
const FOUNDER_ID   = "sv_founder_001";

// Garante que a conta do fundador sempre existe no banco local
const seedFounder = () => {
  const users = DB.get("sv5_users") || {};
  if (!users[FOUNDER]) {
    DB.set("sv5_users", {
      ...users,
      [FOUNDER]: { id: FOUNDER_ID, name: "Admin Study Vieira", email: FOUNDER, pass: FOUNDER_PASS }
    });
  }
};
seedFounder();

const uid = () => Math.random().toString(36).slice(2,10);
const now         = () => Date.now();
const today       = () => new Date().toISOString().slice(0,10);
const fmt         = (d) => new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"});
const fmtL        = (d) => new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
const fmtTS       = (ts) => new Date(ts).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"});
const fmtDT       = (ts) => new Date(ts).toLocaleString("pt-BR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
const MONTHS      = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const WDAYS       = ["D","S","T","Q","Q","S","S"];
const COLORS      = [
  {id:"sky",   dot:"#7dd3fc",glow:"rgba(125,211,252,0.45)",tint:"rgba(125,211,252,0.08)"},
  {id:"violet",dot:"#c4b5fd",glow:"rgba(196,181,253,0.45)",tint:"rgba(196,181,253,0.08)"},
  {id:"rose",  dot:"#fda4af",glow:"rgba(253,164,175,0.45)",tint:"rgba(253,164,175,0.08)"},
  {id:"amber", dot:"#fcd34d",glow:"rgba(252,211,77,0.45)", tint:"rgba(252,211,77,0.06)" },
  {id:"teal",  dot:"#5eead4",glow:"rgba(94,234,212,0.45)", tint:"rgba(94,234,212,0.06)" },
  {id:"indigo",dot:"#a5b4fc",glow:"rgba(165,180,252,0.45)",tint:"rgba(165,180,252,0.08)"},
  {id:"sage",  dot:"#86efac",glow:"rgba(134,239,172,0.45)",tint:"rgba(134,239,172,0.06)"},
  {id:"slate", dot:"#cbd5e1",glow:"rgba(203,213,225,0.35)",tint:"rgba(203,213,225,0.05)"},
];
const CTYPES   = [{v:"aula",l:"Aula",icon:"📖"},{v:"revisao",l:"Revisão",icon:"🔄"},{v:"exercicio",l:"Exercício",icon:"✏️"},{v:"video",l:"Vídeo",icon:"🎬"},{v:"leitura",l:"Leitura",icon:"📄"}];
const getCT    = (v) => CTYPES.find(t=>t.v===v)||CTYPES[0];
const PTAGS    = ["Aviso","Prova","Evento","Notícia","Importante"];
const PCOLORS  = {Aviso:"#7dd3fc",Prova:"#fda4af",Evento:"#a5b4fc","Notícia":"#86efac",Importante:"#fcd34d"};
const COMM_TYPES = ["Escola","Universidade","Cursinho","Faculdade","Instituto","Outro"];
const COMM_ICONS = ["🏫","🎓","📚","🏛️","⚗️","🖥️","🎨","🏋️","⚽","🎸"];
const BAN_DURATIONS = [
  {label:"3 dias",   ms: 3*24*60*60*1000},
  {label:"7 dias",   ms: 7*24*60*60*1000},
  {label:"30 dias",  ms:30*24*60*60*1000},
  {label:"Conta inativa (indefinido)", ms: 0},
];

// ── Auth helpers ──────────────────────────────────────────────────────────────
const isAdmin     = (u) => u && (u.email===FOUNDER || u.isAdm === true || (DB.get(K.admins)||[]).includes(u.email));
const getProfile  = (uid) => DB.get(K.profile(uid)) || {};
const saveProfile = (uid, p) => DB.set(K.profile(uid), p);

const getBan = (userId) => {
  const bans = DB.get(K.bans) || [];
  const ban  = bans.find(b => b.userId === userId);
  if (!ban) return null;
  if (ban.expiresAt && ban.expiresAt < Date.now()) {
    DB.set(K.bans, bans.filter(b => b.userId !== userId));
    return null;
  }
  return ban;
};
const isBanned = (userId) => !!getBan(userId);

const getFollows  = () => DB.get(K.follows) || [];
const isFollowing = (a, b) => getFollows().some(f=>f.followerId===a&&f.followingId===b);
const areFriends  = (a, b) => isFollowing(a,b) && isFollowing(b,a);
const getFollowers= (uid) => getFollows().filter(f=>f.followingId===uid).map(f=>f.followerId);
const getFollowing= (uid) => getFollows().filter(f=>f.followerId===uid).map(f=>f.followingId);
const getFriends  = (uid) => getFollowing(uid).filter(id=>isFollowing(id,uid));
const toggleFollow= async(me, them) => {
  const fs = getFollows();
  const ex = fs.some(f=>f.followerId===me&&f.followingId===them);
  DB.set(K.follows, ex ? fs.filter(f=>!(f.followerId===me&&f.followingId===them))
    : [...fs, {followerId:me, followingId:them, ts:Date.now()}]);
  if(USE_SUPABASE){
    if(ex) await sb.from("follows").delete().match({follower_id:me,following_id:them});
    else await sb.from("follows").upsert({follower_id:me,following_id:them});
  }
};

const getCommunities    = ()    => DB.get(K.communities) || [];
const getMemberships    = ()    => DB.get(K.memberships) || [];
const getUserComms      = (uid) => getMemberships().filter(m=>m.userId===uid).map(m=>m.communityId);
const getCommMembers    = (cid) => getMemberships().filter(m=>m.communityId===cid).map(m=>m.userId);
const isInComm          = (uid, cid) => getMemberships().some(m=>m.userId===uid&&m.communityId===cid);
const joinComm          = (uid, cid) => { if(isInComm(uid,cid))return; DB.set(K.memberships,[...getMemberships(),{userId:uid,communityId:cid,joinedAt:Date.now()}]); };
const leaveComm         = (uid, cid) => DB.set(K.memberships, getMemberships().filter(m=>!(m.userId===uid&&m.communityId===cid)));
const getCPosts         = (cid) => (DB.get(K.cposts)||[]).filter(p=>p.communityId===cid).sort((a,b)=>b.createdAt-a.createdAt);
const getGlobalPosts    = ()    => (DB.get(K.posts)||[]).sort((a,b)=>b.createdAt-a.createdAt);

// ══════════════════════════════════════════════════════════════════════════════
//  CSS
// ══════════════════════════════════════════════════════════════════════════════
// ── Theme context ────────────────────────────────────────────────────────────
const ThemeCtx = React.createContext({dark:true, toggle:()=>{}});

// ── Sound engine (Web Audio API, zero deps) ───────────────────────────────────
const SFX = (() => {
  let ctx = null;
  const ac = () => { if(!ctx) ctx = new (window.AudioContext||window.webkitAudioContext)(); return ctx; };
  const tone = (freq, dur, type='sine', vol=0.18, ramp=true) => {
    try {
      const c = ac(); const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(vol, c.currentTime);
      if(ramp) g.gain.exponentialRampToValueAtTime(0.001, c.currentTime+dur);
      o.start(c.currentTime); o.stop(c.currentTime+dur);
    } catch(e){}
  };
  return {
    tab:    () => tone(520, 0.09, 'sine', 0.12),
    click:  () => tone(660, 0.07, 'sine', 0.10),
    open:   () => { tone(440, 0.08, 'sine', 0.10); setTimeout(()=>tone(550,0.08,'sine',0.08),60); },
    close:  () => { tone(550, 0.07, 'sine', 0.09); setTimeout(()=>tone(400,0.08,'sine',0.07),55); },
    save:   () => { tone(523, 0.07, 'sine', 0.12); setTimeout(()=>tone(659,0.10,'sine',0.10),70); setTimeout(()=>tone(784,0.14,'sine',0.09),150); },
    error:  () => { tone(220, 0.12, 'sawtooth', 0.08); setTimeout(()=>tone(180,0.14,'sawtooth',0.07),90); },
    login:  () => { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.12,'sine',0.11),i*70)); },
    toggle: (dark) => tone(dark?300:600, 0.10, 'sine', 0.10),
    follow: () => { tone(659,0.08,'sine',0.12); setTimeout(()=>tone(880,0.12,'sine',0.10),70); },
    ban:    () => { tone(150,0.20,'sawtooth',0.14); setTimeout(()=>tone(100,0.25,'sawtooth',0.10),180); },
  };
})();

const CSS_DARK = `
  --bg:#1c1c1e; --bg2:#2c2c2e;
  --s:rgba(72,72,74,0.55); --s2:rgba(72,72,74,0.28);
  --b:rgba(255,255,255,0.13); --b2:rgba(255,255,255,0.07);
  --t:rgba(255,255,255,0.92); --t2:rgba(255,255,255,0.52); --t3:rgba(255,255,255,0.26);
  --nav-bg:rgba(28,28,30,0.82); --nav-border:rgba(255,255,255,0.06);
  --inp-bg:rgba(255,255,255,0.06); --inp-focus:rgba(255,255,255,0.09);
  --card-bg:rgba(255,255,255,0.04); --card-hover:rgba(255,255,255,0.07);
  --mesh1:rgba(100,100,115,0.16); --mesh2:rgba(80,80,105,0.13); --mesh3:rgba(55,55,70,0.10);
  --shine:rgba(255,255,255,0.18); --spec:rgba(255,255,255,0.12);
`;
const CSS_LIGHT = `
  --bg:#f0f0f5; --bg2:#e5e5ea;
  --s:rgba(220,220,228,0.72); --s2:rgba(210,210,220,0.55);
  --b:rgba(0,0,0,0.10); --b2:rgba(0,0,0,0.06);
  --t:rgba(0,0,0,0.88); --t2:rgba(0,0,0,0.48); --t3:rgba(0,0,0,0.26);
  --nav-bg:rgba(240,240,245,0.88); --nav-border:rgba(0,0,0,0.07);
  --inp-bg:rgba(0,0,0,0.05); --inp-focus:rgba(0,0,0,0.08);
  --card-bg:rgba(0,0,0,0.03); --card-hover:rgba(0,0,0,0.06);
  --mesh1:rgba(180,180,200,0.22); --mesh2:rgba(160,160,190,0.18); --mesh3:rgba(140,140,170,0.14);
  --shine:rgba(255,255,255,0.80); --spec:rgba(255,255,255,0.50);
`;

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700&display=swap');:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--r:20px;--blur:32px;}
html,body{height:100%;}#root{min-height:100%;}
body{font-family:'Figtree',-apple-system,sans-serif;background:var(--bg);min-height:100vh;color:var(--t);overflow-x:hidden;overflow-y:auto;transition:background .3s,color .3s;}
.mesh{position:fixed;inset:0;z-index:0;pointer-events:none;transition:background .4s;
  background:radial-gradient(ellipse 800px 500px at 15% 10%,var(--mesh1) 0%,transparent 70%),
             radial-gradient(ellipse 600px 700px at 85% 85%,var(--mesh2) 0%,transparent 70%),
             radial-gradient(ellipse 350px 350px at 50% 45%,var(--mesh3) 0%,transparent 70%);}
.mesh::after{content:'';position:absolute;inset:0;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");opacity:.3;}
.glass{position:relative;overflow:hidden;background:var(--s);
  backdrop-filter:blur(var(--blur)) saturate(160%) brightness(1.04);-webkit-backdrop-filter:blur(var(--blur)) saturate(160%) brightness(1.04);
  border:1px solid var(--b);border-radius:var(--r);
  box-shadow:0 1px 0 var(--shine) inset,0 -1px 0 rgba(0,0,0,0.12) inset,0 8px 40px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.10);
  transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .3s,background .3s,border-color .3s;}
.glass::before{content:'';position:absolute;top:0;left:8%;right:8%;height:1px;
  background:linear-gradient(90deg,transparent,var(--shine) 40%,var(--shine) 60%,transparent);pointer-events:none;z-index:2;}
.glass::after{content:'';position:absolute;inset:0;border-radius:inherit;
  background:radial-gradient(circle 200px at var(--mx,50%) var(--my,-30%),var(--spec) 0%,rgba(255,255,255,0.02) 45%,transparent 70%);
  pointer-events:none;z-index:1;transition:background .04s linear;}
.nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:4px;padding:8px 20px;
  background:var(--nav-bg);backdrop-filter:blur(40px) saturate(180%);-webkit-backdrop-filter:blur(40px) saturate(180%);
  border-bottom:1px solid var(--nav-border);transition:background .3s,border-color .3s;}
.nlogo{font-size:15px;font-weight:700;letter-spacing:-.3px;cursor:pointer;padding:6px 10px;border-radius:9px;transition:background .18s;margin-right:8px;user-select:none;}
.nlogo:hover{background:rgba(255,255,255,0.07);}
.nlogo em{font-style:normal;color:var(--t2);font-weight:400;font-size:12px;margin-left:3px;}
.nt{padding:7px 13px;border-radius:10px;font-size:13px;font-weight:500;color:var(--t2);cursor:pointer;transition:all .18s;border:1px solid transparent;background:none;font-family:inherit;}
.nt:hover{color:var(--t);background:rgba(255,255,255,0.06);}
.nt.on{color:var(--t);background:var(--s2,rgba(255,255,255,0.10));border-color:var(--b);box-shadow:0 1px 0 var(--shine) inset;}
.nr{display:flex;align-items:center;gap:8px;margin-left:auto;}
.adm-badge{padding:3px 8px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;background:rgba(252,211,77,0.15);border:1px solid rgba(252,211,77,0.28);color:#fcd34d;}
.ban-badge{padding:3px 8px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;background:rgba(255,70,70,0.15);border:1px solid rgba(255,70,70,0.28);color:#ff9494;}
.av{border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.2);flex-shrink:0;}
.av-placeholder{border-radius:50%;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-weight:600;flex-shrink:0;color:var(--t);}
.av-upload{position:relative;cursor:pointer;display:inline-block;}
.av-upload:hover .av-overlay{opacity:1;}
.av-overlay{position:absolute;inset:0;border-radius:50%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;font-size:18px;}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 18px;border-radius:11px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent;transition:all .18s;font-family:inherit;}
.btn-f{background:rgba(255,255,255,0.13);color:var(--t);border-color:rgba(255,255,255,0.17);box-shadow:0 1px 0 rgba(255,255,255,0.2) inset,0 3px 10px rgba(0,0,0,0.18);}
.btn-f:hover{background:rgba(255,255,255,0.19);}
.btn-g{background:rgba(255,255,255,0.05);color:var(--t2);border-color:var(--b2);}
.btn-g:hover{background:rgba(255,255,255,0.09);color:var(--t);}
.btn-del{background:rgba(255,70,70,0.11);color:#ff9494;border-color:rgba(255,70,70,0.2);}
.btn-del:hover{background:rgba(255,70,70,0.18);}
.btn-adm{background:rgba(252,211,77,0.12);color:#fcd34d;border-color:rgba(252,211,77,0.22);}
.btn-adm:hover{background:rgba(252,211,77,0.2);}
.btn-ban{background:rgba(255,70,70,0.12);color:#ff9494;border-color:rgba(255,70,70,0.22);}
.btn-ban:hover{background:rgba(255,70,70,0.2);}
.btn-unban{background:rgba(86,234,172,0.12);color:#5eead4;border-color:rgba(86,234,172,0.22);}
.btn-unban:hover{background:rgba(86,234,172,0.2);}
.btn-follow{background:rgba(125,211,252,0.12);color:#7dd3fc;border-color:rgba(125,211,252,0.25);}
.btn-follow:hover{background:rgba(125,211,252,0.2);}
.btn-unfollow{background:rgba(255,255,255,0.06);color:var(--t2);border-color:var(--b2);}
.btn-join{background:rgba(134,239,172,0.12);color:#86efac;border-color:rgba(134,239,172,0.25);}
.btn-join:hover{background:rgba(134,239,172,0.2);}
.btn-leave{background:rgba(255,255,255,0.06);color:var(--t2);border-color:var(--b2);}
.btn-sm{padding:5px 11px;font-size:12px;border-radius:9px;}
.btn-ico{padding:6px;width:30px;height:30px;border-radius:8px;}
.inp{width:100%;min-width:0;box-sizing:border-box;background:var(--inp-bg);border:1px solid var(--b2);border-radius:10px;padding:10px 13px;color:var(--t);font-size:13px;font-family:inherit;outline:none;transition:all .18s;resize:vertical;}
.inp:focus{background:var(--inp-focus);border-color:var(--b);}
.inp::placeholder{color:var(--t3);}.inp option{background:var(--bg2,#2c2c2e);color:var(--t);}
.app{position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;}
.wrap{flex:1;padding:20px 18px;max-width:1100px;margin:0 auto;width:100%;}
.pc{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
.sh{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.sh h2{font-size:17px;font-weight:600;letter-spacing:-.3px;}
.row{display:flex;align-items:center;gap:8px;}
.g2{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:11px;}
.g3{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;}
.fg{display:flex;flex-direction:column;gap:5px;margin-bottom:13px;min-width:0;}
.fg label{font-size:12px;font-weight:500;color:var(--t2);}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.fr>.fg,.fr>div{min-width:0;}
.mo{
  position:fixed;
  inset:0;
  z-index:99999;
  background:rgba(0,0,0,0.75);
  backdrop-filter:blur(16px);
  overflow-y:auto;
  overflow-x:hidden;
  padding:0;
  display:block;
  box-sizing:border-box;
}
/* centraliza o conteúdo do modal com scroll nativo */
.mo-inner{
  min-height:100%;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:flex-start;
  padding:32px 16px 60px;
  box-sizing:border-box;
}
.mp{
  width:100%;
  max-width:500px;
  padding:24px;
  flex-shrink:0;
  box-sizing:border-box;
  overflow:hidden;
}
.mo .glass{
  transform:none!important;
  will-change:auto!important;
  transition:box-shadow .3s,background .3s!important;
  overflow:visible!important;
}
/* ensure inputs in modals never overflow their containers */
.mo .inp,.mo input,.mo select,.mo textarea{
  max-width:100%;
  box-sizing:border-box;
}
.mo .glass::after{display:none!important;}
.mo .glass::before{display:none!important;}
.er{padding:9px 13px;border-radius:9px;font-size:13px;margin-bottom:12px;background:rgba(255,70,70,0.11);border:1px solid rgba(255,70,70,0.2);color:#ff9494;}
.ok{padding:9px 13px;border-radius:9px;font-size:13px;margin-bottom:12px;background:rgba(86,234,172,0.11);border:1px solid rgba(86,234,172,0.2);color:#5eead4;}
.warn{padding:9px 13px;border-radius:9px;font-size:13px;margin-bottom:12px;background:rgba(252,211,77,0.11);border:1px solid rgba(252,211,77,0.2);color:#fcd34d;}
.empty{text-align:center;padding:36px 20px;color:var(--t2);}
.dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
.pill{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:500;border:1px solid transparent;}
.stabs{display:flex;gap:3px;padding:3px;border-radius:12px;background:var(--card-bg);border:1px solid var(--b2);width:fit-content;margin-bottom:20px;flex-wrap:wrap;}
.stab{padding:7px 14px;border-radius:9px;font-size:13px;font-weight:500;color:var(--t2);cursor:pointer;transition:all .18s;border:none;background:none;font-family:inherit;}
.stab:hover{color:var(--t);}
.stab.on{background:var(--s2,rgba(255,255,255,0.12));color:var(--t);border:1px solid var(--b);box-shadow:0 1px 0 var(--shine) inset;}
.cr{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:11px;background:var(--card-bg);border:1px solid var(--b2);margin-bottom:7px;cursor:pointer;transition:all .18s;}
.cr:hover{background:var(--card-hover);border-color:var(--b);}
.nc{padding:13px 15px;border-radius:11px;background:var(--card-bg);border:1px solid var(--b2);margin-bottom:8px;cursor:pointer;transition:all .18s;}
.nc:hover{background:var(--card-hover);}
.pr-row{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:11px;background:var(--card-bg);border:1px solid var(--b2);margin-bottom:7px;cursor:pointer;transition:all .18s;}
.pr-row:hover{background:var(--card-hover);}
.cg{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
.cc{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:9px;font-size:13px;cursor:pointer;transition:all .15s;position:relative;gap:2px;}
.cc:hover{background:rgba(255,255,255,0.07);}
.cc.tod{background:rgba(255,255,255,0.14);font-weight:600;border:1px solid rgba(255,255,255,0.18);}
.cc.sel:not(.tod){background:rgba(255,255,255,0.09);font-weight:600;}
.cc.oth{color:var(--t3);}
.cdots{display:flex;gap:2px;}
.cdot{width:4px;height:4px;border-radius:50%;}
.back{display:inline-flex;align-items:center;gap:6px;color:var(--t2);font-size:13px;font-weight:500;cursor:pointer;margin-bottom:16px;padding:6px 12px;border-radius:9px;transition:all .18s;}
.back:hover{color:var(--t);background:rgba(255,255,255,0.06);}
.hgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch;}
.hleft{display:flex;flex-direction:column;gap:14px;}
.hright{position:relative;min-height:0;}
.post-card{padding:16px 18px;border-radius:13px;background:var(--card-bg);border:1px solid var(--b2);margin-bottom:9px;position:relative;transition:all .18s;}
.post-card:hover{background:var(--card-hover);}
.comm-card{padding:18px;border-radius:14px;background:var(--card-bg);border:1px solid var(--b2);transition:all .18s;cursor:pointer;}
.comm-card:hover{background:var(--card-hover);border-color:var(--b);}
.user-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:11px;background:var(--card-bg);border:1px solid var(--b2);margin-bottom:7px;transition:all .18s;}
.user-row:hover{background:var(--card-hover);}
.ban-row{background:rgba(255,50,50,0.06);border-color:rgba(255,50,50,0.18);}
.prof-banner{height:140px;border-radius:var(--r) var(--r) 0 0;position:relative;overflow:hidden;cursor:pointer;flex-shrink:0;}
.prof-banner:hover .prof-banner-overlay{opacity:1;}
.prof-banner-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;color:#fff;font-size:13px;font-weight:500;}
.prof-av-wrap{position:relative;display:inline-block;margin-top:-50px;margin-left:20px;z-index:5;}
.prof-av-wrap .av,.prof-av-wrap .av-placeholder{border:3px solid var(--bg,#1c1c1e);box-shadow:0 4px 16px rgba(0,0,0,0.35);}
.prof-stats{display:grid;grid-template-columns:repeat(3,1fr);}
.prof-stat{text-align:center;padding:14px 8px;border-right:1px solid var(--b2);}
.prof-stat:last-child{border-right:none;}
.prof-stat-n{font-size:20px;font-weight:700;line-height:1;}
.prof-stat-l{font-size:11px;color:var(--t2);margin-top:3px;text-transform:uppercase;letter-spacing:.3px;}
.section-label{font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;}
.divider{height:1px;background:var(--b2);margin:16px 0;}

/* ── Posts Feed (Instagram style) ── */
.feed-wrap{position:relative;width:100%;flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;}
.feed-inner{height:100%;overflow-y:scroll;scroll-snap-type:y mandatory;scrollbar-width:none;-ms-overflow-style:none;display:flex;flex-direction:column;}
.feed-inner::-webkit-scrollbar{display:none;}
.feed-slide{scroll-snap-align:start;position:relative;width:100%;height:100%;flex:0 0 100%;cursor:pointer;overflow:hidden;}
.feed-slide:hover .feed-overlay{opacity:1;}
.feed-img{width:100%;height:100%;object-fit:cover;display:block;}
.feed-bg{width:100%;height:100%;display:flex;flex-direction:column;justify-content:flex-end;}
.feed-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.18);transition:opacity .2s;opacity:0;border-radius:var(--r);}
.feed-gradient{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.82) 0%,rgba(0,0,0,0.35) 50%,transparent 100%);}
.feed-content{position:absolute;bottom:0;left:0;right:0;padding:20px 18px 18px;}
.feed-tag{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;margin-bottom:8px;backdrop-filter:blur(8px);}
.feed-title{font-size:17px;font-weight:700;color:#fff;line-height:1.3;margin-bottom:6px;text-shadow:0 1px 4px rgba(0,0,0,0.4);}
.feed-meta{font-size:12px;color:rgba(255,255,255,0.65);}
.feed-pin{position:absolute;top:14px;right:14px;font-size:18px;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));}
.feed-nav{position:absolute;right:10px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;z-index:10;}
.feed-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.4);cursor:pointer;transition:all .2s;}
.feed-dot.active{background:#fff;transform:scale(1.4);}
.feed-hint{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);font-size:11px;color:rgba(255,255,255,0.45);pointer-events:none;}
/* Post detail modal */
.post-detail{width:100%;max-width:600px;padding:0;overflow:hidden;}
.post-detail-img{width:100%;max-height:300px;object-fit:cover;display:block;}
.post-detail-body{padding:24px;}

/* ── Page transitions ── */
@keyframes pageIn{from{opacity:0;transform:translateY(12px) scale(.99);}to{opacity:1;transform:none;}}
.page-enter{animation:pageIn .32s cubic-bezier(.22,1,.36,1) both;}
/* ── Skeleton shimmer ── */
@keyframes shimmer{0%{background-position:-400px 0;}100%{background-position:400px 0;}}
.skel{border-radius:8px;background:linear-gradient(90deg,rgba(255,255,255,0.05) 25%,rgba(255,255,255,0.10) 50%,rgba(255,255,255,0.05) 75%);background-size:400px 100%;animation:shimmer 1.4s ease infinite;}
/* ── Pomodoro ── */
.pom-wrap{display:flex;flex-direction:column;align-items:center;gap:16px;}
/* ── Flashcard flip ── */
.fc-card{perspective:600px;}
.fc-inner{transition:transform .45s cubic-bezier(.22,1,.36,1);transform-style:preserve-3d;}
.fc-inner.flipped{transform:rotateY(180deg);}
.fc-face{backface-visibility:hidden;position:absolute;inset:0;}
.fc-back{transform:rotateY(180deg);}
/* ── Heatmap ── */
.heat-cell{width:12px;height:12px;border-radius:2px;transition:background .2s;}
@keyframes fu{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
.fu{animation:fu .3s cubic-bezier(.22,1,.36,1) both;}
@keyframes si{from{opacity:0;transform:scale(.97);}to{opacity:1;transform:scale(1);}}
.si{animation:si .25s cubic-bezier(.22,1,.36,1) both;}
::-webkit-scrollbar{width:5px;}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.09);border-radius:3px;}
@media(max-width:720px){.hgrid{grid-template-columns:1fr;}.fr{grid-template-columns:1fr;}.nt{display:none;}.nt.on{display:flex;}}
@media(max-width:500px){.fr{grid-template-columns:1fr;}}
`;

// ── Glass Card ────────────────────────────────────────────────────────────────
function G({children,cls="",style={},onClick,tint}){
  const r=useRef(null);
  const mv=useCallback((e)=>{
    const el=r.current;
    if(!el) return;
    // desativa tilt quando está dentro de um modal
    if(el.closest(".mo")) return;
    const b=el.getBoundingClientRect();
    el.style.setProperty("--mx",`${((e.clientX-b.left)/b.width*100).toFixed(1)}%`);
    el.style.setProperty("--my",`${((e.clientY-b.top)/b.height*100).toFixed(1)}%`);
    el.style.transform=`perspective(900px) rotateX(${((e.clientY-b.top)/b.height-.5)*-4}deg) rotateY(${((e.clientX-b.left)/b.width-.5)*4}deg) translateZ(2px)`;
  },[]);
  const ml=useCallback(()=>{
    const el=r.current;
    if(!el) return;
    if(el.closest(".mo")) return;
    el.style.setProperty("--mx","50%");
    el.style.setProperty("--my","-30%");
    el.style.transform="none";
  },[]);
  return <div ref={r} className={`glass ${cls}`}
    style={{"--mx":"50%","--my":"-30%",
      ...(tint?{background:`linear-gradient(140deg,${tint} 0%,rgba(72,72,74,0.5) 100%)`}:{}),
      ...style}}
    onMouseMove={mv} onMouseLeave={ml} onClick={onClick}>{children}</div>;
}

function Pill({color,label}){
  return <span className="pill" style={{background:`${color}18`,borderColor:`${color}28`,color}}>{label}</span>;
}

function Av({src,name,size=30,onClick,editable=false}){
  const s={width:size,height:size,fontSize:Math.round(size*.38)};
  const initials=(name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const inner=src
    ?<img src={src} className="av" style={s} alt={name}/>
    :<div className="av-placeholder" style={s}>{initials}</div>;
  if(!editable)return <div style={{cursor:onClick?"pointer":"default",flexShrink:0}} onClick={onClick}>{inner}</div>;
  return <div className="av-upload" onClick={onClick} style={{width:size,height:size,flexShrink:0}}>
    {inner}<div className="av-overlay">✎</div>
  </div>;
}


// ══════════════════════════════════════════════════════════════════════════════
//  SUPABASE HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

// Check if email is admin in Supabase
const sbIsAdmin = async (email) => {
  if (!USE_SUPABASE) return false;
  if (email === FOUNDER) return true;
  const { data } = await sb.from("admins").select("email").eq("email", email).single();
  return !!data;
};

// Sync Supabase data to localStorage cache so all existing components work unchanged
const sbSyncUserData = async (userId) => {
  if (!USE_SUPABASE || !userId) return;
  try {
    // Subjects
    const { data: subjs } = await sb.from("subjects").select("*").eq("user_id", userId);
    if (subjs) {
      const mapped = subjs.map(s => ({
        id: s.id, name: s.name, desc: s.description,
        color: { id: s.color_id, dot: s.color_dot, glow: s.color_glow, tint: s.color_tint },
        cat: s.category, createdAt: s.created_at?.slice(0,10)
      }));
      DB.set(K.subjects(userId), mapped);

      // For each subject, sync contents, notes, provas
      for (const s of subjs) {
        const sid = s.id;
        const [{ data: conts }, { data: notes }, { data: provs }] = await Promise.all([
          sb.from("contents").select("*").eq("subject_id", sid),
          sb.from("notes").select("*").eq("subject_id", sid),
          sb.from("provas").select("*").eq("subject_id", sid),
        ]);
        if (conts) DB.set(K.contents(userId, sid), conts.map(c => ({ id:c.id, title:c.title, type:c.type, date:c.date, desc:c.description, done:c.done })));
        if (notes) DB.set(K.notes(userId, sid), notes.map(n => ({ id:n.id, title:n.title, body:n.body, createdAt:n.created_at })));
        if (provs) DB.set(K.provas(userId, sid), provs.map(p => ({ id:p.id, title:p.title, date:p.date, weight:p.weight, notes:p.notes, grade:p.grade })));
      }
    }

    // Follows
    const [{ data: following }, { data: followers }] = await Promise.all([
      sb.from("follows").select("following_id").eq("follower_id", userId),
      sb.from("follows").select("follower_id").eq("following_id", userId),
    ]);
    const allFollows = [
      ...(following||[]).map(f => ({ followerId: userId, followingId: f.following_id, ts: Date.now() })),
      ...(followers||[]).map(f => ({ followerId: f.follower_id, followingId: userId, ts: Date.now() })),
    ];
    // Merge with existing follows to avoid losing data
    const existing = DB.get(K.follows) || [];
    const merged = [...existing];
    allFollows.forEach(f => { if (!merged.some(e => e.followerId===f.followerId && e.followingId===f.followingId)) merged.push(f); });
    DB.set(K.follows, merged);

    // Communities + memberships
    const { data: comms } = await sb.from("communities").select("*");
    if (comms) DB.set(K.communities, comms.map(c => ({ id:c.id, name:c.name, type:c.type, desc:c.description, icon:c.icon, createdBy:c.created_by, createdAt:c.created_at })));

    const { data: membs } = await sb.from("memberships").select("*").eq("user_id", userId);
    if (membs) {
      const existing = DB.get(K.memberships) || [];
      const newMembs = membs.map(m => ({ userId: m.user_id, communityId: m.community_id, joinedAt: new Date(m.joined_at).getTime() }));
      const merged = [...existing];
      newMembs.forEach(m => { if (!merged.some(e => e.userId===m.userId && e.communityId===m.communityId)) merged.push(m); });
      DB.set(K.memberships, merged);
    }

    // Global posts
    const { data: posts } = await sb.from("posts").select("*").order("created_at", { ascending: false });
    if (posts) DB.set(K.posts, posts.map(p => ({ id:p.id, title:p.title, body:p.body, img:p.img, tag:p.tag, pinned:p.pinned, authorName:p.author_name, authorEmail:p.author_email, createdAt:new Date(p.created_at).getTime() })));

    // Bans
    const { data: bans } = await sb.from("bans").select("*");
    if (bans) DB.set(K.bans, bans.map(b => ({ userId:b.user_id, reason:b.reason, bannedBy:b.banned_by, bannedAt:new Date(b.banned_at).getTime(), expiresAt:b.expires_at?new Date(b.expires_at).getTime():null, type:b.type })));

    // Admins
    const { data: admins } = await sb.from("admins").select("email");
    if (admins) DB.set(K.admins, admins.map(a => a.email));

    // All users (for community features) — only profiles
    const { data: profiles } = await sb.from("profiles").select("id,name,email,bio,avatar_url");
    if (profiles) {
      const usersMap = {};
      profiles.forEach(p => { usersMap[p.email] = { id:p.id, name:p.name, email:p.email }; });
      DB.set(K.users, usersMap);
    }

  } catch (e) {
    console.warn("Supabase sync error:", e.message);
  }
};

// Supabase write-through: after any mutation, write to Supabase and re-sync
const sbWrite = async (table, data, match = null) => {
  if (!USE_SUPABASE) return;
  try {
    if (match) await sb.from(table).upsert(data).match(match);
    else await sb.from(table).insert(data);
  } catch (e) {
    console.warn("Supabase write error:", e.message);
  }
};
const sbDelete = async (table, match) => {
  if (!USE_SUPABASE) return;
  try { await sb.from(table).delete().match(match); } catch (e) { console.warn(e.message); }
};

// ══════════════════════════════════════════════════════════════════════════════
//  APP ROOT
// ══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const [user,setUser]=useState(()=>USE_SUPABASE?null:DB.get(K.session));
  const [tab,setTab]=useState("home");
  const [viewUser,setViewUser]=useState(null);
  const [dark,setDark]=useState(()=>DB.get("sv5_theme")!=="light");
  const [authLoading,setAuthLoading]=useState(USE_SUPABASE);

  useEffect(()=>{
    document.documentElement.style.cssText=dark?CSS_DARK:CSS_LIGHT;
    DB.set("sv5_theme",dark?"dark":"light");
  },[dark]);

  const toggleTheme=()=>{SFX.toggle(!dark);setDark(d=>!d);};

  // ── Supabase auth ─────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!USE_SUPABASE){setAuthLoading(false);return;}
    const init=async()=>{
      const{data:{session}}=await sb.auth.getSession();
      if(session?.user){
        await _loginFromSession(session.user);
        // Always re-sync fresh data from Supabase on page load
        _syncFromSupabase(session.user.id).catch(e=>console.warn('[sync]',e.message));
      }
      setAuthLoading(false);
    };
    init();
    const{data:{subscription}}=sb.auth.onAuthStateChange(async(event,session)=>{
      if(event==="SIGNED_OUT"){setUser(null);}
      else if(session?.user){
        await _loginFromSession(session.user);
        _syncFromSupabase(session.user.id).catch(()=>{});
      }
    });
    return()=>subscription.unsubscribe();
  },[]);

  const _loginFromSession=async(sbUser)=>{
    const{data:prof}=await sb.from("profiles").select("*").eq("id",sbUser.id).maybeSingle();
    const{data:adm}=await sb.from("admins").select("email").eq("email",sbUser.email).single();
    const isAdm=sbUser.email===FOUNDER||!!adm;
    const u={id:sbUser.id,name:prof?.name||sbUser.email,email:sbUser.email,isAdm};
    _currentUserId=u.id;
    // Cache profile to localStorage so components work unchanged
    // Create profile row if missing
    if(!prof){
      try{await sb.from("profiles").upsert({id:sbUser.id,name:sbUser.user_metadata?.name||sbUser.email.split("@")[0],email:sbUser.email,bio:""});}catch(_){}
    }
    const profData=prof||{};
    _LS.set(K.profile(u.id),{
      avatar:profData.avatar_url||null,
      bio:profData.bio||"",
      banner:profData.banner||null,
      bannerImg:profData.banner_img||null,
      gender:profData.gender||"Prefiro não dizer",
      age:profData.age||"",
      course:profData.course||""
    });
    setUser(u);
    // Sync all user data to localStorage cache (async, no await)
    _syncFromSupabase(u.id).catch(e=>console.warn('[SB sync]',e?.message));
    return u;
  };

  // ── localStorage-only auth ────────────────────────────────────────────────
  const login=(u)=>{
    if(!USE_SUPABASE)DB.set(K.session,u);
    _currentUserId=u.id;
    setUser(u);setTab("home");SFX.login();
  };
  const logout=async()=>{
    if(USE_SUPABASE)await sb.auth.signOut();
    else DB.set(K.session,null);
    _currentUserId=null;setUser(null);SFX.close();
  };
  const refreshUser=()=>{
    if(USE_SUPABASE)return;
    const users=DB.get(K.users)||{};
    const fresh=Object.values(users).find(u2=>u2.id===user?.id);
    if(fresh){const u={id:fresh.id,name:fresh.name,email:fresh.email};DB.set(K.session,u);setUser(u);}
  };

    // Check ban on every render
  if(user && isBanned(user.id)){
    const ban=getBan(user.id);
    return(<>
      <style>{CSS}</style><div className="mesh"/>
      <div className="pc">
        <G cls="si" style={{maxWidth:420,width:"100%",padding:36,textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:16}}>🔨</div>
          <h2 style={{fontSize:22,fontWeight:700,marginBottom:8}}>Conta suspensa</h2>
          <p style={{color:"var(--t2)",fontSize:14,lineHeight:1.6,marginBottom:16}}>
            Sua conta foi suspensa por violar os termos da plataforma.
          </p>
          {ban.reason&&<div className="warn" style={{textAlign:"left"}}><strong>Motivo:</strong> {ban.reason}</div>}
          {ban.expiresAt
            ?<p style={{fontSize:13,color:"var(--t2)"}}>Suspensão expira em: <strong>{fmtDT(ban.expiresAt)}</strong></p>
            :<p style={{fontSize:13,color:"#ff9494"}}>Conta desativada indefinidamente. Entre em contato com um administrador.</p>
          }
          <button className="btn btn-g" style={{marginTop:20,width:"100%"}} onClick={logout}>Sair</button>
        </G>
      </div>
    </>);
  }

  return(<>
    <style>{CSS}</style><div className="mesh"/>
    <div className="app">
      {!user?<AuthPage onLogin={login}/>:<>
        <NavBar user={user} tab={tab} setTab={(t)=>{setTab(t);if(t!=="comunidade")setViewUser(null);SFX.tab();}} onLogout={logout} dark={dark} toggleTheme={toggleTheme}/>
        <div className="wrap">
          {tab==="home"      &&<div key="h" className="page-enter"><HomePage      user={user} setTab={setTab}/></div>}
          {tab==="materias"  &&<div key="m" className="page-enter"><SubjectsTab   user={user}/></div>}
          {tab==="agenda"    &&<div key="a" className="page-enter"><AgendaTab     user={user}/></div>}
          {tab==="comunidade"&&<div key="c" className="page-enter"><CommunityTab  user={user} viewUser={viewUser} setViewUser={setViewUser}/></div>}
          {tab==="perfil"    &&<div key="p" className="page-enter"><ProfileTab    user={user} setUser={(u)=>{DB.set(K.session,u);setUser(u);}}/></div>}
          {tab==="admin"     &&<div key="ad" className="page-enter"><AdminTab      user={user} refreshUser={refreshUser}/></div>}
        </div>
      </>}
    </div>
  </>);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function AuthPage({onLogin}){
  const [mode,setMode]=useState("login");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  const safe=(fn)=>{ if(mounted.current) fn(); };

  const submit=async()=>{
    safe(()=>{setErr("");setLoading(true);});
    try{
      if(!USE_SUPABASE){
        // LocalStorage mode
        const users=DB.get(K.users)||{};
        if(mode==="cadastro"){
          if(!name.trim()||!email.trim()||!pass.trim()){safe(()=>{setErr("Preencha todos os campos.");setLoading(false);});SFX.error();return;}
          if(users[email]){safe(()=>{setErr("E-mail já cadastrado.");setLoading(false);});return;}
          const u={id:uid(),name:name.trim(),email};
          _LS.set(K.users,{...users,[email]:{...u,pass}});
          onLogin(u);
        }else{
          if(!email.trim()||!pass.trim()){safe(()=>{setErr("Preencha e-mail e senha.");setLoading(false);});SFX.error();return;}
          const te=email.trim().toLowerCase();
          if(te===FOUNDER){
            if(pass!==FOUNDER_PASS){safe(()=>{setErr("Senha incorreta.");setLoading(false);});SFX.error();return;}
            onLogin({id:FOUNDER_ID,name:"Admin Study Vieira",email:FOUNDER,isAdm:true});return;
          }
          const u=users[te]||users[email.trim()];
          if(!u||u.pass!==pass){safe(()=>{setErr("Credenciais inválidas.");setLoading(false);});SFX.error();return;}
          if(isBanned(u.id)){safe(()=>{setErr("Conta suspensa.");setLoading(false);});return;}
          safe(()=>setLoading(false));
          onLogin({id:u.id,name:u.name,email:u.email});
        }
        return;
      }

      // ── Supabase mode ──────────────────────────────────────────────────────
      if(mode==="cadastro"){
        if(!name.trim()||!email.trim()||!pass.trim()){safe(()=>{setErr("Preencha todos os campos.");setLoading(false);});SFX.error();return;}
        if(pass.length<6){safe(()=>{setErr("Senha precisa ter ao menos 6 caracteres.");setLoading(false);});return;}
        const{data,error}=await sb.auth.signUp({
          email:email.trim(),password:pass,
          options:{data:{name:name.trim()}}
        });
        if(error){safe(()=>{setErr(error.message);setLoading(false);});SFX.error();return;}
        // Create profile
        try{ await sb.from("profiles").upsert({id:data.user.id,name:name.trim(),email:email.trim(),bio:""}); }catch(_){}
        safe(()=>setLoading(false));
        SFX.login();
        onLogin({id:data.user.id,name:name.trim(),email:email.trim(),isAdm:false});

      }else{
        if(!email.trim()||!pass.trim()){safe(()=>{setErr("Preencha e-mail e senha.");setLoading(false);});SFX.error();return;}

        // Sign in
        const{data,error}=await sb.auth.signInWithPassword({email:email.trim(),password:pass});
        if(error){safe(()=>{setErr(error.message);setLoading(false);});SFX.error();return;}

        const sbUser=data.user;

        // Get profile
        let prof=null;
        try{ const r=await sb.from("profiles").select("*").eq("id",sbUser.id).maybeSingle(); prof=r.data; }catch(_){}

        // Check ban
        let ban=null;
        try{ const r=await sb.from("bans").select("*").eq("user_id",sbUser.id).maybeSingle(); ban=r.data; }catch(_){}
        if(ban&&!(ban.expires_at&&new Date(ban.expires_at)<new Date())){
          await sb.auth.signOut();
          safe(()=>{setErr("Conta suspensa: "+(ban.reason||""));setLoading(false);});
          return;
        }

        // Check admin
        let isAdm=sbUser.email===FOUNDER;
        if(!isAdm){
          try{ const r=await sb.from("admins").select("email").eq("email",sbUser.email).maybeSingle(); isAdm=r.data!==null; }catch(_){}
        }

        // Auto-create profile if missing
        if(!prof){
          const autoName=sbUser.user_metadata?.name||sbUser.email.split("@")[0];
          try{ await sb.from("profiles").upsert({id:sbUser.id,name:autoName,email:sbUser.email,bio:""}); }catch(_){}
          prof={name:autoName};
        }

        // Cache locally
        try{
          _LS.set(K.profile(sbUser.id),{
            avatar:prof.avatar_url||null, bio:prof.bio||"",
            banner:prof.banner||null, bannerImg:prof.banner_img||null,
            gender:prof.gender||"Prefiro não dizer", age:prof.age||"", course:prof.course||""
          });
        }catch(_){}

        // Stop loading BEFORE onLogin (which unmounts this component)
        safe(()=>setLoading(false));
        const userName=prof.name||sbUser.user_metadata?.name||sbUser.email;
        SFX.login();
        onLogin({id:sbUser.id,name:userName,email:sbUser.email,isAdm});

        // Sync data in background
        setTimeout(()=>{ _syncFromSupabase(sbUser.id).catch(()=>{}); },1000);
      }

    }catch(e){
      console.error("[Auth]",e);
      safe(()=>{ setErr(e.message||"Erro ao autenticar."); setLoading(false); });
      SFX.error();
    }
  };

  return(<div className="pc"><G cls="si" style={{maxWidth:380,width:"100%",padding:34}}>
    <div style={{textAlign:"center",marginBottom:28}}>
      <div style={{fontSize:40,marginBottom:10,filter:"drop-shadow(0 4px 14px rgba(255,255,255,0.12))"}}>◈</div>
      <div style={{fontSize:24,fontWeight:700,letterSpacing:-.5}}>Study Vieira</div>
      <div style={{fontSize:13,color:"var(--t2)",marginTop:3}}>Organizador de estudos</div>
    </div>
    {err&&<div className="er">{err}</div>}
    {mode==="cadastro"&&<div className="fg"><label>Nome completo</label>
      <input className="inp" placeholder="Seu nome" value={name} onChange={e=>setName(e.target.value)}/></div>}
    <div className="fg"><label>E-mail</label>
      <input className="inp" type="email" placeholder="email@exemplo.com" value={email} onChange={e=>setEmail(e.target.value)}/></div>
    <div className="fg" style={{marginBottom:20}}><label>Senha</label>
      <input className="inp" type="password" placeholder="••••••••" value={pass}
        onChange={e=>setPass(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&!loading&&submit()}/></div>
    <button className="btn btn-f" style={{width:"100%",fontSize:14}} onClick={submit} disabled={loading}>
      {loading?"Aguarde...":(mode==="login"?"Entrar":"Criar conta")}
    </button>
    <p style={{textAlign:"center",marginTop:16,fontSize:13,color:"var(--t2)"}}>
      {mode==="login"?"Sem conta? ":"Já tem conta? "}
      <span style={{color:"rgba(255,255,255,0.75)",cursor:"pointer",fontWeight:600}}
        onClick={()=>{setMode(m=>m==="login"?"cadastro":"login");setErr("");}}>
        {mode==="login"?"Cadastre-se":"Entrar"}
      </span>
    </p>
  </G></div>);
}


// ── NavBar ────────────────────────────────────────────────────────────────────
function NavBar({user,tab,setTab,onLogout,dark,toggleTheme}){
  const admin=isAdmin(user);
  const prof=getProfile(user.id);
  const navTabs=[{k:"home",l:"Início"},{k:"materias",l:"Matérias"},{k:"agenda",l:"Agenda"},{k:"comunidade",l:"Comunidade"}];
  return(<nav className="nav">
    {/* Logo */}
    <div className="nlogo" onClick={()=>setTab("home")}>◈ <span style={{fontWeight:700}}>Study</span><span style={{color:"var(--t2)",fontWeight:400}}> Vieira</span></div>

    {/* Main tabs */}
    <div style={{display:"flex",gap:2,flex:1}}>
      {navTabs.map(t=>(
        <button key={t.k} className={`nt ${tab===t.k?"on":""}`} onClick={()=>setTab(t.k)}>{t.l}</button>
      ))}
    </div>

    {/* Right actions */}
    <div className="nr">
      {/* Theme toggle */}
      <button className="btn-ico btn btn-g" onClick={toggleTheme} title={dark?"Tema claro":"Tema escuro"}
        style={{fontSize:15,border:"1px solid var(--b2)"}}>
        {dark?"☀️":"🌙"}
      </button>

      {/* Admin badge */}
      {admin&&(
        <button className="btn btn-adm btn-sm" onClick={()=>setTab("admin")} title="Painel Admin"
          style={{padding:"5px 10px",fontSize:11,letterSpacing:.3}}>
          ⭐ Admin
        </button>
      )}

      {/* Avatar → perfil */}
      <div style={{cursor:"pointer",borderRadius:10,padding:"3px 6px",transition:"background .18s",display:"flex",alignItems:"center",gap:6}}
        onClick={()=>{SFX.click();setTab("perfil");}}
        onMouseEnter={e=>e.currentTarget.style.background="var(--card-bg)"}
        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <Av src={prof.avatar} name={user.name} size={26}/>
      </div>

      <button className="btn btn-g btn-sm" style={{fontSize:12}} onClick={onLogout}>Sair</button>
    </div>
  </nav>);
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN TAB — full panel
// ══════════════════════════════════════════════════════════════════════════════
function AdminTab({user,refreshUser}){
  if(!isAdmin(user))return(<div className="fu"><G><div className="empty"><div style={{fontSize:36,marginBottom:10}}>🔒</div><p>Acesso restrito</p></div></G></div>);
  const [sub,setSub]=useState("avisos");
  const tabs=[
    {k:"avisos",  l:"📢 Avisos Globais"},
    {k:"comms",   l:"🏫 Comunidades"},
    {k:"users",   l:"👥 Usuários & Punições"},
    {k:"admins",  l:"⭐ Administradores"},
  ];
  return(<div className="fu">
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
        <h1 style={{fontSize:21,fontWeight:700}}>Painel Admin</h1>
        <div className="adm-badge">{user.email===FOUNDER?"FUNDADOR":"ADM"}</div>
      </div>
      <p style={{fontSize:13,color:"var(--t2)"}}>Gerencie toda a plataforma Study Vieira</p>
    </div>
    <div className="stabs" style={{marginBottom:24}}>
      {tabs.map(t=><button key={t.k} className={`stab ${sub===t.k?"on":""}`} onClick={()=>setSub(t.k)}>{t.l}</button>)}
    </div>
    {sub==="avisos" &&<AdminPosts     user={user}/>}
    {sub==="comms"  &&<AdminComms     user={user}/>}
    {sub==="users"  &&<AdminUsers     user={user}/>}
    {sub==="admins" &&<AdminAdmins    user={user}/>}
  </div>);
}

// ── Admin: Global Posts ───────────────────────────────────────────────────────
function AdminPosts({user}){
  const [posts,setPosts]=useState(()=>DB.get(K.posts)||[]);
  const [modal,setModal]=useState(null);
  // tudo opcional — só a imagem é o aviso se o admin quiser
  const [img,setImg]=useState(null);        // base64
  const [title,setTitle]=useState("");      // opcional
  const [body,setBody]=useState("");        // opcional (legenda/texto)
  const [tag,setTag]=useState("Aviso");
  const [pinned,setPinned]=useState(false);
  const [err,setErr]=useState("");
  const fileRef=useRef(null);

  const save=v=>{DB.set(K.posts,v);setPosts(v);};

  const reset=()=>{setImg(null);setTitle("");setBody("");setTag("Aviso");setPinned(false);setErr("");};
  const openNew=()=>{reset();SFX.open();setModal("new");};
  const openEdit=p=>{setImg(p.img||null);setTitle(p.title||"");setBody(p.body||"");setTag(p.tag||"Aviso");setPinned(p.pinned||false);setErr("");setModal(p);};

  const handleImg=(e)=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>setImg(ev.target.result);
    reader.readAsDataURL(file);
  };

  const submit=async()=>{
    if(!img&&!title.trim()){setErr("Adicione uma imagem ou escreva um título.");return;}
    const post={id:uid(),img,title:title.trim(),body:body.trim(),tag,pinned,authorName:user.name,authorEmail:user.email,createdAt:Date.now()};
    if(modal==="new"){
      save([...posts,post]);
      if(USE_SUPABASE) await sb.from("posts").insert({title:post.title||null,body:post.body||null,img:post.img||null,tag:post.tag,pinned:post.pinned,author_name:post.authorName,author_email:post.authorEmail});
    }else{
      save(posts.map(p=>p.id===modal.id?{...p,img,title:title.trim(),body:body.trim(),tag,pinned}:p));
      if(USE_SUPABASE) await sb.from("posts").update({title:title.trim()||null,body:body.trim()||null,img:img||null,tag,pinned}).eq("id",modal.id);
    }
    SFX.save();SFX.close();setModal(null);
  };
  const del=async(id)=>{
    save(posts.filter(p=>p.id!==id));
    if(USE_SUPABASE) await sb.from("posts").delete().eq("id",id);
    SFX.close();setModal(null);
  };
  const sorted=[...posts].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||b.createdAt-a.createdAt);

  return(<div>
    <div className="sh">
      <h2 style={{fontSize:15,color:"var(--t2)"}}>Avisos globais</h2>
      <button className="btn btn-adm btn-sm" onClick={openNew}>+ Novo Aviso</button>
    </div>

    {sorted.length===0
      ?<G><div className="empty"><div style={{fontSize:32,marginBottom:8}}>🖼️</div><p>Nenhum aviso publicado</p><p style={{fontSize:12,color:"var(--t3)",marginTop:6}}>Publique uma foto — ela vira o aviso</p></div></G>
      :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:10}}>
        {sorted.map(p=>{const tc=PCOLORS[p.tag]||"#cbd5e1";const hasText=p.title||p.body;return(
          <div key={p.id} onClick={()=>openEdit(p)}
            style={{position:"relative",borderRadius:14,overflow:"hidden",aspectRatio:"4/5",cursor:"pointer",
              background:"var(--s)",border:"1px solid var(--b)"}}>
            {/* image or colour bg */}
            {p.img
              ?<img src={p.img} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt="aviso"/>
              :<div style={{width:"100%",height:"100%",background:`linear-gradient(135deg,${tc}30,var(--bg))`}}/>
            }
            {/* only overlay if there's text to show */}
            {hasText&&<div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,0.72) 0%,transparent 55%)"}}/>}
            {p.pinned&&<div style={{position:"absolute",top:10,right:10,fontSize:16,filter:"drop-shadow(0 1px 3px rgba(0,0,0,.5))"}}>📌</div>}
            {hasText&&(
              <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"10px 12px 10px"}}>
                <span style={{display:"inline-block",padding:"2px 7px",borderRadius:20,fontSize:9,fontWeight:600,
                  background:`${tc}30`,color:tc,border:`1px solid ${tc}50`,marginBottom:4}}>{p.tag}</span>
                {p.title&&<div style={{fontSize:13,fontWeight:700,color:"#fff",lineHeight:1.3}}>{p.title}</div>}
              </div>
            )}
            <button className="btn btn-del" style={{position:"absolute",top:8,left:8,padding:"3px 7px",fontSize:10,borderRadius:7}}
              onClick={e=>{e.stopPropagation();del(p.id);}}>✕</button>
          </div>
        );})}
      </div>
    }

    {/* Modal de criação/edição */}
    {modal&&(<Modal onClose={()=>setModal(null)}><G cls="mp si" style={{maxWidth:480,padding:0}} onClick={e=>e.stopPropagation()}>

      {/* ─── ZONA DA IMAGEM (protagonista) ─── */}
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImg}/>
      <div onClick={()=>fileRef.current?.click()} style={{
        width:"100%",minHeight:220,cursor:"pointer",position:"relative",
        background:img?"none":"var(--s)",
        display:"flex",alignItems:"center",justifyContent:"center",
        borderBottom:"1px solid var(--b2)",overflow:"hidden"}}>
        {img
          ?<><img src={img} style={{width:"100%",objectFit:"cover",display:"block",maxHeight:320}} alt="preview"/>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.28)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{color:"rgba(255,255,255,0.85)",fontSize:13,fontWeight:600,background:"rgba(0,0,0,0.35)",padding:"6px 14px",borderRadius:20}}>✎ Trocar imagem</span>
            </div></>
          :<div style={{textAlign:"center",color:"var(--t3)",padding:"32px 20px"}}>
            <div style={{fontSize:40,marginBottom:10}}>🖼️</div>
            <div style={{fontSize:15,fontWeight:600,color:"var(--t2)",marginBottom:6}}>Toque para adicionar imagem</div>
            <div style={{fontSize:12}}>A imagem É o aviso. Texto é opcional.</div>
          </div>
        }
      </div>

      <div style={{padding:20}}>
        <h3 style={{marginBottom:4,fontSize:15}}>{modal==="new"?"Novo Aviso":"Editar Aviso"}</h3>
        <p style={{fontSize:12,color:"var(--t3)",marginBottom:14}}>Título e texto são opcionais — a imagem já comunica.</p>
        {err&&<div className="er">{err}</div>}

        <div className="fr" style={{marginBottom:12}}>
          <div className="fg" style={{marginBottom:0}}><label>Categoria</label>
            <select className="inp" value={tag} onChange={e=>setTag(e.target.value)}>{PTAGS.map(t=><option key={t} value={t}>{t}</option>)}</select>
          </div>
          <div className="fg" style={{marginBottom:0}}><label>Opções</label>
            <div style={{display:"flex",alignItems:"center",gap:8,height:40}}>
              <input type="checkbox" id="pin2" checked={pinned} onChange={e=>setPinned(e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
              <label htmlFor="pin2" style={{fontSize:13,cursor:"pointer"}}>📌 Fixar</label>
            </div>
          </div>
        </div>

        <div className="fg"><label>Título (opcional)</label>
          <input className="inp" placeholder="ex: Prova amanhã!" value={title} onChange={e=>setTitle(e.target.value)}/></div>
        <div className="fg" style={{marginBottom:18}}><label>Legenda / texto (opcional)</label>
          <textarea className="inp" rows={3} placeholder="Mais detalhes se quiser..." value={body} onChange={e=>setBody(e.target.value)}/></div>

        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-f" style={{flex:1}} onClick={submit}>{modal==="new"?"Publicar":"Salvar"}</button>
          {modal!=="new"&&<button className="btn btn-del" onClick={()=>del(modal.id)}>Excluir</button>}
          {img&&<button className="btn btn-g btn-ico" title="Remover imagem" onClick={()=>setImg(null)} style={{fontSize:14}}>🗑</button>}
          <button className="btn btn-g" onClick={()=>setModal(null)}>✕</button>
        </div>
      </div>
    </G></Modal>)}
  </div>);
}

// ── Admin: Communities ────────────────────────────────────────────────────────
function AdminComms({user}){
  const [comms,setComms]=useState(()=>getCommunities());
  const [sel,setSel]=useState(null);  // selected community for managing posts
  const [modal,setModal]=useState(null);
  const [name,setName]=useState("");const [type,setType]=useState("Escola");
  const [desc,setDesc]=useState("");const [icon,setIcon]=useState("🏫");const [err,setErr]=useState("");
  // comm posts
  const [cpost,setCpost]=useState(null);
  const [ptitle,setPtitle]=useState("");const [pbody,setPbody]=useState("");
  const [ptag,setPtag]=useState("Aviso");const [ppinned,setPpinned]=useState(false);const [perr,setPerr]=useState("");

  const saveComms=v=>{DB.set(K.communities,v);setComms(v);};
  const openNew=()=>{setName("");setType("Escola");setDesc("");setIcon("🏫");setErr("");SFX.open();setModal("new");};
  const submit=()=>{if(!name.trim()){setErr("Digite o nome.");return;}
    if(modal==="new")saveComms([...comms,{id:uid(),name:name.trim(),type,desc,icon,createdBy:user.id,createdAt:Date.now()}]);
    else saveComms(comms.map(c=>c.id===modal.id?{...c,name:name.trim(),type,desc,icon}:c));SFX.close();setModal(null);};
  const delComm=id=>{saveComms(comms.filter(c=>c.id!==id));setSel(null);SFX.close();setModal(null);};

  const saveCPost=()=>{
    if(!ptitle.trim()||!pbody.trim()){setPerr("Preencha título e conteúdo.");return;}
    const all=DB.get(K.cposts)||[];
    if(cpost==="new")DB.set(K.cposts,[...all,{id:uid(),communityId:sel,title:ptitle.trim(),body:pbody,tag:ptag,pinned:ppinned,authorName:user.name,createdAt:Date.now()}]);
    else DB.set(K.cposts,all.map(p=>p.id===cpost.id?{...p,title:ptitle.trim(),body:pbody,tag:ptag,pinned:ppinned}:p));
    setCpost(null);setPerr("");
  };
  const delCPost=id=>{DB.set(K.cposts,(DB.get(K.cposts)||[]).filter(p=>p.id!==id));setCpost(null);};

  const comm=sel?comms.find(c=>c.id===sel):null;
  const posts=sel?getCPosts(sel):[];
  const members=sel?getCommMembers(sel):[];

  if(sel&&comm)return(<div>
    <div className="back" onClick={()=>setSel(null)}>← Comunidades</div>
    <G tint="rgba(134,239,172,0.06)" style={{padding:20,marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
        <div style={{fontSize:36}}>{comm.icon}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:700}}>{comm.name}</div>
          <div style={{fontSize:13,color:"var(--t2)",marginTop:2}}>{comm.type} · {members.length} membros</div>
          {comm.desc&&<div style={{fontSize:13,color:"var(--t2)",marginTop:4}}>{comm.desc}</div>}
        </div>
        <button className="btn btn-del btn-sm" onClick={()=>{if(window.confirm("Excluir comunidade?"))delComm(comm.id);}}>Excluir</button>
      </div>
    </G>
    <div className="sh">
      <h2 style={{fontSize:15,color:"var(--t2)"}}>Avisos da comunidade</h2>
      <button className="btn btn-adm btn-sm" onClick={()=>{setPtitle("");setPbody("");setPtag("Aviso");setPpinned(false);setPerr("");setCpost("new");}}>+ Novo Aviso</button>
    </div>
    {posts.length===0?<G><div className="empty"><div style={{fontSize:28,marginBottom:8}}>📢</div><p>Nenhum aviso para esta comunidade</p></div></G>
      :posts.map(p=>{const tc=PCOLORS[p.tag]||"#cbd5e1";return(
        <div key={p.id} className="post-card" style={{cursor:"pointer"}} onClick={()=>{setPtitle(p.title);setPbody(p.body);setPtag(p.tag||"Aviso");setPpinned(p.pinned||false);setPerr("");setCpost(p);}}>
          {p.pinned&&<div style={{position:"absolute",top:12,right:48,fontSize:12}}>📌</div>}
          <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
            <Pill color={tc} label={p.tag||"Aviso"}/>{p.pinned&&<Pill color="#fcd34d" label="Fixado"/>}
            <div style={{marginLeft:"auto"}}><button className="btn btn-del btn-ico" style={{fontSize:11}} onClick={e=>{e.stopPropagation();delCPost(p.id);}}>✕</button></div>
          </div>
          <div style={{fontSize:14,fontWeight:600,marginBottom:3}}>{p.title}</div>
          <div style={{fontSize:12,color:"var(--t2)"}}>{p.body.slice(0,100)}{p.body.length>100?"…":""}</div>
          <div style={{fontSize:11,color:"var(--t3)",marginTop:6}}>{fmtTS(p.createdAt)}</div>
        </div>
      );})}
    {cpost&&(<Modal onClose={()=>setCpost(null)}><G cls="mp si" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
      <h3 style={{marginBottom:18,fontSize:16}}>{cpost==="new"?"Novo Aviso — "+comm.name:"Editar Aviso"}</h3>
      {perr&&<div className="er">{perr}</div>}
      <div className="fg"><label>Título</label><input className="inp" value={ptitle} onChange={e=>setPtitle(e.target.value)}/></div>
      <div className="fr">
        <div className="fg" style={{marginBottom:0}}><label>Categoria</label>
          <select className="inp" value={ptag} onChange={e=>setPtag(e.target.value)}>{PTAGS.map(t=><option key={t} value={t}>{t}</option>)}</select>
        </div>
        <div className="fg" style={{marginBottom:0}}><label>Opções</label>
          <div style={{display:"flex",alignItems:"center",gap:8,height:40}}>
            <input type="checkbox" checked={ppinned} onChange={e=>setPpinned(e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
            <span style={{fontSize:13,cursor:"pointer"}} onClick={()=>setPpinned(p=>!p)}>📌 Fixar</span>
          </div>
        </div>
      </div>
      <div className="fg" style={{marginTop:12,marginBottom:20}}><label>Conteúdo</label>
        <textarea className="inp" rows={5} value={pbody} onChange={e=>setPbody(e.target.value)}/></div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-f" style={{flex:1}} onClick={saveCPost}>{cpost==="new"?"Publicar":"Salvar"}</button>
        {cpost!=="new"&&<button className="btn btn-del" onClick={()=>delCPost(cpost.id)}>Excluir</button>}
        <button className="btn btn-g" onClick={()=>setCpost(null)}>Cancelar</button>
      </div>
    </G></Modal>)}
  </div>);

  return(<div>
    <div className="sh"><h2 style={{fontSize:15,color:"var(--t2)"}}>Comunidades cadastradas</h2>
      <button className="btn btn-adm btn-sm" onClick={openNew}>+ Nova Comunidade</button>
    </div>
    {comms.length===0?<G><div className="empty"><div style={{fontSize:36,marginBottom:10}}>🏫</div><p style={{fontWeight:500}}>Nenhuma comunidade</p><p style={{fontSize:13,color:"var(--t3)",marginTop:6}}>Crie escolas e universidades para avisos personalizados</p></div></G>
      :<div className="g3">{comms.map(c=>{const mCount=getCommMembers(c.id).length;return(
        <div key={c.id} className="comm-card" onClick={()=>setSel(c.id)}>
          <div style={{fontSize:32,marginBottom:10}}>{c.icon}</div>
          <div style={{fontWeight:600,fontSize:15,marginBottom:4}}>{c.name}</div>
          <div style={{fontSize:12,color:"var(--t2)",marginBottom:8}}>{c.type}</div>
          {c.desc&&<div style={{fontSize:12,color:"var(--t3)",marginBottom:8,lineHeight:1.4}}>{c.desc}</div>}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <Pill color="#86efac" label={`👥 ${mCount} membros`}/>
            <Pill color="#7dd3fc" label={`📢 ${getCPosts(c.id).length} avisos`}/>
          </div>
        </div>
      );})}
      </div>}
    {modal&&(<Modal onClose={()=>setModal(null)}><G cls="mp si" onClick={e=>e.stopPropagation()}>
      <h3 style={{marginBottom:18,fontSize:16}}>Nova Comunidade</h3>{err&&<div className="er">{err}</div>}
      <div className="fg"><label>Nome</label><input className="inp" placeholder="ex: ETEC Vila Guilherme" value={name} onChange={e=>setName(e.target.value)}/></div>
      <div className="fr">
        <div className="fg" style={{marginBottom:0}}><label>Tipo</label>
          <select className="inp" value={type} onChange={e=>setType(e.target.value)}>{COMM_TYPES.map(t=><option key={t}>{t}</option>)}</select>
        </div>
        <div className="fg" style={{marginBottom:0}}><label>Ícone</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",padding:"6px 0"}}>
            {COMM_ICONS.map(i=><div key={i} onClick={()=>setIcon(i)}
              style={{fontSize:20,cursor:"pointer",padding:4,borderRadius:6,background:icon===i?"rgba(255,255,255,0.15)":"transparent",transition:"all .15s"}}>{i}</div>)}
          </div>
        </div>
      </div>
      <div className="fg" style={{marginBottom:20,marginTop:8}}><label>Descrição (opcional)</label>
        <input className="inp" placeholder="Breve descrição da comunidade" value={desc} onChange={e=>setDesc(e.target.value)}/></div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-f" style={{flex:1}} onClick={submit}>Criar</button>
        <button className="btn btn-g" onClick={()=>setModal(null)}>Cancelar</button>
      </div>
    </G></Modal>)}
  </div>);
}

// ── Admin: Users & Bans ───────────────────────────────────────────────────────
function AdminUsers({user:adminUser}){
  const [bans,setBans]=useState(()=>DB.get(K.bans)||[]);
  const [modal,setModal]=useState(null);  // {user}
  const [durIdx,setDurIdx]=useState(0);
  const [reason,setReason]=useState("");
  const [search,setSearch]=useState("");
  const users=DB.get(K.users)||{};
  const others=Object.values(users).filter(u=>u.id!==adminUser.id&&u.email!==FOUNDER);

  const filtered=others.filter(u=>!search||(u.name+u.email).toLowerCase().includes(search.toLowerCase()));

  const saveBans=v=>{DB.set(K.bans,v);setBans(v);};
  const banUser=()=>{
    const dur=BAN_DURATIONS[durIdx];
    const expiresAt=dur.ms?Date.now()+dur.ms:null;
    saveBans([...bans.filter(b=>b.userId!==modal.user.id),
      {userId:modal.user.id,reason,bannedBy:adminUser.name,bannedAt:Date.now(),expiresAt,type:dur.label}]);
    SFX.close();setModal(null);setReason("");
  };
  const unbanUser=(uid)=>saveBans(bans.filter(b=>b.userId!==uid));

  const activeBans=bans.filter(b=>!b.expiresAt||b.expiresAt>Date.now());

  return(<div>
    <div style={{marginBottom:16}}>
      <input className="inp" placeholder="Buscar usuário por nome ou e-mail..." value={search} onChange={e=>setSearch(e.target.value)}/>
    </div>

    {activeBans.length>0&&(<>
      <div className="section-label" style={{color:"#ff9494"}}>🔨 Usuários Banidos ({activeBans.length})</div>
      {activeBans.map(ban=>{
        const u=Object.values(users).find(u2=>u2.id===ban.userId);
        const prof=getProfile(ban.userId);
        return u?(<div key={ban.userId} className="user-row ban-row">
          <Av src={prof.avatar} name={u.name} size={38}/>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:500}}>{u.name}</div>
            <div style={{fontSize:12,color:"#ff9494",marginTop:1}}>
              {ban.type} · Motivo: {ban.reason||"Não informado"}
              {ban.expiresAt&&<span style={{color:"var(--t2)"}}> · Expira: {fmtDT(ban.expiresAt)}</span>}
              {!ban.expiresAt&&<span style={{color:"var(--t2)"}}> · Indefinido</span>}
            </div>
          </div>
          <button className="btn btn-unban btn-sm" onClick={()=>unbanUser(u.id)}>Desbanir</button>
        </div>):null;
      })}
      <div className="divider"/>
    </>)}

    <div className="section-label">Todos os usuários ({filtered.length})</div>
    {filtered.length===0?<G><div className="empty"><p>Nenhum usuário encontrado</p></div></G>
      :filtered.map(u=>{
        const ban=bans.find(b=>b.userId===u.id);
        const active=ban&&(!ban.expiresAt||ban.expiresAt>Date.now());
        const prof=getProfile(u.id);
        const subs=DB.get(K.subjects(u.id))||[];
        return(<div key={u.id} className={`user-row ${active?"ban-row":""}`}>
          <Av src={prof.avatar} name={u.name} size={38}/>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{fontSize:14,fontWeight:500}}>{u.name}</div>
              {isAdmin(u)&&<div className="adm-badge">ADM</div>}
              {active&&<div className="ban-badge">BANIDO</div>}
            </div>
            <div style={{fontSize:12,color:"var(--t2)",marginTop:1}}>{u.email} · {subs.length} matérias</div>
          </div>
          {active
            ?<button className="btn btn-unban btn-sm" onClick={()=>unbanUser(u.id)}>Desbanir</button>
            :<button className="btn btn-ban btn-sm" onClick={()=>setModal({user:u})}>🔨 Punir</button>
          }
        </div>);
      })}

    {modal&&(<Modal onClose={()=>setModal(null)}><G cls="mp si" style={{maxWidth:460}} onClick={e=>e.stopPropagation()}>
      <h3 style={{marginBottom:6,fontSize:16}}>🔨 Punir usuário</h3>
      <p style={{fontSize:13,color:"var(--t2)",marginBottom:18}}>Aplicar punição para <strong>{modal.user.name}</strong></p>
      <div className="fg"><label>Tipo de punição</label>
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {BAN_DURATIONS.map((d,i)=>(
            <div key={i} onClick={()=>setDurIdx(i)}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,cursor:"pointer",
                background:durIdx===i?"rgba(255,70,70,0.14)":"rgba(255,255,255,0.04)",
                border:durIdx===i?"1px solid rgba(255,70,70,0.3)":"1px solid var(--b2)",transition:"all .15s"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:durIdx===i?"#ff9494":"var(--t3)",flexShrink:0}}/>
              <span style={{fontSize:13,fontWeight:durIdx===i?600:400}}>{d.label}</span>
              {i===3&&<Pill color="#fcd34d" label="⚠️ Severo"/>}
            </div>
          ))}
        </div>
      </div>
      <div className="fg" style={{marginTop:12,marginBottom:20}}><label>Motivo (será mostrado ao usuário)</label>
        <textarea className="inp" rows={3} placeholder="Descreva o motivo da punição..." value={reason} onChange={e=>setReason(e.target.value)}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-ban" style={{flex:1}} onClick={banUser}>Confirmar punição</button>
        <button className="btn btn-g" onClick={()=>setModal(null)}>Cancelar</button>
      </div>
    </G></Modal>)}
  </div>);
}

// ── Admin: Admins ─────────────────────────────────────────────────────────────
function AdminAdmins({user}){
  const [admins,setAdmins]=useState(()=>DB.get(K.admins)||[]);
  const [email,setEmail]=useState("");const [err,setErr]=useState("");const [ok,setOk]=useState("");
  const users=DB.get(K.users)||{};
  const save=v=>{DB.set(K.admins,v);setAdmins(v);};
  const add=()=>{
    setErr("");setOk("");const e=email.trim().toLowerCase();
    if(!e){setErr("Digite um e-mail.");return;}
    if(e===FOUNDER){setErr("O fundador já é admin permanente.");return;}
    if(admins.includes(e)){setErr("Já é admin.");return;}
    if(!users[e]){setErr("Usuário não encontrado. Precisa ter conta cadastrada.");return;}
    save([...admins,e]);setEmail("");setOk(`${users[e].name} agora é administrador!`);
  };
  const rem=e=>{setOk("");setErr("");save(admins.filter(a=>a!==e));};
  return(<div>
    <G style={{padding:20,marginBottom:14}} tint="rgba(252,211,77,0.05)">
      <div className="section-label" style={{color:"#fcd34d",marginBottom:12}}>Fundador — Admin permanente</div>
      <div className="row">
        <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(252,211,77,0.18)",border:"1px solid rgba(252,211,77,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>◈</div>
        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{user.email===FOUNDER?user.name:"Fundador"}</div></div>
        <div className="adm-badge">FUNDADOR</div>
      </div>
    </G>
    <G style={{padding:20,marginBottom:14}}>
      <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>Adicionar Administrador</div>
      {err&&<div className="er">{err}</div>}{ok&&<div className="ok">{ok}</div>}
      <div style={{display:"flex",gap:8}}>
        <input className="inp" style={{flex:1}} placeholder="E-mail do usuário cadastrado" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}/>
        <button className="btn btn-adm" onClick={add}>Adicionar</button>
      </div>
      <p style={{fontSize:12,color:"var(--t3)",marginTop:8}}>O usuário precisa ter uma conta no Study Vieira.</p>
    </G>
    {admins.length>0&&<G style={{padding:20}}>
      <div className="section-label" style={{marginBottom:12}}>Administradores ({admins.length})</div>
      {admins.map(e=>{const u=users[e];const p=getProfile(u?.id||"");return(
        <div key={e} className="user-row">
          <Av src={p.avatar} name={u?.name||"?"} size={34}/>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500}}>{u?u.name:"?"}</div><div style={{fontSize:12,color:"var(--t2)"}}>{e}</div></div>
          <div className="adm-badge">ADM</div>
          <button className="btn btn-del btn-ico" style={{fontSize:12}} onClick={()=>rem(e)}>✕</button>
        </div>
      );})}
    </G>}
  </div>);
}

// ══════════════════════════════════════════════════════════════════════════════
//  HOME
// ══════════════════════════════════════════════════════════════════════════════
function HomePage({user,setTab}){
  const subjects=DB.get(K.subjects(user.id))||[];
  const globalPosts=getGlobalPosts();
  const pinned=globalPosts.filter(p=>p.pinned);const normal=globalPosts.filter(p=>!p.pinned);
  const sorted=[...pinned,...normal];

  // community posts for this user
  const myComms=getUserComms(user.id);
  const myCommPosts=myComms.flatMap(cid=>{
    const comm=getCommunities().find(c=>c.id===cid);
    return getCPosts(cid).map(p=>({...p,commName:comm?.name,commIcon:comm?.icon}));
  }).sort((a,b)=>b.createdAt-a.createdAt).slice(0,5);

  const now2=new Date();
  const [cy,setCy]=useState(now2.getFullYear());const [cm,setCm]=useState(now2.getMonth());
  const [csel,setCsel]=useState(today());
  const allProvas=subjects.flatMap(s=>(DB.get(K.provas(user.id,s.id))||[]).map(p=>({...p,subj:s})));
  const allConts=subjects.flatMap(s=>(DB.get(K.contents(user.id,s.id))||[]).map(c=>({...c,subj:s})));
  // read fresh on every render so events created in Agenda tab show immediately
  const evOn=d=>{
    const agEvs=DB.get(`sv5_agenda_${user.id}`)||[];
    return[
      ...allProvas.filter(p=>p.date===d).map(p=>({...p,icon:"📝",color:"#fda4af"})),
      ...allConts.filter(c=>c.date===d).map(c=>({...c,icon:"📖",color:c.subj.color.dot})),
      ...agEvs.filter(e=>e.date===d).map(e=>({...e,icon:getAT(e.type).icon,color:getAT(e.type).color})),
    ];
  };
  const fd=new Date(cy,cm,1).getDay();const dim=new Date(cy,cm+1,0).getDate();const pe=new Date(cy,cm,0).getDate();
  const cells=[];
  for(let i=fd-1;i>=0;i--)cells.push({d:pe-i,o:true,m:cm===0?11:cm-1,y:cm===0?cy-1:cy});
  for(let d=1;d<=dim;d++)cells.push({d,o:false,m:cm,y:cy});
  while(cells.length<35){const d=cells.length-fd-dim+1;cells.push({d,o:true,m:cm===11?0:cm+1,y:cm===11?cy+1:cy});}
  const ds=c=>`${c.y}-${String(c.m+1).padStart(2,"0")}-${String(c.d).padStart(2,"0")}`;
  const todayD=today();const selEvs=evOn(csel);
  const h=new Date().getHours();const greet=h<12?"Bom dia":h<18?"Boa tarde":"Boa noite";
  const prof=getProfile(user.id);


  return(<div className="fu">
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
      <Av src={prof.avatar} name={user.name} size={44}/>
      <div>
        <h1 style={{fontSize:22,fontWeight:700,letterSpacing:-.5}}>{greet}, {user.name.split(" ")[0]} 👋</h1>
        <p style={{color:"var(--t2)",fontSize:13,marginTop:2}}>{new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p>
      </div>
    </div>
    <div className="hgrid">
      <div className="hleft">
        <G style={{padding:20}}>
          <div className="sh"><h2>Matérias</h2>
            <button className="btn btn-g btn-sm" onClick={()=>setTab("materias")}>{subjects.length>0?"Ver todas":"+ Adicionar"}</button>
          </div>
          {subjects.length===0?<div style={{color:"var(--t2)",fontSize:13,textAlign:"center",padding:"12px 0"}}>Nenhuma matéria cadastrada</div>
            :subjects.slice(0,5).map(s=>{
              const provas=DB.get(K.provas(user.id,s.id))||[];const conts=DB.get(K.contents(user.id,s.id))||[];
              const nextP=provas.filter(p=>p.date>=todayD).sort((a,b)=>a.date.localeCompare(b.date))[0];
              return(<div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid var(--b2)"}}>
                <div className="dot" style={{background:s.color.dot,boxShadow:`0 0 7px ${s.color.glow}`}}/>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{s.name}</div>
                  <div style={{fontSize:11,color:"var(--t2)"}}>{conts.length} conteúdos · {provas.length} provas{nextP&&<span style={{color:"#fda4af"}}> · {fmt(nextP.date)}</span>}</div>
                </div>
                <Pill color={s.color.dot} label={s.cat||"faculdade"}/>
              </div>);
            })
          }
        </G>
        <G style={{padding:20}}>
          <div className="sh" style={{marginBottom:10}}><h2>Calendário</h2>
            <div style={{display:"flex",gap:4}}>
              <button className="btn btn-g btn-ico" style={{fontSize:13}} onClick={()=>{if(cm===0){setCm(11);setCy(y=>y-1);}else setCm(m=>m-1);}}>‹</button>
              <button className="btn btn-g btn-ico" style={{fontSize:13}} onClick={()=>{if(cm===11){setCm(0);setCy(y=>y+1);}else setCm(m=>m+1);}}>›</button>
            </div>
          </div>
          <div style={{fontSize:13,fontWeight:600,color:"var(--t2)",marginBottom:8}}>{MONTHS[cm]} {cy}</div>
          <div className="cg" style={{marginBottom:3}}>{WDAYS.map((d,i)=><div key={i} style={{textAlign:"center",fontSize:10,color:"var(--t3)",fontWeight:600,padding:"2px 0"}}>{d}</div>)}</div>
          <div className="cg">{cells.map((c,i)=>{const d=ds(c);const evs=evOn(d);return(
            <div key={i} className={`cc ${d===todayD?"tod":""} ${d===csel&&d!==todayD?"sel":""} ${c.o?"oth":""}`} style={{fontSize:12}} onClick={()=>setCsel(d)}>
              {c.d}{evs.length>0&&<div className="cdots">{evs.slice(0,2).map((e,j)=><div key={j} className="cdot" style={{background:e.color}}/>)}</div>}
            </div>);})}
          </div>
          {selEvs.length>0&&<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid var(--b2)"}}>
            <div style={{fontSize:11,color:"var(--t2)",fontWeight:600,marginBottom:6}}>{new Date(csel+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}</div>
            {selEvs.map(e=><div key={e.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:"1px solid var(--b2)"}}>
              <div className="dot" style={{width:7,height:7,background:e.color}}/><div style={{flex:1,fontSize:12}}>{e.title}</div><span>{e.icon}</span>
            </div>)}
          </div>}
        </G>
      </div>

      {/* RIGHT: Feed de Avisos — fills grid cell height via absolute positioning */}
      <div className="hright">
        <PostsFeed allPosts={sorted} myCommPosts={myCommPosts} user={user}/>
      </div>
    </div>
  </div>);
}


// ══════════════════════════════════════════════════════════════════════════════
//  POSTS FEED — Instagram-style scroll snap
// ══════════════════════════════════════════════════════════════════════════════
function PostsFeed({allPosts, myCommPosts, user}){
  const [openPost,setOpenPost]=useState(null);
  const feedRef=useRef(null);
  const [activeIdx,setActiveIdx]=useState(0);

  const feed=[
    ...myCommPosts.map(p=>({...p,_src:"comm"})),
    ...allPosts.map(p=>({...p,_src:"global"})),
  ];

  useEffect(()=>{
    const el=feedRef.current;if(!el)return;
    const fn=()=>setActiveIdx(Math.round(el.scrollTop/el.clientHeight));
    el.addEventListener("scroll",fn,{passive:true});
    return()=>el.removeEventListener("scroll",fn);
  },[]);

  const scrollTo=i=>{feedRef.current?.scrollTo({top:i*feedRef.current.clientHeight,behavior:"smooth"});};

  return(<>
    <G style={{position:"absolute",inset:0,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"14px 18px 10px",flexShrink:0,borderBottom:"1px solid var(--b2)"}}>
        <h2 style={{fontSize:16,fontWeight:600}}>📢 Avisos</h2>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {isAdmin(user)&&<span style={{fontSize:11,color:"#fcd34d",fontWeight:500}}>● ADM</span>}
          {feed.length>0&&<span style={{fontSize:11,color:"var(--t3)"}}>{activeIdx+1}/{feed.length}</span>}
        </div>
      </div>

      {feed.length===0
        ?<div className="empty" style={{padding:"40px 20px",flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontSize:32,marginBottom:8}}>🖼️</div>
            <p style={{fontWeight:500}}>Nenhum aviso</p>
            <p style={{fontSize:12,color:"var(--t3)",marginTop:5}}>
              {isAdmin(user)?"Publique o primeiro aviso no painel Admin":"Aguarde novidades"}
            </p>
          </div>
        :<div className="feed-wrap" style={{flex:1,minHeight:0,margin:0,borderRadius:0}}>
          {feed.length>1&&(
            <div className="feed-nav">
              {feed.map((_,i)=><div key={i} className={`feed-dot ${i===activeIdx?"active":""}`} onClick={()=>scrollTo(i)}/>)}
            </div>
          )}
          <div ref={feedRef} className="feed-inner">
            {feed.map((p,i)=>{
              const tc=PCOLORS[p.tag]||"#cbd5e1";
              const isComm=p._src==="comm";
              const hasText=!!(p.title||p.body);
              return(
                <div key={p.id+i} className="feed-slide"
                  style={{cursor:hasText?"pointer":"default"}}
                  onClick={()=>hasText&&setOpenPost(p)}>

                  {/* Background: foto ou gradiente */}
                  {p.img
                    ?<img src={p.img} className="feed-img" alt="aviso"/>
                    :<div className="feed-bg" style={{background:`linear-gradient(160deg,${tc}22 0%,var(--bg2,#2c2c2e) 100%)`}}/>
                  }

                  {/* Gradiente de legibilidade só se tiver texto */}
                  {hasText&&<div className="feed-gradient"/>}
                  <div className="feed-overlay"/>
                  {p.pinned&&<div className="feed-pin">📌</div>}

                  {/* Badge da comunidade */}
                  {isComm&&(
                    <div style={{position:"absolute",top:14,left:14,display:"flex",alignItems:"center",gap:6,
                      background:"rgba(0,0,0,0.45)",padding:"4px 10px",borderRadius:20,backdropFilter:"blur(8px)"}}>
                      <span style={{fontSize:14}}>{p.commIcon}</span>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.9)",fontWeight:500}}>{p.commName}</span>
                    </div>
                  )}

                  {/* Texto — só aparece se existir */}
                  {hasText&&(
                    <div className="feed-content">
                      <div className="feed-tag" style={{background:`${tc}35`,color:tc,border:`1px solid ${tc}55`}}>{p.tag}</div>
                      {p.title&&<div className="feed-title">{p.title}</div>}
                      <div className="feed-meta">
                        {p.authorName} · {fmtTS(p.createdAt)}
                        {p.body&&<><br/><span style={{opacity:.7}}>{p.body.slice(0,70)}{p.body.length>70?"…":""}</span></>}
                      </div>
                      {p.body&&p.body.length>70&&(
                        <div style={{marginTop:8,fontSize:12,color:"rgba(255,255,255,0.5)"}}>Toque para ler mais →</div>
                      )}
                    </div>
                  )}

                  {/* Sem texto: só tag discreta no rodapé */}
                  {!hasText&&(
                    <div style={{position:"absolute",bottom:14,left:14,display:"flex",alignItems:"center",gap:6}}>
                      <div className="feed-tag" style={{background:`${tc}40`,color:tc,border:`1px solid ${tc}60`,backdropFilter:"blur(8px)"}}>{p.tag}</div>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{p.authorName}</span>
                    </div>
                  )}

                  {i<feed.length-1&&<div className="feed-hint">↓ role</div>}
                </div>
              );
            })}
          </div>
        </div>
      }
    </G>

    {/* Modal de leitura completa — só abre se tiver texto */}
    {openPost&&(
      <Modal onClose={()=>setOpenPost(null)}>
        <G cls="post-detail si" onClick={e=>e.stopPropagation()}>
          {openPost.img&&<img src={openPost.img} className="post-detail-img" alt="aviso"/>}
          <div className="post-detail-body">
            {openPost._src==="comm"&&(
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                <span style={{fontSize:18}}>{openPost.commIcon}</span>
                <span style={{fontSize:12,color:"var(--t2)",fontWeight:500}}>{openPost.commName}</span>
              </div>
            )}
            <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
              <Pill color={PCOLORS[openPost.tag]||"#cbd5e1"} label={openPost.tag}/>
              {openPost.pinned&&<Pill color="#fcd34d" label="📌 Fixado"/>}
            </div>
            {openPost.title&&<h2 style={{fontSize:20,fontWeight:700,marginBottom:12,lineHeight:1.3}}>{openPost.title}</h2>}
            {openPost.body&&<div style={{fontSize:14,color:"var(--t2)",lineHeight:1.75,whiteSpace:"pre-wrap",marginBottom:20}}>{openPost.body}</div>}
            <div style={{fontSize:12,color:"var(--t3)",borderTop:"1px solid var(--b2)",paddingTop:12}}>
              Por <strong style={{color:"var(--t2)"}}>{openPost.authorName}</strong> · {fmtTS(openPost.createdAt)}
            </div>
            <button className="btn btn-g" style={{marginTop:14,width:"100%"}} onClick={()=>setOpenPost(null)}>Fechar</button>
          </div>
        </G></Modal>)}
  </>);}

// ══════════════════════════════════════════════════════════════════════════════
//  COMMUNITY TAB (user-facing)
// ══════════════════════════════════════════════════════════════════════════════
function CommunityTab({user,viewUser,setViewUser}){
  const [sub,setSub]=useState(viewUser?"profile":"people");
  useEffect(()=>{if(viewUser)setSub("profile");},[viewUser]);
  const friends=getFriends(user.id);
  const myComms=getUserComms(user.id);
  return(<div className="fu">
    <div className="sh"><h2>Comunidade</h2></div>
    <div className="stabs">
      {[{k:"people",l:"👥 Pessoas"},{k:"mycomms",l:`🏫 Minhas comunidades (${myComms.length})`},{k:"allcomms",l:"🔍 Explorar"},{k:"friends",l:`🤝 Amigos (${friends.length})`},{k:"activity",l:"📡 Atividade"},
        ...(viewUser?[{k:"profile",l:"👤 Perfil"}]:[])
      ].map(t=><button key={t.k} className={`stab ${sub===t.k?"on":""}`} onClick={()=>setSub(t.k)}>{t.l}</button>)}
    </div>
    {sub==="people"   &&<PeopleTab    user={user} setViewUser={setViewUser} setSub={setSub}/>}
    {sub==="mycomms"  &&<MyCommsTab   user={user}/>}
    {sub==="allcomms" &&<AllCommsTab  user={user}/>}
    {sub==="friends"  &&<FriendsTab   user={user} setViewUser={setViewUser} setSub={setSub}/>}
    {sub==="activity" &&<G style={{padding:20}}><div style={{fontSize:15,fontWeight:600,marginBottom:14}}>Atividade dos amigos</div><ActivityFeed userId={user.id}/></G>}
    {sub==="profile"  &&viewUser&&<UserProfileView uid={viewUser} me={user} onBack={()=>setSub("people")}/>}
  </div>);
}

function PeopleTab({user,setViewUser,setSub}){
  const [search,setSearch]=useState("");
  const allUsers=DB.get(K.users)||{};
  const others=Object.values(allUsers).filter(u=>u.id!==user.id);
  const filtered=others.filter(u=>!search||(u.name+u.email).toLowerCase().includes(search.toLowerCase()));
  return(<div>
    <div className="fg" style={{marginBottom:14}}><input className="inp" placeholder="Buscar pessoas..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
    {filtered.length===0?<G><div className="empty"><div style={{fontSize:32,marginBottom:8}}>👥</div><p>{search?"Nenhum resultado":"Nenhum outro usuário"}</p></div></G>
      :filtered.map(u=><UserCard key={u.id} u={u} me={user} onView={()=>{setViewUser(u.id);setSub("profile");}}/>)}
  </div>);
}

function MyCommsTab({user}){
  const myIds=getUserComms(user.id);
  const comms=getCommunities().filter(c=>myIds.includes(c.id));
  return(<div>
    {comms.length===0?<G><div className="empty"><div style={{fontSize:36,marginBottom:10}}>🏫</div><p style={{fontWeight:500}}>Você não é membro de nenhuma comunidade</p><p style={{fontSize:13,color:"var(--t3)",marginTop:6}}>Explore comunidades e entre na sua escola ou universidade</p></div></G>
      :comms.map(c=><CommCard key={c.id} comm={c} user={user}/>)}
  </div>);
}

function AllCommsTab({user}){
  const comms=getCommunities();
  const [type,setType]=useState("Todas");
  const types=["Todas",...COMM_TYPES];
  const filtered=type==="Todas"?comms:comms.filter(c=>c.type===type);
  return(<div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
      {types.map(t=><button key={t} className={`btn btn-sm ${type===t?"btn-f":"btn-g"}`} onClick={()=>setType(t)}>{t}</button>)}
    </div>
    {filtered.length===0?<G><div className="empty"><div style={{fontSize:36,marginBottom:10}}>🔍</div><p>Nenhuma comunidade encontrada</p></div></G>
      :<div className="g3">{filtered.map(c=><CommCard key={c.id} comm={c} user={user}/>)}</div>}
  </div>);
}

function CommCard({comm,user}){
  const [isMember,setIsMember]=useState(()=>isInComm(user.id,comm.id));
  const members=getCommMembers(comm.id);
  const posts=getCPosts(comm.id);
  const toggle=()=>{
    isMember?leaveComm(user.id,comm.id):joinComm(user.id,comm.id);
    setIsMember(m=>!m);
  };
  return(<div className="comm-card">
    <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
      <div style={{fontSize:28,flexShrink:0}}>{comm.icon}</div>
      <div style={{flex:1}}>
        <div style={{fontWeight:600,fontSize:14}}>{comm.name}</div>
        <div style={{fontSize:12,color:"var(--t2)",marginTop:2}}>{comm.type}</div>
        {comm.desc&&<div style={{fontSize:12,color:"var(--t3)",marginTop:4,lineHeight:1.4}}>{comm.desc}</div>}
      </div>
    </div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",gap:6}}>
        <Pill color="#86efac" label={`👥 ${members.length}`}/>
        <Pill color="#7dd3fc" label={`📢 ${posts.length}`}/>
      </div>
      <button className={`btn btn-sm ${isMember?"btn-leave":"btn-join"}`} onClick={toggle}>
        {isMember?"Sair":"Entrar"}
      </button>
    </div>
    {isMember&&posts.length>0&&(<>
      <div className="divider"/>
      <div className="section-label" style={{marginBottom:8}}>Último aviso</div>
      {(() => {
        const p=posts[0];const tc=PCOLORS[p.tag]||"#cbd5e1";
        return(<div>
          <div style={{display:"flex",gap:6,marginBottom:5}}><Pill color={tc} label={p.tag}/></div>
          <div style={{fontSize:13,fontWeight:600,marginBottom:3}}>{p.title}</div>
          <div style={{fontSize:12,color:"var(--t2)"}}>{p.body.slice(0,80)}{p.body.length>80?"…":""}</div>
        </div>);
      })()}
    </>)}
  </div>);
}

function FriendsTab({user,setViewUser,setSub}){
  const friends=getFriends(user.id);
  const allUsers=DB.get(K.users)||{};
  const friendUsers=friends.map(fid=>Object.values(allUsers).find(u=>u.id===fid)).filter(Boolean);
  return(<div>
    {friendUsers.length===0?<G><div className="empty"><div style={{fontSize:32,marginBottom:8}}>🤝</div><p style={{fontWeight:500}}>Nenhum amigo ainda</p><p style={{fontSize:13,color:"var(--t3)",marginTop:6}}>Quando você e alguém se seguirem mutuamente, viram amigos</p></div></G>
      :friendUsers.map(u=><UserCard key={u.id} u={u} me={user} onView={()=>{setViewUser(u.id);setSub("profile");}}/>)}
  </div>);
}

function UserCard({u,me,onView}){
  const [following,setFollowing]=useState(()=>isFollowing(me.id,u.id));
  const [theyFollow,setTheyFollow]=useState(()=>isFollowing(u.id,me.id));
  const prof=getProfile(u.id);
  const mutual=following&&theyFollow;
  const toggle=()=>{toggleFollow(me.id,u.id);setFollowing(f=>!f);SFX.follow();};
  return(<div className="user-row" style={{cursor:"pointer"}} onClick={onView}>
    <Av src={prof.avatar} name={u.name} size={42}/>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:14,fontWeight:600}}>{u.name}</div>
      <div style={{fontSize:12,color:"var(--t2)",marginTop:1}}>
        {mutual?<span style={{color:"#86efac"}}>🤝 Amigos</span>:theyFollow?<span style={{color:"#7dd3fc"}}>Segue você</span>:<span>Usuário</span>}
      </div>
      {prof.bio&&<div style={{fontSize:12,color:"var(--t3)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{prof.bio}</div>}
    </div>
    <button className={`btn btn-sm ${following?"btn-unfollow":"btn-follow"}`} onClick={e=>{e.stopPropagation();toggle();}}>
      {following?"Seguindo":"+ Seguir"}
    </button>
  </div>);
}

function UserProfileView({uid:targetId,me,onBack}){
  const [following,setFollowing]=useState(()=>isFollowing(me.id,targetId));
  const [theyFollow]=useState(()=>isFollowing(targetId,me.id));
  const allUsers=DB.get(K.users)||{};
  const u=Object.values(allUsers).find(u=>u.id===targetId);
  const prof=getProfile(targetId);
  const subjects=DB.get(K.subjects(targetId))||[];
  const mutual=following&&theyFollow;
  const foll=getFollowing(targetId);const followrs=getFollowers(targetId);
  const toggle=()=>{toggleFollow(me.id,targetId);setFollowing(f=>!f);};
  if(!u)return null;
  const BANNERS=["linear-gradient(135deg,#374151,#1f2937)","linear-gradient(135deg,#1e3a5f,#0f2847)","linear-gradient(135deg,#2d1b4e,#1a0f30)","linear-gradient(135deg,#1a3320,#0d1f14)","linear-gradient(135deg,#3d2020,#231212)"];
  const banner=BANNERS[targetId.charCodeAt(0)%BANNERS.length];
  return(<div>
    <div className="back" onClick={onBack}>← Voltar</div>
    <G style={{padding:0,marginBottom:16}}>
      <div className="prof-banner" style={{background:banner}}><div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.15)"}}/></div>
      <div style={{padding:"0 20px 20px",marginTop:12}}>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:14}}>
          <div style={{marginTop:-44}}><Av src={prof.avatar} name={u.name} size={76}/></div>
          <button className={`btn btn-sm ${following?"btn-unfollow":"btn-follow"}`} onClick={toggle}>{following?"Seguindo":"+ Seguir"}</button>
        </div>
        <div style={{fontSize:18,fontWeight:700}}>{u.name}</div>
        {mutual&&<div style={{fontSize:12,color:"#86efac",marginTop:3}}>🤝 Vocês são amigos</div>}
        {!mutual&&theyFollow&&<div style={{fontSize:12,color:"#7dd3fc",marginTop:3}}>Segue você</div>}
        {prof.bio&&<div style={{fontSize:13,color:"var(--t2)",marginTop:8,lineHeight:1.5}}>{prof.bio}</div>}
      </div>
      <div style={{borderTop:"1px solid var(--b2)"}}>
        <div className="prof-stats">
          {[{n:subjects.length,l:"Matérias"},{n:foll.length,l:"Seguindo"},{n:followrs.length,l:"Seguidores"}].map(s=>(
            <div key={s.l} className="prof-stat"><div className="prof-stat-n">{s.n}</div><div className="prof-stat-l">{s.l}</div></div>
          ))}
        </div>
      </div>
    </G>
    {mutual?(subjects.length===0?<G><div className="empty"><div style={{fontSize:28,marginBottom:8}}>📚</div><p>{u.name.split(" ")[0]} ainda não tem matérias</p></div></G>
      :<><div className="section-label" style={{marginBottom:12}}>📚 Matérias de {u.name.split(" ")[0]}</div>
        <div className="g2">{subjects.map(s=>{
          const conts=DB.get(K.contents(targetId,s.id))||[];const provas=DB.get(K.provas(targetId,s.id))||[];
          return(<G key={s.id} tint={s.color.tint} style={{padding:16,borderTop:`2px solid ${s.color.dot}40`}}>
            <div className="row" style={{marginBottom:8}}>
              <div className="dot" style={{background:s.color.dot,boxShadow:`0 0 7px ${s.color.glow}`}}/>
              <div style={{fontWeight:600,fontSize:14,flex:1}}>{s.name}</div>
            </div>
            {s.desc&&<p style={{fontSize:12,color:"var(--t2)",marginBottom:8}}>{s.desc}</p>}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <Pill color="#7dd3fc" label={`📖 ${conts.length}`}/><Pill color="#fda4af" label={`📝 ${provas.length}`}/>
            </div>
          </G>);})}
        </div></>)
      :<G><div className="empty"><div style={{fontSize:32,marginBottom:10}}>🔒</div><p style={{fontWeight:500}}>Matérias privadas</p>
        <p style={{fontSize:13,color:"var(--t3)",marginTop:6}}>{following?"Aguardando "+u.name.split(" ")[0]+" te seguir de volta":"Siga "+u.name.split(" ")[0]+" para virar amigo e ver as matérias"}</p>
      </div></G>}
  </div>);
}

// ── PROFILE ───────────────────────────────────────────────────────────────────
// ── Avatar crop helper ────────────────────────────────────────────────────────
function AvatarCropper({src,onDone,onCancel}){
  const canvasRef=useRef(null);
  const [offset,setOffset]=useState({x:0,y:0});
  const [scale,setScale]=useState(1);
  const [dragging,setDragging]=useState(false);
  const [start,setStart]=useState({x:0,y:0});
  const imgRef=useRef(null);
  const SIZE=260;

  useEffect(()=>{
    const img=new Image();img.onload=()=>{imgRef.current=img;draw();};img.src=src;
  },[src]);

  const draw=()=>{
    const canvas=canvasRef.current;if(!canvas||!imgRef.current)return;
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,SIZE,SIZE);
    // clip circle
    ctx.save();ctx.beginPath();ctx.arc(SIZE/2,SIZE/2,SIZE/2,0,Math.PI*2);ctx.clip();
    const img=imgRef.current;
    const s=scale;
    const w=img.width*s,h=img.height*s;
    ctx.drawImage(img,SIZE/2-w/2+offset.x,SIZE/2-h/2+offset.y,w,h);
    ctx.restore();
    // circle border
    ctx.beginPath();ctx.arc(SIZE/2,SIZE/2,SIZE/2-1,0,Math.PI*2);
    ctx.strokeStyle="rgba(255,255,255,0.4)";ctx.lineWidth=2;ctx.stroke();
  };

  useEffect(()=>{draw();},[offset,scale]);

  const onMouseDown=(e)=>{setDragging(true);setStart({x:e.clientX-offset.x,y:e.clientY-offset.y});};
  const onMouseMove=(e)=>{if(!dragging)return;setOffset({x:e.clientX-start.x,y:e.clientY-start.y});};
  const onMouseUp=()=>setDragging(false);
  const onTouchStart=(e)=>{const t=e.touches[0];setDragging(true);setStart({x:t.clientX-offset.x,y:t.clientY-offset.y});};
  const onTouchMove=(e)=>{if(!dragging)return;const t=e.touches[0];setOffset({x:t.clientX-start.x,y:t.clientY-start.y});};

  const confirm=()=>{
    const canvas=canvasRef.current;
    const out=document.createElement("canvas");out.width=200;out.height=200;
    const ctx=out.getContext("2d");
    ctx.beginPath();ctx.arc(100,100,100,0,Math.PI*2);ctx.clip();
    ctx.drawImage(canvas,0,0,SIZE,SIZE,0,0,200,200);
    onDone(out.toDataURL("image/jpeg",0.92));
  };

  return(<div style={{textAlign:"center"}}>
    <p style={{fontSize:12,color:"var(--t2)",marginBottom:10}}>Arraste para reposicionar · Use o slider para zoom</p>
    <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
      <canvas ref={canvasRef} width={SIZE} height={SIZE}
        style={{borderRadius:"50%",cursor:dragging?"grabbing":"grab",touchAction:"none",
          boxShadow:"0 0 0 3px rgba(255,255,255,0.2)"}}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}/>
    </div>
    <input type="range" min={0.5} max={3} step={0.05} value={scale}
      onChange={e=>{setScale(parseFloat(e.target.value));}}
      style={{width:220,marginBottom:14,accentColor:"#7dd3fc"}}/>
    <div style={{display:"flex",gap:8,justifyContent:"center"}}>
      <button className="btn btn-f btn-sm" onClick={confirm}>✓ Confirmar</button>
      <button className="btn btn-g btn-sm" onClick={onCancel}>Cancelar</button>
    </div>
  </div>);
}

const BANNER_PRESETS=[
  "linear-gradient(135deg,#374151,#1f2937)",
  "linear-gradient(135deg,#1e3a5f,#0f2847)",
  "linear-gradient(135deg,#2d1b4e,#1a0f30)",
  "linear-gradient(135deg,#1a3320,#0d1f14)",
  "linear-gradient(135deg,#3d2020,#231212)",
  "linear-gradient(135deg,#7c3a1a,#3d1a08)",
  "linear-gradient(135deg,#1a2a4a,#0a1520)",
  "linear-gradient(135deg,#2a1a4a,#150a25)",
];
const GENDERS=["Prefiro não dizer","Masculino","Feminino","Não-binário","Outro"];
const COURSES=["Ensino Fundamental","Ensino Médio","Pré-vestibular / Cursinho","Faculdade","Pós-graduação","Curso livre","Outro"];


// ══════════════════════════════════════════════════════════════════════════════
//  STUDY STATS — Heatmap + Grade Averages
// ══════════════════════════════════════════════════════════════════════════════
function StudyStats({userId,subjects=[]}){
  const [tab,setTab]=useState("heat");
  const today2=new Date().toISOString().slice(0,10);

  // Build activity map from all sources
  const actMap=useMemo(()=>{
    const m={};
    subjects.forEach(s=>{
      (DB.get(K.contents(userId,s.id))||[]).filter(c=>c.done&&c.date).forEach(c=>{m[c.date]=(m[c.date]||0)+1;});
    });
    (DB.get(`sv5_agenda_${userId}`)||[]).filter(e=>e.done&&e.date).forEach(e=>{m[e.date]=(m[e.date]||0)+1;});
    return m;
  },[userId,subjects]);

  // 52 week grid
  const weeks=useMemo(()=>{
    const res=[];const start=new Date();
    start.setDate(start.getDate()-363-start.getDay());
    let wk=[];const cur=new Date(start);
    while(cur<=new Date()){
      const ds=cur.toISOString().slice(0,10);
      wk.push({date:ds,n:actMap[ds]||0});
      if(wk.length===7){res.push(wk);wk=[];}
      cur.setDate(cur.getDate()+1);
    }
    if(wk.length){while(wk.length<7)wk.push({date:null,n:0});res.push(wk);}
    return res;
  },[actMap]);

  const heatColor=n=>n===0?"rgba(255,255,255,0.05)":n===1?"rgba(134,239,172,0.25)":n===2?"rgba(134,239,172,0.45)":n===3?"rgba(134,239,172,0.65)":"rgba(134,239,172,0.9)";
  const totalDays=Object.keys(actMap).length;
  const totalEvs=Object.values(actMap).reduce((a,b)=>a+b,0);
  const streak=useMemo(()=>{let s=0;while(actMap[new Date(Date.now()-s*86400000).toISOString().slice(0,10)])s++;return s;},[actMap]);

  // Grade averages
  const grades=useMemo(()=>subjects.map(s=>{
    const ps=(DB.get(K.provas(userId,s.id))||[]).filter(p=>p.grade&&!isNaN(+p.grade));
    if(!ps.length)return null;
    const {sum,w}=ps.reduce((a,p)=>({sum:a.sum+(+p.grade)*(+p.weight||1),w:a.w+(+p.weight||1)}),{sum:0,w:0});
    return{s,avg:(sum/w).toFixed(1),count:ps.length};
  }).filter(Boolean),[userId,subjects]);

  const gradeColor=a=>+a>=7?"#86efac":+a>=5?"#fcd34d":"#fda4af";

  // Month labels
  const monthLabels=useMemo(()=>{
    const out=[];let last=-1;
    weeks.forEach((wk,wi)=>{const m=new Date(wk[1]?.date||"").getMonth();if(m!==last&&wk[1]?.date){out.push({wi,l:["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][m]});last=m;}});
    return out;
  },[weeks]);

  return(<div>
    <div className="stabs" style={{marginBottom:16}}>
      {[{k:"heat",l:"🔥 Atividade"},{k:"grades",l:"📊 Notas"}].map(t=>(
        <button key={t.k} className={`stab ${tab===t.k?"on":""}`} onClick={()=>setTab(t.k)}>{t.l}</button>
      ))}
    </div>

    {tab==="heat"&&<>
      <div style={{display:"flex",gap:0,marginBottom:16}}>
        {[{n:totalDays,l:"dias ativos",c:"#86efac"},{n:totalEvs,l:"atividades",c:"#7dd3fc"},{n:streak,l:"sequência",c:"#fcd34d"}].map(s=>(
          <div key={s.l} style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:700,color:s.c}}>{s.n}</div>
            <div style={{fontSize:11,color:"var(--t2)",marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{overflowX:"auto"}}>
        {/* Month labels */}
        <div style={{display:"flex",marginBottom:3,marginLeft:18}}>
          {weeks.map((_,wi)=>{const ml=monthLabels.find(m=>m.wi===wi);return(<div key={wi} style={{width:12,flexShrink:0,fontSize:9,color:"var(--t3)",marginRight:2}}>{ml?.l||""}</div>);})}
        </div>
        <div style={{display:"flex",gap:0}}>
          <div style={{display:"flex",flexDirection:"column",gap:2,marginRight:4}}>
            {["D","S","T","Q","Q","S","S"].map((d,i)=>(
              <div key={i} style={{width:14,height:12,fontSize:9,color:"var(--t3)",display:"flex",alignItems:"center",justifyContent:"center"}}>{i%2===1?d:""}</div>
            ))}
          </div>
          {weeks.map((wk,wi)=>(
            <div key={wi} style={{display:"flex",flexDirection:"column",gap:2,marginRight:2}}>
              {wk.map((d,di)=>(
                <div key={di} className="heat-cell" title={d.date?`${d.date}: ${d.n} atividade${d.n!==1?"s":""}`:""}
                  style={{background:d.date?heatColor(d.n):"transparent"}}/>
              ))}
            </div>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,marginTop:8,justifyContent:"flex-end"}}>
          <span style={{fontSize:10,color:"var(--t3)",marginRight:4}}>Menos</span>
          {[0,1,2,3,4].map(n=><div key={n} style={{width:11,height:11,borderRadius:2,background:heatColor(n)}}/>)}
          <span style={{fontSize:10,color:"var(--t3)",marginLeft:4}}>Mais</span>
        </div>
      </div>
    </>}

    {tab==="grades"&&(grades.length===0
      ?<div className="empty"><div style={{fontSize:32,marginBottom:8}}>📊</div><p>Nenhuma nota registrada</p><p style={{fontSize:12,color:"var(--t3)",marginTop:4}}>Adicione notas nas provas de cada matéria</p></div>
      :<div>
        {grades.sort((a,b)=>+b.avg-+a.avg).map(d=>(
          <div key={d.s.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:"1px solid var(--b2)"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:d.s.color?.dot||"#7dd3fc",boxShadow:`0 0 6px ${d.s.color?.glow||"#7dd3fc"}60`,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500}}>{d.s.name}</div>
              <div style={{fontSize:11,color:"var(--t2)",marginTop:1}}>{d.count} prova{d.count!==1?"s":""}</div>
            </div>
            <div style={{width:70,height:5,borderRadius:3,background:"rgba(255,255,255,0.08)",overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:3,background:gradeColor(d.avg),width:`${Math.min(+d.avg*10,100)}%`,transition:"width .5s"}}/>
            </div>
            <div style={{fontSize:18,fontWeight:700,color:gradeColor(d.avg),minWidth:34,textAlign:"right"}}>{d.avg}</div>
          </div>
        ))}
        {grades.length>1&&(()=>{
          const ov=(grades.reduce((s,d)=>s+ +d.avg,0)/grades.length).toFixed(1);
          return(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,padding:"12px 14px",borderRadius:11,background:`${gradeColor(ov)}12`,border:`1px solid ${gradeColor(ov)}30`}}>
            <div style={{fontWeight:600,fontSize:13}}>Média geral</div>
            <div style={{fontSize:22,fontWeight:700,color:gradeColor(ov)}}>{ov}</div>
          </div>);
        })()}
      </div>
    )}
  </div>);
}

// ══════════════════════════════════════════════════════════════════════════════
//  ACTIVITY FEED — O que os amigos estudaram
// ══════════════════════════════════════════════════════════════════════════════
function ActivityFeed({userId}){
  const follows=getFollows();
  const friendIds=follows.filter(f=>f.followerId===userId&&follows.some(f2=>f2.followerId===f.followingId&&f2.followingId===userId)).map(f=>f.followingId);
  const allUsers=DB.get(K.users)||{};
  const getName=id=>Object.values(allUsers).find(u=>u.id===id)?.name?.split(" ")[0]||"Alguém";
  const getProf=id=>getProfile(id);

  const items=useMemo(()=>{
    const out=[];
    friendIds.forEach(fid=>{
      const fname=getName(fid);const fprof=getProf(fid);
      const subjs=DB.get(K.subjects(fid))||[];
      subjs.forEach(s=>{
        (DB.get(K.contents(fid,s.id))||[]).filter(c=>c.done).slice(-2).forEach(c=>{
          const at=getAT(c.type);
          out.push({id:`${fid}c${c.id}`,name:fname,avatar:fprof.avatar,icon:at.icon,color:at.color,text:"estudou",subject:s.name,sc:s.color?.dot||"#7dd3fc",date:c.date,ts:new Date(c.date+"T12:00:00").getTime()});
        });
        (DB.get(K.provas(fid,s.id))||[]).filter(p=>p.grade).slice(-1).forEach(p=>{
          out.push({id:`${fid}p${p.id}`,name:fname,avatar:fprof.avatar,icon:"📝",color:"#fda4af",text:"tirou",subject:`nota ${p.grade} em ${s.name}`,sc:"#fda4af",date:p.date,ts:new Date(p.date+"T12:00:00").getTime()});
        });
        const flash=DB.get(`sv5_flash_${fid}_${s.id}`)||[];
        if(flash.some(c=>c.reviews>0))out.push({id:`${fid}fl${s.id}`,name:fname,avatar:fprof.avatar,icon:"🃏",color:"#c4b5fd",text:"revisou flashcards de",subject:s.name,sc:s.color?.dot||"#c4b5fd",date:null,ts:Date.now()-Math.random()*86400000*2});
      });
    });
    return out.sort((a,b)=>b.ts-a.ts).slice(0,25);
  },[userId,friendIds.join(",")]);

  const relTime=ts=>{const d=Date.now()-ts,m=Math.floor(d/60000),h=Math.floor(d/3600000),dy=Math.floor(d/86400000);return m<1?"agora":m<60?`${m}min`:h<24?`${h}h`:dy<7?`${dy}d`:new Date(ts).toLocaleDateString("pt-BR",{day:"2-digit",month:"short"});};

  if(!friendIds.length)return(<div className="empty"><div style={{fontSize:32,marginBottom:8}}>👥</div><p>Nenhum amigo ainda</p><p style={{fontSize:12,color:"var(--t3)",marginTop:4}}>Quando você e alguém se seguirem mutuamente as atividades aparecem aqui</p></div>);
  if(!items.length)return(<div className="empty"><div style={{fontSize:32,marginBottom:8}}>💤</div><p>Seus amigos ainda não registraram atividades</p></div>);

  return(<div>{items.map((a,i)=>(
    <div key={a.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"11px 0",borderBottom:i<items.length-1?"1px solid var(--b2)":"none"}}>
      <div style={{position:"relative",flexShrink:0}}>
        {a.avatar?<img src={a.avatar} style={{width:36,height:36,borderRadius:"50%",objectFit:"cover",border:"2px solid var(--b2)"}} alt=""/>
          :<div style={{width:36,height:36,borderRadius:"50%",background:"rgba(255,255,255,0.1)",border:"2px solid var(--b2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:600,color:"var(--t2)"}}>{a.name[0]}</div>}
        <div style={{position:"absolute",bottom:-2,right:-2,fontSize:10,background:"var(--bg2,#2c2c2e)",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center"}}>{a.icon}</div>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,lineHeight:1.5}}>
          <strong style={{color:"var(--t)"}}>{a.name}</strong>{" "}
          <span style={{color:"var(--t2)"}}>{a.text}</span>{" "}
          <span style={{color:a.sc,fontWeight:500}}>{a.subject}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:3}}>
          {a.date&&<span style={{fontSize:11,color:"var(--t3)"}}>{fmt(a.date)}</span>}
          <span style={{fontSize:11,color:"var(--t3)",marginLeft:"auto"}}>{relTime(a.ts)}</span>
        </div>
      </div>
    </div>
  ))}</div>);
}

function ProfileTab({user,setUser}){
  const [prof,setProf]=useState(()=>getProfile(user.id));
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(user.name);
  const [bio,setBio]=useState(prof.bio||"");
  const [avatar,setAvatar]=useState(prof.avatar||"");
  const [cropSrc,setCropSrc]=useState(null);  // imagem para cortar
  const [banner,setBanner]=useState(prof.banner||BANNER_PRESETS[user.id.charCodeAt(0)%BANNER_PRESETS.length]);
  const [bannerImg,setBannerImg]=useState(prof.bannerImg||null);
  const [gender,setGender]=useState(prof.gender||"Prefiro não dizer");
  const [age,setAge]=useState(prof.age||"");
  const [course,setCourse]=useState(prof.course||"");
  const [ok,setOk]=useState("");
  const avatarFileRef=useRef(null);
  const bannerFileRef=useRef(null);

  const friends=getFriends(user.id);const following=getFollowing(user.id);const followers=getFollowers(user.id);
  const subjects=DB.get(K.subjects(user.id))||[];

  const handleAvatarFile=(e)=>{
    const file=e.target.files[0];if(!file)return;
    const r=new FileReader();r.onload=(ev)=>setCropSrc(ev.target.result);r.readAsDataURL(file);
  };
  const handleBannerFile=(e)=>{
    const file=e.target.files[0];if(!file)return;
    const r=new FileReader();r.onload=(ev)=>{setBannerImg(ev.target.result);setBanner(null);};r.readAsDataURL(file);
  };

  const save=async()=>{
    const np={...prof,bio,avatar,banner:bannerImg?null:banner,bannerImg,gender,age,course};
    saveProfile(user.id,np);setProf(np);
    const users=DB.get(K.users)||{};
    if(users[user.email])DB.set(K.users,{...users,[user.email]:{...users[user.email],name:name.trim()}});
    const nu={...user,name:name.trim()};setUser(nu);
    // Sync to Supabase — avatar base64 pode ser grande, trunca se necessário
    if(USE_SUPABASE){
      // Avatar: se for base64 muito grande (>500KB), sobe via Storage
      let avatarUrl=avatar||null;
      if(avatar&&avatar.startsWith("data:")&&avatar.length>500000){
        try{
          const res=await fetch(avatar);const blob=await res.blob();
          const path=`avatars/${user.id}.jpg`;
          const{error:upErr}=await sb.storage.from("avatars").upload(path,blob,{upsert:true,contentType:"image/jpeg"});
          if(!upErr){const{data:pub}=sb.storage.from("avatars").getPublicUrl(path);avatarUrl=pub.publicUrl;}
        }catch(e){console.warn("[SB] avatar upload",e.message);}
      }
      const{error}=await sb.from("profiles").upsert({
        id:user.id,
        name:name.trim(),
        email:user.email,
        bio:bio||null,
        avatar_url:avatarUrl,
        banner:bannerImg?null:(banner||null),
        banner_img:bannerImg||null,
        gender:gender||null,
        age:age?String(age):null,
        course:course||null
      });
      if(error){console.error("[SB] profile save error:",error.message);setOk("Erro ao salvar: "+error.message);return;}
    }
    setEditing(false);setOk("Perfil atualizado!");setTimeout(()=>setOk(""),2500);
  };

  const bannerStyle=bannerImg?{backgroundImage:`url(${bannerImg})`,backgroundSize:"cover",backgroundPosition:"center"}:{background:banner||BANNER_PRESETS[0]};

  return(<div className="fu">
    {/* Crop modal */}
    {cropSrc&&(
      <Modal onClose={()=>setCropSrc(null)}><G cls="mp si" style={{maxWidth:340}}>
        <h3 style={{marginBottom:14,fontSize:16,textAlign:"center"}}>✂️ Recortar foto</h3>
        <AvatarCropper src={cropSrc} onDone={(cropped)=>{setAvatar(cropped);setCropSrc(null);}} onCancel={()=>setCropSrc(null)}/>
      </G></Modal>)}

    <G style={{padding:0,overflow:"hidden",marginBottom:16}}>
      {/* Banner */}
      <div className="prof-banner" style={{...bannerStyle,position:"relative"}}>
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.12)"}}/>
        {editing&&(
          <div style={{position:"absolute",bottom:10,right:10,display:"flex",gap:6}}>
            <input ref={bannerFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleBannerFile}/>
            <button className="btn btn-g btn-sm" style={{fontSize:11,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(8px)"}}
              onClick={()=>bannerFileRef.current?.click()}>🖼 Foto</button>
            <div style={{display:"flex",gap:4}}>
              {BANNER_PRESETS.map((b,i)=>(
                <div key={i} onClick={()=>{setBanner(b);setBannerImg(null);}}
                  style={{width:20,height:20,borderRadius:4,background:b,cursor:"pointer",border:banner===b&&!bannerImg?"2px solid white":"2px solid transparent",transition:"all .15s"}}/>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Avatar flutuante sobre o banner — posicionado absolutamente */}
      <div style={{position:"relative",paddingTop:50}}>
        <div style={{position:"absolute",top:-44,left:20,zIndex:10}}>
          <input ref={avatarFileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleAvatarFile}/>
          {editing
            ?<div className="av-upload" onClick={()=>avatarFileRef.current?.click()}>
                <div style={{width:84,height:84,borderRadius:"50%",overflow:"hidden",border:"4px solid var(--bg)",boxShadow:"0 2px 12px rgba(0,0,0,0.4)"}}>
                  {avatar
                    ?<img src={avatar} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt=""/>
                    :<div style={{width:"100%",height:"100%",background:"rgba(255,255,255,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,fontWeight:600,color:"var(--t)"}}>{user.name[0]}</div>
                  }
                </div>
                <div className="av-overlay" style={{borderRadius:"50%",border:"4px solid transparent"}}>✎</div>
              </div>
            :<div style={{width:84,height:84,borderRadius:"50%",overflow:"hidden",border:"4px solid var(--bg)",boxShadow:"0 2px 12px rgba(0,0,0,0.4)"}}>
              {prof.avatar
                ?<img src={prof.avatar} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} alt=""/>
                :<div style={{width:"100%",height:"100%",background:"rgba(255,255,255,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,fontWeight:600,color:"var(--t)"}}>{user.name[0]}</div>
              }
            </div>
          }
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10,padding:"0 20px"}}>
          <button className="btn btn-g btn-sm" onClick={()=>editing?save():setEditing(true)}>
            {editing?"💾 Salvar":"✎ Editar perfil"}
          </button>
        </div>

        <div style={{padding:"0 20px 20px"}}>
        {ok&&<div className="ok" style={{marginBottom:10}}>{ok}</div>}

        {editing?(<>
          {/* Nome (largo) + Idade (estreito) */}
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginBottom:13}}>
            <div className="fg" style={{marginBottom:0}}><label>Nome</label>
              <input className="inp" value={name} onChange={e=>setName(e.target.value)}/>
            </div>
            <div className="fg" style={{marginBottom:0}}><label>Idade</label>
              <input className="inp" type="number" min={5} max={99} placeholder="ex: 20" value={age} onChange={e=>setAge(e.target.value)}/>
            </div>
          </div>
          {/* Gênero + Cursando — cada um em linha própria para não apertar */}
          <div className="fg"><label>Gênero</label>
            <select className="inp" value={gender} onChange={e=>setGender(e.target.value)}>
              {GENDERS.map(g=><option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="fg"><label>O que está cursando</label>
            <select className="inp" value={course} onChange={e=>setCourse(e.target.value)}>
              <option value="">Selecione...</option>
              {COURSES.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="fg" style={{marginBottom:0}}><label>Bio</label>
            <textarea className="inp" rows={2} placeholder="Conta sobre você..." value={bio} onChange={e=>setBio(e.target.value)}/>
          </div>
          <button className="btn btn-g btn-sm" style={{marginTop:10}} onClick={()=>setEditing(false)}>Cancelar</button>
        </>):(<>
          <div style={{fontSize:18,fontWeight:700,letterSpacing:-.3}}>{user.name}</div>
          <div style={{fontSize:13,color:"var(--t2)",marginTop:2}}>{user.email}</div>
          <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"}}>
            {prof.age&&<Pill color="#7dd3fc" label={`${prof.age} anos`}/>}
            {prof.gender&&prof.gender!=="Prefiro não dizer"&&<Pill color="#c4b5fd" label={prof.gender}/>}
            {prof.course&&<Pill color="#86efac" label={prof.course}/>}
            {isAdmin(user)&&<div className="adm-badge">ADM</div>}
          </div>
          {prof.bio&&<div style={{fontSize:13,color:"var(--t2)",marginTop:8,lineHeight:1.5}}>{prof.bio}</div>}
        </>)}
        </div>{/* /padding */}
      </div>{/* /relative */}
      <div style={{borderTop:"1px solid var(--b2)"}}>
        <div className="prof-stats">
          {[{n:subjects.length,l:"Matérias"},{n:following.length,l:"Seguindo"},{n:followers.length,l:"Seguidores"}].map(s=>(
            <div key={s.l} className="prof-stat"><div className="prof-stat-n">{s.n}</div><div className="prof-stat-l">{s.l}</div></div>
          ))}
        </div>
      </div>
    </G>
    <G style={{padding:20,marginTop:14}}>
      <StudyStats userId={user.id} subjects={subjects}/>
    </G>
  </div>);
}

// ── SUBJECTS, CONTENT, NOTES, PROVAS, CALENDAR, AGENDA (unchanged logic) ─────
function SubjectsTab({user}){
  const [subs,setSubs]=useState(()=>DB.get(K.subjects(user.id))||[]);
  const [open,setOpen]=useState(null);const [modal,setModal]=useState(null);
  const [nm,setNm]=useState("");const [desc,setDesc]=useState("");const [ci,setCi]=useState(0);const [cat,setCat]=useState("faculdade");const [err,setErr]=useState("");
  const save=s=>{DB.set(K.subjects(user.id),s);setSubs(s);};
  const openNew=()=>{setNm("");setDesc("");setCi(0);setCat("faculdade");setErr("");SFX.open();setModal("new");};
  const openEdit=s=>{setNm(s.name);setDesc(s.desc||"");setCi(COLORS.findIndex(c=>c.id===s.color.id));setCat(s.cat||"faculdade");setErr("");setModal(s);};
  const submit=async()=>{if(!nm.trim()){setErr("Digite o nome.");return;}const color=COLORS[ci];
    if(modal==="new"){
      const newS={id:uid(),name:nm.trim(),desc,color,cat,createdAt:today()};
      save([...subs,newS]);
      if(USE_SUPABASE) await sb.from("subjects").insert({id:newS.id,user_id:user.id,name:newS.name,description:newS.desc||null,color_id:color.id,color_dot:color.dot,color_glow:color.glow,color_tint:color.tint,category:newS.cat});
    }else{
      save(subs.map(s=>s.id===modal.id?{...s,name:nm.trim(),desc,color,cat}:s));
      if(USE_SUPABASE) await sb.from("subjects").update({name:nm.trim(),description:desc||null,color_id:color.id,color_dot:color.dot,color_glow:color.glow,color_tint:color.tint,category:cat}).eq("id",modal.id);
    }
    SFX.close();setModal(null);};
  const del=async(id)=>{
    save(subs.filter(s=>s.id!==id));
    if(USE_SUPABASE) await sb.from("subjects").delete().eq("id",id);
    SFX.close();setModal(null);};
  if(open){const subj=subs.find(s=>s.id===open);if(!subj){setOpen(null);return null;}
    return<SubjectDetail user={user} subj={subj} onBack={()=>setOpen(null)} onEdit={()=>{setOpen(null);openEdit(subj);}}/>;}
  const cats=[...new Set(subs.map(s=>s.cat||"faculdade"))];
  return(<div className="fu">
    <div className="sh"><h2>Minhas Matérias</h2><button className="btn btn-f" onClick={openNew}>+ Nova Matéria</button></div>
    {subs.length===0?<G><div className="empty"><div style={{fontSize:38,marginBottom:10}}>◈</div><p style={{fontWeight:500}}>Nenhuma matéria</p></div></G>
      :cats.map(cat=>(<div key={cat} style={{marginBottom:22}}>
        <div className="section-label">{cat}</div>
        <div className="g2">{subs.filter(s=>(s.cat||"faculdade")===cat).map(s=>{
          const conts=DB.get(K.contents(user.id,s.id))||[];const notes=DB.get(K.notes(user.id,s.id))||[];const provas=DB.get(K.provas(user.id,s.id))||[];
          const nextP=provas.filter(p=>p.date>=today()).sort((a,b)=>a.date.localeCompare(b.date))[0];
          return(<G key={s.id} tint={s.color.tint} style={{padding:18,cursor:"pointer",borderTop:`2px solid ${s.color.dot}40`}} onClick={()=>setOpen(s.id)}>
            <div className="row" style={{marginBottom:10}}>
              <div className="dot" style={{background:s.color.dot,boxShadow:`0 0 8px ${s.color.glow}`}}/>
              <div style={{fontWeight:600,fontSize:15,flex:1}}>{s.name}</div>
              <button className="btn btn-g btn-ico" style={{fontSize:12}} onClick={e=>{e.stopPropagation();openEdit(s);}}>✎</button>
            </div>
            {s.desc&&<p style={{fontSize:12,color:"var(--t2)",marginBottom:10,lineHeight:1.5}}>{s.desc}</p>}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              <Pill color="#7dd3fc" label={`📖 ${conts.length}`}/><Pill color="#c4b5fd" label={`📝 ${notes.length}`}/><Pill color="#fda4af" label={`⚠️ ${provas.length}`}/>
            </div>
            {nextP&&<div style={{fontSize:11,color:"#fda4af",marginTop:4}}>📅 Prova: {fmt(nextP.date)}</div>}
          </G>);})}
        </div>
      </div>))}
    {modal&&(<Modal onClose={()=>setModal(null)}><G cls="mp si" onClick={e=>e.stopPropagation()}>
      <h3 style={{marginBottom:18,fontSize:16}}>{modal==="new"?"Nova Matéria":`Editar: ${modal.name}`}</h3>{err&&<div className="er">{err}</div>}
      <div className="fg"><label>Nome</label><input className="inp" placeholder="ex: Cálculo II" value={nm} onChange={e=>setNm(e.target.value)}/></div>
      <div className="fg"><label>Descrição</label><input className="inp" placeholder="ex: Integrais" value={desc} onChange={e=>setDesc(e.target.value)}/></div>
      <div className="fg"><label>Categoria</label>
        <select className="inp" value={cat} onChange={e=>setCat(e.target.value)}>
          {["faculdade","escola","curso","concurso","outro"].map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
        </select>
      </div>
      <div className="fg" style={{marginBottom:20}}><label>Cor</label>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {COLORS.map((c,i)=><div key={c.id} onClick={()=>setCi(i)}
            style={{width:26,height:26,borderRadius:"50%",background:c.dot,cursor:"pointer",outline:ci===i?`2px solid ${c.dot}`:"2px solid transparent",outlineOffset:2,boxShadow:ci===i?`0 0 10px ${c.glow}`:"none",transition:"all .18s"}}/>)}
        </div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-f" style={{flex:1}} onClick={submit}>{modal==="new"?"Criar":"Salvar"}</button>
        {modal!=="new"&&<button className="btn btn-del" onClick={()=>del(modal.id)}>Excluir</button>}
        <button className="btn btn-g" onClick={()=>setModal(null)}>Cancelar</button>
      </div>
    </G></Modal>)}
  </div>);
}

// ══════════════════════════════════════════════════════════════════════════════
//  POMODORO TIMER
// ══════════════════════════════════════════════════════════════════════════════
const POMO_MODES=[
  {key:"focus",label:"Foco",minutes:25,color:"#fda4af",emoji:"🎯"},
  {key:"short",label:"Pausa",minutes:5,color:"#86efac",emoji:"☕"},
  {key:"long",label:"Longa",minutes:15,color:"#7dd3fc",emoji:"🌿"},
];
const POMO_BEEP=(freq=880,dur=.3,vol=.15)=>{try{const c=new(window.AudioContext||window.webkitAudioContext)();const o=c.createOscillator();const g=c.createGain();o.connect(g);g.connect(c.destination);o.type="sine";o.frequency.value=freq;g.gain.setValueAtTime(vol,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+dur);o.start();o.stop(c.currentTime+dur);}catch{}};
const POMO_WIN=()=>[523,659,784,1047].forEach((f,i)=>setTimeout(()=>POMO_BEEP(f,.15,.12),i*80));

function PomodoroTimer({subjectName=""}){
  const [mIdx,setMIdx]=useState(0);
  const [secs,setSecs]=useState(POMO_MODES[0].minutes*60);
  const [running,setRunning]=useState(false);
  const [rounds,setRounds]=useState(0);
  const [todayMins,setTodayMins]=useState(0);
  const iRef=useRef(null);
  const mode=POMO_MODES[mIdx];
  const total=mode.minutes*60;
  const pct=((total-secs)/total)*100;
  const mm=String(Math.floor(secs/60)).padStart(2,"0");
  const ss2=String(secs%60).padStart(2,"0");
  const R=52,C=2*Math.PI*R,dash=C-(pct/100)*C;

  const switchMode=useCallback((i)=>{
    clearInterval(iRef.current);setRunning(false);setMIdx(i);setSecs(POMO_MODES[i].minutes*60);
  },[]);

  useEffect(()=>{
    if(!running)return;
    iRef.current=setInterval(()=>{
      setSecs(s=>{
        if(s<=1){
          clearInterval(iRef.current);setRunning(false);POMO_WIN();
          if(POMO_MODES[mIdx].key==="focus"){
            const nr=rounds+1;setRounds(nr);
            setTodayMins(m=>m+25);
            setTimeout(()=>switchMode(nr%4===0?2:1),800);
          }else setTimeout(()=>switchMode(0),800);
          return 0;
        }
        return s-1;
      });
    },1000);
    return()=>clearInterval(iRef.current);
  },[running,mIdx,rounds,switchMode]);

  useEffect(()=>{
    document.title=running?`${mm}:${ss2} ${mode.label} | Study Vieira`:"Study Vieira";
    return()=>{document.title="Study Vieira";};
  },[running,mm,ss2,mode.label]);

  return(<div className="pom-wrap">
    {/* Mode tabs */}
    <div style={{display:"flex",gap:3,background:"rgba(255,255,255,0.05)",borderRadius:12,padding:4,border:"1px solid rgba(255,255,255,0.08)"}}>
      {POMO_MODES.map((m,i)=>(
        <button key={m.key} onClick={()=>switchMode(i)}
          style={{padding:"6px 12px",borderRadius:9,cursor:"pointer",fontSize:12,fontWeight:500,fontFamily:"inherit",
            background:mIdx===i?`${m.color}25`:"transparent",color:mIdx===i?m.color:"rgba(255,255,255,0.4)",
            border:mIdx===i?`1px solid ${m.color}40`:"1px solid transparent",transition:"all .2s"}}>
          {m.emoji} {m.label}
        </button>
      ))}
    </div>
    {/* Circle */}
    <div style={{position:"relative",width:132,height:132}}>
      <svg width="132" height="132" style={{transform:"rotate(-90deg)"}}>
        <circle cx="66" cy="66" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7"/>
        <circle cx="66" cy="66" r={R} fill="none" stroke={mode.color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={dash}
          style={{transition:"stroke-dashoffset .9s linear",filter:`drop-shadow(0 0 5px ${mode.color}70)`}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontSize:30,fontWeight:700,letterSpacing:-1,color:mode.color,lineHeight:1}}>{mm}:{ss2}</div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginTop:3}}>{mode.label}</div>
      </div>
    </div>
    {/* Controls */}
    <div style={{display:"flex",gap:10,alignItems:"center"}}>
      <button onClick={()=>{if(!running)POMO_BEEP(660,.08,.1);setRunning(r=>!r);}}
        style={{width:54,height:54,borderRadius:"50%",border:`1px solid ${mode.color}50`,cursor:"pointer",
          background:`${mode.color}20`,color:mode.color,fontSize:20,
          display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",
          boxShadow:running?`0 0 18px ${mode.color}40`:"none"}}>
        {running?"⏸":"▶"}
      </button>
      <button onClick={()=>switchMode(mIdx)}
        style={{width:40,height:40,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.1)",cursor:"pointer",
          background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.35)",fontSize:15,
          display:"flex",alignItems:"center",justifyContent:"center"}}>
        ↺
      </button>
    </div>
    {/* Stats */}
    <div style={{display:"flex",gap:24,fontSize:12,color:"rgba(255,255,255,0.4)"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:mode.color}}>{rounds}</div>rodadas</div>
      <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:mode.color}}>{todayMins}</div>min hoje</div>
    </div>
    {subjectName&&<div style={{fontSize:11,color:"rgba(255,255,255,0.3)"}}>Estudando: <span style={{color:"rgba(255,255,255,0.55)"}}>{subjectName}</span></div>}
  </div>);
}

function SubjectDetail({user,subj,onBack,onEdit}){
  const [tab,setTab]=useState("conteudo");
  return(<div className="fu">
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
      <div className="back" onClick={onBack}>← Matérias</div>
      <button className="btn btn-g btn-sm" onClick={onEdit}>✎ Editar</button>
    </div>
    <G tint={subj.color.tint} style={{padding:"16px 20px",marginBottom:16}}>
      <div className="row">
        <div className="dot" style={{width:12,height:12,background:subj.color.dot,boxShadow:`0 0 10px ${subj.color.glow}`}}/>
        <div style={{flex:1}}><div style={{fontSize:20,fontWeight:700,letterSpacing:-.3}}>{subj.name}</div>
          {subj.desc&&<div style={{fontSize:13,color:"var(--t2)",marginTop:2}}>{subj.desc}</div>}
        </div>
        <Pill color="#c4b5fd" label={subj.cat||"faculdade"}/>
      </div>
    </G>
    <div className="stabs">
      {[{k:"conteudo",l:"📖 Conteúdo"},{k:"anotacoes",l:"📝 Anotações"},{k:"provas",l:"⚠️ Provas"},{k:"calendario",l:"📅 Calendário"},{k:"pomodoro",l:"⏱ Pomodoro"},{k:"flashcards",l:"🃏 Flashcards"}].map(t=>(
        <button key={t.k} className={`stab ${tab===t.k?"on":""}`} onClick={()=>setTab(t.k)}>{t.l}</button>
      ))}
    </div>
    {tab==="conteudo"  &&<ContentTab   user={user} subj={subj}/>}
    {tab==="anotacoes" &&<NotesTab     user={user} subj={subj}/>}
    {tab==="provas"    &&<ProvasTab    user={user} subj={subj}/>}
    {tab==="calendario"&&<SubjCalendar user={user} subj={subj}/>}
    {tab==="pomodoro"  &&<G style={{padding:28,display:"flex",justifyContent:"center",marginTop:0}}><PomodoroTimer subjectName={subj.name}/></G>}
    {tab==="flashcards"&&<FlashcardsTab user={user} subj={subj}/>}
  </div>);
}
function ContentTab({user,subj}){
  const [items,setItems]=useState(()=>DB.get(K.contents(user.id,subj.id))||[]);
  const [modal,setModal]=useState(null);
  const [title,setTitle]=useState("");const [type,setType]=useState("aula");const [date,setDate]=useState(today());const [desc,setDesc]=useState("");const [err,setErr]=useState("");
  const save=v=>{DB.set(K.contents(user.id,subj.id),v);setItems(v);};
  const openNew=()=>{setTitle("");setType("aula");setDate(today());setDesc("");setErr("");SFX.open();setModal("new");};
  const openEdit=i=>{setTitle(i.title);setType(i.type);setDate(i.date);setDesc(i.desc||"");setErr("");setModal(i);};
  const submit=()=>{if(!title.trim()){setErr("Digite um título.");return;}
    if(modal==="new")save([...items,{id:uid(),title:title.trim(),type,date,desc,done:false}]);
    else save(items.map(i=>i.id===modal.id?{...i,title:title.trim(),type,date,desc}:i));SFX.close();setModal(null);};
  const del=id=>{save(items.filter(i=>i.id!==id));SFX.close();setModal(null);};
  const toggle=id=>save(items.map(i=>i.id===id?{...i,done:!i.done}:i));
  const sorted=[...items].sort((a,b)=>b.date.localeCompare(a.date));
  return(<div>
    <div className="sh"><h2 style={{fontSize:15,color:"var(--t2)"}}>Conteúdo estudado</h2><button className="btn btn-f btn-sm" onClick={openNew}>+ Adicionar</button></div>
    {sorted.length===0?<G><div className="empty"><div style={{fontSize:32,marginBottom:8}}>📖</div><p>Nenhum conteúdo ainda</p></div></G>
      :sorted.map(i=>{const ct=getCT(i.type);return(<div key={i.id} className="cr" onClick={()=>openEdit(i)} style={{opacity:i.done?.55:1}}>
        <div style={{fontSize:18,flexShrink:0}}>{ct.icon}</div>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:500,textDecoration:i.done?"line-through":"none"}}>{i.title}</div>
          {i.desc&&<div style={{fontSize:12,color:"var(--t2)",marginTop:2}}>{i.desc}</div>}
          <div style={{fontSize:11,color:"var(--t3)",marginTop:3}}>{ct.l} · {fmt(i.date)}</div>
        </div>
        <button className="btn btn-g btn-ico" style={{fontSize:12,flexShrink:0}} onClick={e=>{e.stopPropagation();toggle(i.id);}}>{i.done?"↩":"✓"}</button>
      </div>);})}
    {modal&&(<Modal onClose={()=>setModal(null)}><G cls="mp si" onClick={e=>e.stopPropagation()}>
      <h3 style={{marginBottom:18,fontSize:16}}>{modal==="new"?"Novo Conteúdo":"Editar"}</h3>{err&&<div className="er">{err}</div>}
      <div className="fg"><label>Título</label><input className="inp" placeholder="ex: Derivadas" value={title} onChange={e=>setTitle(e.target.value)}/></div>
      <div className="fr">
        <div className="fg" style={{marginBottom:0}}><label>Tipo</label>
          <select className="inp" value={type} onChange={e=>setType(e.target.value)}>{CTYPES.map(t=><option key={t.v} value={t.v}>{t.icon} {t.l}</option>)}</select>
        </div>
        <div className="fg" style={{marginBottom:0}}><label>Data</label><input className="inp" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      </div>
      <div className="fg" style={{marginTop:12,marginBottom:18}}><label>Descrição</label>
        <textarea className="inp" rows={3} value={desc} onChange={e=>setDesc(e.target.value)}/></div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-f" style={{flex:1}} onClick={submit}>{modal==="new"?"Criar":"Salvar"}</button>
        {modal!=="new"&&<button className="btn btn-del" onClick={()=>del(modal.id)}>Excluir</button>}
        <button className="btn btn-g" onClick={()=>setModal(null)}>Cancelar</button>
      </div>
    </G></Modal>)}
  </div>);
}
function NotesTab({user,subj}){
  const [notes,setNotes]=useState(()=>DB.get(K.notes(user.id,subj.id))||[]);
  const [modal,setModal]=useState(null);
  const [title,setTitle]=useState("");const [body,setBody]=useState("");const [err,setErr]=useState("");
  const save=v=>{DB.set(K.notes(user.id,subj.id),v);setNotes(v);};
  const openNew=()=>{setTitle("");setBody("");setErr("");SFX.open();setModal("new");};
  const openEdit=n=>{setTitle(n.title);setBody(n.body||"");setErr("");setModal(n);};
  const submit=()=>{if(!title.trim()){setErr("Digite um título.");return;}
    if(modal==="new")save([...notes,{id:uid(),title:title.trim(),body,createdAt:today()}]);
    else save(notes.map(n=>n.id===modal.id?{...n,title:title.trim(),body}:n));SFX.close();setModal(null);};
  const del=id=>{save(notes.filter(n=>n.id!==id));SFX.close();setModal(null);};
  return(<div>
    <div className="sh"><h2 style={{fontSize:15,color:"var(--t2)"}}>Anotações</h2><button className="btn btn-f btn-sm" onClick={openNew}>+ Nova</button></div>
    {notes.length===0?<G><div className="empty"><div style={{fontSize:32,marginBottom:8}}>📝</div><p>Nenhuma anotação</p></div></G>
      :[...notes].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(n=>(
        <div key={n.id} className="nc" onClick={()=>openEdit(n)}>
          <div style={{fontSize:14,fontWeight:500,marginBottom:n.body?6:0}}>{n.title}</div>
          {n.body&&<div style={{fontSize:13,color:"var(--t2)",lineHeight:1.55,whiteSpace:"pre-wrap"}}>{n.body.length>180?n.body.slice(0,180)+"…":n.body}</div>}
          <div style={{fontSize:11,color:"var(--t3)",marginTop:7}}>{fmt(n.createdAt)}</div>
        </div>
      ))}
    {modal&&(<Modal onClose={()=>setModal(null)}><G cls="mp si" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
      <h3 style={{marginBottom:18,fontSize:16}}>{modal==="new"?"Nova Anotação":"Editar"}</h3>{err&&<div className="er">{err}</div>}
      <div className="fg"><label>Título</label><input className="inp" value={title} onChange={e=>setTitle(e.target.value)}/></div>
      <div className="fg" style={{marginBottom:20}}><label>Conteúdo</label>
        <textarea className="inp" rows={7} value={body} onChange={e=>setBody(e.target.value)} style={{lineHeight:1.6}}/></div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-f" style={{flex:1}} onClick={submit}>{modal==="new"?"Salvar":"Atualizar"}</button>
        {modal!=="new"&&<button className="btn btn-del" onClick={()=>del(modal.id)}>Excluir</button>}
        <button className="btn btn-g" onClick={()=>setModal(null)}>Cancelar</button>
      </div>
    </G></Modal>)}
  </div>);
}
function ProvasTab({user,subj}){
  const [provas,setProvas]=useState(()=>DB.get(K.provas(user.id,subj.id))||[]);
  const [modal,setModal]=useState(null);
  const [title,setTitle]=useState("");const [date,setDate]=useState("");const [weight,setWeight]=useState("");const [notes,setNotes]=useState("");const [grade,setGrade]=useState("");const [err,setErr]=useState("");
  const save=v=>{DB.set(K.provas(user.id,subj.id),v);setProvas(v);};
  const openNew=()=>{setTitle("");setDate("");setWeight("");setNotes("");setGrade("");setErr("");SFX.open();setModal("new");};
  const openEdit=p=>{setTitle(p.title);setDate(p.date);setWeight(p.weight||"");setNotes(p.notes||"");setGrade(p.grade||"");setErr("");setModal(p);};
  const submit=()=>{if(!title.trim()){setErr("Título obrigatório.");return;}if(!date){setErr("Selecione a data.");return;}
    if(modal==="new")save([...provas,{id:uid(),title:title.trim(),date,weight,notes,grade}]);
    else save(provas.map(p=>p.id===modal.id?{...p,title:title.trim(),date,weight,notes,grade}:p));SFX.close();setModal(null);};
  const del=id=>{save(provas.filter(p=>p.id!==id));SFX.close();setModal(null);};
  const todayD=today();
  const upcoming=provas.filter(p=>p.date>=todayD).sort((a,b)=>a.date.localeCompare(b.date));
  const past=provas.filter(p=>p.date<todayD).sort((a,b)=>b.date.localeCompare(a.date));
  const Row=({p})=>(<div className="pr-row" onClick={()=>openEdit(p)}>
    <div style={{textAlign:"center",minWidth:44}}><div style={{fontSize:18}}>{p.date>=todayD?"📅":"📋"}</div></div>
    <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500}}>{p.title}</div>
      <div style={{fontSize:12,color:"var(--t2)",marginTop:2}}>{fmtL(p.date)}{p.weight?` · Peso ${p.weight}`:""}</div>
    </div>
    {p.grade?<div style={{fontSize:16,fontWeight:700,color:subj.color.dot}}>{p.grade}</div>
      :p.date>=todayD?<Pill color="#fda4af" label="⏳"/>:<Pill color="#cbd5e1" label="○"/>}
  </div>);
  return(<div>
    <div className="sh"><h2 style={{fontSize:15,color:"var(--t2)"}}>Provas & Avaliações</h2><button className="btn btn-f btn-sm" onClick={openNew}>+ Adicionar</button></div>
    {provas.length===0?<G><div className="empty"><div style={{fontSize:32,marginBottom:8}}>⚠️</div><p>Nenhuma prova</p></div></G>
      :<>{upcoming.length>0&&<><div className="section-label" style={{marginBottom:8}}>Próximas</div>{upcoming.map(p=><Row key={p.id} p={p}/>)}</>}
        {past.length>0&&<><div className="section-label" style={{margin:"16px 0 8px"}}>Realizadas</div>{past.map(p=><Row key={p.id} p={p}/>)}</>}
      </>}
    {modal&&(<Modal onClose={()=>setModal(null)}><G cls="mp si" onClick={e=>e.stopPropagation()}>
      <h3 style={{marginBottom:18,fontSize:16}}>{modal==="new"?"Nova Prova":"Editar"}</h3>{err&&<div className="er">{err}</div>}
      <div className="fg"><label>Título</label><input className="inp" placeholder="ex: P1 – Álgebra" value={title} onChange={e=>setTitle(e.target.value)}/></div>
      <div className="fr">
        <div className="fg" style={{marginBottom:0}}><label>Data</label><input className="inp" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div className="fg" style={{marginBottom:0}}><label>Peso</label><input className="inp" placeholder="ex: 3.0" value={weight} onChange={e=>setWeight(e.target.value)}/></div>
      </div>
      <div className="fg" style={{marginTop:12}}><label>Nota obtida</label><input className="inp" placeholder="ex: 8.5" value={grade} onChange={e=>setGrade(e.target.value)}/></div>
      <div className="fg" style={{marginBottom:20}}><label>Observações</label><textarea className="inp" rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-f" style={{flex:1}} onClick={submit}>{modal==="new"?"Criar":"Salvar"}</button>
        {modal!=="new"&&<button className="btn btn-del" onClick={()=>del(modal.id)}>Excluir</button>}
        <button className="btn btn-g" onClick={()=>setModal(null)}>Cancelar</button>
      </div>
    </G></Modal>)}
  </div>);
}
function SubjCalendar({user,subj}){
  const provas=DB.get(K.provas(user.id,subj.id))||[];const contents=DB.get(K.contents(user.id,subj.id))||[];
  const now2=new Date();const [year,setYear]=useState(now2.getFullYear());const [month,setMonth]=useState(now2.getMonth());const [sel,setSel]=useState(today());
  const fd=new Date(year,month,1).getDay();const dim=new Date(year,month+1,0).getDate();const pe=new Date(year,month,0).getDate();
  const cells=[];
  for(let i=fd-1;i>=0;i--)cells.push({d:pe-i,o:true,m:month===0?11:month-1,y:month===0?year-1:year});
  for(let d=1;d<=dim;d++)cells.push({d,o:false,m:month,y:year});
  while(cells.length<42){const d=cells.length-fd-dim+1;cells.push({d,o:true,m:month===11?0:month+1,y:month===11?year+1:year});}
  const ds=c=>`${c.y}-${String(c.m+1).padStart(2,"0")}-${String(c.d).padStart(2,"0")}`;
  const todayD=today();
  const allEvs=[...provas.map(p=>({...p,etype:"prova",color:"#fda4af"})),...contents.map(c=>({...c,etype:"content",color:subj.color.dot}))];
  const evOn=d=>allEvs.filter(e=>e.date===d);const selEvs=evOn(sel);
  const prev=()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);};
  const next=()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);};
  return(<div style={{display:"grid",gridTemplateColumns:"1fr 260px",gap:14,alignItems:"start"}}>
    <G style={{padding:20}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <button className="btn btn-g btn-ico" onClick={prev}>‹</button>
        <div style={{fontWeight:600,fontSize:14}}>{MONTHS[month]} {year}</div>
        <button className="btn btn-g btn-ico" onClick={next}>›</button>
      </div>
      <div className="cg" style={{marginBottom:4}}>{WDAYS.map((d,i)=><div key={i} style={{textAlign:"center",fontSize:10,color:"var(--t3)",fontWeight:600,padding:"2px 0"}}>{d}</div>)}</div>
      <div className="cg">{cells.map((c,i)=>{const d=ds(c);const evs=evOn(d);return(
        <div key={i} className={`cc ${d===todayD?"tod":""} ${d===sel&&d!==todayD?"sel":""} ${c.o?"oth":""}`} onClick={()=>setSel(d)}>
          {c.d}{evs.length>0&&<div className="cdots">{evs.slice(0,3).map((e,j)=><div key={j} className="cdot" style={{background:e.color}}/>)}</div>}
        </div>
      );})}</div>
    </G>
    <G style={{padding:18}}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,color:"var(--t2)",fontWeight:600,textTransform:"uppercase",letterSpacing:.4,marginBottom:3}}>{sel===todayD?"Hoje":new Date(sel+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long"})}</div>
        <div style={{fontSize:15,fontWeight:600}}>{new Date(sel+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"long"})}</div>
      </div>
      {selEvs.length===0?<div style={{color:"var(--t3)",fontSize:13,textAlign:"center",padding:"18px 0"}}>Sem eventos</div>
        :selEvs.map(e=>(<div key={e.id} style={{padding:"10px 0",borderBottom:"1px solid var(--b2)"}}>
          <div className="row" style={{marginBottom:3}}>
            <div className="dot" style={{width:7,height:7,background:e.color}}/><div style={{fontWeight:500,fontSize:13,flex:1}}>{e.title}</div>
          </div>
          <div style={{fontSize:11,color:"var(--t2)",paddingLeft:15}}>
            {e.etype==="prova"?`Prova${e.weight?` · Peso ${e.weight}`:""}`:getCT(e.type).l}
            {e.grade&&<span style={{color:subj.color.dot,marginLeft:6}}>Nota: {e.grade}</span>}
          </div>
        </div>))}
    </G>
  </div>);
}
// ── Event types for agenda ───────────────────────────────────────────────────
const AGENDA_TYPES=[
  {v:"prova",    l:"Prova",         icon:"📝", color:"#fda4af"},
  {v:"trabalho", l:"Trabalho",      icon:"📋", color:"#fcd34d"},
  {v:"aula",     l:"Aula",          icon:"📖", color:"#7dd3fc"},
  {v:"revisao",  l:"Revisão",       icon:"🔄", color:"#5eead4"},
  {v:"evento",   l:"Evento",        icon:"🎉", color:"#c4b5fd"},
  {v:"entrega",  l:"Entrega",       icon:"📬", color:"#fb923c"},
  {v:"reuniao",  l:"Reunião",       icon:"👥", color:"#a5b4fc"},
  {v:"lembrete", l:"Lembrete",      icon:"⏰", color:"#86efac"},
];
const getAT=(v)=>AGENDA_TYPES.find(t=>t.v===v)||AGENDA_TYPES[0];


// ══════════════════════════════════════════════════════════════════════════════
//  FLASHCARDS
// ══════════════════════════════════════════════════════════════════════════════
const FC_RATINGS=[
  {v:1,label:"Difícil",color:"#fda4af",emoji:"😓"},
  {v:2,label:"Ok",color:"#fcd34d",emoji:"😐"},
  {v:3,label:"Fácil",color:"#86efac",emoji:"😊"},
];

function FlashcardsTab({user,subj}){
  const KEY=`sv5_flash_${user.id}_${subj.id}`;
  const [cards,setCards]=useState(()=>DB.get(KEY)||[]);
  const [mode,setMode]=useState("list"); // list|study|new|done
  const [flip,setFlip]=useState(false);
  const [idx,setIdx]=useState(0);
  const [studied,setStudied]=useState(0);
  const [front,setFront]=useState("");
  const [back,setBack]=useState("");
  const [editCard,setEditCard]=useState(null);
  const save=v=>{DB.set(KEY,v);setCards(v);};
  const addCard=()=>{
    if(!front.trim()||!back.trim())return;
    if(editCard)save(cards.map(c=>c.id===editCard.id?{...c,front:front.trim(),back:back.trim()}:c));
    else save([...cards,{id:uid(),front:front.trim(),back:back.trim(),score:0,reviews:0}]);
    setFront("");setBack("");setEditCard(null);setMode("list");SFX.save();
  };
  const del=id=>{save(cards.filter(c=>c.id!==id));};
  const openNew=(card=null)=>{setFront(card?.front||"");setBack(card?.back||"");setEditCard(card);setMode("new");SFX.open();};
  const startStudy=()=>{
    if(!cards.length)return;
    const sorted=[...cards].sort((a,b)=>(a.score||0)-(b.score||0));
    setCards(sorted);setIdx(0);setFlip(false);setStudied(0);setMode("study");
  };
  const rate=v=>{
    const updated=cards.map((c,i)=>i===idx?{...c,score:Math.max(0,(c.score||0)+(v-2)),reviews:(c.reviews||0)+1}:c);
    save(updated);setStudied(s=>s+1);
    if(idx<cards.length-1){setIdx(i=>i+1);setFlip(false);}else setMode("done");
  };

  if(mode==="new")return(<G style={{padding:20}}>
    <div style={{fontWeight:600,fontSize:15,marginBottom:16}}>{editCard?"Editar cartão":"Novo flashcard"}</div>
    <div className="fg"><label>Pergunta / Frente</label>
      <textarea className="inp" rows={3} placeholder="ex: O que é fotossíntese?" value={front} onChange={e=>setFront(e.target.value)}/>
    </div>
    <div className="fg" style={{marginBottom:18}}><label>Resposta / Verso</label>
      <textarea className="inp" rows={3} placeholder="ex: Processo pelo qual plantas convertem luz em energia..." value={back} onChange={e=>setBack(e.target.value)}/>
    </div>
    <div style={{display:"flex",gap:8}}>
      <button className="btn btn-f" style={{flex:1}} onClick={addCard} disabled={!front.trim()||!back.trim()}>{editCard?"Salvar":"Criar"}</button>
      <button className="btn btn-g" onClick={()=>{setMode("list");setEditCard(null);}}>Cancelar</button>
    </div>
  </G>);

  if(mode==="done")return(<G style={{padding:28,textAlign:"center"}}>
    <div style={{fontSize:44,marginBottom:12}}>🎉</div>
    <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>Sessão concluída!</div>
    <div style={{fontSize:13,color:"var(--t2)",marginBottom:24}}>Você revisou {studied} cartão{studied!==1?"ões":""}</div>
    <div style={{display:"flex",gap:8,justifyContent:"center"}}>
      <button className="btn btn-f" onClick={startStudy}>Revisar de novo</button>
      <button className="btn btn-g" onClick={()=>setMode("list")}>Ver cartões</button>
    </div>
  </G>);

  if(mode==="study"){
    const cur=cards[idx];if(!cur)return null;
    return(<div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div style={{flex:1,height:4,borderRadius:2,background:"rgba(255,255,255,0.08)",overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:2,background:"#86efac",width:`${(idx/cards.length)*100}%`,transition:"width .4s"}}/>
        </div>
        <span style={{fontSize:12,color:"var(--t2)",flexShrink:0}}>{idx+1}/{cards.length}</span>
      </div>
      {/* Card flip */}
      <div onClick={()=>setFlip(f=>!f)} style={{cursor:"pointer",marginBottom:16}}>
        <div className="fc-card" style={{width:"100%",height:180,position:"relative"}}>
          <div className={`fc-inner ${flip?"flipped":""}`} style={{width:"100%",height:"100%",position:"relative"}}>
            <G cls="fc-face" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:24,height:"100%"}}>
              <div style={{fontSize:10,color:"var(--t3)",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Pergunta</div>
              <div style={{fontSize:16,fontWeight:500,lineHeight:1.5}}>{cur.front}</div>
              <div style={{fontSize:11,color:"var(--t3)",marginTop:14}}>Toque para ver a resposta</div>
            </G>
            <G cls="fc-face fc-back" tint="rgba(134,239,172,0.08)" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:24,height:"100%"}}>
              <div style={{fontSize:10,color:"#86efac",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Resposta</div>
              <div style={{fontSize:16,fontWeight:500,lineHeight:1.5}}>{cur.back}</div>
            </G>
          </div>
        </div>
      </div>
      {/* Rating */}
      <div style={{display:"flex",gap:8,opacity:flip?1:0,pointerEvents:flip?"auto":"none",transition:"opacity .3s"}}>
        {FC_RATINGS.map(r=>(
          <button key={r.v} onClick={()=>rate(r.v)}
            style={{flex:1,padding:"10px 0",borderRadius:11,border:`1px solid ${r.color}40`,background:`${r.color}15`,color:r.color,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            {r.emoji} {r.label}
          </button>
        ))}
      </div>
      <button onClick={()=>setMode("list")} style={{background:"none",border:"none",color:"var(--t3)",fontSize:12,cursor:"pointer",fontFamily:"inherit",marginTop:12,display:"block",width:"100%",textAlign:"center"}}>← Voltar</button>
    </div>);
  }

  // LIST
  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
      <div><div style={{fontWeight:600,fontSize:15}}>Flashcards</div>
        <div style={{fontSize:12,color:"var(--t2)",marginTop:2}}>{cards.length} cartão{cards.length!==1?"ões":""}</div>
      </div>
      <div style={{display:"flex",gap:8}}>
        {cards.length>0&&<button className="btn btn-join btn-sm" onClick={startStudy}>▶ Estudar</button>}
        <button className="btn btn-g btn-sm" onClick={()=>openNew()}>+ Novo</button>
      </div>
    </div>
    {cards.length===0
      ?<G><div className="empty"><div style={{fontSize:36,marginBottom:10}}>🃏</div><p style={{fontWeight:500}}>Nenhum flashcard</p><p style={{fontSize:12,color:"var(--t3)",marginTop:4}}>Crie cartões de pergunta/resposta</p></div></G>
      :<div style={{display:"flex",flexDirection:"column",gap:7}}>
        {cards.map(c=>(
          <div key={c.id} style={{padding:"11px 14px",borderRadius:11,background:"var(--card-bg)",border:"1px solid var(--b2)",display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.front}</div>
              <div style={{fontSize:12,color:"var(--t2)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.back}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              {c.reviews>0&&<span style={{fontSize:11,color:c.score>=2?"#86efac":c.score>=0?"#fcd34d":"#fda4af"}}>{c.reviews}×</span>}
              <button onClick={()=>openNew(c)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--t3)",fontSize:14,padding:"2px 5px"}}>✎</button>
              <button onClick={()=>del(c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,80,80,0.5)",fontSize:14,padding:"2px 5px"}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    }
  </div>);
}

function AgendaTab({user}){
  const subjects=DB.get(K.subjects(user.id))||[];
  const todayD=today();
  // personal events stored separately
  const [events,setEvents]=useState(()=>DB.get(`sv5_agenda_${user.id}`)||[]);
  const [modal,setModal]=useState(null);
  const [title,setTitle]=useState("");const [type,setType]=useState("prova");
  const [date,setDate]=useState(todayD);const [time,setTime]=useState("");
  const [subjId,setSubjId]=useState("");const [notes,setNotes]=useState("");
  const [err,setErr]=useState("");

  const saveEvs=v=>{DB.set(`sv5_agenda_${user.id}`,v);setEvents(v);};

  const openNew=()=>{setTitle("");setType("prova");setDate(todayD);setTime("");setSubjId("");setNotes("");setErr("");SFX.open();setModal("new");};
  const openEdit=e=>{setTitle(e.title);setType(e.type);setDate(e.date);setTime(e.time||"");setSubjId(e.subjId||"");setNotes(e.notes||"");setErr("");setModal(e);};

  const submit=()=>{
    if(!title.trim()){setErr("Digite um título.");return;}
    if(!date){setErr("Selecione a data.");return;}
    const ev={id:uid(),title:title.trim(),type,date,time,subjId,notes,done:false};
    if(modal==="new") saveEvs([...events,ev]);
    else saveEvs(events.map(e=>e.id===modal.id?{...e,...ev,id:e.id}:e));
    SFX.save();SFX.close();setModal(null);
  };
  const del=id=>{saveEvs(events.filter(e=>e.id!==id));SFX.close();setModal(null);};
  const toggleDone=id=>saveEvs(events.map(e=>e.id===id?{...e,done:!e.done}:e));

  // merge: personal agenda events + provas + contents
  const allProvas=subjects.flatMap(s=>(DB.get(K.provas(user.id,s.id))||[]).map(p=>({...p,subj:s,kind:"prova",_src:"subj"})));
  const allConts=subjects.flatMap(s=>(DB.get(K.contents(user.id,s.id))||[]).map(c=>({...c,subj:s,kind:"content",_src:"subj"})));
  const agendaEvs=events.map(e=>{const at=getAT(e.type);const s=subjects.find(s=>s.id===e.subjId);return{...e,_src:"agenda",kind:e.type,subj:s||null,_at:at};});
  const all=[...allProvas,...allConts,...agendaEvs].sort((a,b)=>a.date.localeCompare(b.date)||(a.time||"").localeCompare(b.time||""));
  const upcoming=all.filter(e=>e.date>=todayD);
  const past=all.filter(e=>e.date<todayD).reverse().slice(0,20);

  // Group upcoming by date
  const groups={};
  upcoming.forEach(e=>{(groups[e.date]=groups[e.date]||[]).push(e);});

  const Row=({e})=>{
    const isAgenda=e._src==="agenda";
    const at=isAgenda?e._at:null;
    const ct=e._src==="subj"?(e.kind==="prova"?{icon:"📝",l:"Prova",color:"#fda4af"}:{icon:"📖",l:getCT(e.type).l,color:e.subj?.color.dot||"#7dd3fc"}):null;
    const icon=isAgenda?at.icon:ct.icon;
    const color=isAgenda?at.color:ct.color;
    const label=isAgenda?at.l:ct.l;
    return(
      <div className="cr" style={{opacity:e.done?.5:1}} onClick={()=>isAgenda?openEdit(e):null}>
        <div style={{width:36,height:36,borderRadius:10,background:`${color}20`,border:`1px solid ${color}30`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{icon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:500,textDecoration:e.done?"line-through":"none"}}>{e.title}</div>
          <div style={{fontSize:12,color:"var(--t2)",marginTop:2}}>
            {e.subj&&<span style={{color:e.subj.color.dot}}>{e.subj.name} · </span>}
            <span>{label}</span>
            {e.time&&<span> · {e.time}</span>}
            {e.notes&&<span style={{color:"var(--t3)"}}> · {e.notes}</span>}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {e.grade&&<span style={{fontWeight:700,color:e.subj?.color.dot}}>{e.grade}</span>}
          {isAgenda&&(
            <button className="btn btn-g btn-ico" style={{fontSize:12}}
              onClick={ev=>{ev.stopPropagation();toggleDone(e.id);}}>
              {e.done?"↩":"✓"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return(<div className="fu">
    <div className="sh">
      <h2>Agenda</h2>
      <button className="btn btn-f btn-sm" onClick={openNew}>+ Novo Evento</button>
    </div>

    {all.length===0
      ?<G><div className="empty"><div style={{fontSize:36,marginBottom:10}}>📅</div>
        <p style={{fontWeight:500}}>Agenda vazia</p>
        <p style={{fontSize:13,color:"var(--t3)",marginTop:6}}>Crie eventos ou adicione provas nas matérias</p>
      </div></G>
      :<>
        {/* Upcoming grouped by date */}
        {Object.entries(groups).map(([d,evs])=>(
          <div key={d} style={{marginBottom:18}}>
            <div style={{fontSize:12,fontWeight:600,color:"var(--t2)",textTransform:"uppercase",letterSpacing:.4,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
              <span>{d===todayD?"● Hoje":fmtL(d)}</span>
              <div style={{flex:1,height:1,background:"var(--b2)"}}/>
            </div>
            {evs.map(e=><Row key={e.id+(e.kind||"")} e={e}/>)}
          </div>
        ))}
        {/* Past */}
        {past.length>0&&<>
          <div className="section-label" style={{margin:"20px 0 10px"}}>Histórico</div>
          {past.map(e=><Row key={e.id+(e.kind||"")} e={e}/>)}
        </>}
      </>
    }

    {modal&&(<Modal onClose={()=>setModal(null)}><G cls="mp si" onClick={e=>e.stopPropagation()}>
      <h3 style={{marginBottom:18,fontSize:16}}>{modal==="new"?"Novo Evento":"Editar Evento"}</h3>
      {err&&<div className="er">{err}</div>}

      {/* Type selector */}
      <div className="fg">
        <label>Tipo</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {AGENDA_TYPES.map(t=>(
            <div key={t.v} onClick={()=>setType(t.v)}
              style={{display:"flex",alignItems:"center",gap:5,padding:"6px 11px",borderRadius:9,cursor:"pointer",
                background:type===t.v?`${t.color}22`:"var(--card-bg)",
                border:type===t.v?`1px solid ${t.color}55`:"1px solid var(--b2)",
                transition:"all .15s",fontSize:13}}>
              <span>{t.icon}</span><span style={{color:type===t.v?t.color:"var(--t2)",fontWeight:type===t.v?600:400}}>{t.l}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="fg" style={{marginTop:4}}><label>Título</label>
        <input className="inp" placeholder={`ex: ${getAT(type).l} de Cálculo`} value={title} onChange={e=>setTitle(e.target.value)}/></div>

      <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:10,marginBottom:0}}>
        <div className="fg" style={{marginBottom:0}}><label>Data</label>
          <input className="inp" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div className="fg" style={{marginBottom:0}}><label>Horário (opcional)</label>
          <input className="inp" type="time" value={time} onChange={e=>setTime(e.target.value)}/></div>
      </div>

      {subjects.length>0&&(
        <div className="fg" style={{marginTop:12}}><label>Matéria (opcional)</label>
          <select className="inp" value={subjId} onChange={e=>setSubjId(e.target.value)}>
            <option value="">Sem matéria</option>
            {subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      <div className="fg" style={{marginBottom:20}}><label>Observações (opcional)</label>
        <input className="inp" placeholder="ex: capítulos 3 e 4" value={notes} onChange={e=>setNotes(e.target.value)}/></div>

      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-f" style={{flex:1}} onClick={submit}>{modal==="new"?"Criar":"Salvar"}</button>
        {modal!=="new"&&<button className="btn btn-del" onClick={()=>del(modal.id)}>Excluir</button>}
        <button className="btn btn-g" onClick={()=>setModal(null)}>Cancelar</button>
      </div>
    </G></Modal>)}
  </div>);
}
