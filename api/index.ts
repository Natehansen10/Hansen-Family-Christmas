import { handle } from '../server/app.js'

// One function serves every /api/* route (see the rewrite in vercel.json).
export const GET = handle
export const POST = handle
export const PATCH = handle
export const DELETE = handle
