---
title: 'chessR'
date: '2022-01-20'
description: 'An R package designed to extract and analyse chess game data played on Lichess and chess.com'
featured: true
topics: R,chess,SportsDataverse
recommended: worldfootballR-for-soccer-data
---
<!-- badges: start -->
[![Version-Number](https://img.shields.io/github/r-package/v/JaseZiv/chessR?label=chessR%20(Dev))](https://github.com/JaseZiv/chessR/)
[![R build
status](https://github.com/JaseZiv/chessR/workflows/R-CMD-check/badge.svg)](https://github.com/JaseZiv/chessR/actions)
[![codecov](https://codecov.io/gh/JaseZiv/chessR/branch/master/graph/badge.svg?token=PE7LBUOWX7)](https://app.codecov.io/gh/JaseZiv/chessR)

[![CRAN
status](https://www.r-pkg.org/badges/version-last-release/chessR?style=for-the-badge)](https://CRAN.R-project.org/package=chessR)
[![CRAN
downloads](http://cranlogs.r-pkg.org/badges/grand-total/chessR)](https://CRAN.R-project.org/package=chessR)
[![Downloads](https://cranlogs.r-pkg.org/badges/chessR)](https://cran.r-project.org/package=chessR)
<!-- badges: end -->

# chessR <a href='https://JaseZiv.github.io/chessR/'><img src='https://raw.githubusercontent.com/JaseZiv/chessR/master/man/figures/logo.png' align="right" height="219.5" /></a>

## Overview

This package is designed to allow users to extract game data from
popular online chess platforms. The platforms currently supported in
this package include:

-   [chess.com](https://www.chess.com/)
-   [Lichess](https://lichess.org/)

These websites offer a very convenient set of APIs to be able to access
data and documentation to these can be found [here for
chess.com](https://www.chess.com/news/view/published-data-api) and [here
for Lichess](https://lichess.org/api).

## Installation

You can install the CRAN version of
[**`chessR`**](https://CRAN.R-project.org/package=chessR) with:

```r
install.packages("chessR")
```

You can install the released version of
[**`chessR`**](https://github.com/JaseZiv/chessR/) from
[GitHub](https://github.com/JaseZiv/chessR) with:

```r
# install.packages("devtools")
devtools::install_github("JaseZiv/chessR")
```

```r
library(chessR)
```

------------------------------------------------------------------------

## Usage

The functions available in this package are designed to enable the
extraction of chess game data.

### Data Extraction

The functions detailed below relate to extracting data from the chess
gaming sites currently supported in this package.

#### Raw Game Data

The game extraction functions can take a vector of either single or
multiple usernames. It will output a data frame with all the games
played by that user.

The functions are below.

**Note:** These functions query an API, which is rate limited. The
limiting rates for chess.com are unknown. For Lichess, the limit is
throttled to 15 games per second. Queries could therefore take a few
minutes if you’re querying a lot of games.

```r
# function to extract chess.com game data
chessdotcom_game_data_all_months <- get_raw_chessdotcom(usernames = "JaseZiv")
chessdotcom_hikaru_recent <- get_raw_chessdotcom(usernames = "Hikaru", year_month = c(202104:202105))

# function to extract lichess game data
lichess_game_data <- get_raw_lichess("Georges")
```

#### Analysis Data

The following function will extract the same data that the
`get_raw_chessdotcom()` function will, however this function will also
include additional columns to make analysing data easier.

The function can be used either on a single player, or a character
vector of multiple players.

**Note:** This is only available for chess.com extracts

```r
chess_analysis_single <- get_game_data("JaseZiv")

chess_analysis_multiple <- get_game_data(c("JaseZiv", "Smudgy1"))
```

### Leaderboards

The leaderboards of each game platform can be extracted for a number of
different games available on each platform. Each are discussed below:

#### Chess.com

The below function allows the user to extract the top 50 players of each
game type specified. Game types available include:

> *“daily”,“daily960”, “live_rapid”, “live_blitz”, “live_bullet”,
> “live_bughouse”, “live_blitz960”, “live_threecheck”,
> “live_crazyhouse”, “live_kingofthehill”, “lessons”, “tactics”*

The usernames that are contained in the results can then be passed to
`get_raw_chessdotcom` outlined above.

```r
chessdotcom_leaders <- chessdotcom_leaderboard(game_type = "daily")
```

#### Lichess

The `lichess_leaderboard()` function takes in two parameters; how many
players you want returned (with a max of 200 being returned) and the
speed variant. Speed variants include;

> *“ultraBullet”, “bullet”, “blitz”, “rapid”, “classical”, “chess960”,
> “crazyhouse”, “antichess”, “atomic”, “horde”, “kingOfTheHill”,
> “racingKings”, “threeCheck”*

```r
lichess_leaders <- lichess_leaderboard(top_n_players = 10, speed_variant = "blitz")
```

#### Visualising games

With the additional
[`{chess}`](https://cran.r-project.org/package=chess) package, you can
visualise a game. For example, a recent Hikaru Nakamura vs Daniel
Naroditsky game on chess.com:

```r
# extract just one year-month of Hikaru's games from chess.com
hikaru <- chessR:::get_each_player_chessdotcom("hikaru", "202112")
# convert to {chess} 'game' format
m <- extract_moves_as_game(hikaru[11, ])
# plot each move and save all as a gif
gifski::save_gif({
  plot_moves(m, interactive = FALSE)
}, 
gif_file = "~/Hikaru_Naroditsky.gif", 
delay = 1)
```

![](https://raw.githubusercontent.com/JaseZiv/chessR/master/img/Hikaru_Naroditsky.gif)

For a detailed guide to using the package and the functions for
analysis, see the package
[vignette](https://jaseziv.github.io/chessR/articles/using_chessR_package.html)

## Follow the [SportsDataverse](https://twitter.com/SportsDataverse) on Twitter and star this repo

[![Twitter
Follow](https://img.shields.io/twitter/follow/SportsDataverse?color=blue&label=%40SportsDataverse&logo=twitter&style=for-the-badge)](https://twitter.com/SportsDataverse)

[![GitHub
stars](https://img.shields.io/github/stars/JaseZiv/chessR.svg?color=eee&logo=github&style=for-the-badge&label=Star%20chessR&maxAge=2592000)](https://github.com/JaseZiv/chessR/stargazers/)

## **Our Authors**

-   [Jason Zivkovic](https://twitter.com/JaseZiv)  
    <a href="https://twitter.com/JaseZiv" target="blank"><img src="https://img.shields.io/twitter/follow/JaseZiv?color=blue&label=%40JaseZiv&logo=twitter&style=for-the-badge" alt="@JaseZiv" /></a>
    <a href="https://github.com/JaseZiv" target="blank"><img src="https://img.shields.io/github/followers/JaseZiv?color=eee&logo=Github&style=for-the-badge" alt="@JaseZiv" /></a>

