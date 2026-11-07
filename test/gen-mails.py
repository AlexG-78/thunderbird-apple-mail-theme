#!/usr/bin/env python3
"""Writes made-up mails as an mbox for the headless Thunderbird test: gen-mails.py <inbox file>."""
import sys
import time
from email.utils import format_datetime
from datetime import datetime, timedelta

now = datetime.now().astimezone()
# sender, address, subject, age, status (X-Mozilla-Status: 1 read, 2 replied, 4 flagged, 0x1000 forwarded), body
# [, replies to (index)]; a body with "attachment" gets a file attached
MAILS = [
    ("Lena Hoffmann", "lena@example.org", "Pictures from Saturday", timedelta(minutes=12), 0,
     "Hi!\n\nHere are the pictures from the trip. The one at the lake is my favourite.\n\nSee you soon,\nLena"),
    ("Travel Desk", "trips@example.com", "Your booking is confirmed", timedelta(hours=2), 4,
     "Thank you for your booking.\n\nCheck-in opens 24 hours before departure."),
    ("Jonas Weber", "jonas@example.net", "Re: Project plan for next week", timedelta(hours=5), 4,
     "Sounds good to me. I moved the review to Thursday so we have time for the tests.\n\nJonas", 10),
    ("Mia Schulz", "mia@example.org", "Dinner on Friday?", timedelta(days=1, hours=3), 5,
     "Are you free on Friday evening? The new place around the corner has a table at eight."),
    ("Bank Statements", "noreply@example.com", "Your monthly statement is ready", timedelta(days=2), 1,
     "Your statement for last month is now available in online banking."),
    ("Paul Becker", "paul@example.net", "Bike for sale", timedelta(days=3), 3,
     "Still interested in the bike? I can bring it over on Sunday."),
    ("Newsletter", "news@example.com", "Ten tips for a tidy desktop", timedelta(days=5), 0x1001,
     "This week: keyboard shortcuts, smart folders and how to stop notifications at night."),
    ("Sophie Wagner", "sophie@example.org", "Recipe you asked for", timedelta(days=9), 1,
     "Here it is: 200 g flour, 2 eggs, a pinch of salt. The rest is in the attachment."),
    ("Calendar", "calendar@example.com", "Reminder: dentist at 10:00", timedelta(days=14), 1,
     "This is a reminder for your appointment tomorrow at 10:00."),
    ("Max Fischer", "max@example.net", "Old photos", timedelta(days=40), 1,
     "Found these in a box at my parents' place. Look how young we were!"),
    # a conversation: Anna's plan, Jonas' reply (above), Anna's answer
    ("Anna Klein", "anna@example.org", "Project plan for next week", timedelta(days=1, hours=2), 1,
     "Here is the plan for next week. Please check the dates."),
    ("Anna Klein", "anna@example.org", "Re: Project plan for next week", timedelta(minutes=40), 0,
     "Thursday works. I booked the room.", 2),
]

with open(sys.argv[1], "w") as f:
    for i, (name, addr, subj, age, status, body, *parent) in enumerate(MAILS):
        d = now - age
        f.write(f"From - {time.strftime('%a %b %d %H:%M:%S %Y', d.timetuple())}\n")
        f.write(f"X-Mozilla-Status: {status:04x}\nX-Mozilla-Status2: 00000000\n")
        f.write(f"Message-ID: <test{i}@example.invalid>\nDate: {format_datetime(d)}\n")
        f.write(f"From: {name} <{addr}>\nTo: Alex Example <me@example.com>\nSubject: {subj}\n")
        if "Project plan" in subj:   # several recipients: the header offers Reply All
            f.write("Cc: Jonas Weber <jonas@example.net>, Anna Klein <anna@example.org>\n")
        if parent:   # a reply: thread it under the message it answers
            refs = []
            p = parent[0]
            while True:
                refs.insert(0, f"<test{p}@example.invalid>")
                p = MAILS[p][6] if len(MAILS[p]) > 6 else None
                if p is None:
                    break
            f.write(f"In-Reply-To: {refs[-1]}\nReferences: {' '.join(refs)}\n")
        f.write("MIME-Version: 1.0\n")
        if "attachment" in body:
            f.write('Content-Type: multipart/mixed; boundary="b"\n\n--b\nContent-Type: text/plain; charset=utf-8\n\n')
        else:
            f.write("Content-Type: text/plain; charset=utf-8\n\n")
        f.write(body.replace("\nFrom ", "\n>From ") + "\n\n")
        if "attachment" in body:
            f.write('--b\nContent-Type: text/plain; name="recipe.txt"\nContent-Disposition: attachment; filename="recipe.txt"\n\n'
                    "Flour, eggs, salt.\n\n--b--\n\n")
