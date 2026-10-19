import type { AddonButton, AddonPart, PulseAddon } from '../types'
import { isObj } from './config'

// The add-on contract Pulse draws. A value on a newer contract may carry
// fields Pulse does not know, so it is left out rather than half drawn.
export const ADDON_CONTRACT = 1

const isText = (v: unknown): v is string => typeof v === 'string' && v !== ''

const part = (v: unknown): AddonPart | null =>
  isObj(v) && isText(v.color) && typeof v.text === 'string'
    ? { color: v.color, text: v.text, ...(v.dim === true ? { dim: true as const } : {}) }
    : null

const parts = (v: unknown): AddonPart[] | null => {
  if (!Array.isArray(v)) return null
  const all = v.map(part)
  return all.every(p => p !== null) ? (all as AddonPart[]) : null
}

const button = (v: unknown): AddonButton | null =>
  isObj(v) && isText(v.key) && isText(v.label) && isText(v.command)
    ? { key: v.key, label: v.label, command: v.command, ...(v.primary === true ? { primary: true as const } : {}) }
    : null

const buttons = (v: unknown): AddonButton[] => {
  if (!Array.isArray(v)) return []
  return v.map(button).filter((b): b is AddonButton => b !== null)
}

// Another plugin's value, checked: a well-formed contract-1 add-on, or null.
// A malformed part drops that part (or button), never the whole bar.
export const readAddon = (raw: unknown): PulseAddon | null => {
  if (!isObj(raw) || raw.contract !== ADDON_CONTRACT) return null
  const prompt = isObj(raw.prompt) ? raw.prompt : null
  const promptParts = prompt ? parts(prompt.parts) : null
  const stat = raw.stat === null ? null : parts(raw.stat)
  const at = raw.buttonsAt
  const short = stat !== null && Array.isArray(raw.short) ? parts(raw.short) : null
  return {
    contract: ADDON_CONTRACT,
    stat,
    // Only a short form that can take the buttons where the stat does.
    short: short !== null && (typeof at !== 'number' || at <= short.length) ? short : null,
    label: typeof raw.label === 'string' ? raw.label : '',
    buttons: buttons(raw.buttons),
    // Inline only at a place inside a stat that is there; else the button row.
    buttonsAt: stat !== null && Number.isInteger(at) && (at as number) >= 0 && (at as number) <= stat.length ? (at as number) : null,
    prompt: prompt && promptParts ? { parts: promptParts, buttons: buttons(prompt.buttons) } : null,
  }
}

// A button's command as `$.command.run` takes it: name and arguments.
export const splitCommand = (command: string) => {
  const [name = '', ...rest] = command.trim().replace(/^\//, '').split(/\s+/)
  return { command: name, args: rest.join(' ') }
}
