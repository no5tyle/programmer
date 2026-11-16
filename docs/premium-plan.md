# Premium: scope for accounts, the API and paid tiers

This scopes a **Premium** offering for the Program Builder: accounts, an API that saves programs to them, and two paid tiers, **Individual** and **Group**. Nothing here is built yet. Prices, names and limits marked *(decide)* are proposals to settle before building.

## 1. The tiers

| | Free | Individual | Group |
| --- | --- | --- | --- |
| Use the builder, print, PDF, spreadsheet, calendar file | Yes | Yes | Yes |
| Saved programs | **3** | Unlimited | Unlimited |
| Saved to an account (any device) | Yes, the same 3 *(decide, 6.1)* | Yes | Yes |
| Leaders with every Premium feature | Just you | Just you | The owner **plus up to 10 leaders** *(decide, 6.2)* |
| Programs shared across the group | – | – | Yes |
| The Premium features in section 2 | – | Yes | Yes, for every leader in the group |
| Suggested price (AUD, incl. GST) *(decide)* | Free | $4/month or $36/year | $12/month or $99/year |

How the rules work:

- **Who has Premium.** A person has Premium while they have an active Individual subscription, **or** they're an active member of a group whose Group subscription is active. Having both is fine; nothing doubles up.
- **The free cap of 3.** The cap counts a person's own saved programs, not deleted ones. Programs that belong to a group don't count against anyone's cap.
- **When Premium ends** (cancelled, a payment fails after the grace period, or a leader is removed from a group):
  - nothing is deleted;
  - every program can still be opened, edited, exported and deleted;
  - only *creating* a new program is blocked until there are fewer than 3;
  - Premium-only features (history, live links) stop, but their data is kept for 12 months in case Premium comes back.
- **Failed payments.** Stripe retries for 14 days before the subscription counts as lapsed.

## 2. Premium features

**At launch** (the minimum, plus what makes the minimum worth paying for):

1. **Unlimited programs saved to the account,** on any device. Free accounts get the same thing for up to 3.
2. **Group library** (Group tier). Programs saved to the group are visible to and editable by every leader in it, and stay with the group when a leader leaves. A leader picks *My programs* or *[Group name]* when saving.
3. **Shared styling** (Group tier). The group's styling, leaders, patrols, challenge areas and highlights are saved once and used by every new program in the group. The settings that `newProgram()` already carries over become group-level settings.

**Soon after** (the reasons to stay subscribed):

4. **Version history.** Every save is kept for 90 days, and any earlier version can be restored. This covers "someone in the group deleted my week".
5. **Live family link.** A read-only web page of the program at a short address, always the latest version, for the group's Facebook page or newsletter. It replaces sending a new PDF after every change.
6. **Calendar subscription.** A `webcal://` address families add once. Their calendar then updates when the program changes, rather than the one-off `.ics` file they get now.

**Later, if there's demand:**

7. **Activity library.** Search and reuse activities from past programs (with their descriptions, costs and forms).
8. **Templates.** Start a term from last year's Term 2, or from a group template.

Out of scope for now: editing together live (two leaders typing at once; section 4.3 handles clashes instead), youth member records, payments from families, and Terrain integration.

## 3. The API

### 3.1 Where it runs

The API reuses the stack planned for Pinewood Control in `pinewood-control/docs/deployment-plan.md`: Node with Express and Prisma, Postgres 16 and Caddy, in one `docker compose` on the VPS, with nightly backups. It gets its own database and its own container, so the two apps can't affect each other.

- **Address.** The builder and the API should share a domain, for example `programs.<domain>` and `api.<domain>`. Sign-in can then use an ordinary secure cookie. Browsers increasingly block the cross-site cookies that `no5tyle.github.io` talking to a VPS address would need. This depends on buying the domain discussed earlier.
- **The builder stays a static site** on GitHub Pages. It still works fully without an account or a connection. The API only adds saving to an account.

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
| `POST /programs/import` `{ programs: [...] }` | Uploads the programs already on this device at first sign-in. On a free account it takes the 3 most recently changed and reports the rest as `skipped`. |
| `GET /programs/{id}/versions`, `GET .../versions/{v}`, `POST .../versions/{v}/restore` | Version history (Premium, phase 3). |

