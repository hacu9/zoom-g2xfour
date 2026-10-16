/**
 * PHASE 2 — design only. Nothing imports this yet.
 * The G2X FOUR chain: up to 6 effect slots + 1 pedal slot, amp/cab models,
 * output EQ. Field layout follows the user-facing model, not the wire format;
 * src/patch/codec/ maps between the two once the probe reveals the bytes.
 */
export const MAX_EFFECT_SLOTS = 6;

export interface EffectInstance {
  /** Key into the parameter catalog (src/catalog). */
  effectId: string;
  enabled: boolean;
  /** Parameter name -> value, in the catalog's units and ranges. */
  params: Record<string, number>;
}

export interface OutputEq {
  low: number;
  mid: number;
  high: number;
}

export interface Patch {
  /** Slot number on the pedal, when known. */
  index?: number;
  name: string;
  level: number;
  tempoBpm?: number;
  /** Signal order, at most MAX_EFFECT_SLOTS. Amp/cab models live in this list. */
  slots: EffectInstance[];
  /** The expression-pedal effect slot. */
  pedal?: EffectInstance;
  outputEq?: OutputEq;
}
