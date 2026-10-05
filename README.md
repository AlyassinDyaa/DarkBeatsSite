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
| `/` | Home: the name over a drifting wall of posters, latest pieces, then-and-now comparisons, commissions, conventions |
| `/work` | Every piece, with category filters; a piece opens large with its details |
| `/commissions` | What is on offer, how it works, and the request form |
| `/about` | Who Jordan is, quick facts, where to find him |
| `/contact` | Contact form, email and social links |

## Edit the content: the admin panel

The site is edited at **`/admin`** (for example `https://your-site.com/admin/`).
It is a content manager (Decap CMS) that saves every change as a commit to this repository.
The site rebuilds itself about a minute later. No code involved.

| Section | What you control |
|---|---|
| Work | Every piece: picture, title, category, date, link to the post, a note, whether it is on the home page |
| Then and now | Sets of the same subject drawn years apart: a year and a picture for each drawing |
| Conventions | Events, with dates and where to find the table |
| Site settings | Name, tagline, contact email, brand colour, home page text, commissions (open or closed, offers, prices, steps), the About page, social links, and **Show or hide parts of the site** |

Pictures upload straight from the panel into `public/uploads/`. A piece without a picture gets a
generated title card, so the site never shows a hole.

Every piece, set and event also has a **Hide from the site** switch, which takes it off the site
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

## Design

- Tokens (colours, type, spacing) are at the top of `src/styles/global.css`.
- The whole site is tinted by one hue, `--h`, set from **Site settings → Brand colour**.
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
