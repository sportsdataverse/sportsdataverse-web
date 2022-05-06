import React from 'react';
// core components
import { Grid, Typography } from '@material-ui/core'
import Box from '@material-ui/core/Box'
import useMediaQuery from '@material-ui/core/useMediaQuery'
import PackageCard from '../../src/components/PackageCard'

import wehoop from '../../public/images/wehoop-logo.png'
import hoopR from '../../public/images/hoopR-logo.png'
import cfbfastR from '../../public/images/cfbfastR-logo.png'
import recruitR from '../../public/images/recruitR-logo.png'
import cfbplotR from '../../public/images/cfbplotR-logo.png'
import cfb4th from '../../public/images/cfb4th-logo.png'
import gamezoneR from '../../public/images/gamezoneR-logo.png'
import baseballr from '../../public/images/baseballr-logo.png'
import fastRhockey from '../../public/images/fastRhockey-logo.png'
import worldfootballR from '../../public/images/worldfootballR-logo.png'
import usfootballR from '../../public/images/usfootballR-logo.png'
import toRvik from '../../public/images/toRvik-logo.png'
import chessR from '../../public/images/chessR-logo.png'
import sportyR from '../../public/images/sportyR-logo.png'
import sportsdataverseR from '../../public/images/sportsdataverseR-logo.png'
import emptyLogo from '../../public/images/emptyLogo.png'

const versePackages = [
  {
    sourceHref: 'https://github.com/saiemgilani/sportsdataverse-R/',
    sourceLabel: 'sportsdataverse',
    logo: sportsdataverseR,
    docsHref: 'https://r.sportsdataverse.org/',
    sports: 'All CRAN Packages',
    repositoryType: 'R',
    description: [
      {content:" Easily Install and Load the 'sportsdataverse'"}
    ]
  }
]

