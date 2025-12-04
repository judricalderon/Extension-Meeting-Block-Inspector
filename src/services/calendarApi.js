// src/services/calendarApi.js

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * Fetch events for a single calendar (email) within a given date range.
 *
 * @param {string} calendarId - Usually the user email (e.g. user@company.com)
 * @param {{ start: string, end: string }} dateRange - ISO strings
 * @param {string} accessToken - Google OAuth access token
 * @returns {Promise<Array<Object>>} Normalized events
 */
export async function fetchEventsForUser(calendarId, dateRange, accessToken) {
  const encodedCalendarId = encodeURIComponent(calendarId);

  const params = new URLSearchParams({
    timeMin: dateRange.start,
    timeMax: dateRange.end,
    singleEvents: "true",
    orderBy: "startTime",
    showDeleted: "false"
  });

  let url = `${CALENDAR_API_BASE}/calendars/${encodedCalendarId}/events?${params.toString()}`;
  let allEvents = [];
  let pageToken = null;

  do {
    const pageUrl = pageToken ? `${url}&pageToken=${pageToken}` : url;
    const data = await fetchJsonWithAuth(pageUrl, accessToken);

    const items = Array.isArray(data.items) ? data.items : [];
    const normalized = items
      .filter((ev) => ev.status !== "cancelled")
      .map((ev) => normalizeEvent(ev, calendarId));

    allEvents = allEvents.concat(normalized);
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return allEvents;
}

/**
 * Convenience function: fetch events for multiple calendars in parallel.
 *
 * @param {string[]} calendarIds
 * @param {{ start: string, end: string }} dateRange
 * @param {string} accessToken
 * @returns {Promise<Array<Object>>} Array of events (with calendarId attached)
 */
export async function fetchEventsForUsers(calendarIds, dateRange, accessToken) {
  const promises = calendarIds.map((id) =>
    fetchEventsForUser(id, dateRange, accessToken)
  );

  const results = await Promise.all(promises);
  // results es un array de arrays → aplastamos en uno solo
  return results.flat();
}

/**
 * Perform an authenticated GET request and parse JSON.
 */
async function fetchJsonWithAuth(url, accessToken) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[Calendar-Analytics] Calendar API error:", res.status, text);
    throw new Error(`Calendar API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Normalizes a Google Calendar event into the shape we want to use
 * in the analyzer.
 *
 * @param {Object} ev - Raw Google event
 * @param {string} calendarId
 * @returns {Object} Normalized event
 */
function normalizeEvent(ev, calendarId) {
  const startObj = ev.start || {};
  const endObj = ev.end || {};

  // All-day events sometimes use 'date' instead of 'dateTime'
  const start = startObj.dateTime || startObj.date || null;
  const end = endObj.dateTime || endObj.date || null;

  const allDay = Boolean(startObj.date && !startObj.dateTime);

  return {
    calendarId,
    eventId: ev.id,
    summary: ev.summary || "",
    description: ev.description || "",
    start,        // ISO string
    end,          // ISO string
    allDay,
    raw: ev       // opcional, por si luego quieres más campos
  };
}
