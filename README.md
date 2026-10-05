# DarkBeats — website

Portfolio site for DarkBeats, the digital illustration of Jordan Beattie ([@jbeatsart](https://www.instagram.com/jbeatsart/)).

Built with Vite, React 19, React Router, Framer Motion and Lenis. Fonts are bundled with the site.
Content is edited through an admin panel at `/admin` (see below).

## Run it

```
npm install
npm run dev        # http://localhost:5174
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Pages

| Route | Page |
|---|---|
| `/` | Home: the name over a drifting wall of posters, latest pieces, work, then-and-now comparisons, commissions, conventions |
| `/shop` | Every piece, with category filters; a piece opens large with its details, and its price and Buy button while online purchases are on |
| `/work` | Pictures in sections, shown uncropped: finished pieces, redraws, sketches, whatever is added |
| `/commissions` | What is on offer, how it works, and the request form |
| `/about` | Who Jordan is, quick facts, where to find him |
| `/contact` | Contact form, email and social links |
| `/support` | The artist's own project (Knight Shadow): what it is, its art, and the ways fans can back it |

## Edit the content: the admin panel

The site is edited at **`/admin`** (for example `https://your-site.com/admin/`).
It is a content manager (Decap CMS) that saves every change as a commit to this repository.
The site rebuilds itself about a minute later. No code involved.

| Section | What you control |
|---|---|
| Shop | Every piece: picture, title, category, date, price, link to the post, a note, whether it is on the home page |
| Work | Sections of the Work page and the pictures in each. A section can also fill itself from the Shop, so a finished piece is only uploaded once. Tick "Show on the home page" on up to 6 pictures |
| Then and now | Sets of the same subject drawn years apart: a year and a picture for each drawing |
| Conventions | Events, with dates and where to find the table |
| Home page, Shop and Work pages, Commissions page, About page, Contact page | The words on each page, one short form per page: headings, introductions, buttons. The Home page form also holds the character beside the name and which layout the gallery opens in; the Commissions form holds open or closed, the offers and prices |
| Support page | The project's name, logo, character picture, text and art; the amounts fans can give and the **payment link** behind each; an optional goal bar; the short invitation on the home page |
| Name, colour and contact | Site name, tagline, brand colour, logo, email, social links, footer text |
| Shop and payments | Online purchases on or off, currency, what the buyer gets, delivery countries |
| Show or hide | Switch whole pages, or parts of the home page, on and off |

Pictures upload straight from the panel into `public/uploads/`. A piece without a picture gets a
generated title card, so the site never shows a hole.

Every piece, Work section, set and event also has a **Hide from the site** switch, which takes it off the site
without deleting it.

### Editing on this computer

```
npm run dev
```

Then open http://localhost:5174/admin/ and edit; changes land directly in `content/`.
(`npm run dev` also starts the small helper the panel saves through, on port 8082.)

### Editing files by hand

Everything the panel edits is plain JSON under `content/`. Editing those files and pushing
has the same effect as using the panel.

## Selling pieces online (Stripe)

The Shop page can sell its pieces through Stripe Checkout. It is off until two things are done:

1. On Vercel: project **Settings → Environment Variables**, add `STRIPE_SECRET_KEY` (from the Stripe dashboard: *Developers → API keys → Secret key*; use the `sk_test_...` key first to try it with Stripe's test cards), then redeploy.
2. In the admin: **Shop & payments → Online purchases** on. Each piece needs a **Price** (Shop → the piece).

With purchases on, every priced piece shows its price and a Buy button; the button opens a payment page on Stripe (`api/checkout.js`). The price is read on the server from the site's content, not from the browser, and the key never leaves Vercel. With purchases off, no prices or buttons are shown anywhere.

Orders and buyers' delivery addresses arrive in the Stripe dashboard (and by email from Stripe, if that is switched on there). Never put the secret key into the admin: everything typed there is saved to this repository.

## Taking support payments

The Support page never handles money itself and holds no keys. Each amount on it is a button that opens a payment page the artist made with a payment service, pasted into the admin as a link (Support page, "Ways to give"):

- **Stripe Payment Links** (recommended): in the Stripe dashboard, *Payment Links → New*. Make one link per fixed amount, and one with *Customers choose what to pay* for "any amount". Each link looks like `https://buy.stripe.com/...`.
- A Ko-fi, PayPal.me or Buy Me a Coffee address works the same way.

Visitors can also type an amount of their own. It uses the "any amount" link; with a Stripe or PayPal.me link the typed amount is carried over, so the payment page opens with it filled in.

Until the first link is in, the page shows the amounts with the button switched off and says support opens soon. An amount with no link is shown without a button. The goal bar is filled in by hand (raised so far, target).

Never put a secret key from a payment service into the admin: everything typed there is saved to this repository.

## Design

- Tokens (colours, type, spacing) are at the top of `src/styles/global.css`.
- The whole site is tinted by one hue, `--h`, set from **Name, colour and contact → Brand colour**.
- Wherever a set of pictures is shown (the home page, the Work page) visitors can switch between four layouts: wall, grid, strip and spotlight.
- The browser icon, the icon a phone uses when the site is added to its home screen (`public/manifest.webmanifest`) and the mark in the top bar are all the logo.
- Everything respects `prefers-reduced-motion`: smooth scroll, the poster wall and the moving band switch off.

## Deploy on Vercel (site and admin)

`vercel.json` holds the build settings and routing, so the site itself needs no setup:

1. On vercel.com: **Add New → Project**, import this GitHub repository, press **Deploy**.

The admin at `/admin/` needs two values. It logs in with **a passcode you choose**, and the site
saves changes to GitHub with **a token of its own** (the small files in `/api`). Nobody logging
in needs a GitHub account.

2. Make the token, once, with the GitHub account that owns this repository:
   **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new
   token**. Repository access: **Only select repositories** → this repository.
   Permissions → Repository permissions → **Contents: Read and write**. Generate and copy it.
3. On Vercel: project **Settings → Environment Variables**, add
   `ADMIN_PASSCODE` (the passcode: long and hard to guess, 12 characters or more) and
   `GITHUB_TOKEN` (the token from step 2), then **Deployments → Redeploy**.

To change the passcode later, change `ADMIN_PASSCODE` on Vercel and redeploy; everyone is
logged out and uses the new one. A login lasts a week. Pictures uploaded through the admin on
Vercel can be about 3 MB at most.

Every **Save** in the admin is a commit to the branch the site was built from; Vercel rebuilds
and the change is live about a minute later. In a browser that is logged in to the admin, the
site shows anything saved since its last build straight away (`api/content.js`).

Any other static host works for the site itself: build command `npm run build`, output directory
`dist`, SPA fallback to `index.html`. On Netlify the admin can use Netlify Identity with Git
Gateway instead of the passcode (`netlify.toml` is included).