const rPackages = [
  {
    sourceHref: 'https://github.com/saiemgilani/cfbfastR/',
    sourceLabel: 'cfbfastR',
    logo: cfbfastR,
    docsHref: 'https://cfbfastR.sportsdataverse.org/',
    sports: 'College Football',
    repositoryType: 'R',
    description: [
      {content:' Access College Football Play by Play Data.'}
    ]
  },
  {
    sourceHref: 'https://github.com/saiemgilani/hoopR/',
    sourceLabel: 'hoopR',
    logo: hoopR,
    docsHref: 'https://hoopR.sportsdataverse.org/',
    sports: "Men's Basketball (NBA and MBB)",
    repositoryType: 'R',
    description: [
      {content:" Access Men's Basketball Play by Play Data."},
      // {content:"Provides live game support for ESPN’s NBA and men's college basketball game data and NCAA NET Rankings."},
      // {content:"Also performs as a scraping and aggregating interface for Ken Pomeroy’s college basketball statistics website, kenpom.com."}
    ]
  },
  {
    sourceHref: 'https://github.com/saiemgilani/wehoop/',
    sourceLabel: 'wehoop',
    logo: wehoop,
    docsHref: 'https://wehoop.sportsdataverse.org/',
    sports: "Women's Basketball (WNBA and WBB)",
    repositoryType: 'R',
    description: [
      {content:" Access Women's Basketball Play by Play Data."},
    ]
  },
  {
    sourceHref: 'https://github.com/andreweatherman/toRvik/',
    sourceLabel: 'toRvik',
    logo: toRvik,
    docsHref: 'https://www.torvik.dev/',
    sports: "Men's College Basketball",
    repositoryType: 'R',
    description: [
      {content:" Scrape Tidy Men's College Basketball Data from BartTorvik."},
    ]
  },
  {
    sourceHref: 'https://github.com/BillPetti/baseballr/',
    sourceLabel: 'baseballr',
    logo: baseballr,
    docsHref: 'https://billpetti.github.io/baseballr/',
    sports: "MLB, MiLB, NCAA Baseball",
    repositoryType: 'R',
    description: [
      {content:"  Acquiring and Analyzing Baseball Data."},
    ]
  },
  {
    sourceHref: 'https://github.com/rossdrucker/sportyR',
    sourceLabel: 'sportyR',
    logo: sportyR,
    docsHref: 'https://rossdrucker.github.io/sportyR/',
    sports: "Sports Visualizations",
    repositoryType: 'R',
    description: [
      {content:"  Plot Scaled 'ggplot' Representations of Sports Playing Surfaces."},

    ]
  },
  {
    sourceHref: 'https://github.com/jaseziv/chessR/',
    sourceLabel: 'chessR',
    logo: chessR,
    docsHref: 'https://jaseziv.github.io/chessR/',
    sports: "Chess",
    repositoryType: 'R',
    description: [
      {content:"  Extract and Analyze Chess Game Data Played on Lichess and chess.com."},

    ]
  },
  {
    sourceHref: 'https://github.com/benhowell71/fastRhockey/',
    sourceLabel: 'fastRhockey',
    logo: fastRhockey,
    docsHref: 'https://benhowell71.github.io/fastRhockey/',
    sports: "NHL and PHF",
    repositoryType: 'R',
    description: [
      {content:"  Access NHL and Premier Hockey Federation Play by Play Data."},
    ]
  },
  {
    sourceHref: 'https://github.com/jaseziv/worldfootballR/',
    sourceLabel: 'worldfootballR',
    logo: worldfootballR,
    docsHref: 'https://jaseziv.github.io/worldfootballR/',
    sports: "World Football",
    repositoryType: 'R',
    description: [
      {content:"  Extract World Football (Soccer) Data from Fbref.com, transfermarkt.com, and understat.com."},

    ]
  },
  {
    sourceHref: 'https://github.com/saiemgilani/usfootballR/',
    sourceLabel: 'usfootballR',
    logo: usfootballR,
    docsHref: 'https://usfootballR.sportsdataverse.org/',
    sports: "USA Football",
    repositoryType: 'R',
    description: [
      {content:"  Access MLS and NWSL Play-by-Play Data."},

    ]
  },
  {
    sourceHref: 'https://github.com/kazink36/cfbplotR/',
    sourceLabel: 'cfbplotR',
    logo: cfbplotR,
    docsHref: 'https://kazink36.github.io/cfbplotR/',
    sports: "College Sports Visualization",
    repositoryType: 'R',
    description: [
      {content:" CFB Logo Plots in 'ggplot2'."},
    ]
  },
  {
    sourceHref: 'https://github.com/kazink36/cfb4th/',
    sourceLabel: 'cfb4th',
    logo: cfb4th,
    docsHref: 'https://kazink36.github.io/cfb4th/',
    sports: "College Football Modeling",
    repositoryType: 'R',
    description: [
      {content:" Calculate Optimal Fourth Down Decisions for NCAA Football."},
    ]
  },
  {
    sourceHref: 'https://github.com/JackLich10/gamezoneR',
    sourceLabel: 'gamezoneR',
    logo: gamezoneR,
    docsHref: 'https://jacklich10.github.io/gamezoneR/',
    sports: "College Basketball",
    repositoryType: 'R',
    description: [
      {content:"  Access NCAA Men’s Basketball Data from STATS LLC’s GameZone."},
    ]
  },
  {
    sourceHref: 'https://github.com/saiemgilani/recruitR/',
    sourceLabel: 'recruitR',
    logo: recruitR,
    docsHref: 'https://recruitr.sportsdataverse.org/',
    sports: "College Sports Recruiting",
    repositoryType: 'R',
    description: [
      {content:" Access College Sports Recruiting Data."},
    ]
  },
  {
    sourceHref: 'https://github.com/Puntalytics/puntr/',
    sourceLabel: 'puntr',
    logo: emptyLogo,
    docsHref: 'https://puntalytics.github.io/puntr/',
    sports: "American Football - Special Teams",
    repositoryType: 'R',
    description: [
      {content:" Analysis of Punting."},
    ]
  },
]





export default function RPackageSection() {
  const large = useMediaQuery('(min-width:500px)')
  const vPkgs = versePackages
  const rPkgs = rPackages
  return (
    <div>
      <Box p={5}>
        <Typography variant={'h3'}>R packages</Typography>
      </Box>
      <Grid container
          spacing={1}>
          {vPkgs.map((d,idx)=>
            <Grid item xs={12} sm={12} md={12} lg={12} key={idx}>
              <PackageCard             
                  sourceHref={d.sourceHref}
                  sourceLabel={d.sourceLabel}
                  logo={d.logo}
                  docsHref={d.docsHref}
                  sports={d.sports}
                  repositoryType={d.repositoryType}
                  description={d.description}/>
            </Grid>
          )}
      </Grid>
      <Grid container
          spacing={1}>
          {rPkgs.map((d,idx)=>
            <Grid item xs={12} sm={6} md={6} lg={4} key={idx}>
              <PackageCard             
                  sourceHref={d.sourceHref}
                  sourceLabel={d.sourceLabel}
                  logo={d.logo}
                  docsHref={d.docsHref}
                  sports={d.sports}
                  repositoryType={d.repositoryType}
                  description={d.description}/>
            </Grid>
          )}
        </Grid>
    </div>
  );
}