# Premium: scope for accounts, the API and paid tiers

This scopes a **Premium** offering for the Program Builder: accounts, an API that saves programs to them, and two paid tiers, **Individual** and **Group**. Nothing here is built yet. The decisions taken so far are listed in section 6. The builder isn't public yet, so its current behaviour can change without carrying existing users over.

## 1. The tiers

| | Signed out | Free account | Individual | Group |
| --- | --- | --- | --- | --- |
| Use the builder, print, PDF, spreadsheet, calendar file | Yes | Yes | Yes | Yes |
| Saved programs | **1**, in this browser | **3**, in the account | Unlimited | Unlimited |
| Use them on any device | – | Yes | Yes | Yes |
| Leaders with every Premium feature | – | – | Just you | The owner **plus 10 leaders**, and more places at extra cost |
| Group library, shared styling, unit programs (section 2) | – | – | – | Yes |
| Version history, live family link, calendar subscription | – | – | Yes | Yes, for every leader in the group |
| Group program, linked both ways with unit programs (section 8) | – | – | – | Yes, in the second release |
| Price (AUD, incl. GST) | Free | Free | $4/month or $36/year | $12/month or $99/year, and yearly can be paid by invoice. Each place beyond 10: $1/month or $9/year *(proposed)* |

How the rules work:

- **Who has Premium.** A person has Premium while they have an active Individual subscription, **or** they're an active member of a group whose Group subscription is active. Having both is fine; nothing doubles up.
- **Signed out, one program.** The browser keeps one program. Starting another, opening a file or duplicating asks the leader to sign in (free), or replaces the program on this device after offering *Save file* first. *Programs*, *New program* and *Duplicate* lead to the sign-in for anyone signed out.
- **The free cap of 3.** The cap counts a person's own programs in their account, not deleted ones. Programs that belong to a group don't count against anyone's cap. The server enforces it, so it can't be got around.
- **The owner of a group** can be anyone, including a treasurer or committee member who pays and manages the leaders but doesn't write programs. The owner doesn't use one of the 10 leader places.
- **More places.** A group can add places beyond the 10, one at a time, at a cost per place (proposed A$1 a month or A$9 a year, so 11 to 20 leaders cost less each than the base plan). They're added to the same subscription: billed pro rata for the rest of the period, or added to the next invoice for groups paying by invoice. Places can be removed again, but not below the number of leaders and pending invites. Inviting a leader when every place is taken offers *Add a place* to the owner and admins.
- **Editors from outside the group.** A unit's main leader can let someone from outside the group edit that unit's programs if they have Premium of their own (Individual, or through another group), for example a leader from a neighbouring group running a joint camp. They don't use one of the group's places, and they see only that unit's programs, not the rest of the group. If their Premium lapses, the access becomes view-only until it returns or they're removed.
- **Several groups.** A leader can belong to more than one group (for example helping at two), with one account. Each group has its own subscription.
- **When Premium ends** (cancelled, a payment fails after the grace period, or a leader is removed from a group):
  - nothing is deleted;
  - every program can still be opened, edited, exported and deleted;
  - only *creating* a new program is blocked until there are fewer than 3;
  - Premium-only features (history, live links) stop, but their data is kept for 12 months in case Premium comes back.
- **Failed payments.** Stripe retries for 14 days before the subscription counts as lapsed.

## 2. Premium features

**First paid release** (the minimum, plus what makes it worth paying for):

1. **Unlimited programs saved to the account,** on any device. Free accounts get the same thing for up to 3.
2. **Group library** (Group tier). Programs saved to the group are visible to every leader in it, and stay with the group when a leader leaves. A leader picks *My programs* or *[Group name]* when saving. Each group program belongs to a unit (Joeys, Cubs and so on), and who can edit it follows section 2.1.
3. **Shared styling** (Group tier). The group's styling, leaders, patrols, challenge areas and highlights are saved once and used by every new program in the group. The settings that `newProgram()` already carries over become group-level settings.
4. **Version history.** Every save is kept for 90 days, and any earlier version can be restored. This covers "someone in the group deleted my week".
5. **Live family link.** A read-only web page of the program at a short address, always the latest version, for the group's Facebook page or newsletter. It replaces sending a new PDF after every change.
6. **Calendar subscription.** A `webcal://` address families add once. Their calendar then updates when the program changes, rather than the one-off `.ics` file they get now.

