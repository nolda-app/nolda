// 유튜브 구글 로그인으로 페이지를 떠났다 돌아올 때, 고른 사진 파일을 잃지 않도록 IndexedDB에 잠깐 보관
// (File은 sessionStorage에 못 넣지만 IndexedDB에는 그대로 저장됨 · 사진은 이 기기 밖으로 나가지 않음)
const DB = 'nolda', STORE = 'pending', KEY = 'photos'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function stashPhotos(files: File[]) {
  try { await run('readwrite', (s) => s.put(files, KEY)) } catch { /* 저장 못 하면 돌아와서 사진만 다시 고르면 됨 */ }
}

/** 보관한 사진을 꺼내고 지움 (없으면 빈 배열) */
export async function takePhotos(): Promise<File[]> {
  try {
    const files = await run<File[] | undefined>('readonly', (s) => s.get(KEY))
    await run('readwrite', (s) => s.delete(KEY))
    return files || []
  } catch {
    return []
  }
}
