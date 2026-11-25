import type { WarmupThread } from "../types";

export const threads: WarmupThread[] = [
  {
    theme: "events-and-travel",
    subject: "Train times to Lyon on the 3rd",
    turns: [
      "Hi {{to_first}}, I'm looking at trains to Lyon for the 3rd. The 7:12 gets in at 10:40, and there's a 9:05 that arrives just after one. I have to be at the conference hall by noon, so I think I need the early one. Are you taking the same train, or driving?",
      "I'm on the 7:12 too, coach 6 if you want to find me. Driving would be quicker, but parking near the hall is awful and I'd rather read on the train. If you get there first, ask about the badge desk, I'm told the queue is short before 11.",
      "Coach 6 then, I'll walk down the platform to find you. Thanks for the tip about the badge desk. I'll bring two coffees if the station kiosk is open that early.\n\n{{from_first}}",
      "Two coffees would be welcome, mine will be the one without sugar. See you on the platform, and don't worry if the train is a few minutes late, it usually is.",
    ],
  },
  {
    theme: "events-and-travel",
    subject: "Hotel near the convention centre",
    previousKeys: ["527a3bb6f5d9"],
    turns: [
      "Hey {{to_first}},\n\nI found two hotels for the Denver trip. The Larimer is a six minute walk from the convention centre at 189 a night, and the Platte House is twenty minutes away for 134. I'm inclined to pick the closer one, but I know travel costs are being watched. What would you do?",
      "I'd take the Larimer. Five nights at the difference is about 275, and a twenty minute walk at 7 in the morning in March is not much fun. Also the Larimer includes breakfast, which narrows the gap further. If finance asks, show them the breakfast line.",
      "Good point about breakfast, I hadn't added it up. I'll book the Larimer today and keep the confirmation for the expense report. I'll also ask about late checkout since my flight leaves in the evening.\n\n{{from_first}}",
      "Late checkout is always worth a try. They gave me until 2 pm last year just for asking nicely at the front desk.",
    ],
  },
  {
    theme: "events-and-travel",
    subject: "Seating plan for the anniversary lunch",
    turns: [
      "{{to_first}}, I'm sorting out the tables for my parents' fortieth anniversary lunch, 36 guests in the end. I'd like to keep the cousins from Leeds together and put Uncle Desmond near the door because of his hip. Where do you think Aunt Ruth should sit, given she and Desmond haven't spoken since the wedding?",
      "I'd seat Ruth near the windows with the neighbours, which keeps her at the other end from Desmond with plenty of people between them. She gets on well with your friend Alba too, so perhaps put them side by side. Nothing dramatic, she'll just be happier that way.",
      "Ruth by the window with Alba is a lovely idea. I've redrawn the plan and it finally fits on one page. I'll print it for the restaurant on Friday so they can set out the name cards.\n\n{{from_first}}",
      "Brilliant, printing it is smart, they'll want to see it. Let me know if you need help folding place cards on the day, I'm good with small tasks.",
    ],
  },
  {
    theme: "events-and-travel",
    subject: "Layover in Frankfurt",
    previousKeys: ["4875e75e57e8"],
    turns: [
      "My flight to Singapore has a four hour layover in Frankfurt on the 9th. I'm wondering if it's worth leaving the airport or if I'll just spend the time worrying about getting back. Have you done that connection before?",
      "I have, twice. With four hours I'd stay in the airport. By the time you clear security again and come back, you'd be left with an hour at most. If you want something to do, the observation terrace is open until 9 and is quiet in the afternoon. The pretzels at the bakery near gate B are worth it, too.",
      "That settles it, I'll stay and find the terrace. I could do with a quiet hour anyway, the week has been a lot. I'll try a pretzel and report back.\n\n{{from_first}}",
      "Do report back. If the terrace is closed for any reason, there's a reading lounge near gate Z with decent chairs.",
    ],
  },
  {
    theme: "events-and-travel",
    subject: "Catering numbers for Saturday's open house",
    previousKeys: ["a81e32275dc3"],
    turns: [
      "Good morning {{to_first}}, the open house is on Saturday and the RSVP list stands at 54, though I expect a handful more to just turn up. The caterer wants a final number by tomorrow noon. Should I ask for 60 portions or 65? I hate waste but I'd hate running short even more.",
      "I'd order 60 with a few extra pastries as a buffer. At our last open day about 80 percent of the RSVP list came, and walk-ins were fewer than ten. Sandwiches can be kept for Monday's team lunch if there are leftovers. Pastries disappear anyway.",
      "60 with extra pastries it is. I'll send the final number to the caterer before noon and tell them to deliver by 11 on Saturday. I'll also ask for vegetarian labels on the platters this time.\n\n{{from_first}}",
      "Labels are a great idea, last time we had a long discussion about what was in the quiche. See you on Saturday morning to help set up.",
    ],
  },
  {
    theme: "events-and-travel",
    subject: "Packing list for the ferry to Orkney",
    previousKeys: ["15864e67737a"],
    turns: [
      "Evening {{to_first}},\n\nI've started a packing list for Orkney and it's already too long. Waterproof trousers, two jumpers, the good boots, binoculars for the seabirds. We only have one bag each on the ferry since there's no car. What would you cut?",
      "I'd cut one jumper and rely on layers. The weather in early June changes by the hour, so a thin waterproof shell matters more than a second thick knit. The binoculars are worth the weight, the puffins at Marwick Head are close enough that you'll want them. Leave the umbrella, the wind will break it.",
      "Good advice, the umbrella is out and so is one jumper. I'll pack the light shell and a spare pair of dry socks, which I always forget. The ferry leaves at 5:40 so we'll have a long evening on deck.\n\n{{from_first}}",
      "Dry socks are the secret to a good holiday, I'm glad you thought of them. Bring a flask too, the tea on the boat costs a fortune.",
    ],
  },
  {
    theme: "events-and-travel",
    subject: "Speaker slot at the meetup in Utrecht",
    previousKeys: ["4f5ba93b1de6"],
    turns: [
      "Hi again {{to_first}}, the organisers have offered me a twenty minute slot at the Utrecht meetup on the 28th, between the two main talks. I'd like to speak about how we moved our reporting to a single database, but I'm not sure twenty minutes is enough. Would you trim it or ask for thirty?",
      "I'd stay at twenty and trim, since the slot between two main talks is meant to be brisk. Pick two lessons and show one slide for each. People remember a single clear story better than a tour of the architecture. I'm happy to listen to a practice run on Tuesday if you like.",
      "Two lessons and two slides, that is much clearer than what I had. A practice run on Tuesday would be great, I'll book a room and walk you through it. I'll also ask the organisers whether there's a clicker.\n\n{{from_first}}",
      "Tuesday after lunch is fine for me. If there's no clicker I have one in my bag from my last talk, I'll bring it along.",
    ],
  },
  {
    theme: "events-and-travel",
    subject: "Parking at the stadium on Friday",
    turns: [
      "Hi {{to_first}}, I'm driving to the concert on Friday with Mina and her brother. The stadium website says the main car park is full and the overflow lot on Quarry Road is a fifteen minute walk. Have you been to a show there? I don't want to arrive late for the support act.",
      "I have, and the overflow lot is fine if you arrive before 6. After that the road gets slow because of the one-way system. Doors open at 6:30, so if you leave by 5 you'll be comfortable. Leaving afterwards takes a while, so I'd suggest waiting in the car for twenty minutes.",
      "Leaving by 5 sounds right, and I'll pack snacks for the wait afterwards. Thank you for the road tip, I wouldn't have thought of the one-way system. I'll tell the others to meet at my place at 4:45.\n\n{{from_first}}",
      "4:45 sounds like a plan. Enjoy the show, and take earplugs if you're near the speakers, they really do hurt after the first hour.",
    ],
  },
];
