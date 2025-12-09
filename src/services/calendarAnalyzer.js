// src/services/calendarAnalyzer.js
/**
 * Calendar Analyzer Service
 *
 * This module transforms raw calendar events into a structured
 * per-user/per-day view of "busy" and "free" time blocks.
 *
 * Input:
 *   - A normalized list of events from the calendar API.
 *   - A configuration object defining workday boundaries and block thresholds.
 *
 * Output:
 *   - An array of objects:
 *     {
 *       email: string,
 *       date: string (YYYY-MM-DD),
 *       blocks: Array<{
 *         type: "busy" | "free",
 *         title?: string,
 *         from: string,          // HH:MM
 *         to: string,            // HH:MM
 *         duration: number,      // minutes
 *         isLong?: boolean       // only for busy blocks
 *       }>
 *     }
 */

/**
 * Analyzes a list of calendar events and returns time blocks grouped by user and day.
 *
 * @param {Array<{
 *   calendarId: string;
 *   start: string;
 *   end: string;
 *   allDay?: boolean;
 *   summary?: string;
 * }>} events - List of normalized events from the calendar API.
 * @param {Object} config - Configuration object.
 * @param {string} config.workdayStart - Workday start time in HH:MM format.
 * @param {string} config.workdayEnd - Workday end time in HH:MM format.
 * @param {number} config.minBlockMinutes - Minimum block length in minutes (currently unused here but preserved for compatibility).
 * @param {number} config.maxStandardBlockMinutes - Threshold for marking busy blocks as "long".
 * @returns {Array<{
 *   email: string;
 *   date: string;
 *   blocks: Array<{
 *     type: "busy" | "free";
 *     title?: string;
 *     from: string;
 *     to: string;
 *     duration: number;
 *     isLong?: boolean;
 *   }>;
 * }>} Analysis result grouped by user and day.
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
/**
 * Groups events by user (calendarId) and date.
 *
 * The grouping key has the format:
 *   `${calendarId}__${YYYY-MM-DD}`
 *
 * @param {Array<{
 *   calendarId: string;
 *   start: string;
 *   end: string;
 *   allDay?: boolean;
 *   summary?: string;
 * }>} events - List of normalized events.
 * @returns {Record<string, Array<any>>} A map where keys are "email__date" and values are arrays of events.
 */
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
/**
 * Parses a group key of the form "email__YYYY-MM-DD" into its components.
 *
 * @param {string} key - Composite key containing email and date.
 * @returns {{ email: string; date: string }} The extracted email and date.
 */
function parseGroupKey(key) {
  const [email, date] = key.split("__");
  return { email, date };
}

/**
 * Extracts the date portion (YYYY-MM-DD) from an ISO datetime string.
 *
 * @param {string} isoString - ISO datetime string (e.g. "2025-01-01T09:00:00Z").
 * @returns {string} Date component in YYYY-MM-DD format.
 */
function extractDate(isoString) {
  return isoString.split("T")[0];
}

/** -------------------- DAY ANALYSIS -------------------- **/
/**
 * Builds the list of busy and free blocks for a single day.
 *
 * The function:
 * 1. Builds a workday range from config (workdayStart/workdayEnd).
 * 2. Filters and normalizes events that intersect with the workday.
 * 3. Converts events to "busy" blocks.
 * 4. Fills gaps between busy blocks with "free" blocks.
 *
 * @param {Array<{
 *   start: string;
 *   end: string;
 *   allDay?: boolean;
 *   summary?: string;
 * }>} events - Events for a single user and day.
 * @param {string} date - Date string in YYYY-MM-DD format.
 * @param {Object} config - Analyzer configuration.
 * @param {string} config.workdayStart - Workday start time in HH:MM.
 * @param {string} config.workdayEnd - Workday end time in HH:MM.
 * @param {number} config.maxStandardBlockMinutes - Threshold for marking a busy block as long.
 * @returns {Array<{
 *   type: "busy" | "free";
 *   title?: string;
 *   from: string;
 *   to: string;
 *   duration: number;
 *   isLong?: boolean;
 * }>} Ordered list of time blocks for the day.
 */
function analyzeDayBlocks(events, date, config) {
  const { workdayStart, workdayEnd, maxStandardBlockMinutes } = config;

  // Crear fecha completa para rango laboral
  const workStart = new Date(`${date}T${workdayStart}:00`);
  const workEnd = new Date(`${date}T${workdayEnd}:00`);

  // Convertir eventos a bloques "busy"
  const busyBlocks = events
    .filter((ev) => !ev.allDay) // ignoramos all-day por simplicidad
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
/**
 * Builds a "busy" block representation from a raw block object.
 *
 * @param {{ start: Date; end: Date; title?: string }} block - Normalized busy block.
 * @param {number} maxStandardBlockMinutes - Threshold in minutes to flag a block as long.
 * @returns {{
 *   type: "busy";
 *   title: string;
 *   from: string;
 *   to: string;
 *   duration: number;
 *   isLong: boolean;
 * }} The final busy block object used in reports.
 */
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

/**
 * Builds a "free" block representation for a given time range.
 *
 * @param {Date} start - Start of the free interval.
 * @param {Date} end - End of the free interval.
 * @returns {{
 *   type: "free";
 *   from: string;
 *   to: string;
 *   duration: number;
 * }} The final free block object used in reports.
 */
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
/**
 * Formats a Date object into HH:MM 24-hour time.
 *
 * @param {Date} dateObj - Date to be formatted.
 * @returns {string} Time string in HH:MM format.
 */
function formatTime(dateObj) {
  const h = String(dateObj.getHours()).padStart(2, "0");
  const m = String(dateObj.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
