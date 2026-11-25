import type { WarmupThread } from "../types";

export const threads: WarmupThread[] = [
  {
    theme: "vendors-and-orders",
    subject: "Order 48213, missing mounting brackets",
    turns: [
      "Hello {{to_first}},\n\nOur order 48213 arrived yesterday and everything is there except the mounting brackets, part number MB-220. The packing slip lists twelve but the box only held the eight shelves and the screws. Could you tell me whether they're shipping separately?",
      "Thanks for flagging this, {{to_first}}, and for checking the slip. Looking at our system, the brackets went out in a second parcel on Monday because they come from a different warehouse. Tracking should show delivery by Thursday. If they haven't turned up by Friday let me know and I'll send a fresh set.",
      "That explains it, thank you. I'll keep an eye out on Thursday and tell the installers to hold off until then. One more question, do you have the bracket dimensions to hand, so we can mark the wall in advance?",
      "Yes, each bracket is 180 mm by 40 mm with two holes at 140 mm spacing. Mark the wall at 140 and you'll be fine.\n\nKind regards, {{from_first}}",
    ],
  },
  {
    theme: "vendors-and-orders",
    subject: "Quote for the cafeteria refit",
    turns: [
      "Hi {{to_first}}, thank you for walking the space with us last week. Could you send over the quote for the cafeteria refit with the counter and the six booths split out as separate lines? Our finance team likes to approve in stages and I'd like to avoid revising the paperwork.",
      "Of course. I've split it into counter, booths and lighting, which seems the cleanest. The counter comes to 7,400, the six booths are 9,900 together and the lighting is 2,150. Lead time on the booths is about five weeks because the fabric is made to order.",
      "Five weeks is fine for the booths, but I'd like the counter first so staff can start using it. Is it possible to schedule that part separately for the first half of the month?\n\n{{from_first}}",
      "That's possible, the counter is built in our own workshop and could be installed on the 8th. I'll set a separate delivery slip for it and keep the booths on the later schedule. I'll confirm the exact day by Friday.",
    ],
  },
  {
    theme: "vendors-and-orders",
    subject: "Invoice 2291 shows the wrong address",
    turns: [
      "Good afternoon {{to_first}}, the invoice 2291 you sent us has our old street address in the billing section. Our accountant would like it corrected before she processes the payment, which is due on the 30th. We moved to Birch Lane in March.",
      "Apologies for that, our records kept the old address from your first order. I've updated the account and will issue a corrected copy of 2291 today. The amount is unchanged, 1,384.60, and the due date stays the 30th.\n\n{{from_first}}",
      "Thank you for the quick fix. I'll forward the new copy to our accountant as soon as it arrives. Could you also check that the delivery address on file is Birch Lane, not just the billing one?",
      "Checked, and the delivery address was also still the old one, so I've changed both. Good thing you asked, the next shipment would have gone to the wrong building.",
    ],
  },
  {
    theme: "vendors-and-orders",
    subject: "Reordering the 9 oz paper cups",
    turns: [
      "Hi {{to_first}}, we're nearly out of the 9 oz paper cups, the plain white ones in the sleeve of 50. I'd like to reorder 40 sleeves, if you have them in stock. Last time the delivery took nine days, and I'd prefer it to be quicker.",
      "We have 62 sleeves in stock at the moment, so 40 is no problem. If you place the order before 3 today it ships tomorrow with the courier we use for fragile goods, which usually takes two days. The price is unchanged from last time.",
      "Then please go ahead with 40 sleeves. I'll send the purchase order number in a separate note, it's 7715. Please can you also add a box of the matching lids if they're not too expensive?\n\n{{from_first}}",
      "Lids are 14 a box, so I've added one to the order. Shipping confirmation to follow tomorrow once the courier collects it.",
    ],
  },
  {
    theme: "vendors-and-orders",
    subject: "Delivery window for the pallet on Wednesday",
    turns: [
      "{{to_first}}, the courier says the pallet of printer paper is arriving Wednesday, but we only have the loading dock open between 8 and 10. Can you tell me if they can be firm about the window? Last time they came at four in the afternoon and the building was locked.",
      "I've asked the depot and they can book you in for the morning, between 8 and 10. They'll call the number on the order about half an hour beforehand. Please make sure someone can pick up, because the driver will only wait ten minutes.",
      "Understood, Karim will be at the dock and his number is on the order. Thanks for booking the window. Do we need a pallet jack on our side, or does the driver bring one?\n\n{{from_first}}",
      "The driver has a hand pallet jack on the truck, so you don't need your own. If the dock has a step, though, a second person helps. It's 14 boxes at about 20 kilos each.",
    ],
  },
  {
    theme: "vendors-and-orders",
    subject: "Which finish for the oak table?",
    turns: [
      "Hello {{to_first}},\n\nThank you for sending the swatches. We're choosing between the natural oil and the matte lacquer for the dining table. The table will be used daily by a family with young children. Which one stands up better to spills, in your experience?",
      "For a family table I'd go with the matte lacquer, it resists water rings and wipes clean. The oil looks lovely and feels warmer, but it needs re-oiling once or twice a year. If you like the oil look, there's a hard-wax oil that sits between the two.",
      "That's helpful, the hard-wax oil sounds like a good middle ground. Would it change the delivery date, which is currently the 19th? We have guests arriving on the 24th and would love to use it by then.\n\n{{from_first}}",
      "Hard-wax oil adds about three days for curing, so the table would arrive on the 22nd. That still leaves you two days before your guests. I'd suggest no hot dishes directly on it for the first week.",
    ],
  },
  {
    theme: "vendors-and-orders",
    subject: "Returning the wrong monitor stand",
    turns: [
      "Hi {{to_first}}, I ordered the single arm stand, model S-14, but the box that arrived has the dual arm, model D-14. It's unopened. How do I send it back, and can you send the right one before I start travelling on the 12th?",
      "Sorry about that, the labels on those two boxes look almost identical. I'll email a prepaid return label in a moment. If you post the D-14 tomorrow I'll ship the S-14 at once rather than waiting for the return to arrive, so you should have it before the 12th.",
      "That's very generous, thank you. I'll drop the parcel off first thing tomorrow on my way to the office. Could you tell me roughly when the replacement will leave your warehouse?\n\n{{from_first}}",
      "It will go out tomorrow afternoon, so you should see it by Friday at the latest. I'll write the tracking number in a follow-up as soon as I have it.",
    ],
  },
  {
    theme: "vendors-and-orders",
    subject: "Annual maintenance for the espresso machine",
    turns: [
      "{{to_first}}, our espresso machine is due its yearly service and I'd like to book you in. It's the two-group model that you installed in 2022. The steam wand has been sputtering a little and the pressure gauge drifts. Do you have a slot in the next two weeks?",
      "Thanks for getting in touch. I can come on the 17th at 8:30, before your doors open, which means the machine will be cold and I can descale and replace the gaskets without interrupting anyone. The sputtering is probably a blocked tip, a quick fix. I'll bring a spare gauge in case.",
      "The 17th at 8:30 suits us, I'll make sure someone lets you in through the side door. Roughly how long should I expect it to take, and will it need to be switched off the night before?\n\n{{from_first}}",
      "Plan for about ninety minutes. Switch it off at closing time the evening before so the boiler is cold, and leave the drip tray empty. That's all I need from you.",
    ],
  },
];
