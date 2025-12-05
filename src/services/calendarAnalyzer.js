// src/services/calendarAnalyzer.js

/**
 * Main analyzer function.
 * @param {Array} events - list of normalized events from calendarApi
 * @param {Object} config - workdayStart, workdayEnd, minBlockMinutes, maxStandardBlockMinutes
 * @returns {Array} array of { email, date, blocks: [...] }
 */
export function analyzeCalendar(events, config) {
  if (!events || events.length === 0) return [];

  // 1. Agrupar por usuario y día
  const grouped = groupEventsByUserAndDay(events);

  // 2. Analizar cada usuario/día
  const results = [];

  for (const key of Object.keys(grouped)) {
    const { email, date } = parseGroupKey(key);
    const dayEvents = grouped[key];

    const blocks = analyzeDayBlocks(dayEvents, date, config);
    results.push({ email, date, blocks });
  }

  return results;
}

/** -------------------- GROUPING -------------------- **/

function groupEventsByUserAndDay(events) {
  const map = {};

  for (const ev of events) {
    if (!ev.start || !ev.end) continue;

    const dateKey = extractDate(ev.start); // "YYYY-MM-DD"
    const key = `${ev.calendarId}__${dateKey}`;

    if (!map[key]) map[key] = [];
    map[key].push(ev);
  }

  // Ordenar cada día por hora de inicio
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  return map;
}

function parseGroupKey(key) {
  const [email, date] = key.split("__");
  return { email, date };
}

function extractDate(isoString) {
  return isoString.split("T")[0];
}

/** -------------------- DAY ANALYSIS -------------------- **/

function analyzeDayBlocks(events, date, config) {
  const { workdayStart, workdayEnd, maxStandardBlockMinutes } = config;

  // Crear fecha completa para rango laboral
  const workStart = new Date(`${date}T${workdayStart}:00`);
  const workEnd = new Date(`${date}T${workdayEnd}:00`);

  // Convertir eventos a bloques "busy"
  const busyBlocks = events
    .filter((ev) => !ev.allDay) // ignoramos all-day por simplicidad, puedes extenderlo luego
    .map((ev) => ({
      type: "busy",
      title: ev.summary || "",
      start: new Date(ev.start),
      end: new Date(ev.end)
    }))
    // Mantener solo los eventos que intersectan con horario laboral
    .filter((block) => block.end > workStart && block.start < workEnd)
    // Recortar a los límites del horario laboral
    .map((block) => ({
      ...block,
      start: new Date(Math.max(block.start, workStart)),
      end: new Date(Math.min(block.end, workEnd))
    }));

  // Crear lista final combinando busy + free
  const allBlocks = [];

  // Pointer inicial: inicio laboral
  let cursor = new Date(workStart);

  for (const block of busyBlocks) {
    // 1. Si hay un hueco antes del evento → FREE
    if (block.start > cursor) {
      const freeBlock = buildFreeBlock(cursor, block.start);
      if (freeBlock.duration > 0) {
        allBlocks.push(freeBlock);
      }
    }

    // 2. Evento ocupado
    const busy = buildBusyBlock(block, maxStandardBlockMinutes);
    allBlocks.push(busy);

    // Mover cursor
    cursor = new Date(block.end);
  }

  // 3. Hueco final luego del último evento
  if (cursor < workEnd) {
    const freeBlock = buildFreeBlock(cursor, workEnd);
    if (freeBlock.duration > 0) {
      allBlocks.push(freeBlock);
    }
  }

  return allBlocks;
}

/** -------------------- BLOCK BUILDERS -------------------- **/

function buildBusyBlock(block, maxStandardBlockMinutes) {
  const duration = (block.end - block.start) / 60000; // ms → min

  return {
    type: "busy",
    title: block.title,
    from: formatTime(block.start),
    to: formatTime(block.end),
    duration,
    isLong: duration > maxStandardBlockMinutes
  };
}

function buildFreeBlock(start, end) {
  const duration = (end - start) / 60000;
  return {
    type: "free",
    from: formatTime(start),
    to: formatTime(end),
    duration
  };
}

/** -------------------- UTILITIES -------------------- **/

function formatTime(dateObj) {
  const h = String(dateObj.getHours()).padStart(2, "0");
  const m = String(dateObj.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
