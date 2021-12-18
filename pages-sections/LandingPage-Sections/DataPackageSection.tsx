import React from 'react';
// nodejs library that concatenates classes
import classNames from 'classnames'
import Link from 'next/link'
// @material-ui/core components

// @material-ui/icons

// core components
import { Grid, Typography } from '@material-ui/core'
import Button from '../../src/components/CustomButtons/Button.js';
import Card from '../../src/components/Card/Card.js';
import CardBody from '../../src/components/Card/CardBody.js';
import CardFooter from '../../src/components/Card/CardFooter.js';
import Image from 'next/image'
import useMediaQuery from '@material-ui/core/useMediaQuery'
import Box from '@material-ui/core/Box'
import styles from '../../assets/jss/nextjs-material-kit/pages/landingPageSections/packageStyle.js';
import PackageCard from '../../src/components/PackageCard'
import wehoopData from '../../public/images/wehoop_social_card_data_repo_full.png'
import hoopRData from '../../public/images/hoopR_social_card_data_repo_full.png'
import cfbfastRData from '../../public/images/social_card_final_quote_data_repo.png'
import worldfootballRData from '../../public/images/worldfootballR-data-card.png'
import emptyLogo from '../../public/images/empty.png'


const dataPackages = [
  {
    sourceHref: 'https://github.com/saiemgilani/cfbfastR-data/',
    sourceLabel: 'cfbfastR-data',
    logo: cfbfastRData,
    docsHref: '',
    sports: 'College Football',
    repositoryType: 'Data',
    description: [
      {content:' Repository containing data for working with CFB data. 2002-2020 data included in csv, rds, and parquet format.'}
    ]
  },
  {
    sourceHref: 'https://github.com/saiemgilani/hoopR-data/',
    sourceLabel: 'hoopR-data',
    logo: hoopRData,
    docsHref: '',
    sports: "Men's Basketball (NBA and MBB)",
    repositoryType: 'Data',
    description: [
      {content:' Repository containing data for most teams, players and coaches from 2002-2020. All data provided in csv, rds, and parquet format.'}
    ]
  },
  {
    sourceHref: 'https://github.com/saiemgilani/wehoop-data/',
    sourceLabel: 'wehoop-data',
    logo: wehoopData,
    docsHref: '',
    sports: "Women's Basketball (WNBA and WBB)",
    repositoryType: 'Data',
    description: [
      {content:' Repository containing data for most teams and games from 2002-present. All data provided in csv, rds, and parquet format.'}
    ]
  },
  {
    sourceHref: 'https://github.com/JaseZiv/worldfootballR_data',
    sourceLabel: 'worldfootballR-data',
    logo: worldfootballRData,
    docsHref: '',
    sports: "World Football (Soccer)",
    repositoryType: 'Data',
    description: [
      {content:' Repository containing data for Fbref Comps and Leagues, Transfermarkt Leagues, Mapping between FBref and Transfermarkt Players'}
    ]
  },
  {
    sourceHref: 'https://github.com/saiemgilani/fastRhockey-data/',
    sourceLabel: 'fastRhockey-data',
    logo: emptyLogo,
    docsHref: '',
    sports: "Hockey (NHL and PHF)",
    repositoryType: 'Data',
    description: [
      {content:' Repository containing data for most teams and games from 2010-present for NHL, 2016-present for PHF. All data provided in csv, rds, and parquet format.'}
    ]
  },
]

export default function DataPackageSection() {
  const large = useMediaQuery('(min-width:500px)')
  const dataPkgs = dataPackages 
  return (
    <div>
      <Box p={5}>
        <Typography variant={'h3'}>Data Repositories supporting SportsDataverse packages:</Typography>
      </Box>
      
      <Grid container
          direction={"row"}
          spacing={1}>
          {dataPkgs.map((d,idx)=>
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
