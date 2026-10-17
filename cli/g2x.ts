/**
 * g2x: the editor's pedal code without a browser. Runs on Windows Node (the
 * pedal's MIDI ports live there, WSL cannot see them); scripts/g2x starts it
 * from WSL. Every write keeps the app's rules: a full backup first (saved to a
 * file), Empty slots only, and a fresh read of the slot right before the write.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { displayValue, effectById } from '../src/catalog/g2four';
import { autoSelect } from '../src/midi/backend';
import { readBankInfo, readSlot } from '../src/midi/backup';
import { IDENTITY_REQUEST, isIdentityReply, parseIdentityReply } from '../src/midi/identity';
import type { RawPatch } from '../src/midi/ptcf';
import { restoreEntry } from '../src/midi/restore';
import { ProbeSession } from '../src/midi/session';
import { parseSyx } from '../src/midi/syx';
import { DEFAULT_ZOOM_ID } from '../src/midi/zoom';
import { applyPlan, readCurrentSlot, selectSlot } from '../src/recipe/apply';
import { BUILT_IN } from '../src/recipe/builtin';
import { translate } from '../src/recipe/translate';
import type { ToneRecipe } from '../src/recipe/types';
import { findRecipe, parseArgs, parseSlot, ranges, type Args } from './args';
import { requestJzzMidi } from './jzz-backend';
import { nameOf, policyFrom, saveFullBackup } from './ops';

const HELP = `g2x — Zoom G2X FOUR from the command line (unofficial)

  g2x ports                     list the MIDI ports
  g2x info                      identity, patch count, current slot
  g2x read <slot>               one patch: name, effects, knobs, tempo
  g2x select <slot>             switch the pedal to a patch
  g2x backup                    read all patches, save .syx + .json
  g2x list [file.syx]           patch names from the newest backup (offline)
  g2x recipes                   the built-in recipes
  g2x write <recipe> <slot>     recipe = number, patch name, song, or a .json file
  g2x restore <file.syx> <from> <to> [--confirm <to>]

  --out <dir>    where backups go (default: ./backups)
  --verbose      print every MIDI message sent

Writes go only to Empty slots. Each write runs a full backup first.
Restoring over a real patch needs --confirm with the target slot number.`;

const DEVICE = DEFAULT_ZOOM_ID;
const BAD_WARNING = /not in the catalog|has no knob|no gain knob|cannot take|dropped/i;

function say(text = '') {
  process.stdout.write(`${text}\n`);
}

async function connect(args: Args): Promise<ProbeSession> {
  const midi = await requestJzzMidi();
  if (!midi.sysexEnabled) throw new Error('SysEx is not enabled on this MIDI system.');
  const input = autoSelect(midi.inputs());
  const output = autoSelect(midi.outputs());
  if (!input || !output) throw new Error('No ZOOM G2/G2X FOUR MIDI port. Plug the pedal in with USB and try again.');
  const verbose = args.flags.has('--verbose');
  const session = new ProbeSession(input, output, {
    onIn: () => {},
    onOut: (_bytes, _cls, label) => verbose && process.stderr.write(`→ ${label}\n`),
  });
  await session.open();
  return session;
}

function describe(p: RawPatch | null | undefined): string[] {
  if (!p) return ['  (could not decode)'];
  const lines = [`  name   ${p.name?.trimEnd() ?? p.shortName}`, `  tempo  ${p.tempo ?? '?'} BPM`];
  for (const e of p.effects) {
    const fx = effectById(e.id);
    if (!fx) {
      if (e.id !== 0) lines.push(`  ${e.slot + 1}. effect ${e.id.toString(16)} (not in the catalog)`);
      continue;
    }
    const knobs = fx.parameters
      .map((param, i) => (param.name.startsWith('Hidden') ? null : `${param.name} ${displayValue(param, e.params[i] ?? 0)}`))
      .filter(Boolean)
      .join(', ');
    lines.push(`  ${e.slot + 1}. ${e.on ? '' : '(off) '}${fx.name}: ${knobs}`);
  }
  return lines;
}

async function fullBackup(session: ProbeSession, args: Args) {
  const bk = await saveFullBackup(session, DEVICE, backupDir(args), (n, count) => process.stderr.write(`\rbackup ${n}/${count}`));
  process.stderr.write('\n');
  say(`Saved ${bk.file}.`);
  return bk;
}

function backupDir(args: Args): string {
  const out = args.flags.get('--out');
  return typeof out === 'string' ? out : join(process.cwd(), 'backups');
}

function printNames(entries: { slot: number; name: string }[]) {
  const empty = entries.filter((e) => e.name === 'Empty').map((e) => e.slot);
  for (const e of entries) if (e.name !== 'Empty') say(`${String(e.slot).padStart(3)}  ${e.name}`);
  say(`Empty: ${ranges(empty)}`);
}

function loadRecipe(query: string): ToneRecipe {
  if (/\.json$/i.test(query)) return JSON.parse(readFileSync(query, 'utf8')) as ToneRecipe;
  const r = findRecipe(query);
  if (!r) throw new Error(`No single built-in recipe matches "${query}". Run "g2x recipes" and use its number.`);
  return r;
}

async function run(args: Args): Promise<number> {
  const [a, b, c] = args.positional;
  switch (args.command) {
    case 'help':
    case '--help':
      say(HELP);
      return 0;

    case 'recipes':
      BUILT_IN.forEach((x, i) => say(`${String(i).padStart(2)}  ${((x.recipe as ToneRecipe).patchName ?? '').padEnd(15)} ${x.label}`));
      return 0;

    case 'list': {
      const file = a ?? newestBackup(backupDir(args));
      say(`From ${file}`);
      printNames(parseSyx(new Uint8Array(readFileSync(file)), 10));
      return 0;
    }

    case 'ports': {
      const midi = await requestJzzMidi();
      say(`SysEx: ${midi.sysexEnabled ? 'on' : 'off'}`);
      midi.inputs().forEach((p) => say(`in   ${p.name}`));
      midi.outputs().forEach((p) => say(`out  ${p.name}`));
      return 0;
    }
  }

  // Check the recipe before touching the pedal.
  const recipe = args.command === 'write' && a ? loadRecipe(a) : null;
  const session = await connect(args);
  switch (args.command) {
    case 'info': {
      const id = await session.request(IDENTITY_REQUEST, 'identity', isIdentityReply, 1500);
      const parsed = id ? parseIdentityReply(id) : null;
      const { count, perBank } = await readBankInfo(session, DEVICE);
      const current = await readCurrentSlot(session, DEVICE, perBank);
      say(`port     ${session.portNames.input}`);
      say(`identity ${parsed ? `${parsed.manufacturerName}, family ${parsed.family.toString(16)}, member ${parsed.member.toString(16)}, version ${parsed.versionAscii}` : 'no reply'}`);
      say(`patches  ${count} (${perBank} per bank)`);
      say(`current  ${current ?? 'unknown'}`);
      return 0;
    }

    case 'read': {
      const { count, perBank } = await readBankInfo(session, DEVICE);
      const slot = parseSlot(a, count);
      const d = await readSlot(session, DEVICE, slot, perBank);
      say(`slot ${slot} (bank ${d.bank}, program ${d.program})`);
      describe(d.patch).forEach((l) => say(l));
      return d.patch ? 0 : 1;
    }

    case 'select': {
      const { count, perBank } = await readBankInfo(session, DEVICE);
      const slot = parseSlot(a, count);
      const ok = await selectSlot(session, DEVICE, slot, perBank);
      say(ok ? `On slot ${slot}.` : `The pedal did not confirm slot ${slot}.`);
      return ok ? 0 : 1;
    }

    case 'backup': {
      const bk = await fullBackup(session, args);
      printNames(bk.dumps.map((d) => ({ slot: d.slot, name: nameOf(d) })));
      return 0;
    }

    case 'write': {
      if (!recipe || b === undefined) throw new Error('Usage: g2x write <recipe> <slot>');
      const plan = translate(recipe);
      const bad = plan.warnings.filter((w) => BAD_WARNING.test(w));
      plan.warnings.forEach((w) => say(`warning: ${w}`));
      if (bad.length) throw new Error('The recipe does not translate cleanly. Nothing written.');
      const bk = await fullBackup(session, args);
      const slot = parseSlot(b, bk.count);
      const current = await readCurrentSlot(session, DEVICE, bk.perBank);
      const policy = policyFrom(bk, current);
      if (!policy.scratchSlots.has(slot)) throw new Error(`Slot ${slot} holds "${policy.slotNames?.get(slot)}", not Empty. Nothing written.`);
      say(`Writing "${plan.name}" to slot ${slot}…`);
      const r = await applyPlan(session, DEVICE, plan, slot, current ?? slot, policy);
      r.steps.forEach((s) => say(`  ${s}`));
      r.mismatches.forEach((m) => say(`  MISMATCH ${m}`));
      say(r.ok ? `"${plan.name}" → slot ${slot}: written and verified.` : `"${plan.name}" → slot ${slot}: written with mismatches.`);
      return r.ok ? 0 : 2;
    }

    case 'restore': {
      if (!a || b === undefined || c === undefined) throw new Error('Usage: g2x restore <file.syx> <from> <to> [--confirm <to>]');
      const bk = await fullBackup(session, args);
      const to = parseSlot(c, bk.count);
      const src = parseSyx(new Uint8Array(readFileSync(a)), bk.perBank).find((e) => e.slot === parseSlot(b, bk.count));
      if (!src) throw new Error(`${a} has no patch for slot ${b}.`);
      const current = await readCurrentSlot(session, DEVICE, bk.perBank);
      // Unknown means it could be `to`, and auto-save could undo the restore.
      if (current === null) throw new Error('Could not read which slot the pedal is on. Nothing written.');
      const policy = policyFrom(bk, current);
      const confirmed = args.flags.get('--confirm') === String(to);
      if (!policy.scratchSlots.has(to) && !confirmed) {
        throw new Error(`Slot ${to} holds "${policy.slotNames?.get(to)}". To overwrite it, add --confirm ${to}.`);
      }
      say(`Slot ${to} holds "${policy.slotNames?.get(to)}" → restoring "${src.name}" from slot ${src.slot}…`);
      const r = await restoreEntry(session, DEVICE, src, to, policy, confirmed);
      say(r.verified ? `Restore verified: slot ${to} now holds "${r.name}", byte for byte.` : `Restore sent, but slot ${to} reads back as "${r.name}" and the bytes differ.`);
      return r.verified ? 0 : 2;
    }

    default:
      say(HELP);
      return 1;
  }
}

function newestBackup(dir: string): string {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^g2xfour-backup-.*\.syx$/.test(f)).sort() : [];
  if (!files.length) throw new Error(`No backup in ${dir}. Run "g2x backup" first.`);
  return join(dir, files[files.length - 1]);
}

run(parseArgs(process.argv.slice(2))).then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`\nerror: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  },
);
