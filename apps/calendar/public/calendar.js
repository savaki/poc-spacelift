// Shared calendar utilities for booking and reschedule flows.

var DAY_MAP = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function cleanEnum(val) {
    return (val || '').replace(/"/g, '').replace(/_/g, ' ');
}

function titleCase(str) {
    return str.replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

function formatEnum(val) {
    return titleCase(cleanEnum(val));
}

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

function getAvailableDays(availabilitySlots) {
    var days = {};
    availabilitySlots.forEach(function(slot) {
        var jsDay = DAY_MAP[cleanEnum(slot.day_of_week).toLowerCase()];
        if (jsDay !== undefined) {
            if (!days[jsDay]) days[jsDay] = [];
            days[jsDay].push(slot);
        }
    });
    return days;
}

// Render a month calendar grid into a container element.
// Options: { year, month, selectedDate, availDays, onSelect }
function renderCalendarGrid(containerEl, titleEl, opts) {
    titleEl.textContent = MONTH_NAMES[opts.month] + ' ' + opts.year;

    var firstDay = new Date(opts.year, opts.month, 1).getDay();
    var daysInMonth = new Date(opts.year, opts.month + 1, 0).getDate();
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var html = '';
    for (var i = 0; i < firstDay; i++) {
        html += '<div class="cal-day"></div>';
    }

    for (var d = 1; d <= daysInMonth; d++) {
        var date = new Date(opts.year, opts.month, d);
        var jsDay = date.getDay();
        var isPast = date < today;
        var hasAvail = !!opts.availDays[jsDay];
        var isToday = date.getTime() === today.getTime();
        var dateStr = date.toISOString().slice(0, 10);
        var isSelected = opts.selectedDate === dateStr;

        var cls = 'cal-day in-month';
        if (isToday) cls += ' today';
        if (isPast) cls += ' disabled';
        else if (hasAvail) cls += ' available';
        if (isSelected) cls += ' selected';

        if (!isPast && hasAvail) {
            html += '<div class="' + cls + '" onclick="' + opts.onSelect + '(\'' + dateStr + '\')">' + d + '</div>';
        } else {
            html += '<div class="' + cls + '">' + d + '</div>';
        }
    }
    containerEl.innerHTML = html;
}

// Generate 1-hour time slot buttons from availability windows.
// Returns HTML string. bookedTimes is an array of "HH:MM" strings already taken.
function renderTimeSlots(daySlots, bookedTimes, onSelectFn) {
    var html = '';
    daySlots.forEach(function(slot) {
        var startH = parseInt(slot.start_time.split(':')[0]);
        var startM = parseInt(slot.start_time.split(':')[1]) || 0;
        var endH = parseInt(slot.end_time.split(':')[0]);
        var endM = parseInt(slot.end_time.split(':')[1]) || 0;
        var startMin = startH * 60 + startM;
        var endMin = endH * 60 + endM;

        for (var m = startMin; m + 60 <= endMin; m += 60) {
            var h = Math.floor(m / 60);
            var mm = m % 60;
            var timeStr = String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
            var endTimeStr = String(h + 1).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
            var isBooked = bookedTimes.indexOf(timeStr) >= 0;
            var displayTime = formatTime(h, mm);

            if (isBooked) {
                html += '<div class="cal-slot booked">' + displayTime + '</div>';
            } else {
                html += '<div class="cal-slot" onclick="' + onSelectFn + '(\'' + timeStr + '\', \'' + endTimeStr + '\')">' + displayTime + '</div>';
            }
        }
    });
    return html;
}

// Load booked visit times for a contractor on a date. Returns array of "HH:MM" strings.
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
    } catch (e) {
        return [];
    }
}

// Load availability slots for a contractor. Returns filtered array.
async function loadContractorAvailability(contractorId) {
    var resp = await fetch('/api/availability/list');
    var data = await resp.json();
    if (!Array.isArray(data)) return [];
    return data.filter(function(s) {
        return s.user_id === contractorId && s.status === 'active';
    });
}
