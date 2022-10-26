import React from 'react';
// core components
import { Grid, Typography } from '@material-ui/core'
import Box from '@material-ui/core/Box'
import useMediaQuery from '@material-ui/core/useMediaQuery'
import PackageCard from '../../src/components/PackageCard'
import sdvPy from '../../public/images/sdv-py-logo.png'
import sportypy from '../../public/images/sportyR-logo.png'
import recruitrPy from '../../public/images/recruitR-logo.png'
import emptyLogo from '../../public/images/emptyLogo.png'

const pythonPackages = [

  {
    sourceHref: 'https://github.com/sportsdataverse/sportsdataverse-py/',
    sourceLabel: 'sportsdataverse',
    logo: sdvPy,
    docsHref: 'https://py.sportsdataverse.org/',
    sports: 'All',
    repositoryType: 'Python',
    description: [
      {content:' Python package for working with Sports data.'}
    ]
  },
  {
    sourceHref: 'https://github.com/sportsdataverse/sportypy',
    sourceLabel: 'sportypy',
    logo: sportypy,
    docsHref: 'https://sportypy.sportsdataverse.org/',
    sports: "Sports Visualizations",
    repositoryType: 'Python',
    description: [
      {content:"  Plot Scaled 'matplotlib' Representations of Sports Playing Surfaces."},

    ]
  },
  {
    sourceHref: 'https://github.com/sportsdataverse/recruitR-py/',
    sourceLabel: 'recruitR-py',
    logo: recruitrPy,
    docsHref: 'https://github.com/sportsdataverse/recruitR-py/',
    sports: "College Sports Recruiting",
    repositoryType: 'Python',
    description: [
      {content:" Access College Sports Recruiting Data."},
    ]
  },
  {
    sourceHref: 'https://github.com/nathanblumenfeld/collegebaseball',
    sourceLabel: 'collegebaseball',
    logo: emptyLogo,
    docsHref: 'https://collegebaseball.readthedocs.io/en/latest/index.html',
    sports: "College Baseball",
    repositoryType: 'Python',
    description: [
      {content:" Access College Baseball Data."},
    ]
  },
]

export default function PythonPackageSection() {
  const large = useMediaQuery('(min-width:700px)')
  const pythonPkgs = pythonPackages
  return (
    <>
      <Box p={2}>
        <Typography variant={'h3'}>Python packages</Typography>
      </Box>
      <Grid container spacing={1}>
        {pythonPkgs.map((d,idx)=>
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
    </>
  );
}
