/**
 * dsh-model-select-search — host-side no-op.
 * This plugin is client-only; the host entry exists only to satisfy the
 * plugin manifest schema. All behavior lives in src/client/index.ts.
 * @module dsh-model-select-search
 */
import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'

export const name = 'dsh-model-select-search'
export const inject: string[] = []
export const Config = z.object({})
export function apply(_ctx: Context): void {
  /* Client-only plugin — no host-side behavior. */
}