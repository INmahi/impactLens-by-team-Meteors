# Competition Context: Earth System Trend Detective

Last updated: 2026-11-11. Team entry for the NASA Space Apps Challenge 2026.

We are building a tool that lets anyone test how the polar ice sheets, temperature and sea level are changing, and whether those changes are statistically significant. This file is the shared brief: what the challenge asks, how it is judged, and what we decided.

## 1. The challenge

**Challenge:** [Earth System Trend Detective](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/)

**Official statement (summary).** Change in the Earth system shows up in measured variables when it runs in one direction. A variable can trend one way in one region and the opposite way in another, even when the same process drives both. There are so many variables that choosing and analysing them is hard. The task: create a tool that selects variables measured by Earth science missions or produced by models, visualizes how they change over time, and determines **what** is changing, **where**, **how much**, and whether the change is **significant**.

### Objectives (all four are needed for full scope)
1. Identify Earth science variables that can be investigated for trends.
2. Acquire the data for a specific region (most trends are not global, though some are).
3. Generate and visualize a time series long enough for statistical analysis.
4. Run a basic statistical analysis: the rate of change, and its significance using a t-test, **the Mann-Kendall test**, or confidence intervals.

A response that does both the visualization and the analysis meets the full scope.

### Considerations from the brief (optional, but judges will notice)
- **Audience:** high school and college students, and the public with some science background.
- Give **simple definitions** of the variables.
- Make users **data detectives**: find a variable, then test whether it trends and whether the trend is significant.
- A **short series of questions** about what and where to investigate, leading to suggested variables.
- **A couple of demonstration examples** users can watch.
- Optional AI to suggest variables from news, papers or region type.
- Daily and monthly data are the easiest to process.
- **A trend that is not significant is still interesting**; it may only need a longer record.
- Trends can be non-linear or hidden by the **seasonal cycle**. Linear trends are a great start.
- Instruments and models named in the brief: MODIS, OMI, AIRS, GPM, MERRA-2, GLDAS.

