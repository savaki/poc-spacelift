// Shared calendar utilities and Unpoly compilers.

var DAY_MAP = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function cleanEnum(val) { return (val || '').replace(/"/g, '').replace(/_/g, ' '); }
function titleCase(str) { return str.replace(/\b\w/g, function(c) { return c.toUpperCase(); }); }
function formatEnum(val) { return titleCase(cleanEnum(val)); }

function formatTime(h, m) {
    var ampm = h >= 12 ? 'PM' : 'AM';
    var hour = h % 12 || 12;
    return hour + ':' + String(m).padStart(2, '0') + ' ' + ampm;
}

function formatDate(dateStr) {
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getAvailableDays(slots) {
    var days = {};
    slots.forEach(function(slot) {
        var jsDay = DAY_MAP[cleanEnum(slot.day_of_week).toLowerCase()];
        if (jsDay !== undefined) {
            if (!days[jsDay]) days[jsDay] = [];
            days[jsDay].push(slot);
        }
    });
    return days;
}

async function loadBookedTimes(contractorId, dateStr, excludeVisitId) {
    try {
        var resp = await fetch('/api/visit/by-contractor/' + contractorId);
        var data = await resp.json();
        if (!Array.isArray(data)) return [];
        return data
            .filter(function(v) {
                return v.scheduled_date === dateStr
                    && v.status !== 'cancelled'
                    && v.status !== 'no_show'
                    && (!excludeVisitId || v.id !== excludeVisitId);
            })
            .map(function(v) { return v.start_time; });
    } catch (e) { return []; }
}

async function loadContractorAvailability(contractorId) {
    var resp = await fetch('/api/availability/list');
    var data = await resp.json();
    if (!Array.isArray(data)) return [];
    return data.filter(function(s) {
        return s.user_id === contractorId && s.status === 'active';
    });
}

// --- Unpoly compiler: [data-calendar-grid] ---
// Renders a month calendar grid with availability dots.
// Reads config from data attributes set by the server-rendered JQT template.
up.compiler('[data-calendar-grid]', function(el) {
    var contractorId = el.getAttribute('data-contractor-id');
    var availability;
    var jsonEl = el.querySelector('script[data-availability]');
    try { availability = JSON.parse(jsonEl ? jsonEl.textContent : '[]'); } catch(e) { availability = []; }
    if (jsonEl) jsonEl.remove();
    var queryYear = parseInt(el.getAttribute('data-year')) || 0;
    var queryMonth = parseInt(el.getAttribute('data-month')) || 0;

    var slots = (Array.isArray(availability) ? availability : []).filter(function(s) {
        return s.user_id === contractorId && s.status === 'active';
    });

    if (slots.length === 0) {
        var p = document.createElement('p');
        p.style.cssText = 'text-align:center;padding:2rem 0;color:var(--mz-color-gray-500)';
        p.textContent = 'This contractor has no availability set up yet.';
        el.appendChild(p);
        return;
    }

    var now = new Date();
    var calYear = queryYear || now.getFullYear();
    var calMonth = queryMonth ? queryMonth - 1 : now.getMonth();
    var availDays = getAvailableDays(slots);
    var selectedDate = el.getAttribute('data-selected-date') || null;
    var baseUrl = '/' + contractorId + '/pick-date';
    var selectUrl = el.getAttribute('data-select-url') || ('/' + contractorId + '/pick-time');

    // Nav
    var nav = document.createElement('div');
    nav.className = 'cal-nav';

    var prevM = calMonth === 0 ? 12 : calMonth;
    var prevY = calMonth === 0 ? calYear - 1 : calYear;
    var nextM = calMonth === 11 ? 1 : calMonth + 2;
    var nextY = calMonth === 11 ? calYear + 1 : calYear;

    var prevLink = document.createElement('a');
    prevLink.href = baseUrl + '?year=' + prevY + '&month=' + prevM;
    prevLink.className = 'cal-back';
    prevLink.style.margin = '0';
    prevLink.setAttribute('up-target', '.cal-card');
    prevLink.textContent = '\u2190';
    nav.appendChild(prevLink);

    var title = document.createElement('span');
    title.className = 'cal-nav-title';
    title.textContent = MONTH_NAMES[calMonth] + ' ' + calYear;
    nav.appendChild(title);

    var nextLink = document.createElement('a');
    nextLink.href = baseUrl + '?year=' + nextY + '&month=' + nextM;
    nextLink.className = 'cal-back';
    nextLink.style.margin = '0';
    nextLink.setAttribute('up-target', '.cal-card');
    nextLink.textContent = '\u2192';
    nav.appendChild(nextLink);

    el.appendChild(nav);

    // Weekday headers
    var weekdays = document.createElement('div');
    weekdays.className = 'cal-weekdays';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(d) {
        var div = document.createElement('div');
        div.textContent = d;
        weekdays.appendChild(div);
    });
    el.appendChild(weekdays);

    // Day grid
    var grid = document.createElement('div');
    grid.className = 'cal-days';
    var firstDay = new Date(calYear, calMonth, 1).getDay();
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    var today = new Date(); today.setHours(0, 0, 0, 0);

    for (var i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));

    for (var d = 1; d <= daysInMonth; d++) {
        var date = new Date(calYear, calMonth, d);
        var isPast = date < today;
        var hasAvail = !!availDays[date.getDay()];
        var isToday = date.getTime() === today.getTime();
        var dateStr = date.toISOString().slice(0, 10);

        if (!isPast && hasAvail) {
            var a = document.createElement('a');
            a.href = selectUrl + '?date=' + dateStr;
            a.className = 'cal-day in-month available' + (isToday ? ' today' : '') + (selectedDate === dateStr ? ' selected' : '');
            a.setAttribute('up-target', '.cal-card');
            a.textContent = d;
            grid.appendChild(a);
        } else {
            var div = document.createElement('div');
            div.className = 'cal-day in-month' + (isToday ? ' today' : '') + (isPast ? ' disabled' : '');
            div.textContent = d;
            grid.appendChild(div);
        }
    }
    el.appendChild(grid);
});

// --- Unpoly compiler: [data-time-slots] ---
// Renders time slot buttons with conflict detection.
up.compiler('[data-time-slots]', function(el) {
    var contractorId = el.getAttribute('data-contractor-id');
    var selectedDate = el.getAttribute('data-date');
    var availability;
    var jsonEl = el.querySelector('script[data-availability]');
    try { availability = JSON.parse(jsonEl ? jsonEl.textContent : '[]'); } catch(e) { availability = []; }
    if (jsonEl) jsonEl.remove();
    var selectUrl = el.getAttribute('data-select-url');

    var slots = (Array.isArray(availability) ? availability : []).filter(function(s) {
        return s.user_id === contractorId && s.status === 'active';
    });

    var parts = selectedDate.split('-');
    var dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var availDays = getAvailableDays(slots);
    var daySlots = availDays[dateObj.getDay()] || [];

    loadBookedTimes(contractorId, selectedDate).then(function(bookedTimes) {
        // Remove loading indicator
        var loading = el.querySelector('.cal-loading');
        if (loading) loading.style.display = 'none';

        if (daySlots.length === 0) {
            var p = document.createElement('p');
            p.style.cssText = 'grid-column:1/-1;text-align:center;color:var(--mz-color-gray-500);padding:1rem';
            p.textContent = 'No available time slots for this date.';
            el.appendChild(p);
            return;
        }

        daySlots.forEach(function(slot) {
            var startMin = parseInt(slot.start_time.split(':')[0]) * 60 + (parseInt(slot.start_time.split(':')[1]) || 0);
            var endMin = parseInt(slot.end_time.split(':')[0]) * 60 + (parseInt(slot.end_time.split(':')[1]) || 0);

            for (var m = startMin; m + 60 <= endMin; m += 60) {
                var h = Math.floor(m / 60), mm = m % 60;
                var timeStr = String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
                var endStr = String(h + 1).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
                var isBooked = bookedTimes.indexOf(timeStr) >= 0;

                if (isBooked) {
                    var div = document.createElement('div');
                    div.className = 'cal-slot booked';
                    div.textContent = formatTime(h, mm);
                    el.appendChild(div);
                } else {
                    var a = document.createElement('a');
                    a.href = selectUrl + '?date=' + selectedDate + '&time=' + timeStr + '&end_time=' + endStr;
                    a.className = 'cal-slot';
                    a.setAttribute('up-target', '.cal-card');
                    a.textContent = formatTime(h, mm);
                    el.appendChild(a);
                }
            }
        });
    });
});
