import React from 'react';
// nodejs library that concatenates classes
import classNames from 'classnames';
import Link from 'next/link'
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';

// @material-ui/icons

// core components
import { Grid, Typography } from '@material-ui/core'
import GridContainer from '../../src/components/Grid/GridContainer.js';
import GridItem from '../../src/components/Grid/GridItem.js';
import Button from '../../src/components/CustomButtons/Button.js';
import Card from '../../src/components/Card/Card.js';
import CardBody from '../../src/components/Card/CardBody.js';
import CardFooter from '../../src/components/Card/CardFooter.js';
import Image from 'next/image'
import useMediaQuery from '@material-ui/core/useMediaQuery'
import Box from '@material-ui/core/Box'


import wehoop from '../../public/images/wehoop-logo.png'
import hoopR from '../../public/images/hoopR-logo.png'
import cfbfastR from '../../public/images/cfbfastR-logo.png'
import recruitR from '../../public/images/recruitR-logo.png'
import cfbplotR from '../../public/images/cfbplotR-logo.png'
import cfb4th from '../../public/images/cfb4th-logo.png'
import gamezoneR from '../../public/images/gamezoneR-logo.png'
import baseballr from '../../public/images/baseballr-logo.png'
import hockeyR from '../../public/images/hockeyR-logo.png'
import fastRhockey from '../../public/images/fastRhockey-logo.png'
import worldfootballR from '../../public/images/worldfootballR-logo.png'
import emptyLogo from '../../public/images/emptyLogo.png'
import styles from '../../assets/jss/nextjs-material-kit/pages/landingPageSections/packageStyle.js';
import PackageCard from '../../src/components/PackageCard'

const rPackages = [
  {
    sourceHref: 'https://github.com/saiemgilani/cfbfastR/',
    sourceLabel: 'cfbfastR',
    logo: cfbfastR,
    docsHref: 'https://saiemgilani.github.io/cfbfastR/',
    sports: 'College Football',
    repositoryType: 'R',
    description: [
      {content:' Functions to Access College Football Play by Play Data.'}
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
      {content:" Functions to Access Men's Basketball Play by Play Data."},
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
      {content:" Functions to Access Women's Basketball Play by Play Data."},
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
      {content:"  Functions for Acquiring and Analyzing Baseball Data."},
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
      {content:"  Functions to Extract World Football (Soccer) Data from Fbref.com, transfermarkt.com, and understat.com."},

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
      {content:"  Functions to Access NHL and Premier Hockey Federation Play by Play Data."},
    ]
  },
  {
    sourceHref: 'https://github.com/danmorse314/hockeyR/',
    sourceLabel: 'hockeyR',
    logo: hockeyR,
    docsHref: 'https://hockeyr.netlify.app/',
    sports: "NHL",
    repositoryType: 'R',
    description: [
      {content:"  Functions for Acquiring and Analyzing NHL Play-by-Play Data."},
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
      {content:" Functions to Calculate Optimal Fourth Down Decisions for NCAA Football."},
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
      {content:"  Functions to access NCAA Men’s Basketball data from STATS LLC’s GameZone."},
    ]
  },
  {
    sourceHref: 'https://github.com/saiemgilani/recruitR/',
    sourceLabel: 'recruitR',
    logo: recruitR,
    docsHref: 'https://saiemgilani.github.io/recruitR/',
    sports: "College Sports Recruiting",
    repositoryType: 'R',
    description: [
      {content:" Functions to access college sports recruiting data."},
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
  const rPkgs = rPackages
  return (
    <div>
      <Box p={5}>
        <Typography variant={'h3'}>R packages</Typography>
      </Box>
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