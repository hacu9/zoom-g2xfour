/** Lower case, accents removed: "Måneskin" and "maneskin" match. */
export const foldText = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "2026-10-17T19-55-41-740Z": a timestamp that is safe in a Windows file name. */
export const fileStamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-');