### The challenge video
Dr. James Aker (NASA Goddard) frames the app as five steps ([video](https://www.youtube.com/watch?v=Cd9Q48LhNbo)):
1. Select one or more variables.
2. Define the region for spatial averaging.
3. Choose the time period. Weekly or monthly averages are easier than hourly.
4. Generate the time series and inspect it.
5. Evaluate significance: compute a p-value; significant if p < 0.05.

His demo: monthly MODIS aerosol optical depth over Wisconsin, built in NASA Giovanni.

## 2. Our direction

**One connected story: ice, heat and sea level, at both poles.**

| Variable | What the user sees | Region |
|---|---|---|
| Ice sheet mass | How much ice each sheet holds, over time | Greenland, Antarctica, West/East Antarctica, Peninsula |
| Ice mass loss rate | How fast the mass is changing each year | Same |
| Ice extent | The area the ice covers | Greenland |
| Temperature | Air temperature over each ice sheet | Greenland, Antarctica |
| Mean sea level | Is sea level rise in this region significant? How does it compare with another region? | Global mean, and coastal seas (Bay of Bengal and others) |

Ice mass, loss rate and extent are three views of one thing and sit together as sub-variables of "Ice sheet".

**What makes it fit the challenge**
- **Same planet, opposite poles, different response.** Greenland loses ice largely through summer surface melt. Antarctica loses ice mainly through warm ocean water thinning West Antarctic glaciers; most of its surface stays below freezing. This is the brief's "one way in one region, another way in another" in its clearest form.
- **Compare two or more variables.** Time against ice mass; ice mass against temperature; ice loss against sea level rise.
- **Compare two regions' sea level.** Is the rise in the Bay of Bengal significant, and is it faster than the global mean or another coastal sea? (Decided 2026-11-12: sea level is regional, not global only.)
- **Every answer is tested.** Every series goes through the Mann-Kendall test with Sen's slope, the method the brief names.
- **Honest results.** Short records are flagged, and "not significant" is explained as "cannot tell yet".

**Why this matters to Bangladesh.** Sea level rise is the link between polar ice and a delta country. That is our story for local judges: what happens at the poles arrives at our coast, and the user can test the Bay of Bengal directly.

**Science lines we must not cross**
- Never say warm air is melting Antarctica.
- Two lines that move together do not prove cause. Trending series always correlate.
- Regional sea level is satellite sea level averaged over a sea area, not the value at a town. It leaves out land sinking (subsidence), which in the Bangladesh delta can add several mm per year to the rise people feel. The global mean is never shown as a local value.
- Ice loss is one part of sea level rise; ocean warming and mountain glaciers are the rest.

**A second, lower-priority story:** vegetation loss and urban growth in South and East Asia (MODIS NDVI and VIIRS night lights). Build it only if the ice story is finished.

## 3. Space Apps 2026 logistics

| Item | Detail |
|---|---|
| Global dates | November 14-15, 2026 |
| Guides released | November 13: Project Submission guide, Judging & Awards guide, Global Offers |
| Team size | Up to 6 |
| Global window (2025 pattern) | Opens Saturday 9:00 AM, closes Sunday 11:59 PM local time |
| Bangladesh host | BASIS, across nine cities including Sylhet |
| Bangladesh format (past years) | 36 uninterrupted hours; in 2024 it ran a day ahead of the global weekend |

**Plan for about 30 hours of real build time.** Confirm the exact start, deadline and pitch format with the Sylhet local lead.

### Submission package (confirm in the November 13 guide)
- Project page with title and description
- Short demo: in past years, a 30-second video or a short slide deck
- Link to the working project and a public code repository
- List of NASA and partner data used, and disclosure of AI tools used
- Submit at least two hours early; the site slows near the deadline

## 4. Judging and awards

Five criteria, equally weighted:

| Criterion | What judges ask | How we answer |
|---|---|---|
| Influence | How big is the problem, how many does it help? | Sea level rise affects every coast; the tool is for students and the public |
| Creativity | How original? | Pole-to-pole comparison, multi-variable view, "years until significant" |
| Validity | Is it scientifically sound? | Mann-Kendall with autocorrelation correction, tested against a reference and on known-answer simulations |
| Relevance | Does it answer this challenge? | Every screen answers what, where, how much, significant |
| Presentation | Is the story clear? | Verdict first, one real finding, a tight video |

**Process:** local judges pick Global Nominees (historically about 1 in 10), NASA and partner experts pick Global Finalists, executive judges pick one Global Winner per award.

**Global Awards:** Best Use of Science, Best Use of Data, Best Use of Technology, Galactic Impact, Best Mission Concept, Most Inspirational, Best Storytelling, Global Connection, Art & Technology, and one more (confirm in the 2026 guide).

**Our targets:** Best Use of Science, Best Use of Data, Best Storytelling.

**The prize, realistically:** no large cash prize. Global Winners are invited to a celebration at a NASA facility; in past years winners covered their own travel. The lasting value is NASA-recognized work on our CVs.

**Use NASA data first.** Temperature should come from a NASA product (MERRA-2 or GISTEMP), with ERA5 as a secondary source. IMBIE is an ESA and NASA collaboration. State every source on the project page.

## 5. What wins
1. **Presentation carries it.** One real finding, told in 30 seconds, beats fifteen features.
2. **Scientific validity.** Our statistics are the strongest part; show the proof (the simulation table and the published-value benchmarks) on a slide.
3. **It works live.** A deployed link that needs no server to run an analysis.
4. **Narrow and polished.** Ice mass and temperature done perfectly beat five variables half-working.
5. **Answer the brief's own words** on the results screen: what, where, how much, significant.

## 6. Rules and how we work
- We build a full version before the event, then **rebuild from scratch in a fresh repository** during the hackathon.
- The rebuild is a real rebuild. Copying old code into a new repository is not.
- Fine to bring: processed data, the data contract, designs, written copy, videos, the runbook, open-source libraries.
- Ask the Sylhet local lead how they treat work done before the event.
- Commit early and often during the event.

## 7. Checklist before the event
- [ ] Confirm schedule, deadline, pitch format and pre-work rule with the local lead
- [ ] Earthdata accounts for every member; a CDS account if ERA5 is used
- [ ] Dataset cards written for every source (coverage, format, access, caveats)
- [ ] Data downloaded and processed for Greenland and Antarctica
- [ ] Statistics benchmarks against published values, with citations
- [ ] Screens designed; all text written (variable descriptions, verdicts, notes)
- [ ] Describe-popup videos rendered
- [ ] Version 1 working on synthetic data, then on real data
- [ ] Rebuild runbook written; one timed rebuild rehearsal
- [ ] Video script and slide outline drafted
- [ ] Power and internet backup for the venue

## Sources
- [Challenge page](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/)
- [Challenge video](https://www.youtube.com/watch?v=Cd9Q48LhNbo)
- [Space Apps 2026](https://www.spaceappschallenge.org/2026/)
- [Participant FAQ](https://www.spaceappschallenge.org/resources/participant-faqs/)
- [Judging & Awards guide](https://spaceappschallenge.org/resources/judging-awards-guide)
- [Global Awards](https://www.spaceappschallenge.org/resources/global-awards/)
- [Bangladesh 2024 edition, 36 hours](https://www.tbsnews.net/node/958221)
- [Bangladesh 2025 edition, nine cities](https://digibanglatech.news/158002)

Logistics come from past years and search results. Confirm them against the official guides released on November 13.
