#!/usr/bin/env python3
"""Writes made-up events for the headless Thunderbird test: gen-calendar.py <file.ics> (this week and next)."""
import sys
from datetime import datetime, timedelta

today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
monday = today - timedelta(days=today.weekday())
# day offset from Monday, start hour, minutes, title (None: all day)
EVENTS = [(0, 9, 30, "Team meeting"), (0, 13, 60, "Lunch with Anna"), (1, 10, 90, "Dentist"),
          (2, None, 0, "Mia's birthday"), (2, 15, 45, "Call with Jonas"), (3, 8, 120, "Project review"),
          (4, 18, 150, "Cinema"), (today.weekday(), 11, 60, "Design review"), (8, 9, 30, "Team meeting")]
f = open(sys.argv[1], "w")
f.write("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//mbp115 test//EN\r\n")
for i, (day, hour, minutes, title) in enumerate(EVENTS):
    d = monday + timedelta(days=day)
    f.write(f"BEGIN:VEVENT\r\nUID:test{i}@example.invalid\r\nDTSTAMP:20261101T000000Z\r\nSUMMARY:{title}\r\n")
    if hour is None:
        f.write(f"DTSTART;VALUE=DATE:{d:%Y%m%d}\r\nDTEND;VALUE=DATE:{d + timedelta(days=1):%Y%m%d}\r\n")
    else:
        s = d.replace(hour=hour)
        f.write(f"DTSTART:{s:%Y%m%dT%H%M%S}\r\nDTEND:{s + timedelta(minutes=minutes):%Y%m%dT%H%M%S}\r\n")
    f.write("END:VEVENT\r\n")
f.write("END:VCALENDAR\r\n")
