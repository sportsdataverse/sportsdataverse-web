import React from 'react';
// nodejs library that concatenates classes
import classNames from 'classnames'
import Link from 'next/link'
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';

// @material-ui/icons

// core components
import { Grid, Typography } from '@material-ui/core'
import Card from '@material-ui/core/Card'
import CardActionArea from '@material-ui/core/CardActionArea'
import CardActions from '@material-ui/core/CardActions'
import CardContent from '@material-ui/core/CardContent'
import CardMedia from '@material-ui/core/CardMedia'
import Button from '@material-ui/core/Button'
import ChevronRight from '@material-ui/icons/ChevronRight'
import Box from '@material-ui/core/Box'
import useMediaQuery from '@material-ui/core/useMediaQuery'
import Image from 'next/image'
import PackageCard from '../../src/components/PackageCard'

import sdvLogo from '../../public/images/sdv-js-logo.png'
import emptyLogo from '../../public/images/empty.png'


const nodePackages = [
  {
    sourceHref: 'https://github.com/saiemgilani/sportsdataverse/',
    sourceLabel: 'sportsdataverse',
    logo: sdvLogo,
    docsHref: 'https://js.sportsdataverse.org/',
    sports: 'All collegiate and 6 Professional sports',
    repositoryType: 'Node.js',
    description: [
      {content: "Node.js module with access to ESPN, 247Sports, and the NCAA website"}
      // {content:"Support for the following types of data from ESPN's endpoints: play-by-play (including shot location data when available), scores, schedule, standings, and rankings (not available for professional sports)."},
      // {content:"The following sports are available from ESPN: Men's College Basketball, Women's College Basketball, College Football, WNBA, NBA, NFL, and the NHL."},
      // {content:"Recruiting data from 247Sports available for: men's college basketball and college football."},
      // {content:"All team sports on the NCAA website: 'football', 'basketball-men', 'basketball-women', 'soccer-men', 'soccer-women', 'fieldhockey', 'volleyball-women', 'icehockey-men', 'icehockey-women', 'baseball','beach-volleyball', 'lacrosse-men', 'lacrosse-women', 'volleyball-men'"}
    ]
  },
  {
    sourceHref: 'https://github.com/nntrn/nfl-nerd/',
    sourceLabel: 'nfl-nerd',
    logo: emptyLogo,
    docsHref: 'https://github.com/nntrn/nfl-nerd/',
    sports: 'NFL',
    repositoryType: 'Node.js',
    description: [
      {content:"An api for fetching historical or real time games. Created for NFL player props betting."},
    ]
  }
]
export default function NodePackageSection() {
  const large = useMediaQuery('(min-width:500px)')
  const nodePkgs = nodePackages 
  return (
    <>
          {nodePkgs.map((d,idx)=>
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
    </>
  );
}
