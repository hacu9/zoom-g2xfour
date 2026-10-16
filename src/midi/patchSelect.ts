/**
 * Patch select = Bank Select (CC 0 = 0, CC 32 = bank) + Program Change, on
 * channel 1. The pedal sends the same three messages when you change patch
 * by foot, and in reply to 33. It does not write: the pedal just loads the
 * stored patch. Auto-save keeps any edit to the patch you leave.
 */
export function patchSelect(slot: number, perBank: number): number[][] {
  if (!Number.isInteger(slot) || slot < 0 || perBank <= 0) throw new RangeError(`bad slot ${slot}`);
  const bank = Math.floor(slot / perBank);
  const program = slot % perBank;
  if (bank > 0x7f || program > 0x7f) throw new RangeError(`slot ${slot} is out of the MIDI range`);
  return [
    [0xb0, 0x00, 0x00],
    [0xb0, 0x20, bank],
    [0xc0, program],
  ];
}

/** Next slot up or down, wrapping at the ends like the pedal. */
export function stepSlot(slot: number, delta: number, count: number): number {
  return (((slot + delta) % count) + count) % count;
}
