// ─────────────────────────────────────────────────────────────────────────────
//  db/localStorage.js
//  Camada de dados local (usado no artifact / desenvolvimento sem Supabase)
// ─────────────────────────────────────────────────────────────────────────────

export const DB = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)) ?? null; } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

export const K = {
  users:       "sv5_users",
  session:     "sv5_session",
  admins:      "sv5_admins",
  posts:       "sv5_posts",
  follows:     "sv5_follows",
  bans:        "sv5_bans",
  communities: "sv5_communities",
  memberships: "sv5_memberships",
  cposts:      "sv5_cposts",
  subjects:    (u)    => `sv5_subj_${u}`,
  contents:    (u, s) => `sv5_cont_${u}_${s}`,
  notes:       (u, s) => `sv5_note_${u}_${s}`,
  provas:      (u, s) => `sv5_prov_${u}_${s}`,
  profile:     (u)    => `sv5_prof_${u}`,
};

export const FOUNDER      = "admin@studyvieira.com";
export const FOUNDER_PASS = "SV@Admin2025!";
export const FOUNDER_ID   = "sv_founder_001";

// Garante que a conta do fundador sempre existe
export const seedFounder = () => {
  const users = DB.get(K.users) || {};
  if (!users[FOUNDER]) {
    DB.set(K.users, {
      ...users,
      [FOUNDER]: { id: FOUNDER_ID, name: "Admin Study Vieira", email: FOUNDER, pass: FOUNDER_PASS }
    });
  }
};

// ── Perfis ────────────────────────────────────────────────────────────────────
export const getProfile   = (uid) => DB.get(K.profile(uid)) || {};
export const saveProfile  = (uid, p) => DB.set(K.profile(uid), p);

// ── Admin ─────────────────────────────────────────────────────────────────────
export const isAdmin = (u) =>
  u && (u.email === FOUNDER || (DB.get(K.admins) || []).includes(u.email));

// ── Bans ─────────────────────────────────────────────────────────────────────
export const getBan = (userId) => {
  const bans = DB.get(K.bans) || [];
  const ban  = bans.find(b => b.userId === userId);
  if (!ban) return null;
  if (ban.expiresAt && ban.expiresAt < Date.now()) {
    DB.set(K.bans, bans.filter(b => b.userId !== userId));
    return null;
  }
  return ban;
};
export const isBanned = (userId) => !!getBan(userId);

// ── Follows ───────────────────────────────────────────────────────────────────
export const getFollows   = ()        => DB.get(K.follows) || [];
export const isFollowing  = (a, b)    => getFollows().some(f => f.followerId === a && f.followingId === b);
export const getFollowers = (uid)     => getFollows().filter(f => f.followingId === uid).map(f => f.followerId);
export const getFollowing = (uid)     => getFollows().filter(f => f.followerId  === uid).map(f => f.followingId);
export const getFriends   = (uid)     => getFollowing(uid).filter(id => isFollowing(id, uid));
export const toggleFollow = (me, them) => {
  const fs = getFollows();
  const ex = fs.some(f => f.followerId === me && f.followingId === them);
  DB.set(K.follows, ex
    ? fs.filter(f => !(f.followerId === me && f.followingId === them))
    : [...fs, { followerId: me, followingId: them, ts: Date.now() }]
  );
};

// ── Communities ───────────────────────────────────────────────────────────────
export const getCommunities   = ()           => DB.get(K.communities) || [];
export const getMemberships   = ()           => DB.get(K.memberships) || [];
export const getUserComms     = (uid)        => getMemberships().filter(m => m.userId === uid).map(m => m.communityId);
export const getCommMembers   = (cid)        => getMemberships().filter(m => m.communityId === cid).map(m => m.userId);
export const isInComm         = (uid, cid)   => getMemberships().some(m => m.userId === uid && m.communityId === cid);
export const joinComm         = (uid, cid)   => {
  if (isInComm(uid, cid)) return;
  DB.set(K.memberships, [...getMemberships(), { userId: uid, communityId: cid, joinedAt: Date.now() }]);
};
export const leaveComm        = (uid, cid)   =>
  DB.set(K.memberships, getMemberships().filter(m => !(m.userId === uid && m.communityId === cid)));
export const getCPosts        = (cid)        =>
  (DB.get(K.cposts) || []).filter(p => p.communityId === cid).sort((a, b) => b.createdAt - a.createdAt);
export const getGlobalPosts   = ()           =>
  (DB.get(K.posts) || []).sort((a, b) => b.createdAt - a.createdAt);
