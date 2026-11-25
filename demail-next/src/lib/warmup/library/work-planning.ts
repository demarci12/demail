import type { WarmupThread } from "../types";

export const threads: WarmupThread[] = [
  {
    theme: "work-planning",
    subject: "Q3 roadmap, the onboarding section",
    turns: [
      "Hi {{to_first}},\n\nI finished a rough pass at the onboarding section of the Q3 roadmap last night. I cut the import wizard rewrite and moved it to Q4, since it depends on the new parser. Could you read section 2 before Thursday and tell me if the sequencing holds up?\n\n{{from_first}}",
      "{{to_first}} here. Read it on the train this morning. Sequencing looks fine to me, though I'd keep the parser spike in July rather than August, because the data team is out for two weeks after that. Otherwise I only had small wording notes in the margins.",
      "Good catch on the data team's leave, I had missed that entirely. I'll pull the spike forward and shuffle the dependent items. I'll send the cleaned-up version once it's done.\n\nThanks again, {{from_first}}",
      "Sounds good, I'll look out for it. If it lands before noon on Wednesday I can still squeeze in a proper read before the review.\n\nSpeak soon, {{from_first}}",
    ],
  },
  {
    theme: "work-planning",
    subject: "Hiring plan for the support team",
    turns: [
      "Morning {{to_first}},\n\nI'm drafting the hiring plan for support and I keep landing on two people in September rather than three in October. The ticket volume has been flat since spring, so a third hire feels like a stretch. Does that match what you're seeing from your side?",
      "Hello {{from_first}}, yes, that matches. Median first response is under four hours now, and the backlog only grows on Mondays. I'd rather see one of the two hires cover weekend mornings than add a third body. Happy to write up the shift idea if it helps.",
      "A weekend-mornings shift is a neat way to solve the Monday pile without extra headcount. Yes, please write it up, even a half page is enough. I'll fold it into the plan and flag you as the source.",
      "Will do, half a page by Friday afternoon. I'll include the Monday numbers from the last ten weeks so nobody has to take my word for it. {{from_first}}",
    ],
  },
  {
    theme: "work-planning",
    subject: "Retro notes from the billing migration",
    turns: [
      "Hey {{to_first}}, I wrote down what I remember from the billing migration retro before it fades. Biggest points: we underestimated the invoice backfill, and the rollback plan was only tested on a staging copy that was a month stale. I'm pasting them below so you can correct me.\n\n1. Backfill took nine days, not three.\n2. Rollback rehearsal used old data.\n3. Support learned about the cutover from a customer.",
      "Thanks {{from_first}}, this is a fair summary. I'd add a fourth point, which is that the finance team approved the schema on a Friday and nobody was around to ask questions over the weekend. Not a blame thing, just timing. I'll tidy the list tomorrow and put it in the wiki.",
      "Agreed on the Friday approval, that belongs on the list. I'd phrase it as 'approvals should land before Wednesday', which is easier to act on than a complaint. Want me to take the first pass at the follow-up actions?",
      "Yes please, take the actions section and I'll keep the timeline. We can compare in the wiki draft whenever you have a quiet hour.\n\nCheers, {{from_first}}",
    ],
  },
  {
    theme: "work-planning",
    subject: "Budget lines for next quarter's tooling",
    previousKeys: ["86c4c9f20353"],
    turns: [
      "A quick question on tooling spend, {{to_first}}. The design team asked for four more seats of the prototyping app, which is about 600 a quarter, and engineering wants to move error tracking to the larger tier. I can approve one of them outright but would like your view on the other. Which would you rank first?",
      "I'd rank error tracking first. We spent two full days last month digging through logs for a bug the larger tier would have shown in minutes. The prototyping seats are nice to have, and two of the four people only open files to comment. Perhaps give them viewer access and buy two seats instead of four.",
      "Viewer access for commenters is a good compromise, and it halves the cost. I'll approve the error tracking upgrade today and ask design to come back with two seats. I'll mention it was your suggestion.\n\n{{from_first}}",
      "That works for me. If design pushes back, send them my way and I'll go through who actually edits files each week. No rush from my side.",
    ],
  },
  {
    theme: "work-planning",
    subject: "Interview loop for the data analyst role",
    previousKeys: ["f5019e898bb6"],
    turns: [
      "Good afternoon {{to_first}}, we have three candidates for the data analyst role and I'm sketching the loop. My plan is a thirty minute intro with you, a SQL exercise on Tuesday with Ines, and a final conversation with the head of product. Does that feel like too much for people who are probably interviewing elsewhere too?",
      "It feels slightly heavy, honestly. I'd fold the intro into the final conversation and keep the SQL exercise as the real filter. Candidates tend to drop out after the second call and we'd lose people for no good reason. If you want, I can sit in on the exercise instead of doing a separate intro.",
      "Folding the intro in makes sense, and having you at the exercise gives candidates a friendlier face than a stopwatch. I'll rewrite the invitations tonight and send them out tomorrow morning. Thanks for talking me out of the longer version.\n\n{{from_first}}",
      "Happy to help, it's a better experience for everyone. Let me know the times once they confirm and I'll block my calendar.\n\nBest, {{from_first}}",
    ],
  },
  {
    theme: "work-planning",
    subject: "Draft of the quarterly goals page",
    turns: [
      "Hello {{to_first}},\n\nI put together a first version of the goals page for the whole company. It has five goals, each with a single owner and one number we'll watch. I worry that five is too many. Could you tell me which one you'd drop if you had to?",
      "I'd drop the third one, the knowledge base refresh. It matters, but it doesn't have a number that moves in a quarter, and it'll quietly eat Priya's time. Maybe keep it as a background project and put it on the next list instead. The other four read clearly to me.\n\n{{from_first}}",
      "That's a fair point about the number, I couldn't think of a measure that wasn't contrived. I'll move it down to a background project and tell Priya myself so it doesn't come as a surprise. Four goals it is.",
      "Four feels right. Tell me if you want a second pair of eyes on the wording before it goes to the all-hands, I'm free after lunch on Tuesday.",
    ],
  },
  {
    theme: "work-planning",
    subject: "Handing over the vendor audit",
    turns: [
      "{{to_first}}, since I'm moving to the partnerships team next week I want to hand over the vendor audit properly. It's about two thirds done. The spreadsheet has every contract with renewal date and owner, and what's left is chasing the six contracts with no named owner. Could we find twenty minutes tomorrow to walk through it?",
      "Of course, twenty minutes tomorrow is fine, how about 10:30? I've looked at the spreadsheet and the structure is easy to follow. The only thing I'd ask is that you flag which of the six unowned contracts renew soonest, so I start with those and not with the alphabet.",
      "10:30 works. I'll add a renewal column sorted by date before we talk, and put a note against the two that renew in the next sixty days. Those are the ones I'd chase first.\n\n{{from_first}}",
      "Perfect, that's exactly what I needed. See you at 10:30 and I'll bring the questions I've collected so far, mostly about who signs off on the renewals.",
    ],
  },
  {
    theme: "work-planning",
    subject: "Capacity for the November launch",
    previousKeys: ["f03514ef089a"],
    turns: [
      "Evening {{to_first}}, I'm trying to work out whether the November launch is realistic with the people we have. By my count there are 38 working days left, and the remaining work is roughly 52 person days once I include review and fixes. That's before anyone takes holiday. Does your estimate come out similar?",
      "Mine is a bit higher, around 58, mostly because I allow more time for the payment edge cases. With two people planning leave in October I don't think it fits without cutting something. My suggestion is to drop the saved-views feature from the launch and ship it two weeks later.",
      "Saved views are the right thing to cut, it's the least tied to the pitch we've already made to customers. I'll rework the plan around 46 person days and see if that gives us a few days of margin. I'll send you the revised chart when it's ready.\n\nThanks, {{from_first}}",
      "Good plan, the margin matters more than any single feature. Send the chart whenever it's ready and I'll sanity check the dates against the leave calendar.",
    ],
  },
];
