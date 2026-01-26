// server/utils/date.js
function isoDate(d = new Date()) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function daysBetweenInclusive(startISO, endISO) {
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const diff = Math.floor((e - s) / 86400000);
  return diff + 1;
}

function weeksBetweenInclusive(startISO, endISO) {
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");

  const sDay = (s.getDay() + 6) % 7; // Mon=0..Sun=6
  const eDay = (e.getDay() + 6) % 7;

  const sMon = new Date(s);
  sMon.setDate(s.getDate() - sDay);

  const eMon = new Date(e);
  eMon.setDate(e.getDate() - eDay);

  const diffWeeks = Math.floor((eMon - sMon) / (86400000 * 7));
  return diffWeeks + 1;
}

module.exports = { isoDate, daysBetweenInclusive, weeksBetweenInclusive };
