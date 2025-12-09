/**
 * Calendar API Service
 *
 * This module wraps calls to the Google Calendar v3 API and exposes
 * higher-level helpers to:
 * - Fetch events for a single calendar.
 * - Fetch events for multiple calendars in parallel.
 * - Normalize raw Google Calendar events into a unified internal shape.
 */
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * Fetches events for a single calendar (usually a user email) within
 * a given date range.
 *
 * The function:
 * - Calls the Google Calendar Events list endpoint.
 * - Handles pagination via nextPageToken.
 * - Filters out cancelled events.
 * - Normalizes the remaining events for downstream processing.
 *
 * @param {string} calendarId - Calendar identifier, usually a user email (e.g. user@company.com).
 * @param {{ start: string, end: string }} dateRange - Date range with ISO strings for timeMin/timeMax.
 * @param {string} accessToken - Google OAuth access token.
 * @returns {Promise<Array<Object>>} A list of normalized events.
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
 * Fetches events for multiple calendars in parallel.
 *
 * For each calendar ID:
 * - Attempts to fetch events using fetchEventsForUser.
 * - On failure, records a structured failure entry and continues.
 *
 * The returned object contains:
 * - events: All events from calendars that were successfully read.
 * - failures: A list of calendar IDs that could not be read, with a reason and message.
 *
 * @param {string[]} calendarIds - List of calendar IDs (usually user emails).
 * @param {{ start: string, end: string }} dateRange - Date range with ISO strings.
 * @param {string} accessToken - Google OAuth access token.
 * @returns {Promise<{ events: Array<Object>, failures: Array<{
 *   calendarId: string;
 *   status: number | null;
 *   reason: "not_found_or_no_access" | "forbidden" | "other_error";
 *   message: string;
 * }> }>}
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
 * Performs an authenticated GET request and parses the JSON response.
 *
 * If the response is not OK (non-2xx):
 * - Logs the response body for debugging.
 * - Throws an Error object enriched with:
 *   - status: HTTP status code
 *   - body: raw response body text
 *
 * This allows callers to distinguish 403/404 errors when tracking failures.
 *
 * @param {string} url - Fully resolved URL for the Calendar API endpoint.
 * @param {string} accessToken - Google OAuth access token.
 * @returns {Promise<any>} Parsed JSON response.
 * @throws {Error} When the HTTP response is not successful.
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
 * Normalizes a raw Google Calendar event into the shape used by the analyzer.
 *
 * Normalization rules:
 * - Uses `dateTime` when present, otherwise falls back to `date` (all-day events).
 * - Derives an `allDay` boolean based on the presence of `date` vs `dateTime`.
 * - Preserves the original event object in the `raw` property for debugging or extensions.
 *
 * @param {Object} ev - Raw Google Calendar event object.
 * @param {string} calendarId - The calendar ID from which this event was fetched.
 * @returns {{
 *   calendarId: string;
 *   eventId: string;
 *   summary: string;
 *   description: string;
 *   start: string | null;
 *   end: string | null;
 *   allDay: boolean;
 *   raw: Object;
 * }} Normalized event object.
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
    raw: ev
  };
}
