import { createClient } from '@supabase/supabase-js'

// ─── Supabase client ──────────────────────────────────────────────────────────
// Preencha o arquivo .env com suas credenciais (veja .env.example)
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const FOUNDER_EMAIL = import.meta.env.VITE_FOUNDER_EMAIL || 'admin@studyvieira.com'
export const FOUNDER_PASS  = import.meta.env.VITE_FOUNDER_PASS  || 'SV@Admin2025!'

export const authSignUp = async (name, email, password) => {
  const { data, error } = await supabase.auth.signUp({ email, password,
    options: { data: { name } }
  })
  if (error) throw error
  // Insert profile row
  await supabase.from('profiles').upsert({
    id: data.user.id, name, email, bio: '', avatar_url: null
  })
  return data.user
}

export const authSignIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export const authSignOut = () => supabase.auth.signOut()

export const getSession = async () => {
  const { data } = await supabase.auth.getSession()
  return data.session?.user ?? null
}

export const onAuthChange = (cb) => supabase.auth.onAuthStateChange((_e, s) => cb(s?.user ?? null))

// ─── Profiles ─────────────────────────────────────────────────────────────────
export const getProfile = async (userId) => {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return data || {}
}

export const updateProfile = async (userId, updates) => {
  const { error } = await supabase.from('profiles').upsert({ id: userId, ...updates })
  if (error) throw error
}