**Second release:**

7. **Group program** (Group tier). One program of group events (camps, parades, fundraisers, working bees) that appear automatically in each unit's program, with each unit's own activities showing back in a week-by-week overview of the whole group. See section 8.

**Later, if there's demand:**

8. **Activity library.** Search and reuse activities from past programs (with their descriptions, costs and forms).
9. **Templates.** Start a term from last year's Term 2, or from a group template.

### 2.1 Who can edit a unit's programs

- **By default, that unit's leaders.** Each leader in a group is set to the units they lead (for example Cubs, or Cubs and Scouts). They can edit that unit's programs. Everyone else in the group can view them.
- **The main unit leader** of each unit (one per unit, chosen by the owner or an admin) can invite other leaders in the group to edit that unit's programs too, for example a Scouts leader helping with a Cubs camp, and can remove them again. They can also invite someone from outside the group who has Premium of their own (section 1).
- **The owner and admins** choose each unit's main leader and set which units each leader leads. They manage the group but, unless they're one of the unit's leaders, they view its programs rather than edit them. If a unit has no main leader, they can step in as one.
- A leader's *My programs* are only theirs, whatever their units.

Out of scope for now: editing together live (two leaders typing at once; section 4.3 handles clashes instead), youth member records, payments from families, and Terrain integration.

## 3. The API

### 3.1 Where it runs

The API reuses the stack planned for Pinewood Control in `pinewood-control/docs/deployment-plan.md`: Node with Express and Prisma, Postgres 16 and Caddy, in one `docker compose` on the VPS, with nightly backups. It gets its own database and its own container, so the two apps can't affect each other.

- **Address.** The builder and the API should share a domain, for example `programs.<domain>` and `api.<domain>`. Sign-in can then use an ordinary secure cookie. Browsers increasingly block the cross-site cookies that `no5tyle.github.io` talking to a VPS address would need. This depends on buying the domain discussed earlier.
- **The builder stays a static site** on GitHub Pages. Without an account it still works, for one program kept in the browser, and it works without a connection. The API adds saving to an account.

### 3.2 Signing in

Use **email sign-in codes, not passwords.** The leader enters their email and gets a 6-digit code (and a link) to type in. There's no password to forget, and it suits leaders who aren't comfortable with technology. *Sign in with Google* and *Sign in with Microsoft* can be added later.

The session is an `HttpOnly`, `Secure`, `SameSite=Lax` cookie that lasts 90 days and renews as it's used. Requests that change anything must carry an `Origin` header matching the builder's address.

### 3.3 Endpoints

Everything is under `/api/v1` and uses JSON. Errors are always `{ "error": { "code": "...", "message": "..." } }`, and the message is in plain words the builder can show as is.

**Account**

| Method and path | Does |
| --- | --- |
| `POST /auth/code` `{ email }` | Emails a sign-in code. Always answers 204, so nobody can find out which emails have accounts. Rate-limited per email and per IP. |
| `POST /auth/verify` `{ email, code }` | Signs in (creating the account the first time) and sets the cookie. |
| `POST /auth/logout` | Signs out on this device. |
| `GET /me` | The person and what they can do: `{ user, premium: { active, via: "individual" \| "group", until }, programs: { count, limit }, groups: [...] }`. The builder reads its limits from here instead of hard-coding them. |
| `PATCH /me` `{ name }` | Changes their name. |
| `GET /me/export` | All their data, as a zip of program files. |
| `DELETE /me` | Deletes the account after confirmation. Programs they own go too; group programs stay with the group. |

**Programs**

| Method and path | Does |
| --- | --- |
| `GET /programs?owner=me` or `?owner=group:{id}` | Lists programs: `id, name, groupName, year, term, updatedAt, updatedBy, version, owner`. |
| `POST /programs` `{ id, name, owner, data }` | Saves a new program. `id` is the id the builder already gives each program, so the same program keeps one id on every device. Answers **403 `program_limit`** when a free account already has 3. |
| `GET /programs/{id}` | The program, with `ETag: "<version>"`. |
| `PUT /programs/{id}` with `If-Match: "<version>"` | Saves changes and answers with the new version. If someone else saved first, it answers **412 `version_conflict`** with their version (section 4.3). |
| `DELETE /programs/{id}` | Moves it to a bin for 30 days. |
| `POST /programs/{id}/restore` | Brings it back from the bin. |
| `POST /programs/{id}/move` `{ owner }` | Moves it between *My programs* and a group (Premium). |
| `POST /programs/import` `{ programs: [...] }` | Uploads the program kept in this browser at first sign-in (or programs from *Open* files). Answers `program_limit` for any past a free account's 3. |
| `GET /programs/{id}/versions`, `GET .../versions/{v}`, `POST .../versions/{v}/restore` | Version history (Premium). |

