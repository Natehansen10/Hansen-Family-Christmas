import type { Board, Claim, ClaimStatus, LedgerRow, Unfurled, Wish, WishInput } from '../../shared/types'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message)
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('No connection. Check your signal and try again.', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? 'Something went wrong.', res.status, data.code)
  return data as T
}

export const api = {
  board: () => call<Board>('GET', '/api/board'),
  claimToken: (tokenId: string, personId: string, code?: string) =>
    call<{ personId: string }>('POST', '/api/session', { action: 'claim', tokenId, personId, code }),
  verify: (personId: string, code: string) => call<{ personId: string }>('POST', '/api/session', { action: 'verify', personId, code }),
  signOut: () => call<{ ok: true }>('DELETE', '/api/session'),
  addWish: (input: WishInput) => call<{ wish: Wish }>('POST', '/api/wishes', input),
  editWish: (id: string, patch: Partial<WishInput>) => call<{ wish: Wish }>('PATCH', `/api/wishes?id=${encodeURIComponent(id)}`, patch),
  removeWish: (id: string) => call<{ ok: true }>('DELETE', `/api/wishes?id=${encodeURIComponent(id)}`),
  claim: (wishId: string, action: 'claim' | 'release' | 'status', status?: ClaimStatus) =>
    call<{ wishId: string; claim: Claim | null }>('POST', '/api/claims', { wishId, action, status }),
  ledger: () => call<{ rows: LedgerRow[] }>('GET', '/api/ledger'),
  unfurl: (url: string) => call<Unfurled>('POST', '/api/unfurl', { url }),
}
