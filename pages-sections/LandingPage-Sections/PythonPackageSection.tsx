import React from 'react';
// nodejs library that concatenates classes
import classNames from 'classnames';
import Link from 'next/link'
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
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

import wehoopPy from '../../public/images/wehoop-py-logo.png'
import hoopRPy from '../../public/images/hoopR-py-logo.png'
import sdvPy from '../../public/images/sdv-py-logo.png'
import styles from '../../assets/jss/nextjs-material-kit/pages/landingPageSections/packageStyle.js';

const pythonPackages = [
  
  {
    sourceHref: 'https://github.com/saiemgilani/sportsdataverse-py/',
    sourceLabel: 'sportsdataverse',
    logo: sdvPy,
    docsHref: 'https://py.sportsdataverse.org/',
    sports: 'All',
    repositoryType: 'Python',
    description: [
      {content:' Python package for working with Sports data.'}
    ]
  },
]

export default function PythonPackageSection() {
  const large = useMediaQuery('(min-width:700px)')
  const pythonPkgs = pythonPackages
  return (
    <>
          {pythonPkgs.map((d,idx)=>
            <Grid item xs={12} sm={12} md={12} key={idx}>
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