**Groups** (Group tier)

| Method and path | Does |
| --- | --- |
| `GET /groups/{id}` and `PATCH /groups/{id}` `{ name }` | The group's details, and renaming it. |
| `GET /groups/{id}/settings` and `PUT /groups/{id}/settings` | Shared styling and lists (feature 3). |
| `GET /groups/{id}/members` | Members and pending invites, with the seats used out of 10. |
| `POST /groups/{id}/invites` `{ email }` | Emails an invite. Answers **409 `seats_full`** when all 10 are taken, counting pending invites. Owner and admins only. |
| `POST /invites/{token}/accept` | Joins the group (signing in first if needed). |
| `DELETE /groups/{id}/invites/{inviteId}` and `DELETE /groups/{id}/members/{userId}` | Cancels an invite or removes a leader. A leader can also remove themselves. |
| `POST /groups/{id}/owner` `{ userId }` | Hands the group (and its billing) to another member. |

**Billing** (Stripe)

| Method and path | Does |
| --- | --- |
| `POST /billing/checkout` `{ plan: "individual" \| "group", interval: "month" \| "year", groupName? }` | Returns a Stripe Checkout address to send the person to. Buying Group creates the group, with the buyer as owner. |
| `POST /billing/portal` | Returns a Stripe Customer Portal address for changing the card, the plan or cancelling. |
| `POST /billing/webhook` | Stripe's notices (`checkout.session.completed`, `customer.subscription.updated` and `.deleted`, `invoice.payment_failed`). These are the only things that change a subscription's status, so the builder never decides who has paid. |

**Public pages** (phase 3, no sign-in needed)

| Method and path | Does |
| --- | --- |
| `GET /p/{slug}` | The live family page for a program whose owner has turned its link on. |
| `GET /p/{slug}.ics` | The calendar subscription for it. |

### 3.4 Data

```
users            id, email (unique), name, created_at, last_seen_at
login_codes      email, code_hash, expires_at (10 min), attempts            -- 5 tries, then a new code
sessions         id, user_id, created_at, expires_at, user_agent
subscriptions    id, plan (individual|group), status (active|past_due|canceled), interval,
                 stripe_customer_id, stripe_subscription_id, current_period_end,
                 user_id (individual) | group_id (group)
groups           id, name, owner_id, settings (jsonb), created_at
group_members    group_id, user_id, role (owner|admin|leader), joined_at      -- unique (group_id, user_id)
group_invites    id, group_id, email, token_hash, invited_by, expires_at (14 days)
programs         id (the builder's id), owner_user_id | owner_group_id, name, group_name, year, term,
                 data (jsonb), version, updated_at, updated_by, deleted_at, public_slug
program_versions program_id, version, data (jsonb), created_at, created_by    -- kept 90 days (Premium)
```

- A program's `data` is exactly what the builder saves in the browser today (`state`), so nothing is converted and *Save file* and *Open* keep working.
- A program is capped at 2 MB. The section or uploaded logo is the biggest part, and it's already shrunk to 400 px.
- The seat check counts members plus pending invites, inside the same transaction that adds one, so two invites sent at once can't make 11.

## 4. Changes to the builder

### 4.1 What leaders see

