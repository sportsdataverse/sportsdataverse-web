import React, { FC, ReactElement } from 'react'
import { makeStyles } from '@material-ui/styles'
import Card from '@material-ui/core/Card'
import CardActionArea from '@material-ui/core/CardActionArea'
import CardActions from '@material-ui/core/CardActions'
import CardContent from '@material-ui/core/CardContent'
import CardMedia from '@material-ui/core/CardMedia'
import Button from '@material-ui/core/Button'
import ChevronRight from '@material-ui/icons/ChevronRight'
import Box from '@material-ui/core/Box'
import Container from '@material-ui/core/Container';
import useMediaQuery from '@material-ui/core/useMediaQuery'
import Typography from '@material-ui/core/Typography';

import GridContainer from '../../src/components/Grid/GridContainer.js';
import Image from 'next/image'
import GitHubIcon from '@material-ui/icons/GitHub'
import DescriptionIcon from '@material-ui/icons/Description';

import AccountTreeIcon from '@material-ui/icons/AccountTree'

import Link from 'next/link'

type PackageCardProps = {
    sourceHref: string,
    sourceLabel: string,
    logo?: StaticImageData,
    docsHref: string,
    sports: string,
    repositoryType: string,
    description: any[]
  }


const useStyles = makeStyles((theme) => ({
    a: {
        hover: {
          textDecoration: 'none',
          fontWeight: 900,
          cursor: "pointer",
        },
        textDecoration: 'none',
        fontWeight: 900,
        cursor: "pointer",
        target: "_blank",
        rel: "noreferrer",
      },
    Link: {
        textDecoration: 'none',
        fontWeight: 900,
        cursor: "pointer",
    },
    svg: {
      hover: {
        textDecoration: 'none',
        fontWeight: 900,
        cursor: "pointer",
      },
      textDecoration: 'none',
      fontWeight: 900,
      cursor: "pointer",
    },
    Image: {
      hover: {
        textDecoration: 'none',
        fontWeight: 900,
        cursor: "pointer",
      },
      textDecoration: 'none',
      fontWeight: 900,
      cursor: "pointer",
    },
}))

export const PackageCard: FC<PackageCardProps> = ({
    sourceHref,
    sourceLabel,
    logo,
    docsHref,
    sports,
    repositoryType,
    description }): ReactElement => {
  const classes = useStyles()
  const large = useMediaQuery('(min-width:500px)')
  return (
    <Container maxWidth="sm"  >
        <Box p={1}>
            <Link href={docsHref} passHref>
                <Image
                    src={logo}
                    alt={sourceLabel} />
            </Link>
            <Typography variant={'h4'}>
                <Link href={sourceHref} passHref>{`${sourceLabel}`}</Link>
            </Typography>
            <div>
                <Link href={sourceHref} passHref>
                  <a href={sourceHref}
                  target="_blank"
                  rel="noreferrer"
                  className={classes.a}>
                    <GitHubIcon/>
                  </a>
                </Link>
                <Link href={docsHref} passHref>
                  <a href={docsHref}
                  target="_blank"
                  rel="noreferrer"
                  className={classes.a}>
                    <DescriptionIcon/>
                  </a>
                </Link>
            </div>
            <Typography variant={'caption'}>{`${sports}`+' - '+`${repositoryType}`}</Typography>
            {description.map((d,idx)=>
                <Box p={1} key={idx}>
                    <Typography variant={'body1'} style={{
                        textAlign: 'left'
                    }}>{d.content}</Typography>
                </Box>
            )}
        </Box>
    </Container>
  )
}

export default PackageCard
