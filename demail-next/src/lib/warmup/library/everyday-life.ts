import type { WarmupThread } from "../types";

export const threads: WarmupThread[] = [
  {
    theme: "everyday-life",
    subject: "Recipe for the lentil soup",
    turns: [
      "Hi {{to_first}}, you asked for the lentil soup recipe at the weekend. Here it is from memory: one onion, two carrots, a stick of celery, a cup of brown lentils, a litre of stock and a spoonful of tomato paste. Cook the vegetables slowly first, then add everything else and simmer for forty minutes. A splash of vinegar at the end makes it taste alive.",
      "Thank you, I'll make it on Sunday. I've never added vinegar to soup, which type do you use? I only have white wine vinegar and balsamic in the cupboard. I'm cooking for four, so I'll double the lentils and see if the stock stretches.",
      "White wine vinegar is the one, just a teaspoon in each bowl rather than into the pot. Balsamic would turn it a muddy colour. Doubling the lentils is fine, but use a bit more stock, about a litre and a half, because they soak up a lot.\n\n{{from_first}}",
      "A teaspoon per bowl, noted. I'll let you know how it goes, though with two children at the table the verdict might be harsh.",
    ],
  },
  {
    theme: "everyday-life",
    subject: "Our neighbour's fence",
    turns: [
      "{{to_first}}, the storm took down a section of the fence between our gardens, about three panels. I haven't mentioned it to Mr Hargrove yet because I'm not sure whose side of the boundary it is. Have you dealt with anything like this on your street?",
      "We had something similar two years ago. The deeds usually say who's responsible, and ours turned out to be the house on the left. I'd check the title papers before anything else, then knock on his door with a cup of tea and a plan. Most people are reasonable if you approach it as a shared job.",
      "The deeds are in a folder somewhere, I'll find them tonight. A cup of tea is a good way in, he's quite shy. I'll offer to split the cost of the panels if it turns out to be his side, it's easier than arguing.\n\n{{from_first}}",
      "Splitting it is generous and probably quicker. Let me know if you need the name of the fencer we used, he was punctual and fairly priced.",
    ],
  },
  {
    theme: "everyday-life",
    subject: "A good book for the long flight",
    turns: [
      "Hello {{to_first}},\n\nI have an eleven hour flight next month and I need something absorbing to read. I enjoyed the last one you recommended, the one about the lighthouse keeper. Do you have another in the same spirit, nothing too heavy, but something I can't put down?",
      "I do. Try 'The Salt Road', a novel about a family that runs a ferry in the 1950s. It's quiet, with lovely characters, and the chapters are short enough to read in the gaps between meals and sleep. I think you'll finish it before landing. I can lend you my copy if you'd rather not buy one.",
      "That sounds perfect, and I'd happily borrow your copy. I'll treat it kindly and return it the week after I'm back. Could I pick it up on Thursday evening, if you're home?\n\n{{from_first}}",
      "Thursday evening is fine, come after seven. I'll put it by the door in case I'm still cooking, with a bookmark where I stopped so you can skip the dull bit.",
    ],
  },
  {
    theme: "everyday-life",
    subject: "Marathon training, week nine",
    turns: [
      "{{to_first}}, I've reached week nine of the marathon plan and my left knee has started to complain on long runs. It's not sharp, more of a dull ache after the 14 km mark. Do you think I should skip Sunday's long run, or just shorten it?",
      "I'd shorten it, perhaps to 10 km at an easy pace, and swap one weekday run for a swim or a bike ride. A dull ache that appears late usually points to tired muscles rather than an injury. If it's still there after a week of lighter running, see a physio. Don't power through it.",
      "Shortening it is the sensible choice, even if I hate it. I'll do 10 km on Sunday and an hour on the bike on Wednesday. I've also bought a foam roller, which my calves are already unhappy about.\n\n{{from_first}}",
      "The foam roller always hurts for the first week and then you'd miss it. Keep the pace easy on Sunday, nobody ever lost a marathon in week nine.",
    ],
  },
  {
    theme: "everyday-life",
    subject: "Tomato plants have yellow leaves",
    turns: [
      "Hi {{to_first}}, the lower leaves on my tomato plants have gone yellow and some have brown spots. The plants are about a metre tall with green fruit just setting. I water every second evening. Is this something to worry about, or normal for this time of year?",
      "A bit of yellowing on the lowest leaves is common, but brown spots suggest blight or a fungal problem. Remove those leaves, water at the base in the morning rather than the evening, and avoid wetting the foliage. Leave space between the plants so air can move. If new leaves are spotted too, tell me and we'll think again.",
      "Thank you, I'll take off the bottom leaves this evening and switch to morning watering. The plants are close together, so I'll thin the foliage in the middle. I'll check the new growth on Friday and let you know.\n\n{{from_first}}",
      "That sounds right. Throw the removed leaves in the bin, not the compost, so any spores don't spread to the beans next door. Tell me how the fruit looks in a fortnight.",
    ],
  },
  {
    theme: "everyday-life",
    subject: "Choosing a bike for my daughter",
    turns: [
      "{{to_first}}, my daughter turns eight next month and wants a proper bike. She's 128 cm tall and has outgrown the little one. The shop has a 24 inch with eight gears and a 20 inch with none. I'm leaning towards the 24, but it looks big. What did you buy for yours?",
      "We bought the 24 inch at about that height, and it worked well. The seat can drop low enough for her to stand flat footed, and she grew into it within a few months. A 20 inch would feel like a toy by next summer. I'd just check she can reach the brakes comfortably.",
      "Brake reach is something I wouldn't have checked, thanks. I'll take her to the shop on Saturday and let her ride both around the car park. If the 24 feels right, we'll get it and a helmet in her favourite colour, which is currently purple.\n\n{{from_first}}",
      "A trial ride is the best test. Purple helmets are in fashion, which will help a lot when she's deciding whether to wear it.",
    ],
  },
  {
    theme: "everyday-life",
    subject: "Taking the cat to the vet",
    turns: [
      "Hello {{to_first}},\n\nBiscuit has been sneezing for four days and has stopped eating her dry food. She's still drinking and acts like herself otherwise. I've booked the vet for Thursday at 10:20, but I'm worried about how she'll handle the carrier. Do you have any tricks for a cat who hates travelling?",
      "Leave the carrier out in the living room from now on, with a blanket inside, so it becomes a place she goes by choice. Put a towel over it in the car, which keeps her calm. And try a little tuna on the blanket tonight. By Thursday she may walk in herself.",
      "The towel and tuna are a good idea, she'll do almost anything for tuna. I've put the carrier by the sofa already and she's sniffing it suspiciously. I'll tell you what the vet says after the appointment.\n\n{{from_first}}",
      "Please do. Cats tend to be dramatic about colds, and I hope it's nothing more than that. Give her an extra stroke from me.",
    ],
  },
  {
    theme: "everyday-life",
    subject: "Clearing out the loft",
    turns: [
      "Hi {{to_first}}, we're finally clearing the loft this weekend. There are about thirty boxes, mostly old textbooks, a broken printer and my father's records. I'd like to rent a small van for the Saturday. Do you know a place that doesn't charge extra for the mileage?",
      "Try Hallam Hire near the ring road, they charge by the day and don't count miles for anything under a hundred. A small van is about 45, if I remember rightly. For the records, a charity shop near the station takes vinyl and gives you a receipt. Some of them could be worth money, so it's worth flicking through before you give them away.",
      "Good idea about the records, I'll go through the crates on Friday night. I'll ring Hallam in the morning and book the van for Saturday. If it takes less time than I fear, I might finally sort the garage as well.\n\n{{from_first}}",
      "The garage can wait for another weekend, don't push your luck. Wear a mask in the loft, the dust is dreadful once you start moving things.",
    ],
  },
];
