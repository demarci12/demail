import type { WarmupThread } from "../types";

export const threads: WarmupThread[] = [
  {
    theme: "scheduling",
    subject: "Moving Thursday's call",
    turns: [
      "Hi {{to_first}}, I have a dentist appointment that has just been moved onto Thursday at 2, right where our call sits. Could we shift to Friday morning instead? Anything between 9 and 11 is fine for me.\n\n{{from_first}}",
      "Friday morning works. Let's say 9:30, that gives me time to get the kids to school first. I'll move the invite on my side so it doesn't double up with the old one.",
      "9:30 it is, thank you for being flexible. I'll send a fresh invite in a minute and delete the Thursday one so we don't get confused.\n\n{{from_first}}",
      "Got it, I'll look for the new invite. Hope the dentist goes smoothly, mine always runs forty minutes late and then charges for the privilege.",
    ],
  },
  {
    theme: "scheduling",
    subject: "Coffee when you're next downtown?",
    previousKeys: ["d505ff19474f"],
    turns: [
      "Hey {{to_first}}, you mentioned you'd be near the old post office on the 14th. I'd love to buy you a coffee and hear how the new job is going. Is there a time that day when you're free for an hour, or is it a packed schedule?",
      "That would be lovely. The 14th is busy until about 1, but after that I'm free until my train at 5:15. There's a bakery on Alder Street that does a decent flat white, how about 2:00?",
      "2:00 at the Alder Street bakery is perfect, I know the place. I'll grab a table near the window if it's not too crowded. Looking forward to catching up.\n\n{{from_first}}",
      "Same here, it's been far too long. Text me if you're running behind and I'll order for us both, and I'll save you a slice of whatever cake is left.",
    ],
  },
  {
    theme: "scheduling",
    subject: "Which week for the offsite?",
    previousKeys: ["e9567d90d434"],
    turns: [
      "Good morning {{to_first}},\n\nI'm trying to fix a week for the team offsite and the options are the 9th to 11th of October or the 23rd to 25th. Three people have said they can't do the 23rd because of a conference. The venue has both dates free. Does the 9th work for you, and is there anything on your side I should know about?",
      "The 9th to 11th works for me, no conflicts that I know of. I do have a school event on the evening of the 11th, so I'd probably want to leave by 3 on the last day. Is that going to be a problem for the agenda?",
      "Leaving at 3 on the last day is fine, I'll put the retrospective in the morning so you don't miss it. I'm going to confirm the 9th with the venue tomorrow unless someone objects before then.\n\n{{from_first}}",
      "Great, the morning retrospective suits me well. Thanks for planning around the school thing, I appreciate it more than I can say, it's a small play but a big deal for my son.",
    ],
  },
  {
    theme: "scheduling",
    subject: "Quarterly check-in with Marguerite",
    turns: [
      "{{to_first}}, Marguerite's assistant sent over three slots for our quarterly check-in: Tuesday 10:00, Wednesday 15:30 and the following Monday at 9:00. I'd lean towards Tuesday since it gives us time to prepare on Monday. Which one would you pick?",
      "Tuesday at 10:00 is my pick as well. The Wednesday slot would clash with my gym class and Monday at 9 feels rushed after a weekend. I can have my slides ready by Monday lunchtime if that helps.",
      "Monday lunchtime for the slides is ideal. I'll tell her assistant we're taking Tuesday and ask if they can book the small room on the second floor, the big one has awful acoustics.\n\n{{from_first}}",
      "Good idea about the room. I'll see you Monday afternoon to go through the slides, and bring a printed copy for yourself if you like to scribble.",
    ],
  },
  {
    theme: "scheduling",
    subject: "Can we swap the Tuesday standup?",
    previousKeys: ["ca4f31b3854b"],
    turns: [
      "Small favor, {{to_first}}. I have a delivery arriving Tuesday morning that needs someone home, and it's a heavy bookcase. Could we run Tuesday's standup at 11 instead of 9:30, just that one week? I'd be able to join in full, camera on, and everything.",
      "No problem at all from me, 11 is fine. I'll check with the others, I think Wei has a call at 11:30 but a fifteen minute standup should fit before that. I'll tell everyone this afternoon and update the invite.",
      "Thank you, that's a relief. If Wei really can't make it, I'm happy to send him my update in writing beforehand so nothing gets lost. I'll leave the Tuesday after as it was.\n\n{{from_first}}",
      "Sounds sensible. I'll let you know once I hear from Wei, and good luck assembling the bookcase, those instructions are famously cryptic.",
    ],
  },
  {
    theme: "scheduling",
    subject: "Dinner on the 22nd?",
    turns: [
      "{{to_first}}! It's been ages. We're finally having people over and I was hoping you and Adrián could come on the 22nd, a Saturday. I'm planning a big pot of chickpea stew, so nothing fancy. Would around 7 suit you both?",
      "We'd love to come. The 22nd is open for us, and 7 is perfect. Shall I bring something, maybe bread from the place by the canal, or a dessert? Adrián has also discovered a talent for lemon tart, so I might put him to work.",
      "A lemon tart would be a wonderful addition, please do put him to work. Bread as well, as long as it's not too much to carry. I'll text you the door code closer to the day.\n\n{{from_first}}",
      "Done, both of us will be there with a tart and a loaf. Can't wait to see everyone, and the stew sounds just right for that time of year.",
    ],
  },
  {
    theme: "scheduling",
    subject: "Booking the training room for the 5th",
    previousKeys: ["3dffc1b77cf2"],
    turns: [
      "I'd like to reserve the training room on the 5th for the new starters, from 9 until about 4. Your calendar shows it's yours that day but empty until 2. Could we share it, with my group taking the morning and yours moving in after lunch? I can have everything cleared by 1:30.",
      "Sharing is fine in principle. My session starts at 2:00 sharp, so clearing by 1:30 would be tight for me, since the projector is slow to start and the chairs get rearranged. Could you be out by 1:15? If not, I could use the smaller room next door for the first twenty minutes.",
      "1:15 is doable if we end with a short wrap-up instead of a Q&A. I'll put it in my agenda now and make sure we leave the chairs in a U shape so you don't have to move them. Thank you for being flexible.\n\n{{from_first}}",
      "A U shape is just what I need, thanks. Then we're all set for the 5th. I'll mark the room as shared in the calendar so nobody else books over us.",
    ],
  },
  {
    theme: "scheduling",
    subject: "Pickup time on Sunday",
    previousKeys: ["dd4c1ff6fcf9"],
    turns: [
      "Hi again {{to_first}}, I'm picking up the folding table from you on Sunday, if that still works. I can be there between 11 and 1. Is there a time that's easier on your end? I have a hatchback and will bring a blanket for the legs.",
      "Sunday is good. I'm out until noon at the market, so any time after 12:15 is perfect. I'll leave it by the door in the hallway in case I'm not back yet. The legs fold flat, but one of the clips is stiff, so be gentle with it.",
      "12:30 then, and I'll be gentle with the clip. I'll text you from the street so you know I've arrived. If it's easier I can bring the cash instead of a transfer, whichever you prefer.\n\n{{from_first}}",
      "Cash is easier for me. See you at 12:30, and take an umbrella just in case, the forecast looks unsettled.",
    ],
  },
];
