---
title: 'Introducing cfbscrapR - Archived'
date: '2021-03-12'
description: 'cfbscrapR is an R package for working with CFB data. It is an R API wrapper around https://collegefootballdata.com/. It provides users the capability to retrieve data from a plethora of endpoints and supplement that data with additional information (Expected Points Added/Win Probability added).'
featured: true
topics: R,College Football,cfbscrapR
recommended: sportsdataverse-node-js-module
---
# cfbscrapR - Archived <a href='http://saiemgilani.github.io/cfbscrapR'><img src='https://saiemgilani.github.io/cfbscrapR/reference/figures/logo.png' align="right" height="139" /></a>

<p align="left"> <a href="https://twitter.com/cfbscrapR" target="blank"><img src="https://img.shields.io/twitter/follow/cfbscrapR?logo=twitter&style=for-the-badge" alt="cfbscrapR" /></a> <a href="https://twitter.com/saiemgilani" target="blank"><img src="https://img.shields.io/twitter/follow/saiemgilani?logo=twitter&style=for-the-badge" alt="saiemgilani" /></a> </p>
<a href="https://www.linkedin.com/in/saiem-gilani/"><img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" /><a> <a href="https://github.com/saiemgilani"><img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white" /><a> <a href="https://www.patreon.com/join/sportsdataverse?"><img src="https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white" /><a>

A scraping and aggregating package using the CollegeFootballData API

`cfbscrapR` is an R package for working with CFB data. It is an R API
wrapper around <https://collegefootballdata.com/>. It provides users the
capability to retrieve data from a plethora of endpoints and supplement
that data with additional information (Expected Points Added/Win
Probability added).

**Note:** The API ingests data from ESPN as well as other sources. For
details on those source, please go the website linked above. Sometimes
there are inconsistencies in the underlying data itself. Please report
issues here or to <https://collegefootballdata.com/>.

## **Installation**

You can install `cfbscrapR` from
[GitHub](https://github.com/saiemgilani/cfbscrapR) with:

```r
# Then can install using the devtools package from the following:
devtools::install_github(repo = "saiemgilani/cfbscrapR")
```

## **Documentation**

For more information on the package and [function
reference](https://saiemgilani.github.io/cfbscrapR/reference/index.html),
please see the `cfbscrapR` [documentation website](https://saiemgilani.github.io/cfbscrapR/).

### **Expected Points and Win Probability models**

If you would like to learn more about the Expected Points and Win
Probability models, please refer to the `cfbscrapR`
[tutorials](https://saiemgilani.github.io/cfbscrapR/articles/index.html)
or for the code repository where the models are built, [click
here](https://github.com/meysubb/cfbscrapR-MISC)

<center>

#### **Expected Points model calibration plots**

#### (~~1.31%~~ ~~1.15%~~ 0.94% Calibration Error)

<a href='http://saiemgilani.github.io/cfbscrapR'>
<img src='/images/cfb_ep_fg_model.png' align="right" width="800" />
</a><br clear="all" />
</center>

<center>

#### **Win Probability model calibration plots**

#### (~~0.89%~~ ~~0.787%~~ 0.669% Calibration Error)

<a href='http://saiemgilani.github.io/cfbscrapR'>
<img src="/images/cfb_win_prob_model.png" alt="wp_cv_loso_calibration_results.png" width="800"/>
</a><br clear="all" />
</center>

## **Our Authors**

  - [Saiem Gilani](https://twitter.com/saiemgilani) 
  
  <a href="https://twitter.com/saiemgilani" target="blank"><img src="https://img.shields.io/twitter/follow/saiemgilani?logo=twitter&style=for-the-badge" alt="Saiem Gilani" /></a>

  - [Meyappan Subbiah](https://twitter.com/msubbaiah1) 

  <a href="https://twitter.com/msubbaiah1" target="blank"><img src="https://img.shields.io/twitter/follow/msubbaiah1?logo=twitter&style=for-the-badge" alt="Meyappan Subbiah" /></a>

  - [Jared Lee](https://twitter.com/JaredDLee) 

  <a href="https://twitter.com/JaredDLee" target="blank"><img src="https://img.shields.io/twitter/follow/JaredDLee?logo=twitter&style=for-the-badge" alt="Jared Lee" /></a>

  - [Parker Fleming](https://twitter.com/statsowar)

  <a href="https://twitter.com/statsowar" target="blank"><img src="https://img.shields.io/twitter/follow/statsowar?logo=twitter&style=for-the-badge" alt="Parker Fleming" /></a>

## **Our Contributors (they’re awesome)**

  - [Nate Manzo](https://twitter.com/cfbnate)

  <a href="https://twitter.com/cfbnate" target="blank"><img src="https://img.shields.io/twitter/follow/cfbnate?logo=twitter&style=for-the-badge" alt="Nate Manzo" /></a>

  - [Michael Egle](https://twitter.com/deceptivespeed_) 

  <a href="https://twitter.com/deceptivespeed_" target="blank"><img src="https://img.shields.io/twitter/follow/deceptivespeed_?logo=twitter&style=for-the-badge" alt="Michael Egle" /></a>

  - [Eric Hess](https://twitter.com/arbitanalytics)  

  <a href="https://twitter.com/arbitanalytics" target="blank"><img src="https://img.shields.io/twitter/follow/arbitanalytics?logo=twitter&style=for-the-badge" alt="Eric Hess" /></a>


## **Special Thanks**

  - [Nick Tice](https://github.com/NickTice)


# **cfbscrapR 1.0.5**

  - Added [Eric Hess](https://twitter.com/arbitanalytics)’s [Visualizing
    Team Talent Using Player Recruiting
    Rankings](https://saiemgilani.github.io/cfbscrapR/articles/nth-rated-recruit.html)
    vignette
  - Added
    [`cfb_calendar()`](https://saiemgilani.github.io/cfbscrapR/reference/cfb_calendar.html)
    function from API
  - Updated
    [`cfb_team_roster()`](https://saiemgilani.github.io/cfbscrapR/reference/cfb_team_roster.html)
    to reflect new parameters.

# **cfbscrapR 1.0.4**

  - Updated
    [`cfb_game_box_advanced()`](https://saiemgilani.github.io/cfbscrapR/reference/cfb_game_box_advanced.html)
    to incorporate new columns from API.

# **cfbscrapR 1.0.3**

This was a **big** update\!

  - Updated expected points models and win probability models
  - Add player and yardage columns to
    [`cfb_pbp_data()`](https://saiemgilani.github.io/cfbscrapR/reference/cfb_pbp_data.html)
    pull thanks to a great deal of help from
    [@NickTice](https://github.com/NickTice)
  - Add spread values to the
    [`cfb_pbp_data()`](https://saiemgilani.github.io/cfbscrapR/reference/cfb_pbp_data.html)
    pull
  - Add drive detailed result with attempts at creating more accurate
    drive result labels
  - Added series and first down variables
  - Added argumentation to allow for San Jose State to be entered
    without accent into
    [`cfb_pbp_data()`](https://saiemgilani.github.io/cfbscrapR/reference/cfb_pbp_data.html)
    function `team` argument.
