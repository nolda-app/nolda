# 이메일·비밀번호 자체 로그인 (임시 비활성화)

카카오·구글 소셜 로그인은 백엔드와 연동되어 실제로 동작하지만, 자사 서비스 자체의
이메일·비밀번호 회원가입/로그인은 아직 백엔드가 없는 로컬 흉내(mock)였습니다.
실 서비스 운영 전까지 [`frontend/src/planner/PlannerApp.tsx`](../frontend/src/planner/PlannerApp.tsx)의
`AuthScreen`에서 관련 UI와 로직을 주석 처리해뒀습니다. 지우지 않고 그대로 남겨뒀으니,
백엔드에 이메일 회원가입/로그인 API가 붙으면 아래 순서대로 주석만 해제하면 됩니다.

## 재활성화 체크리스트

1. `PlannerApp` 컴포넌트 내부 `submitAuth` 함수 주석 해제
   (이메일 형식·비밀번호 길이 검증 후 로컬 `auth.user` 설정)
2. `<AuthScreen auth={auth} setAuth={setAuth} />` 호출부에 `submitAuth={submitAuth}` prop 다시 전달
3. `AuthScreen` 함수 시그니처에 `submitAuth: () => void` 파라미터 다시 추가
4. `AuthScreen` 안의 `emailBd`/`pwBd` 테두리 색상 계산 두 줄 주석 해제
5. `AuthScreen` JSX 안, 이름/이메일/비밀번호 `<Field>` + 제출 버튼(`pl-cta`) 블록 주석 해제
6. `AuthScreen` 아래 `Field` 컴포넌트 함수 전체 주석 해제
7. `AuthScreen` 하단 `pl-authfoot` (로그인/회원가입 전환 링크) 블록 주석 해제
8. 실제 API 연동 시 `submitAuth`가 백엔드 회원가입/로그인 엔드포인트를 호출하도록 교체
   (현재는 백엔드 호출 없이 입력값만으로 로컬 상태를 채우는 임시 로직)

## 주석 처리된 코드 원본

### `PlannerApp` 내부 — `submitAuth`

```tsx
const submitAuth = () => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(auth.email)) return setAuth({ error: '이메일 주소를 다시 확인해 주세요.' })
  if (auth.pw.length < 8) return setAuth({ error: '비밀번호는 8자 이상으로 입력해 주세요.' })
  setAuth({ user: { name: auth.name || auth.email.split('@')[0], email: auth.email }, error: '', pw: '' })
}
```

### `AuthScreen` 호출부

```tsx
<AuthScreen auth={auth} setAuth={setAuth} submitAuth={submitAuth} />
```

### `AuthScreen` 함수 시그니처

```tsx
function AuthScreen({ auth, setAuth, submitAuth }: {
  auth: AuthState
  setAuth: (o: Partial<AuthState>) => void
  submitAuth: () => void
}) {
```

### `AuthScreen` 내부 — 테두리 색상

```tsx
const emailBd = auth.error.includes('이메일') ? '#e0574a' : 'rgba(20,24,33,.1)'
const pwBd = auth.error.includes('비밀번호') ? '#e0574a' : 'rgba(20,24,33,.1)'
```

### `AuthScreen` JSX — 입력 폼 + 제출 버튼

```tsx
<div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 11 }}>
  {signup && (
    <Field label="이름" value={auth.name} onChange={(v) => setAuth({ name: v, error: '' })} placeholder="어떻게 부를까요?" />
  )}
  <Field label="이메일" value={auth.email} onChange={(v) => setAuth({ email: v, error: '' })} placeholder="you@example.com" borderColor={emailBd} type="email" />
  <Field label="비밀번호" value={auth.pw} onChange={(v) => setAuth({ pw: v, error: '' })} placeholder="8자 이상" borderColor={pwBd} type="password" />
  {auth.error && <div className="pl-error">{auth.error}</div>}
</div>

<div className="pl-cta" onClick={submitAuth}>{signup ? '가입하고 시작하기' : '로그인'}</div>
```

이 블록이 활성화되면, 화면 하단에 따로 추가해둔
`{auth.error && <div className="pl-error" style={{ marginTop: 28 }}>{auth.error}</div>}`
(소셜 로그인 실패 메시지를 폼 없이도 보여주기 위한 임시용)는 중복되므로 제거할 것.

### `Field` 컴포넌트

```tsx
function Field({ label, value, onChange, placeholder, borderColor, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; borderColor?: string; type?: string
}) {
  return (
    <div>
      <div className="pl-field-label">{label}</div>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="pl-input" style={{ borderColor: borderColor || 'rgba(20,24,33,.1)' }}
      />
    </div>
  )
}
```

### `AuthScreen` 하단 — 로그인/회원가입 전환 링크 (`pl-authfoot`)

```tsx
<div className="pl-authfoot">
  <span style={{ color: 'rgba(20,24,33,.5)' }}>{signup ? '이미 계정이 있나요? ' : '처음이신가요? '}</span>
  <span className="pl-link" onClick={() => setAuth({ mode: signup ? 'login' : 'signup', error: '' })}>{signup ? '로그인' : '회원가입'}</span>
</div>
```