- **Sign in** sits in the top bar (and the phone menu), with the line *Save your programs to your account, to use on any device*. Once signed in, it shows their initial, and opens a small menu: *Account*, *Group* (if any), *Sign out*.
- **The save message** by Undo says where things are: *Saved to your account*, *Saved on this device* (signed out), or *Offline: saved on this device, will upload when you're back online*.
- **Programs** groups the list under *My programs*, *[Group name]* and *On this device only*, each marked with who last changed it and when ("Akela, yesterday").
- **The 4th program** on a free account doesn't fail. A friendly box explains the limit and offers *Go Premium*, *Delete an old program* or *Not now*.
- **First sign-in** on a device that already has programs asks *Upload the 3 programs on this device to your account?* (or all of them, with Premium).
- **The Account page** shows the plan, *Manage billing* (Stripe's page), *Download all my programs* and *Delete my account*.
- **The Group page** (for the owner and admins) lists the leaders, shows *Invite a leader* with the seats left (for example "7 of 10 used"), and lets them remove leaders.
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

### 4.4 The free cap on this device

**Today** there's no limit on programs saved in the browser. The options are:

- **(a)** Apply the cap of 3 to the device too, for new programs only. Anyone who already has more keeps them, but can't add more.
- **(b)** Apply it only to programs saved to an account.

(b) is kinder to current users. But it gives little reason to upgrade, because a leader who never signs in has no limit. (a) is a client-side check, so a determined person can get around it. It's still enough as a nudge. *(decide, 6.3)*

## 5. Privacy and safety

Programs hold leaders' names and phone numbers, and sometimes young people's names in the notes. Once they're on a server, the Australian Privacy Principles apply. In practice:

- **Policies.** A short privacy policy and terms of use, linked from *Sign in* and the Account page.
- **Where data is kept.** In Australia if the VPS is (check its region), encrypted in transit, with database backups encrypted.
- **Downloading and deleting.** Leaders can download everything (`GET /me/export`) and delete their account (`DELETE /me`) themselves. Deleted programs are purged from backups within 35 days.
- **A note in the editor.** Ask leaders not to put young people's personal details in programs, in line with Scouts Australia's child safety and privacy guidance.
- **Live family links (feature 5).** They're off by default, and each program's link is turned on separately. The page shows only what the printout shows. Leader phone numbers are hidden unless the owner chooses to show them.
- **What gets logged.** Ids and error codes, never program contents. Stripe holds the card details; the API never sees them.
- **GST.** If the business registers for GST, Stripe Tax can add it to prices.

## 6. Decisions to make

1. **Do free accounts save to the account at all?** Proposed: yes, up to 3. It's the main way people find Premium, and costs little to store. The alternative is that saving to an account is Premium-only, and free means this device only.
2. **Are the "10 leaders" on top of the owner?** Proposed: yes, owner plus 10. Also decide whether the owner can be someone who isn't a leader, such as a group treasurer who only pays.
3. **Should the free cap apply on the device too?** Section 4.4: (a) the cap applies on the device for new programs only, or (b) it applies only to programs saved to an account.
4. **Prices,** and whether to offer annual billing only for Group. Groups usually pay once a year from group funds, and some will want an invoice rather than a card.
5. **One group per leader, or several?** Proposed: several, for a leader who helps at two groups. Each group needs its own subscription.
6. **The domain** (section 3.1). Accounts need the builder and the API on the same domain.

## 7. Building it, in phases

| Phase | Includes | Size |
| --- | --- | --- |
| 1. Accounts and saving | Domain and API service on the VPS, email codes, `/me`, the program endpoints with version checks, the offline queue, the conflict box, uploading on first sign-in, the free cap, the Account page, Help updates | Large: most of the work, and everything later builds on it |
| 2. Paying | Stripe products, Checkout and Portal, the webhook, Individual and Group plans, the grace period and lapse rules, the Premium prompts | Medium |
| 3. Groups | Groups, invites and seats, the group library, moving programs, shared styling, roles, handing over ownership | Medium |
| 4. Reasons to stay | Version history, live family links, calendar subscriptions | Medium |
| 5. Later | Activity library, templates, Google and Microsoft sign-in | As needed |

Phases 1 and 2 can ship together as the first release: unlimited programs for Individual, and the free cap of 3. Group follows as phase 3.

**Testing.**

- **The API:** tests against a real Postgres in CI, covering the cap, seats (including two invites at once), version conflicts, every webhook and the lapse rules.
- **The builder:** Playwright tests with the API mocked, covering offline, conflicts, the 4th program and first sign-in upload.
- **One end-to-end test** against a test deployment, using Stripe's test mode.
