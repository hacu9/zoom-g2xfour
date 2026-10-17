import rain from './recipes/rain-rob-scallon.json';
import ftbClean from './recipes/metallica-fade-to-black-clean.json';
import ftbDist from './recipes/metallica-fade-to-black-dist.json';
import oneClean from './recipes/metallica-one-clean.json';
import oneDist from './recipes/metallica-one-dist.json';
import mopClean from './recipes/metallica-master-of-puppets-clean.json';
import mopDist from './recipes/metallica-master-of-puppets-dist.json';
import tdtncClean from './recipes/metallica-day-that-never-comes-clean.json';
import tdtncDist from './recipes/metallica-day-that-never-comes-dist.json';
import sandmanClean from './recipes/metallica-enter-sandman-clean.json';
import sandmanDist from './recipes/metallica-enter-sandman-dist.json';
import nemClean from './recipes/metallica-nothing-else-matters-clean.json';
import nemDist from './recipes/metallica-nothing-else-matters-dist.json';
import reptilia from './recipes/strokes-reptilia.json';
import loveSong from './recipes/scouting-for-girls-this-aint-a-love-song.json';
import teQuiero from './recipes/hombres-g-te-quiero.json';
import devuelveme from './recipes/hombres-g-devuelveme-a-mi-chica.json';
import brightside from './recipes/killers-mr-brightside.json';
import dancefloor from './recipes/arctic-monkeys-dancefloor.json';
import akfg from './recipes/akfg-crunch.json';
import wind from './recipes/akeboshi-wind.json';
import coralineClean from './recipes/maneskin-coraline-clean.json';
import coralineDist from './recipes/maneskin-coraline-dist.json';

/** The recipes the app ships, in menu order. */
export const BUILT_IN: { label: string; recipe: unknown }[] = [
  { label: 'Rain — Rob Scallon', recipe: rain },
  { label: 'Fade to Black (clean) — Metallica', recipe: ftbClean },
  { label: 'Fade to Black (distorted) — Metallica', recipe: ftbDist },
  { label: 'One (clean) — Metallica', recipe: oneClean },
  { label: 'One (distorted) — Metallica', recipe: oneDist },
  { label: 'Master of Puppets (clean) — Metallica', recipe: mopClean },
  { label: 'Master of Puppets (distorted) — Metallica', recipe: mopDist },
  { label: 'The Day That Never Comes (clean) — Metallica', recipe: tdtncClean },
  { label: 'The Day That Never Comes (distorted) — Metallica', recipe: tdtncDist },
  { label: 'Enter Sandman (clean intro) — Metallica', recipe: sandmanClean },
  { label: 'Enter Sandman (distorted) — Metallica', recipe: sandmanDist },
  { label: 'Nothing Else Matters (clean) — Metallica', recipe: nemClean },
  { label: 'Nothing Else Matters (distorted) — Metallica', recipe: nemDist },
  { label: 'Reptilia — The Strokes', recipe: reptilia },
  { label: "This Ain't a Love Song (estimate) — Scouting for Girls", recipe: loveSong },
  { label: 'Te quiero — Hombres G', recipe: teQuiero },
  { label: 'Devuélveme a mi chica — Hombres G', recipe: devuelveme },
  { label: 'Mr. Brightside — The Killers', recipe: brightside },
  { label: 'I Bet You Look Good on the Dancefloor — Arctic Monkeys', recipe: dancefloor },
  { label: 'Haruka Kanata / Rewrite — Asian Kung-Fu Generation', recipe: akfg },
  { label: 'Wind — Akeboshi', recipe: wind },
  { label: 'Coraline (clean) — Måneskin', recipe: coralineClean },
  { label: 'Coraline (distorted) — Måneskin', recipe: coralineDist },
];