export const uploadAvatar = async (userId, file) => {
  const ext  = file.name.split('.').pop()
  const path = `avatars/${userId}.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
}

export const listUsers = async () => {
  const { data } = await supabase.from('profiles').select('id, name, email, bio, avatar_url')
  return data || []
}

// ─── Admins ───────────────────────────────────────────────────────────────────
export const getAdmins = async () => {
  const { data } = await supabase.from('admins').select('email')
  return (data || []).map(r => r.email)
}

export const addAdmin = async (email) => {
  const { error } = await supabase.from('admins').insert({ email })
  if (error) throw error
}

export const removeAdmin = async (email) => {
  await supabase.from('admins').delete().eq('email', email)
}

export const isAdminEmail = async (email) => {
  if (email === FOUNDER_EMAIL) return true
  const { data } = await supabase.from('admins').select('email').eq('email', email).single()
  return !!data
}

// ─── Bans ─────────────────────────────────────────────────────────────────────
export const getBan = async (userId) => {
  const { data } = await supabase.from('bans')
    .select('*').eq('user_id', userId).single()
  if (!data) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    await supabase.from('bans').delete().eq('user_id', userId)
    return null
  }
  return data
}

export const banUser = async ({ userId, reason, bannedBy, expiresAt, type }) => {
  await supabase.from('bans').upsert({
    user_id: userId, reason, banned_by: bannedBy,
    banned_at: new Date().toISOString(),
    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    type
  })
}

export const unbanUser = async (userId) => {
  await supabase.from('bans').delete().eq('user_id', userId)
}

export const getAllBans = async () => {
  const { data } = await supabase.from('bans').select('*')
  return data || []
}

// ─── Global Posts (Avisos) ────────────────────────────────────────────────────
export const getPosts = async () => {
  const { data } = await supabase.from('posts')
    .select('*').order('created_at', { ascending: false })
  return data || []
}

export const createPost = async (post) => {
  const { error } = await supabase.from('posts').insert({
    title: post.title, body: post.body, tag: post.tag,
    pinned: post.pinned, author_name: post.authorName,
    author_email: post.authorEmail
  })
  if (error) throw error
}

export const updatePost = async (id, updates) => {
  await supabase.from('posts').update(updates).eq('id', id)
}

export const deletePost = async (id) => {
  await supabase.from('posts').delete().eq('id', id)
}

// ─── Communities ──────────────────────────────────────────────────────────────
export const getCommunities = async () => {
  const { data } = await supabase.from('communities').select('*').order('created_at')
  return data || []
}

export const createCommunity = async (comm) => {
  const { data, error } = await supabase.from('communities').insert({
    name: comm.name, type: comm.type, description: comm.desc,
    icon: comm.icon, created_by: comm.createdBy
  }).select().single()
  if (error) throw error
  return data
}

export const deleteCommunity = async (id) => {
  await supabase.from('communities').delete().eq('id', id)
}

export const joinCommunity = async (userId, communityId) => {
  await supabase.from('memberships').upsert({ user_id: userId, community_id: communityId })
}

export const leaveCommunity = async (userId, communityId) => {
  await supabase.from('memberships').delete()
    .eq('user_id', userId).eq('community_id', communityId)
}

export const getUserCommunities = async (userId) => {
  const { data } = await supabase.from('memberships')
    .select('community_id').eq('user_id', userId)
  return (data || []).map(r => r.community_id)
}

export const getCommunityMembers = async (communityId) => {
  const { data } = await supabase.from('memberships')
    .select('user_id').eq('community_id', communityId)
  return (data || []).map(r => r.user_id)
}

export const isMember = async (userId, communityId) => {
  const { data } = await supabase.from('memberships')
    .select('user_id').eq('user_id', userId).eq('community_id', communityId).single()
  return !!data
}

// ─── Community Posts ───────────────────────────────────────────────────────────
export const getCommunityPosts = async (communityId) => {
  const { data } = await supabase.from('community_posts')
    .select('*').eq('community_id', communityId).order('created_at', { ascending: false })
  return data || []
}

export const createCommunityPost = async (post) => {
  const { error } = await supabase.from('community_posts').insert({
    community_id: post.communityId, title: post.title, body: post.body,
    tag: post.tag, pinned: post.pinned, author_name: post.authorName
  })
  if (error) throw error
}

export const updateCommunityPost = async (id, updates) => {
  await supabase.from('community_posts').update(updates).eq('id', id)
}

export const deleteCommunityPost = async (id) => {
  await supabase.from('community_posts').delete().eq('id', id)
}

// ─── Follows ──────────────────────────────────────────────────────────────────
export const followUser = async (followerId, followingId) => {
  await supabase.from('follows').upsert({ follower_id: followerId, following_id: followingId })
}

export const unfollowUser = async (followerId, followingId) => {
  await supabase.from('follows').delete()
    .eq('follower_id', followerId).eq('following_id', followingId)
}

export const getFollowing = async (userId) => {
  const { data } = await supabase.from('follows')
    .select('following_id').eq('follower_id', userId)
  return (data || []).map(r => r.following_id)
}

export const getFollowers = async (userId) => {
  const { data } = await supabase.from('follows')
    .select('follower_id').eq('following_id', userId)
  return (data || []).map(r => r.follower_id)
}

export const checkFollowing = async (followerId, followingId) => {
  const { data } = await supabase.from('follows')
    .select('follower_id').eq('follower_id', followerId).eq('following_id', followingId).single()
  return !!data
}

// ─── Subjects ─────────────────────────────────────────────────────────────────
export const getSubjects = async (userId) => {
  const { data } = await supabase.from('subjects')
    .select('*').eq('user_id', userId).order('created_at')
  return data || []
}

export const createSubject = async (userId, subj) => {
  const { data, error } = await supabase.from('subjects').insert({
    user_id: userId, name: subj.name, description: subj.desc,
    color_id: subj.color.id, color_dot: subj.color.dot,
    color_glow: subj.color.glow, color_tint: subj.color.tint,
    category: subj.cat
  }).select().single()
  if (error) throw error
  return data
}

export const updateSubject = async (id, subj) => {
  await supabase.from('subjects').update({
    name: subj.name, description: subj.desc,
    color_id: subj.color.id, color_dot: subj.color.dot,
    color_glow: subj.color.glow, color_tint: subj.color.tint,
    category: subj.cat
  }).eq('id', id)
}

export const deleteSubject = async (id) => {
  await supabase.from('subjects').delete().eq('id', id)
}

// ─── Contents ─────────────────────────────────────────────────────────────────
export const getContents = async (subjectId) => {
  const { data } = await supabase.from('contents')
    .select('*').eq('subject_id', subjectId).order('date', { ascending: false })
  return data || []
}

export const createContent = async (subjectId, item) => {
  const { data, error } = await supabase.from('contents').insert({
    subject_id: subjectId, title: item.title,
    type: item.type, date: item.date, description: item.desc, done: false
  }).select().single()
  if (error) throw error
  return data
}

export const updateContent = async (id, updates) => {
  await supabase.from('contents').update(updates).eq('id', id)
}

export const deleteContent = async (id) => {
  await supabase.from('contents').delete().eq('id', id)
}

// ─── Notes ────────────────────────────────────────────────────────────────────
export const getNotes = async (subjectId) => {
  const { data } = await supabase.from('notes')
    .select('*').eq('subject_id', subjectId).order('created_at', { ascending: false })
  return data || []
}

export const createNote = async (subjectId, note) => {
  const { data, error } = await supabase.from('notes').insert({
    subject_id: subjectId, title: note.title, body: note.body
  }).select().single()
  if (error) throw error
  return data
}

export const updateNote = async (id, updates) => {
  await supabase.from('notes').update(updates).eq('id', id)
}

export const deleteNote = async (id) => {
  await supabase.from('notes').delete().eq('id', id)
}

// ─── Provas ───────────────────────────────────────────────────────────────────
export const getProvas = async (subjectId) => {
  const { data } = await supabase.from('provas')
    .select('*').eq('subject_id', subjectId).order('date')
  return data || []
}

export const createProva = async (subjectId, prova) => {
  const { data, error } = await supabase.from('provas').insert({
    subject_id: subjectId, title: prova.title, date: prova.date,
    weight: prova.weight || null, notes: prova.notes || null, grade: prova.grade || null
  }).select().single()
  if (error) throw error
  return data
}

export const updateProva = async (id, updates) => {
  await supabase.from('provas').update(updates).eq('id', id)
}

export const deleteProva = async (id) => {
  await supabase.from('provas').delete().eq('id', id)
}
