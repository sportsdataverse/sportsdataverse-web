---
title: 'cfbfastR'
date: '2021-05-10'
description: 'An R package to quickly obtain clean and tidy college football play by play data'
featured: true
topics: R,College Football,cfbfastR
recommended: sportsdataverse-node-js-module
---
# **cfbfastR** <a href='http://saiemgilani.github.io/cfbfastR'><img src='man/figures/logo.png' align="right" height="150" /></a>

<!-- badges: start -->

[![Twitter
Follow](https://img.shields.io/twitter/follow/cfbfastR?color=blue&label=%40cfbfastR&logo=twitter&style=for-the-badge)](https://twitter.com/cfbfastR)
[![Version-Number](https://img.shields.io/github/r-package/v/saiemgilani/cfbfastr?label=cfbfastR&logo=R&style=for-the-badge)](https://github.com/saiemgilani/cfbfastR/)
[![Lifecycle:maturing](https://img.shields.io/badge/lifecycle-maturing-blue.svg?style=for-the-badge&logo=github)](https://github.com/saiemgilani/cfbfastR/)
[![R-CMD-check](https://img.shields.io/github/workflow/status/saiemgilani/cfbfastr/R-CMD-check?label=R-CMD-Check&logo=R&logoColor=blue&style=for-the-badge)](https://github.com/saiemgilani/cfbfastR/actions/workflows/R-CMD-check.yaml)
[![Contributors](https://img.shields.io/github/contributors/saiemgilani/cfbfastR?style=for-the-badge)](https://github.com/saiemgilani/cfbfastR/graphs/contributors)
<!-- badges: end -->

The goal of [**`cfbfastR`**](https://saiemgilani.github.io/cfbfastR/) is
to provide the community with an R package for working with CFB data. It
is an R API wrapper around <https://collegefootballdata.com/>. Beyond
data aggregation and tidying ease, one of the multitude of services that
[**`cfbfastR`**](https://saiemgilani.github.io/cfbfastR/) provides is
for benchmarking open-source expected points and win probability
metrics.

## **Installation**

You can install the released version of
[**`cfbfastR`**](https://github.com/saiemgilani/cfbfastR/) from
[GitHub](https://github.com/saiemgilani/cfbfastR) with:

``` r
# You can install using the pacman package using the following code:
if (!requireNamespace('pacman', quietly = TRUE)){
  install.packages('pacman')
}
pacman::p_load_current_gh("saiemgilani/cfbfastR")
```

``` r
# if you would prefer devtools installation
if (!requireNamespace('devtools', quietly = TRUE)){
  install.packages('devtools')
}
# Alternatively, using the devtools package:
devtools::install_github(repo = "saiemgilani/cfbfastR")
```

## **Breaking Changes**

[**Full News on
Releases**](https://saiemgilani.github.io/cfbfastR/news/index.html)

# **cfbfastR v1.3.3**

### Hotfix [`cfbd_game_player_stats()`](https://saiemgilani.github.io/cfbfastR/reference/cfbd_game_player_stats.html)

<details>

<summary>View more version news</summary>

## **cfbfastR v1.3.2**

### Added ID linking to [`cfbd_recruiting_players()`](https://saiemgilani.github.io/cfbfastR/reference/cfbd_recruiting_player.html)

## **cfbfastR v1.3.1**

### Added three [NFL draft](https://saiemgilani.github.io/cfbfastR/reference/cfbd_draft.html) functions:

  - [`cfbd_draft_teams()`](https://saiemgilani.github.io/cfbfastR/reference/cfbd_draft_teams.html)
    - **Get list of NFL teams**
  - [`cfbd_draft_positions()`](https://saiemgilani.github.io/cfbfastR/reference/cfbd_draft_positions.html)
    - **Get list of NFL positions for mapping to collegiate**
  - [`cfbd_draft_picks()`](https://saiemgilani.github.io/cfbfastR/reference/cfbd_draft_picks.html)
    - **Get list of NFL Draft picks**

## **cfbfastR v1.2.1**

##### **Minor release**

  - Added headshot\_url to outputs of
    [`cfbd_team_rosters`](https://saiemgilani.github.io/cfbfastR/reference/cfbd_team_rosters.html)

  - Renamed returns in
    [`cfbd_game_advanced()`](https://saiemgilani.github.io/cfbfastR/reference/cfbd_game_advanced.html):
    
      - `rushing_line_yd_avg` to plural `rushing_line_yds_avg`
      - `rushing_second_lvl_yd_avg` to plural
        `rushing_second_lvl_yds_avg`
      - `rushing_open_field_yd_avg` to plural
        `rushing_open_field_yds_avg`

  - Completed documentation for all returns except `cfbd_pbp_data()`

  - Continued work on intro vignette

## **cfbfastR v1.2.0**

#### **Add significant documentation to the package**

  - Added mini-vignettes pertaining to CFB Data functionality:
      - [`cfbd_betting`](https://saiemgilani.github.io/cfbfastR/articles/cfbd_betting.html),
      - [`cfbd_games`](https://saiemgilani.github.io/cfbfastR/articles/cfbd_games.html),
      - [`cfbd_plays`](https://saiemgilani.github.io/cfbfastR/articles/cfbd_plays.html),  
      - [`cfbd_recruiting`](https://saiemgilani.github.io/cfbfastR/articles/cfbd_recruiting.html),  
      - [`cfbd_stats`](https://saiemgilani.github.io/cfbfastR/articles/cfbd_stats.html),
      - [`cfbd_teams`](https://saiemgilani.github.io/cfbfastR/articles/cfbd_teams.html)
  - [Introductory vignette
    stub](https://saiemgilani.github.io/cfbfastR/articles/intro.html)
    added

#### **ESPN/CFBD metrics function variable return standardization**

  - Change `id` variable to `team_id` in
    [`espn_ratings_fpi()`](https://saiemgilani.github.io/cfbfastR/reference/espn_ratings.html)
  - Changed `espn_game_id` variable to `game_id` in
    [`espn_metrics_wp()`](https://saiemgilani.github.io/cfbfastR/reference/espn_metrics.html),
    corrected the `away_win_percentage` calculation and added
    `tie_percentage` to the returns.
  - Change `id` variable to `athlete_id` in
    [`cfbd_metrics_ppa_players_season()`](https://saiemgilani.github.io/cfbfastR/reference/cfbd_metrics_ppa_players_season.html)

## **cfbfastR v1.1.0**

#### **Add loading from Data Repository functionality**

  - Added
    [`load_cfb_pbp()`](https://saiemgilani.github.io/cfbfastR/reference/load_cfb_pbp.html)
    and
    [`update_cfb_db()`](https://saiemgilani.github.io/cfbfastR/reference/update_cfb_db.html)
    functions. Pretty much cherry-picking the `nflfastR` methodology of
    loading data from the
    [`cfbfastR-data`](https://github.com/saiemgilani/cfbfastR-data/)
    repository.

#### **Add support for parallel processing and progress updates**

  - Added [`furrr`](https://furrr.futureverse.org/index.html),
    [`future`](https://future.futureverse.org/), and
    [`progressr`](https://progressr.futureverse.org/) dependencies to
    the package to allow for parallel processing of the play-by-play
    data with progress updates if desired.

## **cfbfastR v1.0.0**

#### **Function Naming Convention Change**

  - All functions sourced from the College Football Data API will start
    with `cfbd_` as opposed to `cfb_` (as in cfbscrapR). One additional
    `cfbd_` function has been added that corresponds to the result when
    [`cfbd_pbp_data()`](https://saiemgilani.github.io/cfbfastR/reference/cfbd_pbp_data.html)
    has the parameter `epa_wpa=FALSE`. It has now been separated into
    its own function for clarity
    [`cfbd_plays()`](https://saiemgilani.github.io/cfbfastR/reference/cfbd_play.html).
    The parameter and functionality still exists in
    [`cfbd_pbp_data()`](https://saiemgilani.github.io/cfbfastR/reference/cfbd_pbp_data.html)
    but we expect this function will still exist but made obsolete in
    favor of a function more closely matching `nflfastR`’s naming
    conventions.

  - Similarly, data and metrics sourced from ESPN will begin with
    `espn_` as opposed to `cfb_`. In particular, the two functions are
    now
    [`espn_ratings_fpi()`](https://saiemgilani.github.io/cfbfastR/reference/espn_ratings.html)
    and
    [`espn_metrics_wp()`](https://saiemgilani.github.io/cfbfastR/reference/espn_metrics.html)

  - Data generated from any of the `cfbfastR` methods will use `cfb_`

#### **College Football Data API Keys**

The [CollegeFootballData API](https://collegefootballdata.com/) now
requires an API key, here’s a quick run-down:

  - To get an API key, follow the directions here: [College Football
    Data Key Registration.](https://collegefootballdata.com/key)

  - Using the key: You can save the key for consistent usage by adding
    `CFBD_API_KEY=XXXX-YOUR-API-KEY-HERE-XXXXX` to your .Renviron file
    (easily accessed via
    [**`usethis::edit_r_environ()`**](https://usethis.r-lib.org/reference/edit.html)).
    Run
    [**`usethis::edit_r_environ()`**](https://usethis.r-lib.org/reference/edit.html),
    a new script will pop open named `.Renviron`, **THEN** paste the
    following in the new script that pops up (with**out** quotations)

<!-- end list -->

``` r
CFBD_API_KEY = XXXX-YOUR-API-KEY-HERE-XXXXX
```

Save the script and restart your RStudio session, by clicking `Session`
(in between `Plots` and `Build`) and click `Restart R` (there also
exists the shortcut `Ctrl + Shift + F10` to restart your session). If
set correctly, from then on you should be able to use any of the `cfbd_`
functions without any other changes.

  - For less consistent usage: At the beginning of every session or
    within an R environment, save your API key as the environment
    variable `CFBD_API_KEY` (with quotations) using a command like the
    following.

<!-- end list -->

``` r
Sys.setenv(CFBD_API_KEY = "XXXX-YOUR-API-KEY-HERE-XXXXX")
```

  - Added [API Key
    methods](https://saiemgilani.github.io/cfbfastR/reference/register_cfbd.html).
    If you forget to set your environment variable, functions will give
    you a warning and ask for one.

</details>

# Follow cfbfastR on Twitter and star this repo

[![Twitter
Follow](https://img.shields.io/twitter/follow/cfbfastR?color=blue&label=%40cfbfastR&logo=twitter&style=for-the-badge)](https://twitter.com/cfbfastR)

[![GitHub
stars](https://img.shields.io/github/stars/saiemgilani/cfbfastR.svg?color=eee&logo=github&style=for-the-badge&label=Star%20cfbfastR&maxAge=2592000)](https://github.com/saiemgilani/cfbfastR/stargazers/)