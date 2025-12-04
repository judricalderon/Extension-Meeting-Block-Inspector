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
  console.log("[Calendar-Analytics] fetchEventsForUser →", calendarId);

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
 * Fetch events for multiple calendars in parallel.
 * Devuelve:
 *  - events: todos los eventos de los calendarios que sí se pudieron leer
 *  - failures: lista de calendarios que fallaron
 *
 * @param {string[]} calendarIds
 * @param {{ start: string, end: string }} dateRange
 * @param {string} accessToken
 * @returns {Promise<{ events: Array<Object>, failures: Array<Object> }>}
 */
export async function fetchEventsForUsers(calendarIds, dateRange, accessToken) {
  console.log("[Calendar-Analytics] fetchEventsForUsers →", calendarIds);

  const failures = [];

  const promises = calendarIds.map(async (id) => {
    try {
      return await fetchEventsForUser(id, dateRange, accessToken);
    } catch (err) {
      console.error(
        "[Calendar-Analytics] Failed fetching events for calendar:",
        id,
        err
      );
      failures.push({
        calendarId: id,
        status: err.status || null,
        reason:
          err.status === 404
            ? "not_found_or_no_access"
            : err.status === 403
            ? "forbidden"
            : "other_error",
        message: err.message || "Calendar could not be read"
      });
      return [];
    }
  });

  const results = await Promise.all(promises);
  const events = results.flat();

  return { events, failures };
}

/**
 * Perform an authenticated GET request and parse JSON.
 * En 404/403 lanzamos error con status para poder registrar la falla.
 */
async function fetchJsonWithAuth(url, accessToken) {
  console.log("[Calendar-Analytics] API call →", url);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error(
      `[Calendar-Analytics] Calendar API error ${res.status}:`,
      bodyText
    );

    const error = new Error(`Calendar API error: ${res.status}`);
    error.status = res.status;
    error.body = bodyText;
    throw error;
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
    start, // ISO string
    end,   // ISO string
    allDay,
    raw: ev // original event (optional)
  };
}
