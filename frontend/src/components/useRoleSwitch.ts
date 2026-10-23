import type { KeyboardEventHandler, MouseEventHandler } from 'react'
import type { Role } from '../protocol/snapshot'

type RoleSwitch = {
  sentence: string
  label: string
  press: {
    onClick: MouseEventHandler<HTMLButtonElement>
    onKeyDown: KeyboardEventHandler<HTMLButtonElement>
  }
}

// The header's two switches press through this; each is one element whose label changes, so
// keyboard focus survives the switch.
export function useRoleSwitch(role: Role, onSwitch: (role: Role) => void): RoleSwitch {
  const facilitator = role === 'Facilitator'
  return {
    sentence: facilitator ? 'You are a facilitator.' : 'You are a voter.',
    label: facilitator ? 'Switch to voter' : 'Switch to facilitator',
    press: {
      // A double-click's second click would switch back once the first switch re-renders.
      onClick: e => {
        if (e.detail <= 1) onSwitch(facilitator ? 'Voter' : 'Facilitator')
      },
      // A held Enter repeats its click the same way.
      onKeyDown: e => {
        if (e.repeat && e.key === 'Enter') e.preventDefault()
      }
    }
  }
}
