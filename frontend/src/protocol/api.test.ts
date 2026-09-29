import { describe, expect, it } from 'vitest'
import { ApiError, isSessionRefusal } from './api'

describe('isSessionRefusal', () => {
  it('holds for a 401 only', () => {
    expect(isSessionRefusal(new ApiError('vote', 401))).toBe(true)
    expect(isSessionRefusal(new ApiError('vote', 403))).toBe(false)
    expect(isSessionRefusal(new ApiError('vote', 409))).toBe(false)
    expect(isSessionRefusal(new Error('vote answered 401'))).toBe(false)
    expect(isSessionRefusal(new TypeError('Failed to fetch'))).toBe(false)
  })
})
