import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

/**
 * Supabase Auth는 이메일 형식을 필요로 하므로
 * 사용자가 입력한 ID를 내부 이메일로 변환합니다.
 * (예: "admin" → "admin@productpro.app")
 */
function toEmail(id: string): string {
  if (id.includes('@')) return id
  return `${id}@productpro.app`
}

/** 로그인 */
export async function signIn(id: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toEmail(id.trim()),
    password,
  })
  if (error) {
    return { session: null, error: '아이디 또는 비밀번호가 올바르지 않습니다.' }
  }
  return { session: data.session, error: null }
}

/** 회원가입 */
export async function signUp(id: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email: toEmail(id.trim()),
    password,
    options: {
      data: {
        display_name: displayName,
        username: id.trim(),
      },
    },
  })
  if (error) {
    if (error.message.includes('already registered')) {
      return { error: '이미 사용 중인 아이디입니다.' }
    }
    return { error: error.message }
  }
  // email confirmation 비활성화 시 session이 즉시 발급됨
  return { session: data.session, error: null }
}

/** 로그아웃 */
export async function signOut() {
  await supabase.auth.signOut()
}

/** 현재 세션 반환 */
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

/** 세션에서 표시 이름 반환 */
export function getDisplayName(session: Session | null): string {
  if (!session) return 'admin'
  return (
    session.user.user_metadata?.display_name ||
    session.user.user_metadata?.username ||
    session.user.email?.split('@')[0] ||
    'admin'
  )
}

/** 세션에서 아이디(username) 반환 */
export function getUsername(session: Session | null): string {
  if (!session) return 'admin'
  return (
    session.user.user_metadata?.username ||
    session.user.email?.split('@')[0] ||
    'admin'
  )
}
