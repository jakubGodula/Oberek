# HOWTO-ANSWER.md — how to answer a Q&A file (5 minutes to read)

You received one or more `*-q_and_a.md` files from `01-intake/qa/`. Each file belongs to one area and has an
**owner** (set in the front matter by the team lead). The owner answers; anyone can add notes.

## The rules
1. **Every question already has a default.** An empty `Answer:` means "I accept the default". You only have to write
   something where you disagree, know better, or where the question says `Blocking: yes`.
2. **`Blocking: yes` needs an explicit answer.** The plan step refuses to continue while a blocking question is empty.
   Blocking questions are the ones where a wrong default would waste days of the two weeks.
3. **Answer with the option letter first, then the reason** — `A — we already have a Helius key` is perfect.
   You may combine options (`A + C`) or write your own (`D — <text>`).
4. **Fill `Answered by / date`** so the plan can cite you. `Notes:` is free text: evidence, links, doubts.
5. **Do not edit the question, options or default text.** If a question is wrong, say so in `Notes:` and answer anyway.
6. **Do not paste secrets** (API keys, seed phrases, `.env` contents). Reference where they live instead.
7. Change the front-matter `status:` from `open` to `answered` when you are done with the file.

## Where to put the answered file
- Folder mode (this run): put the answered file back in `01-intake/inbox/` with the **same file name**, or just edit it
  in place in `01-intake/qa/` if you have write access to the shared folder. Do not rename.
- If you prefer chat: send the whole file; the TL drops it into `inbox/`.

## Optional: let a cheap model check the defaults for you
Open the file in any AI coding tool (Claude at the 20 USD tier, DeepSeek, Gemini, Cursor, Codex) with this prompt:

```
Read <path-to-this-q_and_a.md> and the repository at <repo path>. For each question, check the "Default" and
"AI recommendation" against the actual code and the docs under research/. Add evidence (file paths, versions,
links) under "Notes:" and propose an answer under "Notes:" as "Proposed: <letter> — <reason>". Do NOT fill the
"Answer:" line; a human does that. Do not change any other text.
```

## Deadline
The TL needs the answers before running Step 2 (the plan). Target: **end of day 2** of the hackathon window.
Unanswered non-blocking questions fall back to the default and are flagged in `02-plan/ANSWERS-RESOLVED.md`.
