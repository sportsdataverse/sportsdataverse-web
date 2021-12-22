import React from 'react';
// core components
import { Grid, Typography } from '@material-ui/core'
import Box from '@material-ui/core/Box'
import useMediaQuery from '@material-ui/core/useMediaQuery'
import PackageCard from '../../src/components/PackageCard'
import sdvPy from '../../public/images/sdv-py-logo.png'

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
