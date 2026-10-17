/**
 * The write gate. classify() blocks every write; this module lets exactly four
 * verified write shapes through, under a policy:
 *   - slot upload   45 00 00 <bank 2> <program 2> <len 2> <PTCF 7-bit> <CRC 5>
 *   - param edit    64 20 00 <slot 0-7> <param> <value 5 septets>
 *   - name edit     64 20 00 5F <index> <ASCII> 00 00 00 00
 *   - patch tempo   64 20 00 64 02 <bpm 2> 00 00 00 (40-250)
 * Shapes verified on a G2X FOUR on 2026-10-15 (see docs/g2x-four-protocol.md).
 * AUTO-SAVE IS ON on the test pedal: an edit persists once the patch changes.
 */
import { patchBytesFromSlotDump } from './backup';
import { validateMidiMessage } from './hex';
import { parsePTCF } from './ptcf';
import { isZoomSysex, zoomBody } from './zoom';

export interface WritePolicy {
  /** A full backup ran in this session. No write without it. */
  backupTaken: boolean;
  /** Slots that held "Empty" in that backup. Free to write. */
  scratchSlots: ReadonlySet<number>;
  /** The slot the pedal is on, from 64 26 / program change. Null = unknown. */
  currentSlot: number | null;
  perBank: number;
  /** Total stored patches (07 / 44 reply). */
  patchCount: number;
  /** User ticked "edit real patches". */
  allowRealPatchEdits: boolean;
  /** A non-scratch slot the user confirmed by typing its number, for one restore. */
  confirmedSlot: number | null;
  /** What this tab believes each slot holds (backup + its own writes). A write checks the pedal against it. */
  slotNames?: ReadonlyMap<number, string>;
}

/**
 * The writable ("scratch") slots after a write. A recipe write keeps its slot
 * writable (you may write it again); a restore keeps it only when it put
 * "Empty" back, because a restored patch is a real one.
 */
export function writableAfter(cur: ReadonlySet<number>, slot: number, name: string, kind: 'recipe' | 'restore'): Set<number> {
  const next = new Set(cur);
  if (kind === 'recipe' || name.trimEnd() === 'Empty') next.add(slot);
  else next.delete(slot);
  return next;
}

export type WriteKind = 'slot-upload' | 'param-edit' | 'name-edit' | 'tempo';
export type WriteCheck = { ok: true; kind: WriteKind; slot: number } | { ok: false; reason: string };

const isData = (b: number) => b >= 0 && b <= 0x7f;
/** The pedal's own rename burst used indexes 0-13 (14 characters). */
const MAX_NAME_INDEX = 32;
const MAX_PARAM = 2 + 19;

export function shapeOf(bytes: number[]): { kind: WriteKind; body: number[] } | null {
  if (validateMidiMessage(bytes) || !isZoomSysex(bytes)) return null;
  const b = zoomBody(bytes);
  if (b[0] === 0x45 && b[1] === 0x00 && b[2] === 0x00 && b.length > 9 && b.length < 1200) return { kind: 'slot-upload', body: b };
  if (b.length === 10 && b[0] === 0x64 && b[1] === 0x20 && b[2] === 0x00) {
    if (b[3] === 0x5f && b[4] < MAX_NAME_INDEX && b.slice(6).every((x) => x === 0) && b[5] >= 0x20 && b[5] < 0x7f) return { kind: 'name-edit', body: b };
    // Patch tempo only (64 20 00 64 02). Every other 64 20 00 64 xx stays blocked.
    if (b[3] === 0x64 && b[4] === 0x02 && b.slice(7).every((x) => x === 0)) {
      const bpm = b[5] | (b[6] << 7);
      if (bpm >= 40 && bpm <= 250) return { kind: 'tempo', body: b };
    }
    // slot 0-7, param 0 (on/off), 1 (effect id) or 2+knob (max 19 knobs); value < 2^29.
    if (b[3] <= 0x07 && b[4] <= MAX_PARAM && b.slice(4).every(isData) && b[9] < 0x02) return { kind: 'param-edit', body: b };
  }
  return null;
}

export function classifyWrite(bytes: number[], p: WritePolicy): WriteCheck {
  const shape = shapeOf(bytes);
  if (!shape) return { ok: false, reason: 'Not one of the four verified write shapes.' };
  if (!p.backupTaken) return { ok: false, reason: 'Run "Back up all patches" first. No writes without a backup from this session.' };

  if (shape.kind === 'slot-upload') {
    const b = shape.body;
    const bank = b[3] | (b[4] << 7);
    const program = b[5] | (b[6] << 7);
    if (program >= p.perBank) return { ok: false, reason: `Program ${program} is out of range (${p.perBank} per bank).` };
    const slot = bank * p.perBank + program;
    if (slot >= p.patchCount) return { ok: false, reason: `Slot ${slot} does not exist (${p.patchCount} patches).` };
    const declared = b[7] | (b[8] << 7);
    const data = patchBytesFromSlotDump(bytes) ?? [];
    if (data.length !== declared) return { ok: false, reason: `Upload is truncated: ${data.length} of ${declared} bytes.` };
    const patch = parsePTCF(data);
    if (!patch) return { ok: false, reason: 'Upload payload is not a valid PTCF patch.' };
    if (!p.scratchSlots.has(slot) && p.confirmedSlot !== slot) {
      return { ok: false, reason: `Slot ${slot} holds a real patch. Type its number to confirm the overwrite.` };
    }
    return { ok: true, kind: 'slot-upload', slot };
  }

  const slot = p.currentSlot;
  if (slot === null) return { ok: false, reason: 'Unknown current patch. Read it first (33 or a patch change).' };
  if (!p.scratchSlots.has(slot) && !p.allowRealPatchEdits) {
    return { ok: false, reason: `The pedal is on slot ${slot}, a real patch, and auto-save is ON. Tick "edit real patches" to allow it.` };
  }
  return { ok: true, kind: shape.kind, slot };
}

/** 64 20 00 <slot> <param> <value as 5 little-endian septets> (zoom-explorer setEffectParameterForCurrentPatch). */
export function paramEdit(deviceId: number, slot: number, param: number, value: number): number[] {
  const v = [0, 7, 14, 21, 28].map((s) => Math.floor(value / 2 ** s) & 0x7f);
  return [0xf0, 0x52, 0x00, deviceId, 0x64, 0x20, 0x00, slot, param, ...v, 0xf7];
}

export function tempoEdit(deviceId: number, bpm: number): number[] {
  return [0xf0, 0x52, 0x00, deviceId, 0x64, 0x20, 0x00, 0x64, 0x02, bpm & 0x7f, (bpm >> 7) & 0x7f, 0, 0, 0, 0xf7];
}

export function nameEdit(deviceId: number, index: number, char: string): number[] {
  return [0xf0, 0x52, 0x00, deviceId, 0x64, 0x20, 0x00, 0x5f, index, char.charCodeAt(0), 0, 0, 0, 0, 0xf7];
}

/** Re-target a slot dump to another bank/program. The CRC covers only the patch data. */
export function retargetSlotDump(msg: ArrayLike<number>, slot: number, perBank: number): number[] {
  const m = Array.from(msg);
  const bank = Math.floor(slot / perBank);
  const prog = slot % perBank;
  m.splice(7, 4, bank & 0x7f, (bank >> 7) & 0x7f, prog & 0x7f, (prog >> 7) & 0x7f);
  return m;
}