**Groups** (Group tier)

| Method and path | Does |
| --- | --- |
| `GET /groups/{id}` and `PATCH /groups/{id}` `{ name }` | The group's details, and renaming it. |
| `GET /groups/{id}/settings` and `PUT /groups/{id}/settings` | Shared styling and lists (feature 3). |
| `GET /groups/{id}/members` | Members and pending invites, with the places used out of the group's total (10 plus any extra), and outside editors listed separately. |
| `POST /groups/{id}/invites` `{ email }` | Emails an invite. Answers **409 `seats_full`** when every place is taken, counting pending invites. Owner and admins only. |
| `PUT /groups/{id}/places` `{ extra }` | Sets the number of places beyond 10, updating the Stripe subscription's quantity (pro rata, or on the next invoice). Answers `409 places_in_use` if it would go below the leaders and pending invites. Owner and admins. |
| `POST /invites/{token}/accept` | Joins the group (signing in first if needed). |
| `DELETE /groups/{id}/invites/{inviteId}` and `DELETE /groups/{id}/members/{userId}` | Cancels an invite or removes a leader. A leader can also remove themselves. |
| `POST /groups/{id}/owner` `{ userId }` | Hands the group (and its billing) to another member. |
| `PATCH /groups/{id}/members/{userId}` `{ role, sections }` | Sets a leader's role (admin or leader) and the units they lead. Owner and admins. |
| `PUT /groups/{id}/units/{section}` `{ mainLeaderId }` | Chooses a unit's main leader. Owner and admins. |
| `POST /groups/{id}/units/{section}/editors` `{ userId }` or `{ email }` and `DELETE .../editors/{userId}` | Lets another leader edit the unit's programs, or stops it. By `email`, it invites someone outside the group: they must have Premium of their own to accept (`402 premium_required` otherwise, with a link to get it). The unit's main leader, the owner and admins. |

**Billing** (Stripe)

| Method and path | Does |
| --- | --- |
| `POST /billing/checkout` `{ plan: "individual" \| "group", interval: "month" \| "year", groupName? }` | Returns a Stripe Checkout address to send the person to. Buying Group creates the group, with the buyer as owner. |
| `POST /billing/invoice` `{ groupName, billingEmail, abn? }` | Group, yearly: sets the subscription up to be paid by invoice (bank transfer). Stripe emails the invoice with 30 days to pay, and Premium starts straight away. |
| `POST /billing/portal` | Returns a Stripe Customer Portal address for changing the card, the plan or cancelling. |
| `POST /billing/webhook` | Stripe's notices (`checkout.session.completed`, `customer.subscription.updated` and `.deleted`, `invoice.payment_failed`). These are the only things that change a subscription's status, so the builder never decides who has paid. |

**Public pages** (Premium; no sign-in needed to view)

| Method and path | Does |
| --- | --- |
| `GET /p/{slug}` | The live family page for a program whose owner has turned its link on. |
| `GET /p/{slug}.ics` | The calendar subscription for it. |

### 3.4 Data

```
users            id, email (unique), name, created_at, last_seen_at
login_codes      email, code_hash, expires_at (10 min), attempts            -- 5 tries, then a new code
sessions         id, user_id, created_at, expires_at, user_agent
subscriptions    id, plan (individual|group), status (active|past_due|canceled), interval, pays_by (card|invoice),
                 extra_places (int, default 0),
                 stripe_customer_id, stripe_subscription_id, current_period_end,
                 user_id (individual) | group_id (group)
groups           id, name, owner_id, settings (jsonb), created_at
group_members    group_id, user_id, role (owner|admin|leader), sections text[] (units they lead), joined_at
                                                                             -- unique (group_id, user_id)
group_units      group_id, section, main_leader_id                           -- one main leader per unit
unit_editors     group_id, section, user_id | invited_email, outside (bool), invited_by, at
                                                     -- extra editors for a unit; outside ones need Premium
group_invites    id, group_id, email, token_hash, invited_by, expires_at (14 days)
programs         id (the builder's id), owner_user_id | owner_group_id, section, name, group_name, year, term,
                 data (jsonb), version, updated_at, updated_by, deleted_at, public_slug
program_versions program_id, version, data (jsonb), created_at, created_by    -- kept 90 days (Premium)
```

