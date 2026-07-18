# PRODUCT.md — sportsdataverse.org

## What this is

The public front door of the SportsDataverse: an open-source sports-data
organization shipping ~40 packages (R, Python, Node.js), nightly open data
releases (120M+ rows of play-by-play across 8 leagues), and in-house models
(EPA, win probability, ratings). The site also hosts `/platform`, a
members-only operations console (datasets, query, orchestration, models,
database status) gated by GitHub org membership.

## Audience

Sports analytics developers and researchers: R and Python users, students,
sports-Twitter/Bluesky analytics community, quant hobbyists. They come to
find the right package, read methods posts, and grab data. Platform users
are org members operating pipelines and models.

## Register

- Public site (`app/(site)`): **brand** — design is part of the product's
  credibility. Marketing + blog + directory surfaces.
- Platform (`app/(platform)`): **product** — dense operational UI; design
  serves the work.

## Platform

web (Next.js App Router, Tailwind v4, shadcn/ui).

## Voice

Plain, specific, confident. Data-literate but never gatekeeping: "every play,
every league, open." No hype adjectives; numbers and league names do the
talking. Sentence case everywhere except display headlines (condensed caps).

## The page's single job

Route a visitor to the right package/data in one click, and make the org's
credibility unmistakable while doing it. For members: get into the platform
fast (visible sign-in).

## Anti-references

- Generic SaaS landing kit (gradient text, icon-tile cards, hero metrics).
- Sports-betting site energy (neon green, aggressive countdowns).
- Academic-plain (unstyled Bootstrap-era tables).