- A program's `data` is exactly what the builder saves in the browser today (`state`), so nothing is converted and *Save file* and *Open* keep working.
- A program is capped at 2 MB. The section or uploaded logo is the biggest part, and it's already shrunk to 400 px.
- The seat check counts members plus pending invites, inside the same transaction that adds one, so two invites sent at once can't go over. The owner and outside editors aren't counted.
- Whether an outside editor can edit is checked on every write against their own Premium, not stored.
- Every program write checks the rules in section 2.1 on the server: a group program's `section` decides who may change it.

## 4. Changes to the builder

### 4.1 What leaders see

- **Sign in** sits in the top bar (and the phone menu), with the line *Save your programs to your account, to use on any device*. Once signed in, it shows their initial, and opens a small menu: *Account*, *Group* (if any), *Sign out*.
- **The save message** by Undo says where things are: *Saved to your account*, *Saved on this device* (signed out), or *Offline: saved on this device, will upload when you're back online*.
- **Programs** groups the list under *My programs* and each group the leader belongs to (by unit within a group), each marked with who last changed it and when ("Akela, yesterday"). Programs a leader can only view are marked *View only*. Signed out, it shows the one program on this device and *Sign in to keep more than one*.
- **The 4th program** on a free account doesn't fail. A friendly box explains the limit and offers *Go Premium*, *Delete an old program* or *Not now*.
- **First sign-in** uploads the program on this device to the account, after asking.
- **The Account page** shows the plan, *Manage billing* (Stripe's page), *Download all my programs* and *Delete my account*.
- **The Group page** (for the owner and admins) lists the leaders and the units each leads, shows *Invite a leader* with the places left (for example "7 of 10 used") and *Add places*, sets each unit's main leader, and removes leaders. A unit's main leader sees their unit there, with *Let another leader edit*.
- **Several groups:** a leader in more than one group switches between them in *Programs*.
- **Help** gets three new answers:
  - *How do I use it on another computer?* now answers "Sign in".
  - *How do I give it to another leader?* now answers "Save it to your group".
  - A new one: *What does Premium add?*

### 4.2 Saving and offline

The browser's copy stays the working copy, so the builder is as fast as it is now and works with no signal at a campsite.

- Each change is saved locally straight away, as now.
- For a signed-in leader, the same debounced save then sends `PUT /programs/{id}` with the version it last had.
- Saves made offline are queued and sent when the connection is back.
- On opening a program, the builder checks `GET /programs/{id}` and takes the newer copy.

### 4.3 When two leaders change the same program

When a `PUT` gets `412 version_conflict`, the builder shows both versions side by side, with when and by whom each was changed. The leader picks one of:

- *Keep mine*
- *Keep theirs*
- *Keep both* (theirs stays; mine is saved as a copy)

Nothing is ever lost silently. This is enough while live joint editing is out of scope. Version history (feature 4) is the backstop.

### 4.4 One program in the browser

Signed out, the builder keeps one program in the browser. For a signed-in leader, the browser also holds a working copy of the programs they open, for speed and offline use (section 4.2). That copy is a cache of the account, not a separate save, and it's cleared on *Sign out*.

Today the builder keeps any number of programs in the browser. Because it isn't public yet, this changes outright, with nothing to carry over: *Programs*, *New program* and *Duplicate* lead to sign-in when signed out.

## 5. Privacy and safety

Programs hold leaders' names and phone numbers, and sometimes young people's names in the notes. Once they're on a server, the Australian Privacy Principles apply. In practice:

- **Policies.** A short privacy policy and terms of use, linked from *Sign in* and the Account page.
- **Where data is kept.** In Australia if the VPS is (check its region), encrypted in transit, with database backups encrypted.
- **Downloading and deleting.** Leaders can download everything (`GET /me/export`) and delete their account (`DELETE /me`) themselves. Deleted programs are purged from backups within 35 days.
- **A note in the editor.** Ask leaders not to put young people's personal details in programs, in line with Scouts Australia's child safety and privacy guidance.
- **Live family links (feature 5).** They're off by default, and each program's link is turned on separately. The page shows only what the printout shows. Leader phone numbers are hidden unless the owner chooses to show them.
- **What gets logged.** Ids and error codes, never program contents. Stripe holds the card details; the API never sees them.
- **GST.** If the business registers for GST, Stripe Tax can add it to prices.

## 6. Decisions

Taken:

1. **Free accounts** save up to 3 programs to the account.
2. **Signed out,** the browser keeps only one program (section 4.4). Not public yet, so no carry-over for current behaviour.
3. **Group places:** the owner plus 10 leaders, and more places at a cost per place. The owner can be someone who only pays and manages.
   - **Editors from outside the group** are allowed for a unit if they have Premium of their own, without using a place.
4. **Several groups** per leader, each with its own subscription.
5. **Prices:**
   - Individual: A$4 a month or A$36 a year.
   - Group: A$12 a month or A$99 a year, with yearly payable by invoice.
6. **Editing a unit's programs:** that unit's leaders, plus leaders the unit's main leader invites (section 2.1).
7. **The group program** can be changed by any leader in the group. Its changes apply automatically, with a notice, and joint activities wait for the invited unit to accept (section 8).
8. **The group overview** shows what families see: date, time, activity, where and weeks off.
9. **The first paid release** has unlimited programs, the group library and shared styling, version history, live family links and calendar subscriptions. The group program follows in the second release.

Still open:

- **The domain** (section 3.1) isn't bought yet. It's needed before phase 1, because accounts need the builder and the API on the same domain. `<domain>` stands in for it here.
- **The VPS's region,** for where data is kept (section 5).
- **GST registration,** which decides whether Stripe Tax is needed.
- **The price of extra places.** Proposed A$1 a month or A$9 a year each.

## 7. Building it, in phases

| Phase | Includes | Size |
| --- | --- | --- |
| 0. Before | Buy the domain; point the builder and `api.<domain>` at it; privacy policy and terms | Small |
| 1. Accounts and saving | API service on the VPS, email codes, `/me`, the program endpoints with version checks, the offline queue, the conflict box, uploading on first sign-in, one program when signed out, the cap of 3, the Account page, Help updates | Large: most of the work, and everything later builds on it |
| 2. Paying | Stripe products, Checkout and Portal, invoices for yearly Group, the webhook, the grace period and lapse rules, the Premium prompts | Medium |
| 3. Groups | Groups and several per leader, invites and places, extra places, outside editors, the group library, moving programs, shared styling, roles, units and their main leaders and editors, handing over ownership | Medium |
| 4. Reasons to stay | Version history, live family links, calendar subscriptions | Medium |
| 5. Group program | Group events, linked unit programs, joint activities, the overview, group printout and group calendar, *From the group* notices (section 8) | Large: the most involved part |
| 6. Later | Activity library, templates, Google and Microsoft sign-in | As needed |

Phases 1 to 4 are the first paid release. The group program (phase 5) is the second.

**Testing.**

- **The API:** tests against a real Postgres in CI, covering the cap, places (including two invites at once, extra places and removing them), outside editors whose Premium lapses, who can edit each unit's programs, version conflicts, every webhook, invoices and the lapse rules.
- **The builder:** Playwright tests with the API mocked, covering offline, conflicts, one program when signed out, the 4th program, view-only programs and first sign-in upload.
- **One end-to-end test** against a test deployment, using Stripe's test mode.

## 8. The group program

A Scout group runs several units (Joeys, Cubs, Scouts, Venturers, Rovers), each with its own program. Some things belong to the whole group: Anzac Day, the group camp, the Bunnings sausage sizzle, a working bee, a joint Cubs and Scouts night. Today each unit leader types those into their own program by hand. When one moves, every program is out of date.

The **group program** is one program of group events. It's linked both ways:

- **Down:** group events appear in each unit's program automatically, and stay up to date when they change.
- **Up:** each unit's activities show in the group program's overview, a week-by-week view of every section, which is always current.

It's part of the Group tier, in the second release. Any leader in the group can add and change group events.

### 8.1 What it holds

A **group event** has:

- the same details as a program row: date and end date, time, title, description, where, uniform, cost and forms;
- **Sections:** which units it's for (*All*, or for example Cubs and Scouts).
- **How it fits:** either
  - *Instead of the meeting*: it replaces that week's meeting for those sections, as a camp weekend or a parade on the meeting night would;
  - *In addition*: it's added on its own day, and the meeting goes ahead.
- **Status:** *Confirmed*, or *Proposed* while a joint activity waits for the other sections to accept (section 8.4).

A unit program is **linked** to the group program when it's saved to the group with its section and term set. There's one linked program per section per term (for example "Cubs, Term 3 2027"). Copies and drafts aren't linked. When a unit leader saves a program to the group, the builder asks *Is this your Cubs program for Term 3 2027?*.

### 8.2 Down: group events in unit programs

- **New programs.** A new unit program for a term starts with that term's group events already in it, after *Generate meeting dates*.
- **Changes.** When a group event is added, changed or removed, every linked unit program for its sections updates. The unit leader sees a *From the group* notice next time they open it: "Group camp moved to 14–16 Aug · Working bee added, Sat 2 May". From the notice they can go to each changed row.
- **How they show.** Linked rows are marked with a small group badge. The group program sets the event's details:
  - date, time and title;
  - description, where, uniform, cost and forms.

  Clicking one of those says *Set by the group program* and offers *Change it in the group program* (which changes it for every unit), or *Make it our own*. *Make it our own* turns the row into an ordinary row that no longer updates.

  The unit keeps its own:
  - leader;
  - duty patrol;
  - notes;
  - highlight and styling.

  These are never overwritten.
- **Instead of the meeting.** That week's meeting row becomes the group event. If the unit had already planned an activity that night, it isn't deleted. It moves to a **Needs a new date** list at the bottom of the program, to drag into another week or delete.
- **Not going.** A unit can choose *Not attending* for a group event, so it's hidden from their program and printout. The group program shows "Joeys: not attending". The unit can't delete a linked row outright, because it would come back on the next change.
- **Weeks outside the term.** An event in the holidays adds that week to the unit's program, using the existing week-before/week-after handling, and the *Hols* row.

**How this avoids clashes.** Group events are stored once, on the server, not copied into each unit program.

- The API sends them with the unit program, and the builder places them among its rows.
- The unit's own settings for a linked row (its leader, patrol, notes, styling, *Not attending*) are stored in the unit program, by event id.
- A group change therefore never edits a unit program, and never causes a version clash with a unit leader's own edits (section 4.3).
- When the builder is offline it uses the group events it last fetched, and catches up when back online.

### 8.3 Up: the group overview

The group program has two views:

- **Group events:** the list any leader in the group can edit. It's like a program, with columns for Date, Event, Sections, *Instead of the meeting*, Where and Cost.
- **Overview:** a table of weeks down the side and sections across the top. Each cell shows that unit's activities for the week, with group events across all their sections. Weeks off, *Not attending* and clashes are marked; a clash is, for example, two sections booked into the hall at the same time.

The overview is built from the linked unit programs each time it's opened, so it's always current, and nothing is copied. It shows only what the unit's printout shows (date, time, activity, where, weeks off), never leader contacts or notes.

It can be:

- printed, or saved as a PDF, landscape, for families with children in several sections;
- shared as a live family link, with a section filter;
- subscribed to as a calendar of the whole group or chosen sections, with each event labelled by section.

### 8.4 Up: from a unit to the group

From a unit row's ⋮ menu, *Share with the group* offers:

- **Joint activity:** invites other sections (for example "Cubs invite Scouts to the Night Hike"). It shows as *Proposed* in the group program and in the invited units' *From the group* notices. When a unit's leader accepts, it becomes a linked row in their program. If they decline, the proposing unit is told.
- **Make it a group event:** moves it into the group program for the sections chosen. It applies to them straight away, like any group event.

Once it's a group event, the row in the proposing unit's program becomes a linked row like any other.

### 8.5 Who can do what

| | Any leader in the group | A unit's leaders and its invited editors |
| --- | --- | --- |
| Add, change, remove group events | Yes | Yes |
| The unit's program, and linked rows' own fields | View | Yes |
| Accept or decline joint activities for the unit | – | Yes |
| *Not attending*, *Make it our own* for the unit | – | Yes |
| See the overview | Yes | Yes |

Editors from outside the group edit their unit's program and its linked rows' own fields, and answer joint activities for it. They don't change group events or see the overview or other units' programs; group events show in their unit's program as for anyone.

The group's *From the group* notices name who made each change ("Bagheera moved the group camp"). Version history on the group program (feature 4) can undo a change made by mistake.

### 8.6 API additions

| Method and path | Does |
| --- | --- |
| `GET /groups/{id}/terms/{year}-{term}` | The group program for a term: its events, with each section's response. |
| `POST /groups/{id}/events` | Adds a group event (any leader in the group). |
| `PATCH /groups/{id}/events/{eventId}` with `If-Match` | Changes it, and answers `412 version_conflict` if someone changed it first. |
| `DELETE /groups/{id}/events/{eventId}` | Removes it from the group program and every linked program, keeping a notice. |
| `POST /groups/{id}/events/{eventId}/responses` `{ section, response: "accept" \| "decline" \| "not_attending" \| "attending" }` | A unit's answer to a joint activity, or *Not attending*. |
| `POST /programs/{id}/rows/{rowId}/share` `{ kind: "joint" \| "group", sections, fits: "instead" \| "extra" }` | Shares a unit row with the group (section 8.4). |
| `PATCH /programs/{id}` `{ linked: true, section, year, term }` | Makes a program the linked one for its section and term. Answers `409 already_linked` with the current one, which can be swapped. |
| `GET /programs/{id}` | Adds `groupEvents` (this term's events for its section) and `groupEventsVersion` to the existing response. `GET /programs/{id}/group-events?since=` fetches only changes. |
| `GET /groups/{id}/overview?year=&term=` | The overview table. |
| `GET /groups/{id}/changes?since=&section=` | The *From the group* notices. |
| `GET /g/{slug}` and `GET /g/{slug}.ics?sections=cubs,scouts` | The public group page and group calendar (when turned on). |

Data:

```
group_events          id, group_id, year, term, date, end_date, time, title, description, where_text, uniform,
                      cost, forms, sections text[], fits (instead|extra), status (proposed|confirmed),
                      proposed_by_program_id, version, created_by, updated_by, updated_at, deleted_at
group_event_responses event_id, section, response (accepted|declined|not_attending), by, at   -- one per section
group_changes         id, group_id, event_id, sections text[], kind (added|changed|removed|proposed|answered),
                      summary, by, at                                                    -- kept 1 year
programs              + section, + linked (bool)                       -- unique (group, section, year, term) when linked
```

A unit program's data keeps, for each group event, `groupLinks: { [eventId]: { leader, patrol, notes, category, style, notAttending } }`, and its own rows as now. The builder joins the two to render, print and export.

### 8.7 In the builder

- **Programs.** It lists *Group program, Term 3 2027* at the top of the group's programs, for everyone in the group to view and change.
- **Group program editor.** It reuses the program sheet, with the group event columns and a **Sections** picker (chips for each section). It has tabs for *Group events* and *Overview*.
- **Unit programs.**
  - Linked rows show the group badge.
  - The *From the group* notice appears on opening.
  - The *Needs a new date* list sits under the program, and only shows when it has something in it.
  - The row menu gains *Share with the group*, and, on linked rows, *Not attending* and *Make it our own*.
- **Phones.**
  - Linked rows show the badge in the week list.
  - The editor shows the group's fields as read-only, with the unit's own fields below.
  - The *From the group* notice appears as a banner above the list.
- **Help.** New answers: *Where do group events come from?* and *How do I invite another section?*.

### 8.8 Testing

- **API:**
  - changing or removing an event updates every linked program's `groupEvents`, and only those for its sections;
  - *Instead of the meeting* moves a planned activity to *Needs a new date*, without losing it;
  - responses and permissions behave as section 8.5 sets out;
  - the overview leaves out notes and contacts;
  - a group change never causes a `412` on a unit program.
- **Builder** (with the API mocked):
  - linked rows render, print and export (PDF, spreadsheet, calendar) like ordinary rows;
  - group fields can't be edited, and the unit's own fields can;
  - the notice and *Not attending* work;
  - offline uses the last fetched events.
